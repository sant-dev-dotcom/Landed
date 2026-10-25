"use client";

import { useCallback, useEffect, useState } from "react";
import { Award } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { NavBar } from "@/components/ios/NavBar";
import { GroupedList } from "@/components/ios/GroupedList";
import { ListSection } from "@/components/ios/ListSection";
import { ListRow } from "@/components/ios/ListRow";
import { Screen } from "@/components/ios/Screen";
import { CaseIcon } from "@/components/LampIcons";
import { ButtonLink } from "@/components/ios/Button";
import { SearchField } from "@/components/ios/SearchField";
import { SkeletonRow, Spinner } from "@/components/ios/Spinner";
import { AiLabel } from "@/components/Disclaimer";
import { getJSON, postJSON } from "@/lib/client";
import { useProfile } from "@/lib/hooks";
import type { JobListing } from "@/lib/types";

interface Credential {
  overview: string;
  boardName?: string;
  boardUrl?: string;
}

/** Turn a credential like "Registered nurse" into a starter job search. */
function starterQuery(work?: string) {
  if (!work) return "";
  if (/nurs|enfermer/i.test(work)) return "nurse";
  if (/teach|maestr/i.test(work)) return "teacher assistant";
  if (/engineer|ingenier/i.test(work)) return "engineer";
  if (/account|contad/i.test(work)) return "accounting clerk";
  if (/mechanic|mec[aá]nic/i.test(work)) return "auto mechanic";
  return work;
}

export default function JobsPage() {
  const t = useTranslations("jobs");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [profile, ready] = useProfile();
  const city = profile?.city || "Houston, TX";
  const [credential, setCredential] = useState<Credential | null>(null);
  const [credLoading, setCredLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [jobs, setJobs] = useState<JobListing[] | null>(null);
  const [sample, setSample] = useState(false);

  const search = useCallback(
    async (q: string) => {
      setJobs(null);
      try {
        const d = await getJSON<{ jobs: JobListing[]; sample?: boolean }>(`/api/jobs?city=${encodeURIComponent(city)}&q=${encodeURIComponent(q)}`);
        setJobs(d.jobs);
        setSample(Boolean(d.sample));
      } catch {
        setJobs([]);
      }
    },
    [city]
  );

  useEffect(() => {
    if (!ready) return;
    const q = starterQuery(profile?.workBackground);
    setQuery(q);
    search(q);
    if (profile?.workBackground) {
      setCredLoading(true);
      postJSON<Credential>("/api/credential", { workBackground: profile.workBackground, city, locale })
        .then(setCredential)
        .catch(() => setCredential(null))
        .finally(() => setCredLoading(false));
    }
  }, [ready, profile?.workBackground, city, locale, search]);

  return (
    <Screen>
      <NavBar title={t("title")} large>
        <div className="pt-2">
          <SearchField
            value={query}
            onChange={setQuery}
            onSubmit={search}
            placeholder={t("searchPlaceholder", { city: city.split(",")[0] })}
            cancelLabel={tc("cancel")}
          />
        </div>
      </NavBar>
      <GroupedList className="pt-4">
        <ListSection id="credential" header={t("credentialTitle")} bare>
          <div className="flex flex-col gap-3.5 rounded-status bg-orange-tint p-5">
            <div className="flex items-center gap-3">
              <Award size={22} strokeWidth={1.75} className="shrink-0 text-oat" aria-hidden />
              <p className="text-[1.3125rem] leading-snug">{profile?.workBackground || t("credentialTitle")}</p>
            </div>
            {credLoading ? (
              <p className="flex items-center gap-2 text-body text-secondary-label">
                <Spinner size={16} />
                {t("credentialLoading")}
              </p>
            ) : credential ? (
              <>
                <p className="text-body text-label-soft">{credential.overview}</p>
                {credential.boardName && <p className="text-subheadline text-oat">{credential.boardName}</p>}
                <AiLabel />
              </>
            ) : (
              <p className="text-body text-label-soft">{t("noBackground")}</p>
            )}
            {credential?.boardUrl && (
              <ButtonLink href={credential.boardUrl} size="medium" className="self-start">
                {t("stateBoard")}
              </ButtonLink>
            )}
          </div>
        </ListSection>

        <ListSection id="jobs" header={t("results", { city: city.split(",")[0] })} footer={sample ? tc("sampleData") : undefined}>
          {jobs === null ? (
            <div role="status" aria-label={t("finding")}>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ) : jobs.length === 0 ? (
            <ListRow title={<span className="text-secondary-label">{t("empty")}</span>} />
          ) : (
            jobs.map((j, i) => (
              <ListRow
                key={`${j.title}-${i}`}
                href={j.link}
                external={Boolean(j.link)}
                icon={<CaseIcon />}
                iconColor="var(--oat)"
                title={j.title}
                subtitle={[j.company, j.location, j.postedAt, j.via && t("via", { source: j.via })].filter(Boolean).join(" · ")}
              />
            ))
          )}
        </ListSection>
      </GroupedList>
    </Screen>
  );
}
