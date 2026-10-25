"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { useTranslations } from "next-intl";
import { NavBar } from "@/components/ios/NavBar";
import { GroupedList } from "@/components/ios/GroupedList";
import { ListSection } from "@/components/ios/ListSection";
import { ListRow } from "@/components/ios/ListRow";
import { Screen } from "@/components/ios/Screen";
import { Disclaimer } from "@/components/Disclaimer";
import { RIGHTS, type RightId } from "@/components/RightsCard";
import { useOpenLink } from "@/components/browser/InAppBrowser";

export default function RightDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("rights");
  const tl = useTranslations("legal");
  const openLink = useOpenLink();
  const r = RIGHTS.find((x) => x.id === id);
  if (!r) notFound();
  const key = r.id as RightId;

  return (
    <Screen push>
      <NavBar title={t(`${key}.title`)} back={{ href: "/legal", label: tl("title") }} />
      <GroupedList className="pt-4">
        <div className="flex flex-col items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-tile bg-cell" style={{ color: r.color }} aria-hidden>
            <r.Icon size={26} strokeWidth={1.75} />
          </span>
          <h2 className="text-title2">{t(`${key}.title`)}</h2>
        </div>
        <p className="text-headline text-label-soft">{t(`${key}.body`)}</p>
        <ListSection>
          <ListRow
            onClick={() => openLink(t(`${key}.url`), { summary: t(`${key}.body`) })}
            external
            tint
            title={tl("sourceLink", { name: t(`${key}.source`) })}
          />
        </ListSection>
        <Disclaimer />
      </GroupedList>
    </Screen>
  );
}
