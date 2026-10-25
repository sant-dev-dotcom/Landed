"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, ChevronLeft, ExternalLink, Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { CUSTOM_LOCALE, LANGUAGES, languageInfo, matchLanguage } from "@/i18n/languages";
import { useProfile } from "@/lib/hooks";
import { domainOf, localizedVersion, sourceType, type LocalizedUrl } from "@/lib/links";
import { getJSON } from "@/lib/client";
import { BarButton } from "../ios/Sheet";
import { Button } from "../ios/Button";
import { LoadingBlock, Spinner } from "../ios/Spinner";
import { SegmentedControl } from "../ios/SegmentedControl";
import { SourceBadge } from "../TrustedLinks";
import { useCurrentLanguageName } from "../LanguagePicker";

// One way to open every external link: an in-app panel. The page shows as-is when the site
// allows framing, otherwise as a clean reading view (government pages arranged by AI). The
// "Translate" control at the top shows it in any language: the site's own translation when
// it has one, otherwise an AI translation (trusted sites only). Pages are fetched by our
// server only for allowlisted sites, never with anything about the user, and only shown to
// the person viewing them.

export interface OpenOptions {
  /** Team-written summary in the user's language, shown when the page can't be shown or translated. */
  summary?: string;
  /** The site's own language versions, if we know them. */
  localized?: LocalizedUrl;
}

type OpenLink = (url: string, opts?: OpenOptions) => void;
const BrowserContext = createContext<OpenLink>(() => {});

/** Open an external link in the in-app browser. */
export const useOpenLink = () => useContext(BrowserContext);

interface Entry {
  key: number;
  url: string;
  opts: OpenOptions;
}

export function BrowserProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<Entry[]>([]);

  const open = useCallback<OpenLink>((url, opts = {}) => {
    // Phone calls and email hand off to the device.
    if (/^(tel:|mailto:)/.test(url)) {
      window.location.href = url;
      return;
    }
    if (!/^https?:\/\//.test(url)) return;
    setStack((s) => [...s, { key: Date.now(), url, opts }]);
  }, []);

  return (
    <BrowserContext.Provider value={open}>
      {children}
      <BrowserPanel
        entry={stack[stack.length - 1]}
        canGoBack={stack.length > 1}
        onBack={() => setStack((s) => s.slice(0, -1))}
        onClose={() => setStack([])}
      />
    </BrowserContext.Provider>
  );
}

// ---- Views ----

type Part = string | { text: string; href: string };
interface Block {
  kind: "h" | "p" | "li";
  level?: number;
  ordered?: boolean;
  parts: Part[];
}
interface SiteNeed {
  /** Using this means going to the website (online tool, application, payment, account…). */
  requiresSite?: boolean;
  siteAction?: string;
  siteNotice?: { title: string; button: string };
}
type View =
  | { kind: "frame"; url: string }
  | ({
      kind: "reader";
      url: string;
      title: string;
      blocks: Block[];
      /** AI-translated. */
      ai?: boolean;
      /** The page's own text, arranged by AI. */
      formatted?: boolean;
      sourceLang?: string;
    } & SiteNeed)
  | { kind: "summary"; url: string };

type Version = "official" | "ai" | "summary" | "same";
type Translation = { status: "loading" } | { status: "error" } | { status: "ready"; view: View; version: Version };

type ReaderJSON = { title: string; blocks: Block[]; aiFormatted?: boolean } & SiteNeed;

/** In-app reading view of a trusted page (for sites that refuse to be framed). */
const readerView = async (url: string): Promise<View> => {
  try {
    const r = await getJSON<ReaderJSON & { url: string; lang: string }>(`/api/read-page?url=${encodeURIComponent(url)}`);
    return { kind: "reader", url, title: r.title, blocks: r.blocks, sourceLang: r.lang, formatted: r.aiFormatted, requiresSite: r.requiresSite, siteAction: r.siteAction, siteNotice: r.siteNotice };
  } catch {
    return { kind: "summary", url };
  }
};

/** The page itself when the site allows framing, otherwise its reading view. */
const pageView = async (url: string): Promise<View> => {
  try {
    const r = await getJSON<{ embeddable: boolean }>(`/api/frame-check?url=${encodeURIComponent(url)}`);
    if (r.embeddable) return { kind: "frame", url };
  } catch {
    // fall through to the reading view
  }
  return readerView(url);
};

/** The code to look for on sites: the locale, or a typed-in language's BCP 47 tag. */
function siteLang(code: string) {
  if (code !== CUSTOM_LOCALE) return code;
  return (document.documentElement.lang || "en").toLowerCase().split("-")[0];
}

const MODE_KEY = "landed:browser-mode";
const TARGET_KEY = "landed:browser-language";
// Languages typed in under "Another language…" (not one of the app's), this session.
const OTHER_KEY = "landed:browser-other-languages";
const OTHER = "other:";
const OTHER_CHOICE = "__other";
const session = {
  get: (k: string) => {
    try {
      return sessionStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      sessionStorage.setItem(k, v);
    } catch {
      // per-session preference only
    }
  },
};

// ---- Panel ----

function BrowserPanel({
  entry,
  canGoBack,
  onBack,
  onClose,
}: {
  entry?: Entry;
  canGoBack: boolean;
  onBack: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("browser");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const customName = useCurrentLanguageName();
  const [profile] = useProfile();
  // The language the person chose for Landed (onboarding or Settings).
  const preferred = profile?.locale ?? locale;
  const [others, setOthers] = useState<string[]>([]);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");
  const [original, setOriginal] = useState<View | null>(null);
  const [pageInfo, setPageInfo] = useState<{ lang: string; alternates: Record<string, string> } | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [translations, setTranslations] = useState<Record<string, Translation>>({});
  const [mode, setMode] = useState<"translated" | "original">("translated");

  const url = entry?.url ?? "";
  const type = url ? sourceType(url) : null;
  const nameOf = (code: string) =>
    code.startsWith(OTHER) ? code.slice(OTHER.length) : code === CUSTOM_LOCALE ? customName : (languageInfo(code)?.native ?? code);

  useEffect(() => {
    try {
      setOthers(JSON.parse(session.get(OTHER_KEY) || "[]"));
    } catch {
      setOthers([]);
    }
  }, []);

  // Load the page itself and which languages the site offers.
  useEffect(() => {
    if (!entry) return;
    let live = true;
    setOriginal(null);
    setPageInfo(null);
    setTranslations({});
    setMode(session.get(MODE_KEY) === "original" ? "original" : "translated");
    setTyping(false);
    // Default: the language chosen earlier this session, otherwise the person's preferred
    // language (no translation when that's English).
    const remembered = session.get(TARGET_KEY);
    setTarget(remembered !== null ? remembered || null : preferred !== "en" ? preferred : null);
    if (!sourceType(entry.url)) {
      setOriginal({ kind: "summary", url: entry.url });
      setPageInfo({ lang: "", alternates: {} });
      return;
    }
    pageView(entry.url).then((v) => live && setOriginal(v));
    getJSON<{ lang: string; alternates: Record<string, string> }>(`/api/page-languages?url=${encodeURIComponent(entry.url)}`)
      .catch(() => ({ lang: "", alternates: {} }))
      .then((p) => live && setPageInfo(p));
    return () => {
      live = false;
    };
  }, [entry, locale, preferred]);

  // Translate into the chosen language (once per language; kept so switching is instant).
  useEffect(() => {
    if (!entry || !target || !pageInfo || !sourceType(entry.url) || translations[target]) return;
    let live = true;
    const done = (tr: Translation) => live && setTranslations((s) => ({ ...s, [target]: tr }));
    setTranslations((s) => ({ ...s, [target]: { status: "loading" } }));
    (async () => {
      // A typed-in language has no site version to look for: straight to AI translation.
      const typedName = target.startsWith(OTHER) ? target.slice(OTHER.length) : null;
      if (!typedName) {
        const lang = siteLang(target);
        if (pageInfo.lang && pageInfo.lang === lang) return done({ status: "ready", view: original ?? { kind: "summary", url }, version: "same" });
        // 1. The site's own version in that language.
        const official = (entry.opts.localized && localizedVersion(entry.opts.localized, lang)) || pageInfo.alternates[lang];
        if (official && official !== entry.url) return done({ status: "ready", view: await pageView(official), version: "official" });
      }
      // 2. AI translation of the page's text.
      try {
        const language = typedName ? `name=${encodeURIComponent(typedName)}` : `lang=${encodeURIComponent(target)}`;
        const tp = await getJSON<{ sourceLang: string; translated: ReaderJSON }>(`/api/translate-page?url=${encodeURIComponent(entry.url)}&${language}`);
        done({ status: "ready", view: { kind: "reader", url: entry.url, ...tp.translated, ai: true, sourceLang: tp.sourceLang }, version: "ai" });
      } catch {
        // 3. Landed's own summary, if it's in the chosen language.
        if (entry.opts.summary && target === locale) done({ status: "ready", view: { kind: "summary", url: entry.url }, version: "summary" });
        else done({ status: "error" });
      }
    })();
    return () => {
      live = false;
    };
    // `original` is only read for the same-language case; it shouldn't re-run translation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry, target, pageInfo, locale]);

  const chooseTarget = (code: string) => {
    if (code === OTHER_CHOICE) {
      setTyping(true);
      return;
    }
    setTyping(false);
    setTarget(code || null);
    session.set(TARGET_KEY, code);
    if (code) switchMode("translated");
  };
  // "Another language…": one of the app's languages by any name ("Spanish", "español") uses
  // that one (and its official site versions); anything else is translated by AI.
  const chooseTyped = (e: React.FormEvent) => {
    e.preventDefault();
    const name = typed.replace(/[^\p{L}\p{M} ()'-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 40);
    if (!name) return;
    const known = matchLanguage(name);
    setTyped("");
    if (known) return chooseTarget(known);
    const label = name.charAt(0).toUpperCase() + name.slice(1);
    const next = [label, ...others.filter((o) => o.toLowerCase() !== label.toLowerCase())].slice(0, 5);
    setOthers(next);
    session.set(OTHER_KEY, JSON.stringify(next));
    chooseTarget(OTHER + label);
  };
  const switchMode = (m: "translated" | "original") => {
    setMode(m);
    session.set(MODE_KEY, m);
  };

  const tr = target ? translations[target] : undefined;
  const ready = tr?.status === "ready" && tr.version !== "same" ? tr : null;
  const showing: "translated" | "original" = ready && mode === "translated" ? "translated" : "original";
  const current = showing === "translated" ? ready!.view : original;
  const versionLabel =
    showing === "original"
      ? t("versionOriginal")
      : ready!.version === "official"
        ? t("versionOfficial", { language: nameOf(target!) })
        : ready!.version === "ai"
          ? t("versionAi")
          : t("summaryTitle");
  const openOutside = () => window.open(current && current.kind !== "summary" ? current.url : url, "_blank", "noopener,noreferrer");

  // Languages to translate into: every app language, plus a typed-in one if it's in use.
  const options = [
    ...LANGUAGES.map((l) => ({ code: l.code as string, name: l.native })),
    ...(locale === CUSTOM_LOCALE ? [{ code: CUSTOM_LOCALE, name: customName }] : []),
    ...others.map((name) => ({ code: OTHER + name, name })),
  ].filter((o) => o.code !== pageInfo?.lang);

  return (
    <Dialog.Root open={Boolean(entry)} onOpenChange={(o) => !o && onClose()}>
      <AnimatePresence>
        {entry && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-[80] bg-black/60"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                className="fixed bottom-0 left-1/2 z-[80] flex h-[calc(100dvh-env(safe-area-inset-top)-12px)] w-full max-w-app flex-col overflow-hidden rounded-t-sheet border-x border-t border-separator bg-grouped outline-none"
                style={{ x: "-50%" }}
                initial={reduce ? { opacity: 0 } : { y: "100%" }}
                animate={reduce ? { opacity: 1 } : { y: 0 }}
                exit={reduce ? { opacity: 0 } : { y: "100%" }}
                transition={{ duration: 0.38, ease: [0.32, 0.72, 0, 1] }}
              >
                <header className="hairline-b shrink-0">
                  <div className="flex min-h-[52px] items-center gap-1 px-2">
                    {canGoBack ? (
                      <BarButton onClick={onBack} ariaLabel={t("back")}>
                        <ChevronLeft size={24} strokeWidth={1.75} className="rtl:-scale-x-100" aria-hidden />
                      </BarButton>
                    ) : null}
                    <BarButton onClick={onClose}>{t("close")}</BarButton>
                    <Dialog.Title className="flex min-w-0 flex-1 items-center justify-center gap-2 text-body font-medium">
                      <span className="truncate">{domainOf(url)}</span>
                      {type && <SourceBadge type={type} />}
                    </Dialog.Title>
                    {/* Balances the Close button so the domain stays centered. */}
                    <span className="min-w-[44px]" aria-hidden />
                  </div>

                  {/* Translate + Open in Browser */}
                  <div className="flex items-center gap-2 px-4 pb-2.5">
                    {type && (
                      <label className="pressable relative flex min-h-[40px] min-w-0 items-center gap-1.5 rounded-control border border-separator px-3 text-callout text-tint">
                        <Languages size={17} strokeWidth={1.75} className="shrink-0" aria-hidden />
                        <span className="truncate">{target ? nameOf(target) : t("translate")}</span>
                        <ChevronDown size={16} strokeWidth={1.75} className="shrink-0" aria-hidden />
                        <select
                          value={target ?? ""}
                          onChange={(e) => chooseTarget(e.target.value)}
                          aria-label={t("translateTo")}
                          className="absolute inset-0 cursor-pointer opacity-0"
                        >
                          <option value="">{t("noTranslation")}</option>
                          {options.map((o) => (
                            <option key={o.code} value={o.code}>
                              {o.name}
                            </option>
                          ))}
                          <option value={OTHER_CHOICE}>{t("otherLanguage")}</option>
                        </select>
                      </label>
                    )}
                    <button
                      type="button"
                      onClick={openOutside}
                      className="pressable ms-auto flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-control border border-separator px-3 text-callout text-tint"
                    >
                      <ExternalLink size={16} strokeWidth={1.75} aria-hidden />
                      {t("openInBrowser")}
                    </button>
                  </div>

                  {typing && (
                    <form onSubmit={chooseTyped} className="flex items-center gap-2 px-4 pb-2.5">
                      <label htmlFor="other-language" className="sr-only">
                        {t("otherLanguageLabel")}
                      </label>
                      <input
                        id="other-language"
                        value={typed}
                        onChange={(e) => setTyped(e.target.value)}
                        maxLength={40}
                        autoFocus
                        placeholder={t("otherLanguagePlaceholder")}
                        className="min-h-[40px] min-w-0 flex-1 rounded-control border border-separator bg-cell px-3 text-body outline-none placeholder:text-tertiary-label"
                      />
                      <Button type="submit" size="small" disabled={!typed.trim()}>
                        {t("translate")}
                      </Button>
                      <Button type="button" variant="plain" size="small" onClick={() => setTyping(false)}>
                        {t("cancelOther")}
                      </Button>
                    </form>
                  )}

                  {ready && (
                    <div className="px-4 pb-2.5">
                      <SegmentedControl
                        label={versionLabel}
                        value={showing}
                        onChange={switchMode}
                        options={[
                          { value: "translated", label: nameOf(target!) },
                          { value: "original", label: t("original") },
                        ]}
                      />
                    </div>
                  )}
                  <p className="flex items-center gap-2 px-5 pb-2.5 text-footnote italic text-secondary-label" aria-live="polite">
                    {tr?.status === "loading" ? (
                      <>
                        <Spinner size={14} />
                        {t("translatingTo", { language: nameOf(target!) })}
                      </>
                    ) : tr?.status === "error" ? (
                      t("translateFailed")
                    ) : tr?.status === "ready" && tr.version === "same" ? (
                      t("alreadyIn", { language: nameOf(target!) })
                    ) : original ? (
                      versionLabel
                    ) : (
                      ""
                    )}
                  </p>
                </header>

                <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
                  {!original ? (
                    <LoadingBlock text={sourceType(url) === "official" ? t("preparing") : t("loading")} />
                  ) : (
                    <>
                      {/* Both versions stay mounted so the switch is instant. */}
                      <ViewBox view={original} hidden={showing !== "original"} summary={entry.opts.summary} />
                      {ready && <ViewBox view={ready.view} hidden={showing !== "translated"} summary={entry.opts.summary} />}
                    </>
                  )}
                </div>

                <footer className="hairline-t shrink-0 px-5 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-2.5">
                  <button type="button" onClick={openOutside} className="pressable flex min-h-[36px] items-center gap-1.5 text-footnote text-tint">
                    <ExternalLink size={14} strokeWidth={1.75} aria-hidden />
                    {t("viewOriginal", { domain: domainOf(url) })}
                  </button>
                  {type === null && <p className="text-footnote text-secondary-label">{t("notTrusted")}</p>}
                </footer>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

function ViewBox({ view, hidden, summary }: { view: View; hidden: boolean; summary?: string }) {
  const t = useTranslations("browser");
  const open = useOpenLink();
  const cls = hidden ? "hidden" : "";
  const visit = (u: string) => window.open(u, "_blank", "noopener,noreferrer");

  if (view.kind === "frame") {
    return (
      <iframe
        src={view.url}
        title={domainOf(view.url)}
        className={`absolute inset-0 h-full w-full border-0 bg-white ${cls}`}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
      />
    );
  }

  if (view.kind === "summary") {
    return (
      <div className={`flex flex-col gap-5 px-5 py-6 ${cls}`}>
        <p className="text-subheadline text-secondary-label">{summary ? t("cantEmbed") : t("noSummary")}</p>
        {summary && (
          <div className="rounded-card bg-cell p-5">
            <p className="mb-2 text-footnote text-secondary-label">{t("summaryTitle")}</p>
            <p className="text-headline text-label-soft">{summary}</p>
          </div>
        )}
        <Button onClick={() => visit(view.url)} icon={<ExternalLink size={18} strokeWidth={1.75} aria-hidden />}>
          {t("openPage")}
        </Button>
      </div>
    );
  }

  // Reading view. Lists are grouped from consecutive items.
  const groups: (Block | Block[])[] = [];
  for (const b of view.blocks) {
    const last = groups[groups.length - 1];
    if (b.kind === "li" && Array.isArray(last) && last[0].ordered === b.ordered) last.push(b);
    else groups.push(b.kind === "li" ? [b] : b);
  }
  const parts = (ps: Part[]) =>
    ps.map((p, i) =>
      typeof p === "string" ? (
        <span key={i}>{p}</span>
      ) : (
        <button key={i} type="button" onClick={() => open(p.href)} className="text-tint underline decoration-1 underline-offset-2">
          {p.text}
        </button>
      )
    );

  return (
    <article className={`px-5 py-5 ${cls}`} lang={view.ai ? undefined : view.sourceLang}>
      {/* Some things can only be done on the website itself: say so first. */}
      {view.requiresSite && (
        <div role="note" className="mb-5 flex flex-col gap-3 rounded-status bg-green-tint p-5">
          <p className="text-headline font-medium text-label">{view.siteNotice?.title ?? t("mustVisitTitle")}</p>
          {view.siteAction && <p className="text-body text-label-soft">{view.siteAction}</p>}
          <Button size="medium" className="self-start" onClick={() => visit(view.url)} icon={<ExternalLink size={17} strokeWidth={1.75} aria-hidden />}>
            {view.siteNotice?.button.replaceAll("{domain}", domainOf(view.url)) ?? t("goTo", { domain: domainOf(view.url) })}
          </Button>
        </div>
      )}
      {view.ai ? (
        <p role="note" className="mb-5 rounded-control bg-orange-tint px-4 py-3 text-footnote text-oat">
          {t("aiBanner", { source: view.sourceLang === "en" ? "English" : (view.sourceLang ?? "English") })}
        </p>
      ) : (
        view.formatted && (
          <p role="note" className="mb-5 rounded-control border border-separator px-4 py-3 text-footnote text-secondary-label">
            {t("aiFormatted", { domain: domainOf(view.url) })}
          </p>
        )
      )}
      <h1 className="mb-4 text-title2">{view.title}</h1>
      <div className="flex flex-col gap-3 text-body text-label-soft">
        {groups.map((g, i) =>
          Array.isArray(g) ? (
            g[0].ordered ? (
              <ol key={i} className="list-decimal space-y-1.5 ps-6">
                {g.map((b, j) => (
                  <li key={j}>{parts(b.parts)}</li>
                ))}
              </ol>
            ) : (
              <ul key={i} className="list-disc space-y-1.5 ps-6">
                {g.map((b, j) => (
                  <li key={j}>{parts(b.parts)}</li>
                ))}
              </ul>
            )
          ) : g.kind === "h" ? (
            <h2 key={i} className={`mt-3 text-label ${g.level === 2 ? "text-title3" : "text-headline font-medium"}`}>
              {parts(g.parts)}
            </h2>
          ) : (
            <p key={i}>{parts(g.parts)}</p>
          )
        )}
      </div>
    </article>
  );
}
