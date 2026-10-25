"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { NavBar } from "./ios/NavBar";
import { GroupedList } from "./ios/GroupedList";
import { ListSection } from "./ios/ListSection";
import { ListRow } from "./ios/ListRow";
import { Screen } from "./ios/Screen";
import { StatusCard } from "./StatusCard";
import { DateTimeline } from "./DateTimeline";
import { ScanSheet } from "./ScanSheet";
import { PrepSheet } from "./PrepSheet";
import { RIGHTS, RightsCard } from "./RightsCard";
import { Disclaimer } from "./Disclaimer";
import { useChecklist, useDates, useProfile } from "@/lib/hooks";
import { itemsFor } from "@/lib/checklist";

type SheetKind = "scan" | "prep" | null;

export function LegalDashboard({ initialSheet = null }: { initialSheet?: SheetKind }) {
  const t = useTranslations("legal");
  const router = useRouter();
  const tc = useTranslations("checklist");
  const [dates] = useDates();
  const [profile] = useProfile();
  const [checklist] = useChecklist();
  const items = itemsFor(profile);
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

        <DateTimeline dates={dates} onScan={() => setSheet("scan")} />

        <ListSection id="tools" header={t("tools")}>
          <ListRow
            href="/legal/checklist"
            title={tc("title")}
            subtitle={tc("progress", { done: items.filter((i) => checklist[i.id]?.done).length, total: items.length })}
          />
          <ListRow onClick={() => setSheet("scan")} chevron title={t("scan")} />
          <ListRow href="/legal/ask" title={t("ask")} />
          <ListRow href="/legal/help" title={t("help")} />
          <ListRow onClick={() => setSheet("prep")} chevron title={t("prep")} />
        </ListSection>

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
