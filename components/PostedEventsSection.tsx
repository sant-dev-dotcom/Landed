"use client";

import { useEffect, useState } from "react";
import { Check, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Button } from "@/components/ios/Button";
import { ListSection } from "@/components/ios/ListSection";
import { useToast } from "@/components/ios/Toast";
import { DateBadge } from "@/components/EventDateBadge";
import { cachePosted, listPosted, listSamples, matchesFilters, setRsvp } from "@/lib/communityEvents";
import { demoPostedEvents } from "@/lib/demoEvents";
import { getSampleRsvps } from "@/lib/storage";
import type { EventInterest } from "@/lib/interests";
import type { PostedEvent } from "@/lib/types";

const SHOWN = 6;

/** "Posted on Landed": events people posted (and sample ones), matching the person's filters, with RSVPs. */
export function PostedEventsSection({
  city,
  country,
  interests,
  custom,
}: {
  city: string;
  country: string;
  /** The filters the list was last searched for. */
  interests: EventInterest[];
  custom: string[];
}) {
  const t = useTranslations("posted");
  const tc = useTranslations("common");
  const locale = useLocale();
  const toast = useToast();
  const [events, setEvents] = useState<PostedEvent[]>(() => demoPostedEvents(city, locale));
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const filterKey = `${interests.join(",")}|${custom.join(",")}`;

  useEffect(() => {
    let current = true;
    const initial = demoPostedEvents(city, locale);
    setEvents(initial);
    setAll(false);
    let finished = false;
    // Restore local sample RSVPs without waiting for either network request.
    getSampleRsvps().then((rsvps) => {
      if (!current || finished) return;
      setEvents((list) => list.map((e) => rsvps.includes(e.id) && e.rsvp === undefined ? { ...e, rsvp: true, going: e.going + 1 } : e));
    });
    Promise.all([
      listPosted(city).catch(() => [] as PostedEvent[]),
      listSamples(city, locale, interests, custom, country).catch(() => [] as PostedEvent[]),
    ]).then(([posted, samples]) => {
      if (!current) return;
      const list = [...posted.filter((e) => matchesFilters(e, interests, custom)), ...samples].sort((a, b) => (a.date < b.date ? -1 : 1));
      // Keep the instant samples if neither source has anything to show.
      if (list.length) {
        finished = true;
        setEvents(list);
      }
    });
    return () => {
      current = false;
    };
    // filterKey stands for interests + custom.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, country, locale, filterKey]);

  useEffect(() => cachePosted(events), [events]);

  const toggle = async (e: PostedEvent) => {
    setBusy(e.id);
    try {
      const next = await setRsvp(e, !e.rsvp);
      setEvents((list) => {
        const updated = list.map((x) => (x.id === e.id ? next : x));
        return updated;
      });
      if (next.rsvp) toast(t("rsvpDone"));
    } catch {
      toast(tc("error"));
    } finally {
      setBusy(null);
    }
  };

  const shown = all ? events : events.slice(0, SHOWN);
  const hasSamples = events.some((e) => e.sample);

  return (
    <ListSection id="posted" header={t("title")} footer={hasSamples ? t("samplesFooter") : t("footer")} bare>
      <div className="list-section overflow-hidden rounded-cell bg-cell">
        {events.length === 0 ? (
          <p className="px-4 py-[14px] text-body text-secondary-label">{t("empty")}</p>
        ) : (
          shown.map((e) => (
            <div key={e.id} className="list-row flex items-stretch gap-3 pl-4">
              <Link href={`/social/posted?id=${encodeURIComponent(e.id)}`} className="flex min-w-0 flex-1 items-center gap-3.5 py-[14px] active:opacity-60">
                <DateBadge iso={e.date} locale={locale} />
                <span className="min-w-0 flex-1">
                  <span className="block text-body">{e.title}</span>
                  <span className="mt-0.5 block text-subheadline text-secondary-label">
                    {[e.startTime, e.venue].filter(Boolean).join(" · ")}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 text-footnote text-secondary-label">
                    <span className="inline-flex items-center gap-1">
                      <Users size={14} strokeWidth={1.75} aria-hidden />
                      {t("going", { count: e.going })}
                    </span>
                    {e.sample && <span className="rounded-full border border-separator px-2 text-caption1">{t("sample")}</span>}
                    {e.mine && <span className="rounded-full border border-separator px-2 text-caption1">{t("yours")}</span>}
                  </span>
                </span>
              </Link>
              <div className="flex shrink-0 items-center pr-3">
                <button
                  type="button"
                  onClick={() => toggle(e)}
                  disabled={busy === e.id}
                  aria-pressed={Boolean(e.rsvp)}
                  aria-label={e.rsvp ? t("cancelRsvpFor", { title: e.title }) : t("rsvpFor", { title: e.title })}
                  className={`pressable flex min-h-[44px] items-center gap-1 rounded-full px-3.5 text-callout ${
                    e.rsvp ? "bg-tint-fill font-medium text-on-accent" : "border border-separator text-label"
                  }`}
                >
                  {e.rsvp && <Check size={16} strokeWidth={2} aria-hidden />}
                  {e.rsvp ? t("goingButton") : t("rsvp")}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      {events && events.length > SHOWN && (
        <Button variant="plain" size="medium" onClick={() => setAll((v) => !v)}>
          {all ? t("showFewer") : t("showAll", { count: events.length })}
        </Button>
      )}
    </ListSection>
  );
}
