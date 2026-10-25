"use client";

import { useTranslations } from "next-intl";

export function Disclaimer({ className = "" }: { className?: string }) {
  const t = useTranslations();
  return (
    <p role="note" className={`text-footnote italic text-secondary-label ${className}`}>
      {t("disclaimer")}
    </p>
  );
}

export function AiLabel() {
  const t = useTranslations("common");
  return <p className="text-note italic text-secondary-label">{t("aiLabel")}</p>;
}
