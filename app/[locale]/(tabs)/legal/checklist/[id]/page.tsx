"use client";

import { use, useState } from "react";
import { CalendarPlus, Check } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { NavBar } from "@/components/ios/NavBar";
import { GroupedList } from "@/components/ios/GroupedList";
import { ListSection } from "@/components/ios/ListSection";
import { Screen } from "@/components/ios/Screen";
import { Button } from "@/components/ios/Button";
import { Card } from "@/components/ios/Card";
import { HowToSteps } from "@/components/checklist/HowToSteps";
import { LegalHelpCard, TrustedLinkRow } from "@/components/TrustedLinks";
import { AddDateSheet } from "@/components/DateTimeline";
import { AskLandedButton } from "@/components/assistant/Assistant";
import { Disclaimer } from "@/components/Disclaimer";
import { getItem, linksFor } from "@/lib/checklist";
import { formatDate, useChecklist, useProfile } from "@/lib/hooks";
import { setItemDone } from "@/lib/storage";

export default function ChecklistItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("checklist");
  const ti = useTranslations("checklist.items");
  const locale = useLocale();
  const [profile] = useProfile();
  const [state] = useChecklist();
  const [adding, setAdding] = useState(false);
  const item = getItem(id);
  const back = { href: "/legal/checklist", label: t("title") };

  if (!item) {
    return (
      <Screen push>
        <NavBar title={t("title")} back={back} />
        <p className="px-5 py-12 text-center text-body text-secondary-label">{t("notFound")}</p>
      </Screen>
    );
  }

  const title = ti(`${item.id}.title`);
  const body = ti(`${item.id}.body`);
  const done = state[item.id];

  return (
    <Screen push>
      <NavBar title={title} back={back} />
      <GroupedList className="pt-4">
        <div className="flex flex-col gap-3">
          <p className="text-note italic text-secondary-label">{t(`sections.${item.section}`)}</p>
          <h2 className="text-title2">{title}</h2>
          {done?.done && (
            <p className="flex items-center gap-1.5 text-subheadline text-sage">
              <Check size={16} strokeWidth={2} aria-hidden />
              {done.doneAt ? t("doneOn", { date: formatDate(done.doneAt.slice(0, 10), locale) }) : t("markDone")}
            </p>
          )}
          <p className="text-headline text-label-soft">{body}</p>
        </div>

        {item.statusDependent && <LegalHelpCard />}

        <ListSection id="howto" header={t("howToTitle")} footer={t("stepsFooter")} bare>
          <Card className="p-5">
            <HowToSteps item={item} profile={profile} />
          </Card>
        </ListSection>

        <ListSection id="links" header={t("linksTitle")}>
          {linksFor(item.links, profile).map((link) => {
            const n = item.links.indexOf(link) + 1;
            return <TrustedLinkRow key={n} link={link} title={ti(`${item.id}.links.l${n}`)} summary={body} />;
          })}
        </ListSection>

        <div className="flex flex-col gap-2.5">
          <Button variant={done?.done ? "tinted" : "filled"} onClick={() => setItemDone(item.id, !done?.done)}>
            {done?.done ? t("markNotDone") : t("markDone")}
          </Button>
          {item.deadline && (
            <Button variant="tinted" icon={<CalendarPlus size={18} strokeWidth={1.75} aria-hidden />} onClick={() => setAdding(true)}>
              {t("addDate")}
            </Button>
          )}
          <AskLandedButton itemId={item.id} />
        </div>

        <Disclaimer />
      </GroupedList>
      {item.deadline && (
        <AddDateSheet open={adding} onClose={() => setAdding(false)} initialDocType={item.deadline.docType} initialLabel={title} />
      )}
    </Screen>
  );
}
