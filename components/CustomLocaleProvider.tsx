"use client";

import { useEffect, useState, type ReactNode } from "react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { CUSTOM_LOCALE } from "@/i18n/languages";
import { setActiveCustomLanguage } from "@/lib/client";
import { getCustomLanguage, KEYS, type CustomLanguage } from "@/lib/storage";

type Tree = Record<string, unknown>;

// English underneath, so keys added after the translation was made still show something.
function merge(base: Tree, over: Tree): Tree {
  const out: Tree = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = v && typeof v === "object" && base[k] && typeof base[k] === "object" ? merge(base[k] as Tree, v as Tree) : v;
  }
  return out;
}

/** Swaps in the on-device translation for a language the user typed in. */
export function CustomLocaleProvider({ english, children }: { english: AbstractIntlMessages; children: ReactNode }) {
  const [custom, setCustom] = useState<CustomLanguage | null | undefined>(undefined);

  useEffect(() => {
    const load = () => getCustomLanguage().then(setCustom);
    const onStorage = (e: Event) => {
      const key = (e as CustomEvent<string>).detail;
      if (key === KEYS.customLanguage || key === "*") load();
    };
    load();
    window.addEventListener("landed:storage", onStorage);
    return () => window.removeEventListener("landed:storage", onStorage);
  }, []);

  useEffect(() => {
    if (custom === undefined) return;
    const html = document.documentElement;
    html.lang = custom?.tag ?? "en";
    html.dir = custom?.rtl ? "rtl" : "ltr";
    setActiveCustomLanguage(custom?.name ?? null);
    return () => {
      // Put back what the server rendered, so React's <html lang/dir> props apply cleanly on the next locale.
      html.lang = CUSTOM_LOCALE;
      html.dir = "ltr";
      setActiveCustomLanguage(null);
    };
  }, [custom]);

  // Render nothing until storage answers, so English doesn't flash first.
  if (custom === undefined) return null;
  return (
    <NextIntlClientProvider
      locale={CUSTOM_LOCALE}
      messages={(custom ? merge(english as Tree, custom.messages) : english) as AbstractIntlMessages}
    >
      {children}
    </NextIntlClientProvider>
  );
}
