"use client";

import { useTranslations } from "next-intl";
import { NavBar } from "@/components/ios/NavBar";
import { GroupedList } from "@/components/ios/GroupedList";
import { Screen } from "@/components/ios/Screen";
import { ChecklistContent } from "@/components/checklist/ChecklistContent";
import { Disclaimer } from "@/components/Disclaimer";

export default function ChecklistPage() {
  const t = useTranslations("checklist");
  const tl = useTranslations("legal");
  return (
    <Screen push>
      <NavBar title={t("title")} back={{ href: "/legal", label: tl("title") }} />
      <GroupedList className="pt-4">
        <ChecklistContent />
        <Disclaimer />
      </GroupedList>
    </Screen>
  );
}
