"use client";

import { Building2, GraduationCap, Landmark, Scale, ShieldCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { ListRow } from "./ios/ListRow";
import { languageList } from "@/lib/client";
import type { HelpListing } from "@/lib/types";

export const TYPE_ICON: Record<HelpListing["type"], { Icon: typeof Scale; color: string }> = {
  nonprofit: { Icon: Landmark, color: "var(--sage)" },
  accredited_rep: { Icon: ShieldCheck, color: "var(--sage)" },
  clinic: { Icon: GraduationCap, color: "var(--lavender)" },
  attorney: { Icon: Scale, color: "var(--oat)" },
  unknown: { Icon: Building2, color: "var(--muted)" },
};

/** One legal-help result row. Pushes to the detail screen. */
export function HelpCard({ listing, href }: { listing: HelpListing; href: string }) {
  const t = useTranslations("help");
  const locale = useLocale();
  const { Icon, color } = TYPE_ICON[listing.type];
  const meta = [t(`type_${listing.type}`), listing.cost && listing.cost !== "unknown" ? t(`cost_${listing.cost}`) : null, listing.distanceText]
    .filter(Boolean)
    .join(" · ");
  return (
    <ListRow
      href={href}
      icon={<Icon />}
      iconColor={color}
      title={listing.name}
      subtitle={
        <>
          {meta}
          {listing.languages && listing.languages.length > 1 && (
            <span className="block">{t("speaks", { languages: languageList(listing.languages, locale) })}</span>
          )}
          {listing.address && <span className="block truncate">{listing.address}</span>}
        </>
      }
    />
  );
}
