"use client";

import { useEffect, useState } from "react";
import { Camera, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Card } from "./ios/Card";
import { Button } from "./ios/Button";
import { Toggle } from "./ios/Toggle";
import { BarButton, Sheet } from "./ios/Sheet";
import { ListSection } from "./ios/ListSection";
import { ListRow } from "./ios/ListRow";
import { daysUntil, formatDate } from "@/lib/hooks";
import { addDate, removeDate, uid, updateDate } from "@/lib/storage";
import type { TrackedDate } from "@/lib/types";

// Clay rose for urgent (60 days or less, or just passed), oat for coming up, muted for later.
function urgency(days: number) {
  if (days < 0 || days <= 60) return "text-clay";
  if (days <= 180) return "text-oat";
  return "text-secondary-label";
}

export function DateTimeline({ dates, onScan }: { dates: TrackedDate[]; onScan: () => void }) {
  const t = useTranslations("legal");
  const locale = useLocale();
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const daysText = (days: number) => (days < 0 ? t("daysAgo", { count: -days }) : t("daysLeft", { count: days }));

  return (
    <>
      <ListSection
        id="my-dates"
        header={t("myDates")}
        headerTrailing={
          <button type="button" onClick={() => setAdding(true)} className="pressable -my-3 min-h-[44px] px-1 text-callout text-tint">
            {t("addDate")}
          </button>
        }
        bare
      >
        {dates.length === 0 ? (
          <Card className="flex flex-col items-start gap-4 p-5">
            <p className="text-body text-label-soft">{t("datesEmpty")}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="tinted" size="small" icon={<Camera size={18} strokeWidth={1.75} aria-hidden />} onClick={onScan}>
                {t("scan")}
              </Button>
              <Button variant="tinted" size="small" icon={<Plus size={18} strokeWidth={1.75} aria-hidden />} onClick={() => setAdding(true)}>
                {t("addDate")}
              </Button>
            </div>
          </Card>
        ) : (
          <ul className="no-scrollbar -mx-5 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-5" aria-label={t("myDates")}>
            {dates.map((d) => {
              const days = daysUntil(d.date);
              return (
                <li key={d.id} className="w-[150px] shrink-0 snap-start">
                  <button
                    type="button"
                    onClick={() => setOpenId(d.id)}
                    className="pressable flex h-full w-full flex-col gap-1.5 rounded-tile bg-cell p-3.5 text-start"
                  >
                    <span className={`text-caption1 ${urgency(days)}`}>{daysText(days)}</span>
                    <span className="text-body">{d.label}</span>
                    <span className="text-footnote text-secondary-label">{formatDate(d.date, locale)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </ListSection>
      <AddDateSheet open={adding} onClose={() => setAdding(false)} />
      <DateSheet date={dates.find((d) => d.id === openId) ?? null} onClose={() => setOpenId(null)} daysText={daysText} />
    </>
  );
}

/** One tracked date: when it is, the reminder switch, and delete. */
function DateSheet({ date, onClose, daysText }: { date: TrackedDate | null; onClose: () => void; daysText: (days: number) => string }) {
  const t = useTranslations("legal");
  const tc = useTranslations("common");
  const locale = useLocale();
  // Keep showing the last date while the sheet animates closed.
  const [shown, setShown] = useState<TrackedDate | null>(date);
  if (date && date !== shown) setShown(date);
  const d = date ?? shown;
  const days = d ? daysUntil(d.date) : 0;

  return (
    <Sheet
      open={Boolean(date)}
      onClose={onClose}
      title={d?.label ?? ""}
      detent="medium"
      trailing={
        <BarButton bold onClick={onClose}>
          {tc("done")}
        </BarButton>
      }
    >
      {d && (
        <div className="flex flex-col gap-6 px-5 pb-8 pt-2">
          <ListSection>
            <ListRow title={t("docType")} value={d.docType} />
            <ListRow
              title={t("dateField")}
              subtitle={<span className={urgency(days)}>{daysText(days)}</span>}
              value={formatDate(d.date, locale, { dateStyle: "long" })}
            />
            {d.note && <ListRow title={t("noteField")} subtitle={d.note} />}
            <ListRow
              title={t("reminder")}
              trailing={<Toggle checked={d.reminder} onChange={(v) => updateDate(d.id, { reminder: v })} label={`${t("reminder")}: ${d.label}`} />}
            />
          </ListSection>
          {d.createdFrom === "scan" && <p className="-mt-3 px-1 text-footnote text-secondary-label">{t("fromScan")}</p>}
          <Button
            variant="destructive"
            size="large"
            icon={<Trash2 size={18} strokeWidth={1.75} aria-hidden />}
            onClick={async () => {
              await removeDate(d.id);
              onClose();
            }}
            aria-label={t("deleteDate", { label: d.label })}
          >
            {tc("delete")}
          </Button>
        </div>
      )}
    </Sheet>
  );
}

const DOC_TYPES = ["workPermit", "passport", "uscis", "court", "i94", "lease", "other"] as const;

type DocType = (typeof DOC_TYPES)[number];

export function AddDateSheet({
  open,
  onClose,
  initialDocType,
  initialLabel,
}: {
  open: boolean;
  onClose: () => void;
  initialDocType?: string;
  initialLabel?: string;
}) {
  const t = useTranslations("legal");
  const tc = useTranslations("common");
  const [docType, setDocType] = useState<DocType>("workPermit");
  const [label, setLabel] = useState("");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    if (initialDocType && (DOC_TYPES as readonly string[]).includes(initialDocType)) setDocType(initialDocType as DocType);
    if (initialLabel) setLabel(initialLabel);
  }, [open, initialDocType, initialLabel]);

  const valid = label.trim() && /^\d{4}-\d{2}-\d{2}$/.test(date);
  const save = async () => {
    if (!valid) return;
    await addDate({
      id: uid(),
      docType: t(`docTypes.${docType}`),
      label: label.trim(),
      date,
      note: note.trim() || undefined,
      reminder: true,
      createdFrom: "manual",
    });
    setLabel("");
    setDate("");
    setNote("");
    onClose();
  };

  const field = "min-h-[44px] w-full bg-transparent text-body outline-none placeholder:text-tertiary-label";

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("addSheetTitle")}
      detent="medium"
      leading={<BarButton onClick={onClose}>{tc("cancel")}</BarButton>}
      trailing={
        <BarButton bold onClick={save} disabled={!valid}>
          {tc("add")}
        </BarButton>
      }
    >
      <form
        className="space-y-6 px-5 pb-8 pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="list-section overflow-hidden rounded-cell bg-cell">
          <label className="list-row flex items-center gap-3 pl-4">
            <span className="row-body relative flex flex-1 items-center gap-3 pr-4">
              <span className="w-28 shrink-0 text-body">{t("docType")}</span>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value as (typeof DOC_TYPES)[number])}
                className={`${field} bg-cell text-end text-secondary-label`}
              >
                {DOC_TYPES.map((k) => (
                  <option key={k} value={k}>
                    {t(`docTypes.${k}`)}
                  </option>
                ))}
              </select>
              <span className="row-sep absolute bottom-0 left-0 right-0 h-[0.5px] bg-separator" aria-hidden />
            </span>
          </label>
          <label className="list-row flex items-center gap-3 pl-4">
            <span className="row-body relative flex flex-1 flex-col pr-4 pt-2">
              <span className="text-footnote text-secondary-label">{t("labelField")}</span>
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("labelPlaceholder")} className={field} maxLength={80} />
              <span className="row-sep absolute bottom-0 left-0 right-0 h-[0.5px] bg-separator" aria-hidden />
            </span>
          </label>
          <label className="list-row flex items-center gap-3 pl-4">
            <span className="row-body relative flex flex-1 items-center gap-3 pr-4">
              <span className="w-28 shrink-0 text-body">{t("dateField")}</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${field} text-end [color-scheme:dark]`} />
              <span className="row-sep absolute bottom-0 left-0 right-0 h-[0.5px] bg-separator" aria-hidden />
            </span>
          </label>
          <label className="list-row flex items-center gap-3 pl-4">
            <span className="row-body relative flex flex-1 flex-col pr-4 pt-2">
              <span className="text-footnote text-secondary-label">{t("noteField")}</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("notePlaceholder")} className={field} maxLength={160} />
            </span>
          </label>
        </div>
        <button type="submit" className="sr-only">
          {tc("add")}
        </button>
      </form>
    </Sheet>
  );
}
