"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ExternalLink, MapPin, Ticket } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { NavBar } from "@/components/ios/NavBar";
import { GroupedList } from "@/components/ios/GroupedList";
import { ListSection } from "@/components/ios/ListSection";
import { Screen } from "@/components/ios/Screen";
import { Button, buttonClass } from "@/components/ios/Button";
import { Card } from "@/components/ios/Card";
import { SkeletonRow } from "@/components/ios/Spinner";
import { DateBadge } from "@/components/EventDateBadge";
import { useOpenLink } from "@/components/browser/InAppBrowser";
import { intlTag } from "@/i18n/languages";
import { getJSON } from "@/lib/client";
import { cachedEvent } from "@/lib/eventCache";
import type { EventDetails, EventListing } from "@/lib/types";

export default function EventPage() {
  return (
    <Suspense>
      <EventDetail />
    </Suspense>
  );
}

function EventDetail() {
  const t = useTranslations("community");
  const locale = useLocale();
  const openLink = useOpenLink();
  const id = useSearchParams().get("id") || "";
  const [event, setEvent] = useState<EventListing | null | undefined>(undefined);
  const [details, setDetails] = useState<EventDetails | null>(null);

  useEffect(() => {
    setEvent(cachedEvent(id) ?? null);
  }, [id]);

  // Read the event's own page: description, price, free or paid.
  const page = event?.links?.find((l) => l.type === "tickets")?.link ?? event?.links?.[0]?.link ?? event?.link;
  useEffect(() => {
    if (!event) return;
    if (!page) {
      setDetails({});
      return;
    }
    setDetails(null);
    getJSON<EventDetails>(`/api/events/details?url=${encodeURIComponent(page)}&lang=${encodeURIComponent(locale)}&title=${encodeURIComponent(event.title)}`)
      .then(setDetails)
      .catch(() => setDetails({}));
  }, [event, page, locale]);

  const back = { href: "/social", label: t("title") };

  if (event === undefined) return <Screen push><NavBar title={t("eventTitle")} back={back} /></Screen>;
  if (event === null) {
    return (
      <Screen push>
        <NavBar title={t("eventTitle")} back={back} />
        <p className="px-5 py-12 text-center text-body text-secondary-label">{t("notFound")}</p>
      </Screen>
    );
  }

  const tickets = event.links?.filter((l) => l.type === "tickets") ?? [];
  const info = event.links?.filter((l) => l.type === "info") ?? [];
  const description = details?.description ?? event.description;
  const where = [event.venue, event.location].filter(Boolean).join(" · ");
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([event.venue, event.location].filter(Boolean).join(" "))}`;
  const money = (n: number, currency: string) =>
    new Intl.NumberFormat(intlTag(locale), { style: "currency", currency, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
  const price = details?.price
    ? details.price.min === details.price.max
      ? money(details.price.min, details.price.currency)
      : `${money(details.price.min, details.price.currency)}–${money(details.price.max, details.price.currency)}`
    : null;
  // Paid tickets, free (maybe with registration), or the page doesn't say.
  const cost: "paid" | "free" | "unknown" = details?.price || details?.free === false ? "paid" : details?.free ? "free" : "unknown";
  // Buying or registering happens on the seller's own site, in the phone's browser.
  const openSeller = (link: string) => window.open(link, "_blank", "noopener,noreferrer");

  return (
    <Screen push>
      <NavBar title={event.title} back={back} />
      <GroupedList className="pt-4">
        <div className="flex items-start gap-4">
          <DateBadge iso={event.startDate} when={event.when} locale={locale} large />
          <div className="min-w-0 flex-1">
            <h2 className="text-title2">{event.title}</h2>
            {event.when && <p className="mt-1 text-subheadline text-secondary-label">{event.when}</p>}
          </div>
        </div>

        {where && (
          <Card className="flex items-start gap-3.5 p-[18px]">
            <MapPin size={22} strokeWidth={1.75} className="mt-0.5 shrink-0 text-lavender" aria-hidden />
            <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
              <p className="text-body">{where}</p>
              {/* Directions hand off to the maps app, like phone calls. */}
              <a href={maps} target="_blank" rel="noopener noreferrer" className="text-callout text-tint">
                {t("directions")}
              </a>
            </div>
          </Card>
        )}

        <ListSection id="about" header={t("about")} bare>
          {details === null && !description ? (
            <div role="status" aria-label={t("loadingDetails")} className="list-section overflow-hidden rounded-cell bg-cell">
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ) : (
            <Card className="flex flex-col gap-3 p-5">
              <p className={`text-headline ${description ? "text-label-soft" : "text-secondary-label"}`}>{description || t("noDescription")}</p>
              {details?.organizer && <p className="text-subheadline text-secondary-label">{t("hostedBy", { name: details.organizer })}</p>}
              {details?.aiSummary && <p className="text-note italic text-secondary-label">{t("aiSummary")}</p>}
            </Card>
          )}
        </ListSection>

        {tickets.length > 0 ? (
          <div className={`flex flex-col gap-3.5 rounded-status p-5 ${cost === "free" ? "bg-green-tint" : "bg-indigo-tint"}`}>
            <div className="flex items-center gap-3">
              <Ticket size={22} strokeWidth={1.75} className={`shrink-0 ${cost === "free" ? "text-sage" : "text-lavender"}`} aria-hidden />
              <p className="text-[1.3125rem] leading-snug">{t(`tickets_${cost}`)}</p>
            </div>
            {details === null ? (
              <p className="text-subheadline text-secondary-label">{t("loadingDetails")}</p>
            ) : (
              <p className="text-body text-label-soft">{cost === "paid" ? (price ? t("priceIs", { price }) : t("paidNoPrice")) : cost === "free" ? t("freeRegister") : t("noPrice")}</p>
            )}
            <div className="flex flex-col items-stretch gap-2">
              {tickets.map((l, i) => (
                <Button
                  key={l.link}
                  variant={i === 0 ? "filled" : "tinted"}
                  icon={<ExternalLink size={18} strokeWidth={1.75} aria-hidden />}
                  onClick={() => openSeller(l.link)}
                >
                  {t(cost === "paid" ? "buyTickets" : cost === "free" ? "register" : "getTickets", { source: l.source })}
                </Button>
              ))}
            </div>
            <p className="text-footnote text-secondary-label">{t("soldBy", { source: tickets[0].source })}</p>
          </div>
        ) : null}

        {(info.length > 0 || (!tickets.length && event.link)) && (
          <div className="flex flex-col gap-2">
            {(info.length ? info : [{ source: new URL(event.link!).hostname.replace(/^www\./, ""), link: event.link!, type: "info" as const }]).map((l) => (
              <button key={l.link} type="button" onClick={() => openLink(l.link, { summary: description })} className={buttonClass("tinted", "large")}>
                {t("moreInfo", { source: l.source })}
              </button>
            ))}
          </div>
        )}

        {/* No ticket or info page in the listing: offer a web search for it. */}
        {!event.links?.length && !event.link && !event.sample && (
          <button
            type="button"
            onClick={() => openSeller(`https://www.google.com/search?q=${encodeURIComponent([event.title, event.venue, event.when].filter(Boolean).join(" "))}`)}
            className={buttonClass("tinted", "large")}
          >
            {t("searchEvent")}
          </button>
        )}
        {event.sample && <p className="text-note italic text-secondary-label">{t("sampleEvent")}</p>}
      </GroupedList>
    </Screen>
  );
}
