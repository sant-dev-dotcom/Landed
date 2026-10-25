"use client";

import { CalendarPlus, CheckCircle2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "./ios/Button";
import { ClockIcon, WarningIcon } from "./LampIcons";
import { formatDate, statusFor } from "@/lib/hooks";
import type { TrackedDate } from "@/lib/types";

// Clay rose for urgent, oat for coming up, sage when all is well. Always an icon and words.
const TONE = {
  red: { card: "bg-red-tint", fg: "text-clay", Icon: ({ className }: { className: string }) => <WarningIcon size={22} className={className} /> },
  yellow: { card: "bg-orange-tint", fg: "text-oat", Icon: ({ className }: { className: string }) => <ClockIcon size={22} className={className} /> },
  green: { card: "bg-green-tint", fg: "text-sage", Icon: ({ className }: { className: string }) => <CheckCircle2 size={22} strokeWidth={1.75} className={className} aria-hidden /> },
  empty: { card: "bg-cell", fg: "text-sage", Icon: ({ className }: { className: string }) => <CalendarPlus size={22} strokeWidth={1.75} className={className} aria-hidden /> },
} as const;

export function StatusCard({ dates, onPrepare }: { dates: TrackedDate[]; onPrepare: () => void }) {
  const t = useTranslations("status");
  const locale = useLocale();
  const { status, next, days = 0 } = statusFor(dates);
  const { card, fg, Icon } = TONE[status];

  let headline: string;
  let sub: string;
  if (status === "empty") {
    headline = t("empty");
    sub = t("emptySub");
  } else if (status === "red" && days < 0) {
    headline = t("redPast");
    sub = t("redPastSub", { label: next!.label, count: -days });
  } else {
    headline = status === "green" ? t("green") : status === "yellow" ? t("yellow", { count: days }) : t("red", { count: days });
    sub =
      status === "green" && (!next || days < 0 || days > 180)
        ? next && days >= 0
          ? t("nextSub", { label: next.label, date: formatDate(next.date, locale) })
          : t("greenSub")
        : t("nextSub", { label: next!.label, date: formatDate(next!.date, locale) });
  }

  return (
    <div className={`flex flex-col gap-3.5 rounded-status p-5 ${card}`} role={status === "red" ? "status" : undefined}>
      <div className="flex items-center gap-3">
        <Icon className={`shrink-0 ${fg}`} />
        <p className="text-[1.3125rem] leading-snug">{headline}</p>
      </div>
      <p className="text-body text-label-soft">{dates.length > 0 ? `${t("count", { count: dates.length })} · ${sub}` : sub}</p>
      <Button size="medium" className="self-start" onClick={onPrepare}>
        {t("prepare")}
      </Button>
    </div>
  );
}
