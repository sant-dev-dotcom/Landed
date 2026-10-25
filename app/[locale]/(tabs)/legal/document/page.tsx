"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ChevronLeft, Info, Lock, MessageCircleQuestion, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { ButtonLink } from "@/components/ios/Button";
import { SegmentedControl } from "@/components/ios/SegmentedControl";
import { ScanResultView } from "@/components/ScanResult";
import { DocumentChat } from "@/components/document/DocumentChat";
import { DocumentSheet, type SheetDetent } from "@/components/document/DocumentSheet";
import { DocumentViewer } from "@/components/document/DocumentViewer";
import { closeDocument, getOpenDocument, type OpenDocument } from "@/lib/documentSession";

const RISK = {
  high: { Icon: AlertTriangle, color: "var(--clay)", bg: "var(--urgent-surface)" },
  medium: { Icon: Info, color: "var(--oat)", bg: "var(--oat-surface)" },
  low: { Icon: ShieldCheck, color: "var(--sage)", bg: "var(--sage-surface)" },
} as const;

/**
 * A scanned document after the AI read it, made for a phone: the document fills the screen
 * (pinch to zoom, hold to highlight), and a bottom sheet holds what the AI found and a chat about
 * it. The sheet peeks with the summary, opens halfway to ask about a highlight, or all the way.
 */
export default function DocumentPage() {
  const t = useTranslations("document");
  const ts = useTranslations("scan");
  const tl = useTranslations("legal");
  const router = useRouter();
  const [doc, setDoc] = useState<OpenDocument | null | undefined>(undefined);
  const [picked, setPicked] = useState("");
  const [quote, setQuote] = useState<string | null>(null);
  const [panel, setPanel] = useState<"details" | "chat">("details");
  const [detent, setDetent] = useState<SheetDetent>("peek");

  // Kept in memory only, so after a reload the document is gone (it's never saved).
  useEffect(() => setDoc(getOpenDocument()), []);
  const onPick = useCallback((text: string) => setPicked(text), []);

  const close = () => {
    closeDocument();
    router.push("/legal");
  };
  const scanAnother = () => {
    closeDocument();
    router.push("/legal/scan");
  };
  const askAbout = () => {
    setQuote(picked);
    setPanel("chat");
    setDetent("half");
    document.getSelection()?.removeAllRanges();
    setPicked("");
  };
  const open = (p: "details" | "chat") => {
    setPanel(p);
    if (detent === "peek") setDetent("half");
  };

  if (doc === undefined) return null;
  if (doc === null) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-grouped px-8 text-center">
        <Lock size={28} strokeWidth={1.75} className="text-secondary-label" aria-hidden />
        <p className="text-body text-label-soft">{t("gone")}</p>
        <ButtonLink href="/legal/scan" size="medium">
          {t("scanAgain")}
        </ButtonLink>
      </main>
    );
  }

  const risk = RISK[doc.result.riskLevel];

  return (
    // Over the tab bar, in the same phone-width column as the rest of the app.
    <div className="fixed inset-0 z-50 bg-grouped">
      <div className="relative mx-auto flex h-full w-full max-w-app flex-col md:border-x md:border-separator">
        <header className="bar-blur hairline-b shrink-0 pt-safe">
          <div className="flex min-h-[52px] items-center px-2">
            <button type="button" onClick={close} className="pressable flex min-h-[44px] min-w-[88px] items-center text-body text-tint">
              <ChevronLeft size={26} strokeWidth={1.75} aria-hidden className="rtl:-scale-x-100" />
              {tl("title")}
            </button>
            <h1 className="min-w-0 flex-1 truncate text-center text-body font-medium">{doc.result.documentKind}</h1>
            <span className="flex min-w-[88px] justify-end pr-3 text-secondary-label" title={t("notSaved")}>
              <Lock size={16} strokeWidth={1.75} aria-hidden />
              <span className="sr-only">{t("notSaved")}</span>
            </span>
          </div>
        </header>

        <div className="relative min-h-0 flex-1">
          {/* Room at the bottom so the end of the page clears the peeking sheet. */}
          <div className="h-full pb-[calc(140px+env(safe-area-inset-bottom))]">
            <DocumentViewer doc={doc} onPick={onPick} />
          </div>

          <DocumentSheet
            detent={detent}
            onDetent={setDetent}
            above={
              picked ? (
                <button
                  type="button"
                  onClick={askAbout}
                  className="pressable flex min-h-[48px] max-w-full items-center gap-2 rounded-full bg-tint-fill py-2 pl-4 pr-5 text-callout font-medium text-on-accent shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
                >
                  <MessageCircleQuestion size={18} strokeWidth={1.75} className="shrink-0" aria-hidden />
                  <span className="shrink-0">{t("askThis")}</span>
                  <span className="min-w-0 truncate font-normal opacity-80">“{picked}”</span>
                </button>
              ) : null
            }
            peek={
              <button type="button" onClick={() => open("details")} className="flex w-full flex-col items-start gap-1.5 text-start">
                <span className="flex w-full items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-headline">{doc.result.documentKind}</span>
                  <span className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-footnote" style={{ background: risk.bg, color: risk.color }}>
                    <risk.Icon size={14} strokeWidth={1.75} aria-hidden />
                    {ts(`risk_${doc.result.riskLevel}`)}
                  </span>
                </span>
                <span className="line-clamp-2 text-subheadline text-label-soft">{doc.result.summary}</span>
                <span className="text-footnote text-tint">{t("peekMore")}</span>
              </button>
            }
            header={
              <SegmentedControl
                label={t("panelLabel")}
                value={panel}
                onChange={(p) => setPanel(p)}
                options={[
                  { value: "details", label: t("details") },
                  { value: "chat", label: t("chat") },
                ]}
              />
            }
          >
            {panel === "details" ? (
              <ScanResultView result={doc.result} sample={doc.sample} onAgain={scanAnother} />
            ) : (
              <div className="flex min-h-full flex-col px-4">
                <DocumentChat doc={doc} quote={quote} onClearQuote={() => setQuote(null)} />
              </div>
            )}
          </DocumentSheet>
        </div>
      </div>
    </div>
  );
}
