"use client";

import { useState } from "react";
import { User } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { AvatarButton, NavBar } from "@/components/ios/NavBar";
import { GroupedList } from "@/components/ios/GroupedList";
import { ListSection } from "@/components/ios/ListSection";
import { ListRow } from "@/components/ios/ListRow";
import { Screen } from "@/components/ios/Screen";
import { ButtonLink } from "@/components/ios/Button";
import { Card } from "@/components/ios/Card";
import { CaseIcon, ClockIcon, PeopleIcon, RowChevron, ShieldIcon, WarningIcon } from "@/components/LampIcons";
import { useOpenLink } from "@/components/browser/InAppBrowser";
import { AskLandedButton } from "@/components/assistant/Assistant";
import { itemsFor } from "@/lib/checklist";
import { daysUntil, formatDate, nextDate, useChecklist, useDates, usePlan, useProfile } from "@/lib/hooks";
import { learnMoreFor } from "@/lib/planLinks";
import { savePlan } from "@/lib/storage";
import type { Profile } from "@/lib/types";

/** Days since arriving: the months they told us at onboarding plus the days since then. */
function dayInUS(p: Profile) {
  const since = Math.max(0, Math.floor((Date.now() - new Date(p.createdAt).getTime()) / 86_400_000));
  return p.monthsInUS * 30 + since + 1;
}

// Clay rose for urgent dates, oat for coming up, plain surface for later ones.
function tone(days: number) {
  if (days < 0 || days <= 60) return { card: "bg-red-tint", text: "text-clay", Icon: WarningIcon };
  if (days <= 180) return { card: "bg-orange-tint", text: "text-oat", Icon: ClockIcon };
  return { card: "bg-cell", text: "text-secondary-label", Icon: ClockIcon };
}

export default function HomePage() {
  const t = useTranslations("home");
  const tl = useTranslations("legal");
  const tc = useTranslations("common");
  const tcat = useTranslations("categories");
  const ttabs = useTranslations("tabs");
  const locale = useLocale();
  const [profile, profileReady] = useProfile();
  const [plan] = usePlan();
  const [dates] = useDates();
  const [checklist] = useChecklist();
  const [showAll, setShowAll] = useState(false);
  const openLink = useOpenLink();

  const open = plan.filter((s) => !s.done);
  const visible = showAll ? plan : open.slice(0, 3);
  const upcoming = nextDate(dates);
  const upcomingDays = upcoming ? daysUntil(upcoming.date) : 0;
  const legalItems = itemsFor(profile);
  const legalDone = legalItems.filter((i) => checklist[i.id]?.done).length;
  const legalFinished = legalItems.length > 0 && legalDone === legalItems.length;

  const toggle = (id: string) => savePlan(plan.map((s) => (s.id === id ? { ...s, done: !s.done } : s)));

  const title = profile?.name ? t("greeting", { name: profile.name }) : t("greetingNoName");
  const eyebrow = profile ? t("dayIn", { day: dayInUS(profile), city: profile.city.split(",")[0] }) : undefined;

  const explore = [
    { href: "/legal", label: ttabs("legal"), Icon: ShieldIcon, color: "text-sage" },
    { href: "/social", label: ttabs("community"), Icon: PeopleIcon, color: "text-lavender" },
    { href: "/jobs", label: ttabs("jobs"), Icon: CaseIcon, color: "text-oat" },
  ];

  return (
    <Screen>
      <NavBar
        title={title}
        large
        eyebrow={eyebrow}
        trailing={
          <AvatarButton label={t("profileButton")} href="/settings">
            {profile?.name ? profile.name.trim()[0].toUpperCase() : <User size={20} strokeWidth={1.75} />}
          </AvatarButton>
        }
      />
      <GroupedList className="pt-5">
        <AskLandedButton />

        {profileReady && !profile && (
          <Card className="flex flex-col items-start gap-4 p-5">
            <p className="text-body text-label-soft">{t("noProfile")}</p>
            <ButtonLink href="/onboarding" size="medium">
              {t("setUp")}
            </ButtonLink>
          </Card>
        )}

        {(plan.length > 0 || profile) && (
          <ListSection id="steps" header={t("nextSteps")} footer={t("nextStepsFooter")}>
            {/* Legal paperwork comes first: pinned above the plan in the urgent clay-rose style
                until every checklist item is done. */}
            {profile && (
              <Link
                href="/legal/checklist"
                className={`list-row flex w-full items-stretch gap-3.5 pl-4 transition-colors duration-200 active:bg-fill ${legalFinished ? "" : "bg-red-tint"}`}
              >
                <span className="flex shrink-0 items-start pt-[14px]">
                  <ShieldIcon size={24} detail={legalFinished} className={legalFinished ? "text-sage" : "text-clay"} />
                </span>
                <span className="flex min-h-[52px] min-w-0 flex-1 items-center gap-3 py-[14px] pr-4">
                  <span className="min-w-0 flex-1">
                    {!legalFinished && <span className="block text-footnote font-medium text-clay">{t("legalFirst")}</span>}
                    <span className="block text-body">{t("legalTitle")}</span>
                    <span className="mt-0.5 block text-subheadline text-secondary-label">
                      {legalFinished ? t("legalAllDone") : t("legalSub", { done: legalDone, total: legalItems.length })}
                    </span>
                  </span>
                  <RowChevron />
                </span>
              </Link>
            )}
            {plan.length > 0 && visible.length === 0 && <ListRow title={<span className="text-label-soft">{t("allDone")}</span>} />}
            {visible.map((s) => (
              <ListRow
                key={s.id}
                leadingTop
                leading={
                  <button
                    type="button"
                    onClick={() => toggle(s.id)}
                    aria-label={s.done ? t("markNotDone", { title: s.title }) : t("markDone", { title: s.title })}
                    aria-pressed={s.done}
                    className="-m-[11px] flex h-11 w-11 items-center justify-center"
                  >
                    <span className="lamp-check" data-checked={s.done} aria-hidden />
                  </button>
                }
                title={<span className={s.done ? "text-secondary-label line-through" : ""}>{s.title}</span>}
                subtitle={
                  s.done ? undefined : (
                    <>
                      <span className="block">{s.why}</span>
                      <span className="mt-1 block text-footnote">
                        {tcat(s.category)}
                        {s.dueInDays ? ` · ${t("dueIn", { count: s.dueInDays })}` : ""}
                        {/* Every step has one, including plans saved before links were checked. */}
                        {" · "}
                        <button type="button" onClick={() => openLink(learnMoreFor(s, locale))} className="text-tint">
                          {tc("learnMore")}
                        </button>
                      </span>
                    </>
                  )
                }
              />
            ))}
            {plan.length > 3 && (
              <ListRow
                title={showAll ? t("fewerSteps") : t("allSteps", { count: plan.length })}
                tint
                onClick={() => setShowAll((v) => !v)}
              />
            )}
          </ListSection>
        )}

        <section aria-labelledby="upcoming-heading" className="flex flex-col gap-3">
          <h2 id="upcoming-heading" className="text-title3">
            {t("comingUp")}
          </h2>
          {upcoming ? (
            (() => {
              const { card, text, Icon } = tone(upcomingDays);
              return (
                <Link href="/legal" className={`pressable flex items-start gap-3.5 rounded-cell p-[18px] ${card}`}>
                  <Icon size={24} className={`shrink-0 ${text}`} />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="text-headline">{upcoming.label}</span>
                    <span className={`text-subheadline ${text}`}>
                      {upcomingDays < 0 ? tl("daysAgo", { count: -upcomingDays }) : tl("daysLeft", { count: upcomingDays })}
                      {" · "}
                      {formatDate(upcoming.date, locale, { month: "short", day: "numeric" })}
                    </span>
                  </span>
                </Link>
              );
            })()
          ) : (
            <Link href="/legal/scan" className="pressable flex items-start gap-3.5 rounded-cell bg-cell p-[18px]">
              <ClockIcon size={24} className="shrink-0 text-secondary-label" />
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-headline">{t("noDates")}</span>
                <span className="text-subheadline text-secondary-label">{t("noDatesSub")}</span>
              </span>
            </Link>
          )}
        </section>

        <section aria-labelledby="explore-heading" className="flex flex-col gap-3">
          <h2 id="explore-heading" className="text-title3">
            {t("explore")}
          </h2>
          <div className="grid grid-cols-3 gap-2.5">
            {explore.map(({ href, label, Icon, color }) => (
              <Link
                key={href}
                href={href}
                className="pressable flex min-h-[76px] flex-col justify-between gap-2 rounded-tile bg-cell px-3 py-4 text-callout"
              >
                <Icon size={26} detail className={color} />
                {label}
              </Link>
            ))}
          </div>
        </section>
      </GroupedList>
    </Screen>
  );
}
