"use client";

import { useId, useState } from "react";
import { ChevronDown, Copy, ExternalLink, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ios/Button";
import { useToast } from "@/components/ios/Toast";
import { formatDate } from "@/lib/hooks";
import type { EventDraft } from "@/lib/types";

/**
 * "Need help with event planning, catering, etc?": a prompt to give the Muse app, filled in from
 * the event being created. The Open Muse button isn't connected to the app yet.
 */
export function MusePlanningHelp({ draft, city }: { draft: EventDraft; city: string }) {
  const t = useTranslations("museHelp");
  const locale = useLocale();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const panelId = useId();

  const time = [draft.startTime, draft.endTime].filter(Boolean).join(" – ");
  const place = [draft.venue, draft.address].filter(Boolean).join(", ") || city;
  const prompt = [
    t("intro"),
    "",
    t("lineEvent", { value: draft.title.trim() || t("blankEvent") }),
    t("lineWhen", { value: [draft.date ? formatDate(draft.date, locale, { weekday: "long", month: "long", day: "numeric" }) : "", time].filter(Boolean).join(", ") || t("blankWhen") }),
    t("lineWhere", { value: place }),
    t("lineGuests"),
    t("lineBudget"),
    ...(draft.description.trim() ? [t("lineAbout", { value: draft.description.trim() })] : []),
    "",
    t("askTitle"),
    t("ask1"),
    t("ask2"),
    t("ask3"),
    t("ask4"),
    t("ask5"),
    "",
    t("closing"),
  ].join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      toast(t("copied"));
    } catch {
      toast(t("copyFailed"));
    }
  };

  return (
    <section className="overflow-hidden rounded-cell bg-cell">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="pressable flex min-h-[52px] w-full items-start gap-3 p-4 text-start"
      >
        <Sparkles size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-lavender" aria-hidden />
        <span className="min-w-0 flex-1 text-body">{t("title")}</span>
        <ChevronDown
          size={20}
          strokeWidth={1.75}
          aria-hidden
          className={`mt-0.5 shrink-0 text-tertiary-label transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div id={panelId} className="flex flex-col gap-3 px-4 pb-4">
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-control border border-separator bg-grouped p-3 font-sans text-subheadline text-label-soft">
            {prompt}
          </pre>
          <p className="text-footnote text-secondary-label">{t("hint")}</p>
          <div className="flex flex-wrap gap-2.5">
            <Button size="medium" icon={<ExternalLink size={18} strokeWidth={1.75} aria-hidden />} onClick={() => toast(t("openSoon"))}>
              {t("open")}
            </Button>
            <Button variant="tinted" size="medium" icon={<Copy size={18} strokeWidth={1.75} aria-hidden />} onClick={copy}>
              {t("copy")}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
