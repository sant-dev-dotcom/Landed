"use client";

import { useState } from "react";
import { Globe } from "lucide-react";
import { useTranslations } from "next-intl";
import { LanguageSheet, useCurrentLanguageName } from "./LanguagePicker";

export function LanguageSwitcher() {
  const t = useTranslations("language");
  const name = useCurrentLanguageName();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${t("label")}: ${name}`}
        className="pressable flex min-h-[44px] items-center gap-2 rounded-full border border-separator bg-cell px-4 text-callout"
      >
        <Globe size={17} strokeWidth={1.75} aria-hidden className="text-tint" />
        {name}
      </button>
      <LanguageSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
