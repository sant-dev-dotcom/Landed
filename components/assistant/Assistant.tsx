"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUp, Check, Copy, MessageCircle, Mic, MicOff } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { intlTag } from "@/i18n/languages";
import { INTERNAL_ROUTE, routeStores, type AssistantAnswer, type AssistantResponse, type ChatLink, type Proposal } from "@/lib/assistant";
import { readStores } from "@/lib/assistantData";
import { postJSON } from "@/lib/client";
import { formatDate } from "@/lib/hooks";
import { addDate, deleteSavedChat, getSavedChat, saveChat, setItemDone, uid } from "@/lib/storage";
import { BarButton } from "../ios/Sheet";
import { Button } from "../ios/Button";
import { Toggle } from "../ios/Toggle";
import { Spinner } from "../ios/Spinner";
import { AiLabel } from "../Disclaimer";
import { Markdown } from "../Markdown";
import { LinkChip } from "../TrustedLinks";
import { ReadAloud } from "../ReadAloud";
import { ShieldIcon } from "../LampIcons";
import { useOpenLink } from "../browser/InAppBrowser";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  answer?: AssistantAnswer;
  error?: boolean;
  /** For a failed reply: the question to send again. */
  retry?: string;
  /** Per proposal index: what the person chose. */
  decided?: Record<number, "confirmed" | "declined">;
}

interface Ctx {
  open: (context?: { itemId?: string }) => void;
}
const AssistantContext = createContext<Ctx>({ open: () => {} });
export const useAssistant = () => useContext(AssistantContext);

const SESSION_KEY = "landed:chat-session";

function readSession(): ChatMessage[] {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "[]");
  } catch {
    return [];
  }
}

export function AssistantProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("assistant");
  const [isOpen, setOpen] = useState(false);
  const [context, setContext] = useState<{ itemId?: string } | undefined>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [saved, setSaved] = useState(false);
  const [returnPill, setReturnPill] = useState(false);
  const loaded = useRef(false);

  // Chat lasts for this session, or longer only when the person turns on "Save chat".
  useEffect(() => {
    getSavedChat<ChatMessage[]>().then((s) => {
      if (s?.length) {
        setMessages(s);
        setSaved(true);
      } else {
        setMessages(readSession());
      }
      loaded.current = true;
    });
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(messages));
    } catch {
      // private mode: the chat still works for this page
    }
    if (saved) saveChat(messages);
  }, [messages, saved]);

  const open = useCallback((ctx?: { itemId?: string }) => {
    setContext(ctx?.itemId ? ctx : undefined);
    setReturnPill(false);
    setOpen(true);
  }, []);

  return (
    <AssistantContext.Provider value={{ open }}>
      {children}
      <AssistantPanel
        open={isOpen}
        onClose={() => setOpen(false)}
        context={context}
        clearContext={() => setContext(undefined)}
        messages={messages}
        setMessages={setMessages}
        saved={saved}
        setSaved={async (v) => {
          setSaved(v);
          if (v) await saveChat(messages);
          else await deleteSavedChat();
        }}
        onInternal={() => {
          setOpen(false);
          setReturnPill(true);
        }}
      />
      {returnPill && !isOpen && (
        <button
          type="button"
          onClick={() => {
            setReturnPill(false);
            setOpen(true);
          }}
          className="pressable fixed bottom-[calc(var(--tab-bar-space)+10px)] left-1/2 z-40 flex min-h-[44px] -translate-x-1/2 items-center gap-2 rounded-full bg-tint-fill px-5 text-callout font-medium text-on-accent shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
        >
          <MessageCircle size={18} strokeWidth={1.75} aria-hidden />
          {t("backToChat")}
        </button>
      )}
    </AssistantContext.Provider>
  );
}

/** "Ask Landed" button; on a checklist item page it opens with that item as context. */
export function AskLandedButton({ itemId, className = "" }: { itemId?: string; className?: string }) {
  const t = useTranslations("assistant");
  const { open } = useAssistant();
  return (
    <Button variant="tinted" className={className} icon={<MessageCircle size={20} strokeWidth={1.75} className="text-sage" aria-hidden />} onClick={() => open({ itemId })}>
      {t("button")}
    </Button>
  );
}

/* Minimal typing for the Web Speech API. */
interface SpeechRec {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onend: () => void;
  onerror: () => void;
  start: () => void;
  stop: () => void;
}
type SpeechCtor = new () => SpeechRec;

function AssistantPanel({
  open,
  onClose,
  context,
  clearContext,
  messages,
  setMessages,
  saved,
  setSaved,
  onInternal,
}: {
  open: boolean;
  onClose: () => void;
  context?: { itemId?: string };
  clearContext: () => void;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  saved: boolean;
  setSaved: (v: boolean) => void;
  onInternal: () => void;
}) {
  const t = useTranslations("assistant");
  const tc = useTranslations("common");
  const ti = useTranslations("checklist.items");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const router = useRouter();
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [listening, setListening] = useState(false);
  const [speech, setSpeech] = useState<SpeechCtor | null>(null);
  const recRef = useRef<SpeechRec | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollPos = useRef<number | null>(null);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
    setSpeech(() => w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null);
  }, []);

  // Coming back to the chat lands on the same spot; new messages scroll to the end.
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = scrollPos.current ?? el.scrollHeight;
    });
  }, [open]);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, pending]);

  const itemTitle = context?.itemId ? ti(`${context.itemId}.title`) : null;

  /** `retryOf`: the id of a failed reply to replace (the question is already in the chat). */
  const send = async (raw: string, retryOf?: string) => {
    const text = raw.trim();
    if (!text || pending) return;
    setInput("");
    const history = messages
      .filter((m) => !m.error)
      .slice(-8)
      .map((m) => ({ role: m.role, text: m.answer?.text ?? m.text }));
    if (retryOf) setMessages((m) => m.filter((x) => x.id !== retryOf));
    else setMessages((m) => [...m, { id: uid(), role: "user", text }]);
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setMessages((m) => [...m, { id: uid(), role: "assistant", text: t("offline"), error: true, retry: text }]);
      return;
    }
    setPending(true);
    try {
      // Send only the data this question is about.
      let data = await readStores(routeStores(text, context).map((store) => ({ store })));
      let answer: AssistantAnswer | null = null;
      for (let i = 0; i < 4 && !answer; i++) {
        const res = await postJSON<AssistantResponse>("/api/assistant", { message: text, locale, history, context, data });
        if ("needData" in res) data = { ...data, ...(await readStores(res.needData)) };
        else answer = res.answer;
      }
      if (!answer) throw new Error("no answer");
      setMessages((m) => [...m, { id: uid(), role: "assistant", text: answer!.text, answer: answer! }]);
    } catch {
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      setMessages((m) => [...m, { id: uid(), role: "assistant", text: offline ? t("offline") : t("error"), error: true, retry: text }]);
    } finally {
      setPending(false);
    }
  };

  const goInternal = (url: string) => {
    scrollPos.current = scrollRef.current?.scrollTop ?? null;
    onInternal();
    router.push(url);
  };

  const decide = async (msgId: string, index: number, p: Proposal, confirmed: boolean) => {
    if (confirmed) {
      if (p.kind === "addDate") {
        await addDate({ id: uid(), label: p.label, date: p.date, docType: p.docType, reminder: true, createdFrom: "manual" });
      } else {
        await setItemDone(p.itemId, p.kind === "markDone");
      }
    }
    setMessages((m) =>
      m.map((x) => (x.id === msgId ? { ...x, decided: { ...x.decided, [index]: confirmed ? "confirmed" : "declined" } } : x))
    );
  };

  const toggleMic = () => {
    if (!speech) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new speech();
    rec.lang = intlTag(locale);
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e) => setInput(Array.from(e.results).map((r) => r[0].transcript).join(""));
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  const suggestions = itemTitle ? [t("itemPrompt", { title: itemTitle })] : [t("s1"), t("s2"), t("s3"), t("s4")];

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          scrollPos.current = scrollRef.current?.scrollTop ?? null;
          onClose();
        }
      }}
    >
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div className="fixed inset-0 z-[60] bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                className="fixed bottom-0 left-1/2 z-[60] flex h-[calc(100dvh-env(safe-area-inset-top)-12px)] w-full max-w-app flex-col overflow-hidden rounded-t-sheet border-x border-t border-separator bg-grouped outline-none"
                style={{ x: "-50%" }}
                initial={reduce ? { opacity: 0 } : { y: "100%" }}
                animate={reduce ? { opacity: 1 } : { y: 0 }}
                exit={reduce ? { opacity: 0 } : { y: "100%" }}
                transition={{ duration: 0.38, ease: [0.32, 0.72, 0, 1] }}
              >
                <header className="hairline-b shrink-0">
                  <div className="relative flex min-h-[52px] items-center px-2">
                    <div className="z-10 flex flex-1 items-center">
                      {messages.length > 0 && (
                        <BarButton
                          onClick={async () => {
                            setMessages([]);
                            scrollPos.current = null;
                            if (saved) await deleteSavedChat();
                          }}
                        >
                          {t("clear")}
                        </BarButton>
                      )}
                    </div>
                    <Dialog.Title className="pointer-events-none absolute inset-x-24 truncate text-center text-body font-medium">{t("title")}</Dialog.Title>
                    <div className="z-10 flex flex-1 justify-end">
                      <BarButton bold onClick={onClose}>
                        {tc("done")}
                      </BarButton>
                    </div>
                  </div>
                  <label className="flex min-h-[44px] items-center justify-between gap-3 px-5 pb-1">
                    <span className="text-footnote text-secondary-label">{t("save")}</span>
                    <Toggle checked={saved} onChange={setSaved} label={t("save")} />
                  </label>
                </header>

                <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
                  {itemTitle && (
                    <button type="button" onClick={clearContext} className="mb-4 inline-flex items-center gap-2 rounded-full border border-separator px-3 py-1.5 text-footnote text-secondary-label">
                      {t("aboutItem", { title: itemTitle })} ✕
                    </button>
                  )}
                  {messages.length === 0 ? (
                    <div className="flex flex-col gap-5">
                      <p className="text-headline text-label-soft">{t("welcome")}</p>
                      <div className="flex flex-col gap-2">
                        <p className="text-footnote text-secondary-label">{t("suggested")}</p>
                        {suggestions.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => send(s)}
                            className="pressable rounded-cell border border-separator bg-cell px-4 py-3 text-start text-body text-tint"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <ol className="flex flex-col gap-4" aria-live="polite">
                      {messages.map((m) =>
                        m.role === "user" ? (
                          <li key={m.id} className="flex justify-end">
                            <p className="max-w-[85%] whitespace-pre-line rounded-cell rounded-br-[6px] bg-tint-fill px-4 py-3 text-body text-on-accent">{m.text}</p>
                          </li>
                        ) : (
                          <li key={m.id}>
                            <AssistantMessage
                              message={m}
                              onInternal={goInternal}
                              onDecide={(i, p, ok) => decide(m.id, i, p, ok)}
                              onAsk={(q) => send(q)}
                              onRetry={() => m.retry && send(m.retry, m.id)}
                              busy={pending}
                            />
                          </li>
                        )
                      )}
                      {pending && (
                        <li className="flex items-center gap-2 text-subheadline text-secondary-label">
                          <Spinner size={18} />
                          {t("thinking")}
                        </li>
                      )}
                    </ol>
                  )}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    send(input);
                  }}
                  className="hairline-t flex shrink-0 items-end gap-2 px-3 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-2.5"
                >
                  {speech && (
                    <button
                      type="button"
                      onClick={toggleMic}
                      aria-label={listening ? t("micStop") : t("mic")}
                      aria-pressed={listening}
                      className={`pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${listening ? "bg-red-tint text-red-text" : "text-secondary-label"}`}
                    >
                      {listening ? <MicOff size={22} strokeWidth={1.75} aria-hidden /> : <Mic size={22} strokeWidth={1.75} aria-hidden />}
                    </button>
                  )}
                  <label className="flex min-h-[44px] flex-1 items-center rounded-[22px] border border-separator bg-cell px-4">
                    <input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder={listening ? t("listening") : t("placeholder")}
                      aria-label={t("placeholder")}
                      maxLength={800}
                      enterKeyHint="send"
                      className="min-h-[42px] w-full bg-transparent text-body outline-none placeholder:text-secondary-label"
                    />
                  </label>
                  <button type="submit" disabled={!input.trim() || pending} aria-label={t("send")} className="pressable flex h-11 w-11 shrink-0 items-center justify-center disabled:opacity-40">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-tint-fill text-on-accent">
                      <ArrowUp size={20} strokeWidth={2} aria-hidden />
                    </span>
                  </button>
                </form>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

function AssistantMessage({
  message,
  onInternal,
  onDecide,
  onAsk,
  onRetry,
  busy,
}: {
  message: ChatMessage;
  onInternal: (url: string) => void;
  onDecide: (index: number, p: Proposal, confirmed: boolean) => void;
  onAsk: (question: string) => void;
  onRetry: () => void;
  busy: boolean;
}) {
  const t = useTranslations("assistant");
  const th = useTranslations("legalHelpCard");
  const ti = useTranslations("checklist.items");
  const locale = useLocale();
  const openLink = useOpenLink();
  const [copied, setCopied] = useState(false);
  const a = message.answer;

  if (!a) {
    return (
      <div className="flex max-w-[88%] flex-col items-start gap-2" role={message.error ? "alert" : undefined}>
        <p className="rounded-cell rounded-bl-[6px] bg-cell px-4 py-3 text-body text-label-soft">{message.text}</p>
        {message.error && message.retry && (
          <Button size="small" variant="tinted" onClick={onRetry} disabled={busy}>
            {t("retry")}
          </Button>
        )}
      </div>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(a.text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard blocked
    }
  };

  const linkTitle = new Map(a.links.map((l) => [l.url, l]));
  const go = (url: string) => (INTERNAL_ROUTE.test(url) ? onInternal(url) : openLink(url));

  // Inline [words](url) links were already checked against the allowlist by the server.
  const renderLink = (text: string, url: string, key: number) => (
    <button key={key} type="button" onClick={() => go(url)} className="text-tint underline decoration-1 underline-offset-2">
      {text}
    </button>
  );

  const proposalText = (p: Proposal) =>
    p.kind === "addDate"
      ? t("proposeDate", { label: p.label, date: formatDate(p.date, locale, { dateStyle: "long" }) })
      : t(p.kind === "markDone" ? "proposeDone" : "proposeNotDone", { title: ti(`${p.itemId}.title`) });

  return (
    <div className="flex max-w-[92%] flex-col items-start gap-2.5">
      <div className="rounded-cell rounded-bl-[6px] bg-cell px-4 py-3">
        <Markdown text={a.text} renderLink={renderLink} />
      </div>
      {a.limited && <p className="text-footnote italic text-oat">{t("limitedNote")}</p>}

      <div className="flex flex-wrap gap-1.5">
        <ReadAloud text={a.text} />
        <button
          type="button"
          onClick={copy}
          className="pressable inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-separator px-3 text-footnote text-tint"
        >
          {copied ? <Check size={15} strokeWidth={2} aria-hidden /> : <Copy size={15} strokeWidth={1.75} aria-hidden />}
          <span aria-live="polite">{copied ? t("copied") : t("copy")}</span>
        </button>
      </div>

      {a.links.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {a.links.map((l: ChatLink) =>
            l.type === "external" ? (
              <LinkChip key={l.url} url={l.url} title={linkTitle.get(l.url)?.title} />
            ) : (
              <button
                key={l.url}
                type="button"
                onClick={() => onInternal(l.url)}
                className="pressable inline-flex min-h-[36px] items-center rounded-full border border-separator px-3 text-footnote text-tint"
              >
                {l.title} ›
              </button>
            )
          )}
        </div>
      )}

      {a.proposals.map((p, i) => {
        const decided = message.decided?.[i];
        return (
          <div key={i} className="flex w-full flex-col gap-3 rounded-cell border border-separator p-4">
            <p className="text-body">{proposalText(p)}</p>
            {decided ? (
              <p className={`flex items-center gap-1.5 text-subheadline ${decided === "confirmed" ? "text-sage" : "text-secondary-label"}`}>
                {decided === "confirmed" && <Check size={16} strokeWidth={2} aria-hidden />}
                {decided === "confirmed" ? t("confirmed") : t("declined")}
              </p>
            ) : (
              <div className="flex gap-2">
                <Button size="small" onClick={() => onDecide(i, p, true)}>
                  {t("confirm")}
                </Button>
                <Button size="small" variant="tinted" onClick={() => onDecide(i, p, false)}>
                  {t("cancel")}
                </Button>
              </div>
            )}
          </div>
        );
      })}

      {a.helpCard && (
        <div className="flex w-full flex-col gap-2.5 rounded-status bg-indigo-tint p-4">
          <div className="flex items-center gap-2.5">
            <ShieldIcon size={20} detail className="shrink-0 text-lavender" />
            <p className="text-body font-medium">{th("title")}</p>
          </div>
          <p className="text-subheadline text-label-soft">{th("body")}</p>
          <Button size="small" className="self-start" onClick={() => onInternal("/legal/help")}>
            {th("button")}
          </Button>
        </div>
      )}

      {a.usedData.length > 0 && (
        <p className="text-footnote text-secondary-label">{t("usedData", { sources: a.usedData.map((s) => t(`store_${s}`)).join(", ") })}</p>
      )}
      {a.isLegal && !a.limited && <AiLabel />}

      {/* Follow-up questions: one tap to ask, no typing. */}
      {(a.followUps?.length ?? 0) > 0 && (
        <div className="mt-1 flex flex-col items-start gap-1.5">
          <p className="text-footnote text-secondary-label">{t("followUps")}</p>
          {a.followUps!.map((q) => (
            <button
              key={q}
              type="button"
              disabled={busy}
              onClick={() => onAsk(q)}
              className="pressable rounded-control border border-separator bg-cell px-3.5 py-2 text-start text-callout text-tint disabled:opacity-40"
            >
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
