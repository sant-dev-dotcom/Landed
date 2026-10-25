"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Printer, Share } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { BarButton, Sheet } from "./ios/Sheet";
import { Button } from "./ios/Button";
import { Card } from "./ios/Card";
import { ListSection } from "./ios/ListSection";
import { ListRow } from "./ios/ListRow";
import { SegmentedControl } from "./ios/SegmentedControl";
import { LoadingBlock } from "./ios/Spinner";
import { useToast } from "./ios/Toast";
import { Markdown } from "./Markdown";
import { AiLabel, Disclaimer } from "./Disclaimer";
import { formatDate, useDates, useProfile } from "@/lib/hooks";
import { postJSON } from "@/lib/client";
import { savePrep } from "@/lib/storage";
import type { PrepSummary } from "@/lib/types";

export function PrepSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("prep");
  const tc = useTranslations("common");
  const locale = useLocale();
  const toast = useToast();
  const [dates] = useDates();
  const [profile] = useProfile();
  const [questions, setQuestions] = useState<string[]>(["", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [summary, setSummary] = useState<PrepSummary | null>(null);
  const [view, setView] = useState<"locale" | "en">("locale");

  const create = async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await postJSON<{ summary: PrepSummary }>("/api/prep", {
        locale,
        dates: dates.map(({ label, date, docType }) => ({ label, date, docType })),
        questions: questions.filter((q) => q.trim()),
        profile: profile ? { city: profile.city, originCountry: profile.originCountry, name: profile.name } : undefined,
      });
      setSummary(data.summary);
      setView("locale");
      await savePrep({ questions: questions.filter((q) => q.trim()), summary: data.summary, createdAt: new Date().toISOString() });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const bilingual = locale !== "en";
  const fullText = summary ? (bilingual ? `${summary.summaryLocale}\n\n---\n\n${summary.summaryEnglish}` : summary.summaryEnglish) : "";

  const share = async () => {
    if (!summary) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: t("title"), text: fullText });
      } catch {
        /* user cancelled */
      }
    } else {
      await copy();
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fullText);
      toast(t("copied"));
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("title")}
      detent={summary ? "large" : "medium"}
      leading={
        summary ? (
          <BarButton onClick={() => setSummary(null)}>{t("edit")}</BarButton>
        ) : (
          <BarButton onClick={onClose}>{tc("cancel")}</BarButton>
        )
      }
      trailing={
        summary ? (
          <>
            <BarButton onClick={share} ariaLabel={t("share")}>
              <Share size={22} strokeWidth={1.75} aria-hidden />
            </BarButton>
            <BarButton onClick={() => window.print()} ariaLabel={t("print")}>
              <Printer size={22} strokeWidth={1.75} aria-hidden />
            </BarButton>
          </>
        ) : (
          <BarButton bold onClick={onClose}>
            {tc("done")}
          </BarButton>
        )
      }
    >
      {loading ? (
        <LoadingBlock text={t("creating")} />
      ) : summary ? (
        <div className="flex flex-col gap-4 px-5 pb-8 pt-2">
          {bilingual && (
            <SegmentedControl
              label={t("title")}
              value={view}
              onChange={setView}
              options={[
                { value: "locale", label: t("yourLanguage") },
                { value: "en", label: t("english") },
              ]}
            />
          )}
          <Card className="p-5">
            <Markdown text={view === "locale" && bilingual ? summary.summaryLocale : summary.summaryEnglish} className="mb-4" />
            <AiLabel />
          </Card>
          <div className="flex gap-3">
            <Button variant="tinted" size="medium" className="flex-1" icon={<Copy size={18} strokeWidth={1.75} aria-hidden />} onClick={copy}>
              {t("copy")}
            </Button>
            <Button variant="tinted" size="medium" className="flex-1" icon={<Printer size={18} strokeWidth={1.75} aria-hidden />} onClick={() => window.print()}>
              {t("print")}
            </Button>
          </div>
          <Disclaimer />
          {typeof document !== "undefined" &&
            createPortal(
              <div className="print-root print-only p-8 text-black">
                <Markdown text={bilingual ? summary.summaryLocale : summary.summaryEnglish} />
                {bilingual && (
                  <div style={{ breakBefore: "page" }}>
                    <Markdown text={summary.summaryEnglish} />
                  </div>
                )}
                <p className="mt-6 text-footnote">{tc("aiLabel")}</p>
              </div>,
              document.body
            )}
        </div>
      ) : (
        <div className="flex flex-col gap-7 px-5 pb-8 pt-2">
          <p className="text-body text-label-soft">{t("intro")}</p>
          <ListSection header={t("datesSection")}>
            {dates.length === 0 ? (
              <ListRow title={<span className="text-secondary-label">{t("noDates")}</span>} />
            ) : (
              dates.map((d) => <ListRow key={d.id} title={d.label} subtitle={`${d.docType} · ${formatDate(d.date, locale)}`} />)
            )}
          </ListSection>
          <ListSection header={t("questions")} footer={t("questionsFooter")}>
            {questions.map((q, i) => (
              <label key={i} className="list-row flex pl-4">
                <span className="row-body relative flex flex-1 pr-4">
                  <input
                    value={q}
                    maxLength={300}
                    onChange={(e) => setQuestions((qs) => qs.map((x, j) => (j === i ? e.target.value : x)))}
                    placeholder={t("questionPlaceholder", { n: i + 1 })}
                    aria-label={t("questionPlaceholder", { n: i + 1 })}
                    className="min-h-[52px] w-full bg-transparent text-body outline-none placeholder:text-tertiary-label"
                  />
                  <span className="row-sep absolute bottom-0 left-0 right-0 h-[0.5px] bg-separator" aria-hidden />
                </span>
              </label>
            ))}
          </ListSection>
          {error && <p className="text-center text-subheadline text-red-text">{tc("error")}</p>}
          <Button onClick={create}>{t("create")}</Button>
          <Disclaimer />
        </div>
      )}
    </Sheet>
  );
}
