"use client";

import { useState, type ReactNode } from "react";
import { ClipboardList, MessageCircleQuestion, Scale, ScanLine } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { NavBar } from "./ios/NavBar";
import { GroupedList } from "./ios/GroupedList";
import { ListSection } from "./ios/ListSection";
import { Screen } from "./ios/Screen";
import { DragScroll } from "./ios/DragScroll";
import { StatusCard } from "./StatusCard";
import { DateTimeline } from "./DateTimeline";
import { ScanSheet } from "./ScanSheet";
import { PrepSheet } from "./PrepSheet";
import { RIGHTS, RightsCard } from "./RightsCard";
import { Disclaimer } from "./Disclaimer";
import { ChecklistContent } from "./checklist/ChecklistContent";
import { useDates } from "@/lib/hooks";

type SheetKind = "scan" | "prep" | null;

export function LegalDashboard({ initialSheet = null }: { initialSheet?: SheetKind }) {
  const t = useTranslations("legal");
  const router = useRouter();
  const [dates] = useDates();
  const [sheet, setSheet] = useState<SheetKind>(initialSheet);

  const close = () => {
    setSheet(null);
    // Deep-linked sheets (/legal/scan, /legal/prep) return to the dashboard URL.
    if (initialSheet) setTimeout(() => router.replace("/legal"), 350);
  };

  return (
    <Screen>
      <NavBar title={t("title")} large />
      <GroupedList className="gap-6 pt-4">
        <StatusCard dates={dates} onPrepare={() => setSheet("prep")} />

        {/* One horizontal row, between the date status and My Dates. */}
        <ListSection id="tools" header={t("tools")} bare>
          <DragScroll aria-label={t("tools")} className="no-scrollbar -mx-5 flex flex-nowrap gap-2.5 overflow-x-auto px-5 pb-1">
            <li className="shrink-0"><ToolButton onClick={() => setSheet("scan")} icon={<ScanLine />} color="text-oat" title={t("scan")} /></li>
            <li className="shrink-0"><ToolButton href="/legal/ask" icon={<MessageCircleQuestion />} color="text-lavender" title={t("ask")} /></li>
            <li className="shrink-0"><ToolButton href="/legal/help" icon={<Scale />} color="text-sage" title={t("help")} /></li>
            <li className="shrink-0"><ToolButton onClick={() => setSheet("prep")} icon={<ClipboardList />} color="text-clay" title={t("prep")} /></li>
          </DragScroll>
        </ListSection>

        <DateTimeline dates={dates} onScan={() => setSheet("scan")} />

        <ChecklistContent />

        <ListSection id="rights" header={t("rights")} footer={t("rightsFooter")}>
          {RIGHTS.map((r) => (
            <RightsCard key={r.id} id={r.id} />
          ))}
        </ListSection>

        <Disclaimer />
      </GroupedList>

      <ScanSheet open={sheet === "scan"} onClose={close} />
      <PrepSheet open={sheet === "prep"} onClose={close} />
    </Screen>
  );
}

/** A compact tool with an icon and a single-line label. */
function ToolButton({
  href,
  onClick,
  icon,
  color,
  title,
}: {
  href?: string;
  onClick?: () => void;
  icon: ReactNode;
  color: string;
  title: string;
}) {
  const className = "pressable inline-flex min-h-[48px] items-center gap-2.5 whitespace-nowrap rounded-control border border-separator bg-cell px-4 py-2 text-start text-callout";
  const body = (
    <>
      <span
        className={`flex shrink-0 items-center justify-center ${color} [&>svg]:h-5 [&>svg]:w-5 [&>svg]:[stroke-width:1.75]`}
        aria-hidden
      >
        {icon}
      </span>
      <span>{title}</span>
    </>
  );
  if (href)
    return (
      <Link href={href} className={className}>
        {body}
      </Link>
    );
  return (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  );
}
