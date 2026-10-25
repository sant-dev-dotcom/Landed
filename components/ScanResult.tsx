"use client";

import { useState } from "react";
import { AlertTriangle, Check, ChevronDown, Info, Lock, ShieldCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { ListSection } from "./ios/ListSection";
import { ListRow } from "./ios/ListRow";
import { Button, ButtonLink } from "./ios/Button";
import { AiLabel, Disclaimer } from "./Disclaimer";
import { formatDate } from "@/lib/hooks";
import { addDate, uid } from "@/lib/storage";
import type { ScanResult as Result } from "@/lib/types";

// Clay rose for important, oat for needs attention, sage for low risk.
const RISK = {
  high: { Icon: AlertTriangle, color: "var(--clay)", bg: "var(--urgent-surface)" },
  medium: { Icon: Info, color: "var(--oat)", bg: "var(--oat-surface)" },
  low: { Icon: ShieldCheck, color: "var(--sage)", bg: "var(--sage-surface)" },
} as const;

export function ScanResultView({ result, sample, onAgain }: { result: Result; sample?: boolean; onAgain: () => void }) {
  const t = useTranslations("scan");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [added, setAdded] = useState<Set<number>>(new Set());
  const risk = RISK[result.riskLevel];

  const add = async (i: number) => {
    const d = result.dates[i];
    await addDate({
      id: uid(),
      docType: result.documentKind,
      label: d.label,
      date: d.date,
      note: result.suggestedNextStep,
      reminder: true,
      createdFrom: "scan",
    });
    setAdded((s) => new Set(s).add(i));
    try {
      navigator.vibrate?.(10);
    } catch {
      /* optional */
    }
  };

  return (
    <div className="flex flex-col gap-7 px-5 pb-8 pt-2">
      <ListSection header={t("whatThisIs")}>
        <ListRow
          title={result.documentKind}
          trailing={
            <span
              className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-footnote"
              style={{ background: risk.bg, color: risk.color }}
            >
              <risk.Icon size={14} strokeWidth={1.75} aria-hidden />
              {t(`risk_${result.riskLevel}`)}
            </span>
          }
        />
      </ListSection>

      {result.riskLevel !== "low" && (
        <div
          className="flex flex-col gap-3.5 rounded-status p-5"
          style={{ background: risk.bg }}
          role={result.riskLevel === "high" ? "alert" : undefined}
        >
          <div className="flex items-center gap-3">
            <risk.Icon size={22} strokeWidth={1.75} style={{ color: risk.color }} className="shrink-0" aria-hidden />
            <p className="text-[1.3125rem] leading-snug">{result.riskLevel === "high" ? t("highRiskTitle") : t("mediumRiskTitle")}</p>
          </div>
          {result.riskReason && <p className="text-body text-label-soft">{result.riskReason}</p>}
          {result.riskLevel === "high" && (
            <ButtonLink href="/legal/help" size="medium" className="self-start">
              {t("findHelp")}
            </ButtonLink>
          )}
        </div>
      )}

      <ListSection header={t("summary")} footer={<AiLabel />}>
        <p className="px-4 py-3.5 text-headline text-label-soft">{result.summary}</p>
      </ListSection>

      <ListSection header={t("dates")}>
        {result.dates.length === 0 ? (
          <ListRow title={<span className="text-secondary-label">{t("noDates")}</span>} />
        ) : (
          result.dates.map((d, i) => (
            <ListRow
              key={i}
              title={d.label}
              subtitle={formatDate(d.date, locale, { dateStyle: "long" })}
              trailing={
                added.has(i) ? (
                  <span className="flex min-h-[44px] items-center gap-1 px-2 text-subheadline text-sage">
                    <Check size={16} strokeWidth={2} aria-hidden />
                    {tc("added")}
                  </span>
                ) : (
                  <Button size="small" onClick={() => add(i)} aria-label={t("addDate", { label: d.label })}>
                    {tc("add")}
                  </Button>
                )
              }
            />
          ))
        )}
      </ListSection>

      {result.terms.length > 0 && (
        <ListSection header={t("wordsToKnow")}>
          {result.terms.map((term, i) => (
            <details key={i} className="list-row group pl-4">
              <summary className="row-body relative flex min-h-[52px] cursor-pointer list-none items-center gap-2 py-[14px] pr-4 [&::-webkit-details-marker]:hidden">
                <span className="flex-1 text-body">{term.term}</span>
                <ChevronDown
                  size={18}
                  strokeWidth={1.75}
                  className="shrink-0 text-tertiary-label transition-transform duration-200 group-open:rotate-180"
                  aria-hidden
                />
                <span className="row-sep absolute bottom-0 left-0 right-0 h-[0.5px] bg-separator" aria-hidden />
              </summary>
              <p className="pb-3.5 pr-4 text-subheadline text-label-soft">{term.meaning}</p>
            </details>
          ))}
        </ListSection>
      )}

      <ListSection header={t("nextStep")}>
        <p className="px-4 py-3.5 text-body text-label-soft">{result.suggestedNextStep}</p>
      </ListSection>

      <div className="space-y-3">
        <p className="flex items-center justify-center gap-1.5 text-footnote text-secondary-label" role="status">
          <Lock size={14} strokeWidth={1.75} aria-hidden />
          {t("photoNotSaved")}
        </p>
        {sample && <p className="text-center text-caption1 text-secondary-label">{tc("sampleData")}</p>}
        <Disclaimer className="text-center" />
        <Button variant="tinted" size="large" onClick={onAgain}>
          {t("scanAnother")}
        </Button>
      </div>
    </div>
  );
}
