"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Landmark } from "lucide-react";
import { useTranslations } from "next-intl";
import { NavBar } from "@/components/ios/NavBar";
import { GroupedList } from "@/components/ios/GroupedList";
import { ListSection } from "@/components/ios/ListSection";
import { ListRow } from "@/components/ios/ListRow";
import { Screen } from "@/components/ios/Screen";
import { SearchField } from "@/components/ios/SearchField";
import { SegmentedControl } from "@/components/ios/SegmentedControl";
import { SkeletonRow } from "@/components/ios/Spinner";
import { HelpCard } from "@/components/HelpCard";
import { Disclaimer } from "@/components/Disclaimer";
import { getJSON } from "@/lib/client";
import { useProfile } from "@/lib/hooks";
import { cacheListings } from "@/lib/helpCache";
import type { HelpListing } from "@/lib/types";

type Filter = "all" | "free" | "spanish";

export default function HelpPage() {
  const t = useTranslations("help");
  const tc = useTranslations("common");
  const tl = useTranslations("legal");
  const [profile, ready] = useProfile();
  const city = profile?.city || "Houston, TX";
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>(profile?.locale === "es" ? "spanish" : "all");
  const [listings, setListings] = useState<HelpListing[] | null>(null);
  const [sample, setSample] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (profile?.locale === "es") setFilter("spanish");
  }, [profile?.locale]);

  const load = useCallback(
    async (q: string) => {
      setListings(null);
      setError(false);
      try {
        const data = await getJSON<{ listings: HelpListing[]; sample?: boolean }>(
          `/api/help?city=${encodeURIComponent(city)}&q=${encodeURIComponent(q)}`
        );
        setListings(data.listings);
        setSample(Boolean(data.sample));
        cacheListings(data.listings);
      } catch {
        setError(true);
        setListings([]);
      }
    },
    [city]
  );

  useEffect(() => {
    if (ready) load("");
  }, [ready, load]);

  const shown = useMemo(() => {
    if (!listings) return [];
    if (filter === "free") return listings.filter((l) => l.cost === "free" || l.cost === "low");
    if (filter === "spanish") {
      const spanish = listings.filter((l) => l.languages?.includes("Spanish"));
      // No language info in the results: show everything rather than nothing.
      return spanish.length ? spanish : listings;
    }
    return listings;
  }, [listings, filter]);

  return (
    <Screen push>
      <NavBar title={t("title")} back={{ href: "/legal", label: tl("title") }}>
        <div className="space-y-3 px-5 pb-1 pt-3">
          <SearchField
            value={query}
            onChange={setQuery}
            onSubmit={load}
            placeholder={t("searchPlaceholder", { city: city.split(",")[0] })}
            cancelLabel={tc("cancel")}
          />
          <SegmentedControl
            label={t("filterLabel")}
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: t("all") },
              { value: "free", label: t("free") },
              { value: "spanish", label: t("spanish") },
            ]}
          />
        </div>
      </NavBar>

      <GroupedList className="pt-5">
        <ListSection id="directories" header={t("directories")}>
          <ListRow
            href="https://www.immigrationlawhelp.org/"
            external
            icon={<BookOpen size={18} strokeWidth={2} />}
            iconColor="var(--system-blue)"
            title={t("ilh")}
            subtitle={t("ilhSub")}
          />
          <ListRow
            href="https://www.justice.gov/eoir/list-pro-bono-legal-service-providers"
            external
            icon={<Landmark size={18} strokeWidth={2} />}
            iconColor="var(--system-indigo)"
            title={t("eoir")}
            subtitle={t("eoirSub")}
          />
        </ListSection>

        <ListSection id="results" header={t("results", { city: city.split(",")[0] })} footer={sample ? tc("sampleData") : undefined}>
          {listings === null ? (
            <div aria-label={t("finding")} role="status">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
              <span className="sr-only">{t("finding")}</span>
            </div>
          ) : error ? (
            <ListRow title={tc("error")} tint onClick={() => load(query)} />
          ) : shown.length === 0 ? (
            <ListRow title={<span className="text-secondary-label">{t("empty")}</span>} />
          ) : (
            shown.map((l) => (
              <HelpCard key={l.name} listing={l} href={`/legal/help/detail?n=${encodeURIComponent(l.name)}`} />
            ))
          )}
        </ListSection>
        <Disclaimer />
      </GroupedList>
    </Screen>
  );
}
