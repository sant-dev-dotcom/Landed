"use client";

import { useEffect, useState } from "react";
import { Square, Volume2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { intlTag } from "@/i18n/languages";

/** Markdown → plain sentences for speech. */
function plain(md: string) {
  return md
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`#>]+/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}

// One answer is read at a time across the app.
let current: { stop: () => void } | null = null;

/**
 * Reads text aloud with the phone's built-in voice, in the app's language. Nothing is sent
 * anywhere. Hidden when the browser can't speak.
 */
export function ReadAloud({ text, className = "" }: { text: string; className?: string }) {
  const t = useTranslations("assistant");
  const locale = useLocale();
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    return () => {
      if (speaking) window.speechSynthesis?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!supported) return null;

  const toggle = () => {
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    current?.stop();
    synth.cancel();
    const u = new SpeechSynthesisUtterance(plain(text));
    const lang = intlTag(locale);
    u.lang = lang;
    // Prefer an installed voice for this language; otherwise the browser picks one.
    const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang.toLowerCase().split("-")[0]));
    if (voice) u.voice = voice;
    u.rate = 0.95;
    u.onend = u.onerror = () => setSpeaking(false);
    current = { stop: () => setSpeaking(false) };
    setSpeaking(true);
    synth.speak(u);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={speaking}
      className={`pressable inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-separator px-3 text-footnote text-tint ${className}`}
    >
      {speaking ? <Square size={13} strokeWidth={2} fill="currentColor" aria-hidden /> : <Volume2 size={15} strokeWidth={1.75} aria-hidden />}
      {speaking ? t("stopReading") : t("readAloud")}
    </button>
  );
}
