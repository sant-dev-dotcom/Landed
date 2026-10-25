"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { NavBar } from "@/components/ios/NavBar";
import { GroupedList } from "@/components/ios/GroupedList";
import { ListSection } from "@/components/ios/ListSection";
import { ListRow } from "@/components/ios/ListRow";
import { Screen } from "@/components/ios/Screen";
import { SkeletonRow } from "@/components/ios/Spinner";
import { DateBadge } from "@/components/EventDateBadge";
import { ForumSection } from "@/components/ForumSection";
import { getJSON } from "@/lib/client";
import { cacheEvents } from "@/lib/eventCache";
import { Ticket } from "lucide-react";
import { useProfile } from "@/lib/hooks";
import type { EventListing } from "@/lib/types";

const EVENTS_PER_PAGE = 5;
// Remembered for the tab session, so coming back from an event opens the same page.
const PAGE_KEY = "landed:eventsPage";

function readPage() {
  try {
    return Number(sessionStorage.getItem(PAGE_KEY)) || 0;
  } catch {
    return 0;
  }
}

export default function CommunityPage() {
  const t = useTranslations("community");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [profile, ready] = useProfile();
  const city = profile?.city || "Houston, TX";
  const [events, setEvents] = useState<EventListing[] | null>(null);
  const [sample, setSample] = useState(false);
  const [page, setPage] = useState(0);

  useEffect(() => setPage(readPage()), []);

  const pageCount = events ? Math.ceil(events.length / EVENTS_PER_PAGE) : 0;
  // A shorter list (new city or language) can leave the saved page past the end.
  const current = Math.min(page, Math.max(0, pageCount - 1));
  const pageEvents = events?.slice(current * EVENTS_PER_PAGE, (current + 1) * EVENTS_PER_PAGE) ?? [];

  const goToPage = (p: number) => {
    setPage(p);
    try {
      sessionStorage.setItem(PAGE_KEY, String(p));
    } catch {
      // ignore
    }
  };

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


  return (
    <Screen>
      <NavBar title={t("title")} large />
      <GroupedList>
        <ListSection id="events" header={t("events")} footer={sample ? tc("sampleData") : t("eventsFooter")} bare>
          {pageCount > 1 && (
            <nav aria-label={t("eventPages")} className="flex flex-wrap gap-2">
              {Array.from({ length: pageCount }, (_, i) => {
                const active = i === current;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => goToPage(i)}
                    aria-current={active ? "page" : undefined}
                    aria-label={t("eventsPage", { page: i + 1 })}
                    className={`pressable flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-callout ${
                      active ? "bg-tint-fill font-medium text-on-accent" : "border border-separator bg-cell text-secondary-label"
                    }`}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </nav>
          )}
          <div className="list-section overflow-hidden rounded-cell bg-cell">
            {events === null ? (
              <div role="status" aria-label={t("loadingEvents")}>
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </div>
            ) : events.length === 0 ? (
              <ListRow title={<span className="text-secondary-label">{t("noEvents")}</span>} />
            ) : (
              pageEvents.map((e) => (
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
          </div>
        </ListSection>

        <ForumSection />
      </GroupedList>
    </Screen>
  );
}
