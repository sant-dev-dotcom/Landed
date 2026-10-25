"use client";

import { intlTag } from "@/i18n/languages";

/** Month + day tile for an event (lavender: community). */
export function DateBadge({ iso, when, locale, large }: { iso?: string; when?: string; locale: string; large?: boolean }) {
  // SerpApi gives "Oct 28" style start dates; our samples use ISO dates.
  let month = "";
  let day = "";
  if (iso && /^\d{4}-\d{2}-\d{2}/.test(iso)) {
    const [y, m, d] = iso.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    month = date.toLocaleDateString(intlTag(locale), { month: "short" });
    day = String(d);
  } else if (iso) {
    const m = iso.match(/([A-Za-z]+)\s+(\d{1,2})/);
    if (m) {
      month = m[1].slice(0, 3);
      day = m[2];
    }
  }
  return (
    <span
      className={`flex shrink-0 flex-col items-center justify-center rounded-control bg-indigo-tint ${large ? "h-[64px] w-[60px]" : "h-[50px] w-[46px]"}`}
      aria-label={when || iso}
    >
      <span className="text-caption2 uppercase text-lavender">{month || "•"}</span>
      <span className={large ? "text-title2 leading-7" : "text-title3 leading-6"}>{day}</span>
    </span>
  );
}
