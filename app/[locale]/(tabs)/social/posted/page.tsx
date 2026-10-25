"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, MapPin, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { Alert } from "@/components/ios/Alert";
import { Button } from "@/components/ios/Button";
import { Card } from "@/components/ios/Card";
import { GroupedList } from "@/components/ios/GroupedList";
import { NavBar } from "@/components/ios/NavBar";
import { Screen } from "@/components/ios/Screen";
import { useToast } from "@/components/ios/Toast";
import { DateBadge } from "@/components/EventDateBadge";
import { cachedPosted, deletePosted, setRsvp, updateCachedPosted } from "@/lib/communityEvents";
import { formatDate } from "@/lib/hooks";
import type { PostedEvent } from "@/lib/types";

export default function PostedEventPage() {
  return (
    <Suspense>
      <PostedEventDetail />
    </Suspense>
  );
}

function PostedEventDetail() {
  const t = useTranslations("posted");
  const tc = useTranslations("common");
  const tm = useTranslations("community");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const id = useSearchParams().get("id") || "";
  const [event, setEvent] = useState<PostedEvent | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => setEvent(cachedPosted(id) ?? null), [id]);

  const back = { href: "/social", label: tm("title") };
  if (event === undefined) return <Screen push><NavBar title={t("eventTitle")} back={back} /></Screen>;
  if (event === null) {
    return (
      <Screen push>
        <NavBar title={t("eventTitle")} back={back} />
        <p className="px-5 py-12 text-center text-body text-secondary-label">{tm("notFound")}</p>
      </Screen>
    );
  }

  const toggle = async () => {
    setBusy(true);
    try {
      const next = await setRsvp(event, !event.rsvp);
      setEvent(next);
      updateCachedPosted(next);
      if (next.rsvp) toast(t("rsvpDone"));
    } catch {
      toast(tc("error"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setConfirm(false);
    try {
      await deletePosted(event.id);
      toast(t("deleted"));
      router.replace("/social");
    } catch {
      toast(tc("error"));
    }
  };

  const when = [formatDate(event.date, locale, { weekday: "long", month: "long", day: "numeric" }), [event.startTime, event.endTime].filter(Boolean).join(" – ")]
    .filter(Boolean)
    .join(" · ");
  const where = [event.venue, event.address].filter(Boolean).join(" · ");
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([event.venue, event.address, event.city].filter(Boolean).join(" "))}`;

  return (
    <Screen push>
      <NavBar title={t("eventTitle")} back={back} />
      <GroupedList className="pt-4">
        <div className="flex items-start gap-4">
          <DateBadge iso={event.date} locale={locale} large />
          <div className="min-w-0 flex-1">
            <h2 className="text-title2">{event.title}</h2>
            <p className="mt-1.5 text-subheadline text-secondary-label">{when}</p>
            {event.sample && <p className="mt-2 text-note italic text-secondary-label">{t("sampleNote")}</p>}
          </div>
        </div>

        {where && (
          <Card className="flex items-start gap-3.5 p-[18px]">
            <MapPin size={22} strokeWidth={1.75} className="mt-0.5 shrink-0 text-lavender" aria-hidden />
            <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
              <p className="text-body">{where}</p>
              <a href={maps} target="_blank" rel="noopener noreferrer" className="text-callout text-tint">
                {tm("directions")}
              </a>
            </div>
          </Card>
        )}

        <Card className="flex flex-col gap-3 p-5">
          {event.description && <p className="whitespace-pre-line text-headline text-label-soft">{event.description}</p>}
          <dl className="flex flex-col gap-1 text-subheadline">
            {event.cost && (
              <div className="flex gap-2">
                <dt className="text-secondary-label">{t("cost")}</dt>
                <dd>{event.cost}</dd>
              </div>
            )}
            {event.host && (
              <div className="flex gap-2">
                <dt className="text-secondary-label">{t("host")}</dt>
                <dd>{event.host}</dd>
              </div>
            )}
          </dl>
        </Card>

        <div className="flex flex-col gap-3 rounded-status bg-indigo-tint p-5">
          <p className="flex items-center gap-2 text-[1.3125rem] leading-snug">
            <Users size={22} strokeWidth={1.75} className="shrink-0 text-lavender" aria-hidden />
            {t("going", { count: event.going })}
          </p>
          <Button
            variant={event.rsvp ? "tinted" : "filled"}
            onClick={toggle}
            disabled={busy}
            icon={event.rsvp ? <Check size={18} strokeWidth={2} aria-hidden /> : undefined}
            aria-pressed={Boolean(event.rsvp)}
          >
            {event.rsvp ? t("goingCancel") : t("rsvpBig")}
          </Button>
          {event.sample && <p className="text-footnote text-secondary-label">{t("sampleRsvpNote")}</p>}
        </div>

        {event.mine && (
          <Button variant="destructive" onClick={() => setConfirm(true)}>
            {t("delete")}
          </Button>
        )}
      </GroupedList>

      <Alert
        open={confirm}
        onClose={() => setConfirm(false)}
        title={t("deleteTitle")}
        actions={[
          { label: tc("cancel"), style: "cancel", onPress: () => setConfirm(false) },
          { label: tc("delete"), style: "destructive", onPress: remove },
        ]}
      />
    </Screen>
  );
}
