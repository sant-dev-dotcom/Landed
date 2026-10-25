"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Globe, MapPin, Phone, Star } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { NavBar } from "@/components/ios/NavBar";
import { GroupedList } from "@/components/ios/GroupedList";
import { ListSection } from "@/components/ios/ListSection";
import { ListRow } from "@/components/ios/ListRow";
import { Screen } from "@/components/ios/Screen";
import { ButtonLink, buttonClass } from "@/components/ios/Button";
import { Disclaimer } from "@/components/Disclaimer";
import { TYPE_ICON } from "@/components/HelpCard";
import { cachedListings } from "@/lib/helpCache";
import { languageList } from "@/lib/client";
import type { HelpListing } from "@/lib/types";

export default function HelpDetailPage() {
  return (
    <Suspense>
      <HelpDetail />
    </Suspense>
  );
}

function HelpDetail() {
  const t = useTranslations("help");
  const locale = useLocale();
  const name = useSearchParams().get("n") || "";
  const [listing, setListing] = useState<HelpListing | null | undefined>(undefined);

  useEffect(() => {
    setListing(cachedListings().find((l) => l.name === name) ?? null);
  }, [name]);

  const back = { href: "/legal/help", label: t("title") };

  if (listing === undefined) return <Screen push><NavBar title={t("details")} back={back} /></Screen>;
  if (listing === null) {
    return (
      <Screen push>
        <NavBar title={t("details")} back={back} />
        <p className="px-4 py-12 text-center text-body text-secondary-label">{t("notFound")}</p>
      </Screen>
    );
  }

  const { Icon, color } = TYPE_ICON[listing.type];
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${listing.name} ${listing.address ?? ""}`)}`;

  return (
    <Screen push>
      <NavBar title={t("details")} back={back} />
      <GroupedList className="pt-4">
        <div className="flex flex-col items-center gap-3 px-2 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-tile bg-cell" style={{ color }} aria-hidden>
            <Icon size={32} strokeWidth={1.75} />
          </span>
          <h2 className="text-title2">{listing.name}</h2>
          <p className="text-subheadline text-secondary-label">
            {[t(`type_${listing.type}`), t(`cost_${listing.cost ?? "unknown"}`)].join(" · ")}
          </p>
          {listing.rating ? (
            <p className="flex items-center gap-1 text-footnote text-secondary-label" aria-label={t("rating", { rating: listing.rating })}>
              <Star size={14} className="text-oat" fill="currentColor" aria-hidden />
              {listing.rating}
            </p>
          ) : null}
        </div>

        <div className="flex gap-2">
          {listing.phone && (
            <ButtonLink href={`tel:${listing.phone.replace(/[^\d+]/g, "")}`} variant="tinted" size="medium" className="flex-1 flex-col !gap-0.5 py-2 text-footnote">
              <Phone size={20} aria-hidden />
              {t("call")}
            </ButtonLink>
          )}
          {listing.website && (
            <ButtonLink href={listing.website} variant="tinted" size="medium" className="flex-1 flex-col !gap-0.5 py-2 text-footnote">
              <Globe size={20} aria-hidden />
              {t("website")}
            </ButtonLink>
          )}
          {/* Directions hand off to the maps app, like phone calls. */}
          <a href={maps} target="_blank" rel="noopener noreferrer" className={buttonClass("tinted", "medium", "flex-1 flex-col !gap-0.5 py-2 text-footnote")}>
            <MapPin size={20} aria-hidden />
            {t("directions")}
          </a>
        </div>

        <ListSection>
          {listing.address && <ListRow title={listing.address} icon={<MapPin size={18} strokeWidth={2} />} iconColor="var(--system-red)" />}
          {listing.phone && <ListRow title={listing.phone} icon={<Phone size={18} strokeWidth={2} />} iconColor="var(--system-green)" />}
          {listing.languages && (
            <ListRow
              title={t("speaks", { languages: languageList(listing.languages, locale) })}
              icon={<Globe size={18} strokeWidth={2} />}
              iconColor="var(--system-blue)"
            />
          )}
        </ListSection>

        <ListSection header={t("howToVerify")}>
          {(["verify1", "verify2", "verify3", "verify4"] as const).map((k) => (
            <ListRow key={k} title={t(k)} leadingTop leading={<CheckCircle2 size={22} strokeWidth={1.75} className="text-sage" aria-hidden />} />
          ))}
          <ListRow href="https://www.texasbar.com/AM/Template.cfm?Section=Find_A_Lawyer" external title={t("verifyLinkBar")} tint />
          <ListRow href="https://www.justice.gov/eoir/recognized-organizations-and-accredited-representatives-roster-state-and-city" external title={t("verifyLinkEoir")} tint />
        </ListSection>
        <Disclaimer />
      </GroupedList>
    </Screen>
  );
}
