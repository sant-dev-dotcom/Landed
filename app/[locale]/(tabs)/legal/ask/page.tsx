"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Mic, MicOff } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { NavBar } from "@/components/ios/NavBar";
import { ListSection } from "@/components/ios/ListSection";
import { ListRow } from "@/components/ios/ListRow";
import { Screen } from "@/components/ios/Screen";
import { Spinner } from "@/components/ios/Spinner";
import { BarButton } from "@/components/ios/Sheet";
import { AnswerWithSources } from "@/components/AnswerWithSources";
import { Disclaimer } from "@/components/Disclaimer";
import { intlTag } from "@/i18n/languages";
import { postJSON } from "@/lib/client";
import { getQuestions, saveQuestions, uid } from "@/lib/storage";
import type { GroundedAnswer, SavedQuestion } from "@/lib/types";

/* Minimal typing for the Web Speech API (not in TS's DOM lib everywhere). */
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

export default function AskPage() {
  const t = useTranslations("ask");
  const tl = useTranslations("legal");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [items, setItems] = useState<SavedQuestion[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [listening, setListening] = useState(false);
  const [speech, setSpeech] = useState<SpeechCtor | null>(null);
  const recRef = useRef<SpeechRec | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getQuestions().then(setItems);
    const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
    setSpeech(() => w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [items, pending]);

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || pending) return;
    setInput("");
    const item: SavedQuestion = { id: uid(), question, askedAt: new Date().toISOString() };
    setItems((s) => [...s, item]);
    setPending(true);
    let answer: GroundedAnswer;
    try {
      ({ answer } = await postJSON<{ answer: GroundedAnswer }>("/api/ask", { question, locale }));
    } catch {
      answer = {
        answer: tc("error"),
        sources: [],
        isCaseSpecific: false,
        redirectToHelp: false,
      };
    }
    setPending(false);
    setItems((s) => {
      const next = s.map((x) => (x.id === item.id ? { ...x, answer } : x));
      saveQuestions(next);
      return next;
    });
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
    rec.onresult = (e) => {
      const text = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join("");
      setInput(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  const starters = [t("q1"), t("q2"), t("q3"), t("q4")];

  return (
    <Screen push withTabBar={false}>
      <NavBar
        title={t("title")}
        back={{ href: "/legal", label: tl("title") }}
        trailing={
          items.length > 0 ? (
            <BarButton
              onClick={() => {
                setItems([]);
                saveQuestions([]);
              }}
            >
              {t("clear")}
            </BarButton>
          ) : undefined
        }
      />

      <div className="px-5 pb-[calc(50px+env(safe-area-inset-bottom)+80px)] pt-4">
        {items.length === 0 ? (
          <div className="flex flex-col gap-7">
            <div className="pt-4">
              <h2 className="text-title2">{t("emptyTitle")}</h2>
              <p className="mt-2 text-body text-label-soft">{t("emptySub")}</p>
            </div>
            <ListSection header={t("suggested")}>
              {starters.map((q) => (
                <ListRow key={q} title={q} tint onClick={() => ask(q)} />
              ))}
            </ListSection>
            <Disclaimer />
          </div>
        ) : (
          <ol className="flex flex-col gap-4" aria-live="polite">
            {items.map((it) => (
              <li key={it.id} className="flex flex-col gap-3">
                <div className="flex justify-end">
                  <p className="max-w-[80%] rounded-cell rounded-br-[6px] bg-tint-fill px-4 py-3 text-body text-on-accent">
                    <span className="sr-only">{t("you")}: </span>
                    {it.question}
                  </p>
                </div>
                {it.answer && (
                  <div>
                    <span className="sr-only">{t("landed")}: </span>
                    <AnswerWithSources answer={it.answer} />
                  </div>
                )}
              </li>
            ))}
            {pending && (
              <li className="flex items-center gap-2 text-subheadline text-secondary-label">
                <Spinner size={18} />
                {t("thinking")}
              </li>
            )}
            <li>
              <Disclaimer className="pt-2" />
            </li>
          </ol>
        )}
        <div ref={endRef} />
      </div>

      {/* Input bar, pinned above the tab bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="bar-blur hairline-t fixed bottom-[calc(50px+env(safe-area-inset-bottom))] left-1/2 z-30 flex w-full max-w-app -translate-x-1/2 items-end gap-2 px-3 py-2.5"
      >
        {speech && (
          <button
            type="button"
            onClick={toggleMic}
            aria-label={listening ? t("micStop") : t("mic")}
            aria-pressed={listening}
            className={`pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
              listening ? "bg-red-tint text-red-text" : "text-secondary-label"
            }`}
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
            maxLength={600}
            enterKeyHint="send"
            className="min-h-[42px] w-full bg-transparent text-body outline-none placeholder:text-secondary-label"
          />
        </label>
        <button
          type="submit"
          disabled={!input.trim() || pending}
          aria-label={t("send")}
          className="pressable flex h-11 w-11 shrink-0 items-center justify-center disabled:opacity-40"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-tint-fill text-on-accent">
            <ArrowUp size={20} strokeWidth={2} aria-hidden />
          </span>
        </button>
      </form>
    </Screen>
  );
}
