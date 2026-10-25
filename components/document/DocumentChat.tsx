"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp, Quote, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Spinner } from "@/components/ios/Spinner";
import { postJSON } from "@/lib/client";
import { documentText } from "@/lib/documentText";
import type { OpenDocument } from "@/lib/documentSession";

interface Message {
  role: "user" | "assistant";
  text: string;
  /** The part of the document the question was about. */
  quote?: string;
}

/** Chat about the open document. A highlighted part arrives as `quote` and goes with the next question. */
export function DocumentChat({ doc, quote, onClearQuote }: { doc: OpenDocument; quote: string | null; onClearQuote: () => void }) {
  const t = useTranslations("document");
  const locale = useLocale();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (quote) input.current?.focus();
  }, [quote]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages, busy]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    const sent: Message = { role: "user", text: q, quote: quote ?? undefined };
    const history = messages.map((m) => ({ role: m.role, text: m.quote ? `About "${m.quote}": ${m.text}` : m.text }));
    setMessages((list) => [...list, sent]);
    setDraft("");
    onClearQuote();
    setBusy(true);
    try {
      const { answer } = await postJSON<{ answer: string }>("/api/scan/chat", {
        question: q,
        selection: sent.quote,
        documentText: documentText(doc.lines),
        documentKind: doc.result.documentKind,
        summary: doc.result.summary,
        history,
        locale,
      });
      setMessages((list) => [...list, { role: "assistant", text: answer }]);
    } catch {
      setMessages((list) => [...list, { role: "assistant", text: t("chatFailed") }]);
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    ask(draft);
  };

  const suggestions = quote ? [t("sugMean"), t("sugMatter")] : [t("sugDo"), t("sugDates"), t("sugWho")];

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-1 flex-col gap-3 pb-3" aria-live="polite">
        {messages.length === 0 && <p className="px-1 text-subheadline text-secondary-label">{t("chatIntro")}</p>}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="ml-8 flex flex-col items-end gap-1.5 self-end">
              {m.quote && (
                <p className="flex max-w-full items-start gap-1.5 rounded-control border border-separator px-3 py-2 text-footnote text-secondary-label">
                  <Quote size={12} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden />
                  <span className="line-clamp-3">{m.quote}</span>
                </p>
              )}
              <p className="rounded-[18px] rounded-br-md bg-tint-fill px-3.5 py-2.5 text-body text-on-accent">{m.text}</p>
            </div>
          ) : (
            <p key={i} className="mr-8 whitespace-pre-line rounded-[18px] rounded-bl-md bg-cell px-3.5 py-2.5 text-body text-label-soft">
              {m.text}
            </p>
          )
        )}
        {busy && (
          <p className="mr-8 flex items-center gap-2 self-start rounded-[18px] bg-cell px-3.5 py-2.5 text-subheadline text-secondary-label">
            <Spinner size={14} />
            {t("thinking")}
          </p>
        )}
        <div ref={end} />
      </div>

      <div className="sticky bottom-0 flex flex-col gap-2 bg-grouped pb-2 pt-2">
        {!busy && (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button key={s} type="button" onClick={() => ask(s)} className="pressable min-h-[36px] rounded-full border border-separator px-3 text-footnote text-label">
                {s}
              </button>
            ))}
          </div>
        )}
        {quote && (
          <div className="flex items-start gap-2 rounded-control border border-separator bg-cell px-3 py-2">
            <Quote size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-sage" aria-hidden />
            <p className="line-clamp-2 min-w-0 flex-1 text-footnote text-label-soft">
              <span className="sr-only">{t("askingAbout")} </span>
              {quote}
            </p>
            <button type="button" onClick={onClearQuote} aria-label={t("clearQuote")} className="pressable -m-1 flex h-8 w-8 shrink-0 items-center justify-center text-secondary-label">
              <X size={16} strokeWidth={2} aria-hidden />
            </button>
          </div>
        )}
        <form onSubmit={submit} className="flex items-end gap-2 rounded-[22px] border border-separator bg-cell py-1.5 pl-4 pr-1.5">
          <label htmlFor="doc-question" className="sr-only">
            {t("questionLabel")}
          </label>
          <textarea
            id="doc-question"
            ref={input}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(draft);
              }
            }}
            rows={1}
            maxLength={600}
            placeholder={quote ? t("placeholderQuote") : t("placeholder")}
            className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent py-1.5 text-body outline-none placeholder:text-tertiary-label"
          />
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            aria-label={t("send")}
            className="pressable flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-tint-fill text-on-accent disabled:opacity-40"
          >
            <ArrowUp size={18} strokeWidth={2.25} aria-hidden />
          </button>
        </form>
        <p className="px-1 text-caption1 text-secondary-label">{t("chatDisclaimer")}</p>
      </div>
    </div>
  );
}
