"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { NavBar } from "@/components/ios/NavBar";
import { GroupedList } from "@/components/ios/GroupedList";
import { ListSection } from "@/components/ios/ListSection";
import { ListRow } from "@/components/ios/ListRow";
import { Screen } from "@/components/ios/Screen";
import { Card } from "@/components/ios/Card";
import { Button } from "@/components/ios/Button";
import { SkeletonRow } from "@/components/ios/Spinner";
import { useToast } from "@/components/ios/Toast";
import { DateBadge } from "@/components/EventDateBadge";
import { getJSON, languageList } from "@/lib/client";
import { cacheEvents } from "@/lib/eventCache";
import { Ticket } from "lucide-react";
import { useProfile } from "@/lib/hooks";
import type { EventListing } from "@/lib/types";
import seedProfiles from "@/data/seed-profiles.json";

interface Neighbor {
  id: string;
  name: string;
  from: string;
  originCountry: string;
  city: string;
  years: number;
  job: { en: string; es: string };
  languages: string[];
  color: string;
}


export default function CommunityPage() {
  const t = useTranslations("community");
  const tc = useTranslations("common");
  const locale = useLocale();
  const toast = useToast();
  const [profile, ready] = useProfile();
  const city = profile?.city || "Houston, TX";
  const [events, setEvents] = useState<EventListing[] | null>(null);
  const [sample, setSample] = useState(false);

  useEffect(() => {
    if (!ready) return;
    getJSON<{ events: EventListing[]; sample?: boolean }>(`/api/events?city=${encodeURIComponent(city)}&locale=${locale}`)
      .then((d) => {
        setEvents(d.events);
        cacheEvents(d.events);
        setSample(Boolean(d.sample));
      })
      .catch(() => setEvents([]));
  }, [ready, city, locale]);

  // Mock neighbor match: same origin country or shared language, same city first.
  const neighbors = useMemo(() => {
    const all = seedProfiles as Neighbor[];
    const langs = new Set(profile?.languages ?? []);
    const score = (n: Neighbor) =>
      (n.originCountry === profile?.originCountry ? 3 : 0) +
      (n.languages.some((l) => langs.has(l) && l !== "English") ? 2 : 0) +
      (n.city === city ? 2 : 0);
    return [...all].sort((a, b) => score(b) - score(a)).slice(0, 2);
  }, [profile, city]);

  const cityName = (c: string) => c.split(",")[0];

  return (
    <Screen>
      <NavBar title={t("title")} large />
      <GroupedList>
        <ListSection id="events" header={t("events")} footer={sample ? tc("sampleData") : t("eventsFooter")}>
          {events === null ? (
            <div role="status" aria-label={t("loadingEvents")}>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ) : events.length === 0 ? (
            <ListRow title={<span className="text-secondary-label">{t("noEvents")}</span>} />
          ) : (
            events.map((e) => (
              <ListRow
                key={e.id ?? e.title}
                href={e.id ? `/social/event?id=${encodeURIComponent(e.id)}` : undefined}
                leading={<DateBadge iso={e.startDate} when={e.when} locale={locale} />}
                title={e.title}
                subtitle={[e.when, e.venue ?? e.location].filter(Boolean).join(" · ")}
                trailing={
                  e.links?.some((l) => l.type === "tickets") ? (
                    <Ticket size={18} strokeWidth={1.75} className="shrink-0 text-lavender" aria-label={t("hasTickets")} />
                  ) : undefined
                }
              />
            ))
          )}
        </ListSection>

        <ListSection id="people" header={t("people")} footer={t("peopleFooter")} bare>
          <div className="flex flex-col gap-3">
            {neighbors.map((n) => (
              <Card key={n.id} className="flex items-start gap-3.5 p-[18px]">
                <span
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-title3 text-on-accent"
                  style={{ background: n.color }}
                  aria-hidden
                >
                  {n.name[0]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-headline">{n.name}</p>
                  <p className="mt-1 text-subheadline text-label-soft">
                    {t("bio", {
                      from: n.from.split(",")[0],
                      city: cityName(n.city),
                      years: n.years,
                      job: locale === "es" ? n.job.es : n.job.en,
                      languages: languageList(n.languages, locale),
                    })}
                  </p>
                  <Button variant="tinted" size="small" className="mt-3" onClick={() => toast(t("toast"))} aria-label={t("sayHiTo", { name: n.name })}>
                    {t("sayHi")}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </ListSection>
      </GroupedList>
    </Screen>
  );
}
