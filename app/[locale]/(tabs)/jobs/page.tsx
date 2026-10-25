"use client";

import { useEffect, useState } from "react";
import { Award, GraduationCap, HeartHandshake, Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { NavBar } from "@/components/ios/NavBar";
import { GroupedList } from "@/components/ios/GroupedList";
import { ListSection } from "@/components/ios/ListSection";
import { ListRow } from "@/components/ios/ListRow";
import { Screen } from "@/components/ios/Screen";
import { CaseIcon, ShieldIcon } from "@/components/LampIcons";
import { ButtonLink } from "@/components/ios/Button";
import { SearchField } from "@/components/ios/SearchField";
import { SkeletonRow, Spinner } from "@/components/ios/Spinner";
import { AiLabel } from "@/components/Disclaimer";
import { getJSON, postJSON } from "@/lib/client";
import { useProfile, useWorkStatus } from "@/lib/hooks";
import { saveWorkStatus } from "@/lib/storage";
import { WORK_STATUSES, type JobListing, type WorkStatus } from "@/lib/types";

interface Credential {
  overview: string;
  boardName?: string;
  boardUrl?: string;
}

interface JobsResponse {
  jobs: JobListing[];
  sample?: boolean;
  /** Left out for "no papers needed"-style wording. */
  hidden?: number;
  /** Left out because the listing says it can't hire someone with this authorization. */
  hiddenForStatus?: number;
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
  const [status, statusReady] = useWorkStatus();
  const city = profile?.city || "Houston, TX";
  const [credential, setCredential] = useState<Credential | null>(null);
  const [credLoading, setCredLoading] = useState(false);
  const [query, setQuery] = useState("");
  // The search that was run: changes on submit, and the list reloads when it or the status does.
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [result, setResult] = useState<JobsResponse | null>(null);

  // Not yet able to work, or not sure: lead with what work authorization means.
  const unsure = !status || status === "none";

  useEffect(() => {
    if (!ready) return;
    const q = starterQuery(profile?.workBackground);
    setQuery(q);
    setSubmitted(q);
    if (profile?.workBackground) {
      setCredLoading(true);
      postJSON<Credential>("/api/credential", { workBackground: profile.workBackground, city, locale })
        .then(setCredential)
        .catch(() => setCredential(null))
        .finally(() => setCredLoading(false));
    }
  }, [ready, profile?.workBackground, city, locale]);

  useEffect(() => {
    if (submitted === null || !statusReady) return;
    let current = true;
    setResult(null);
    const params = new URLSearchParams({ city, q: submitted });
    if (status) params.set("status", status);
    getJSON<JobsResponse>(`/api/jobs?${params}`)
      .then((d) => current && setResult(d))
      .catch(() => current && setResult({ jobs: [] }));
    return () => {
      current = false;
    };
  }, [submitted, status, statusReady, city]);

  const jobs = result?.jobs ?? null;
  const hidden = result?.hidden ?? 0;
  const hiddenForStatus = result?.hiddenForStatus ?? 0;
  const filtering = status === "greenCard" || status === "workPermit" || status === "visa";

  return (
    <Screen>
      <NavBar title={t("title")} large>
        <div className="pt-2">
          <SearchField
            value={query}
            onChange={setQuery}
            onSubmit={setSubmitted}
            placeholder={t("searchPlaceholder", { city: city.split(",")[0] })}
            cancelLabel={tc("cancel")}
          />
        </div>
      </NavBar>
      <GroupedList className="pt-4">
        <ListSection id="status" header={t("statusTitle")} footer={t("statusPrivacy")} bare>
          <div role="radiogroup" aria-labelledby="status-heading" className="flex flex-wrap gap-2">
            {WORK_STATUSES.map((s: WorkStatus) => {
              const active = s === status;
              return (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => saveWorkStatus(s)}
                  className={`pressable min-h-[44px] rounded-full px-4 text-callout ${
                    active ? "bg-tint-fill font-medium text-on-accent" : "border border-separator bg-cell text-label"
                  }`}
                >
                  {t(`status_${s}`)}
                </button>
              );
            })}
          </div>
          {status && status !== "none" && <p className="px-1 text-subheadline text-label-soft">{t(`statusNote_${status}`)}</p>}
        </ListSection>

        {/* Work authorization first: a legal matter, in the same clay-rose style as the legal
            priority on Home. Shown until they say what lets them work. */}
        {unsure && (
          <section aria-labelledby="work-auth-heading" className="flex flex-col gap-3.5 rounded-status bg-red-tint p-5">
            <div className="flex items-start gap-3">
              <ShieldIcon size={24} className="mt-0.5 shrink-0 text-clay" />
              <div className="flex min-w-0 flex-col gap-1.5">
                <h2 id="work-auth-heading" className="text-headline">
                  {t("authTitle")}
                </h2>
                <p className="text-body text-label-soft">{t("authBody")}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <ButtonLink href="/legal/checklist/workPermit" size="medium">
                {t("authPermit")}
              </ButtonLink>
              <ButtonLink href="/legal/help" variant="tinted" size="medium">
                {t("authHelp")}
              </ButtonLink>
            </div>
          </section>
        )}

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

        <ListSection
          id="jobs"
          header={t(status === "visa" ? "resultsVisa" : "results", { city: city.split(",")[0] })}
          footer={
            result?.sample || hidden > 0 || filtering ? (
              <>
                {result?.sample && <span className="block">{tc("sampleData")}</span>}
                {filtering && hiddenForStatus > 0 && (
                  <span className="block">{t("hiddenStatus", { count: hiddenForStatus, status: t(`status_${status}`) })}</span>
                )}
                {filtering && <span className="block">{t("unsaidNote")}</span>}
                {hidden > 0 && (
                  <span className="block">
                    {t("hiddenRisky", { count: hidden })}{" "}
                    <Link href="/legal/checklist/scams" className="text-tint">
                      {t("hiddenWhy")}
                    </Link>
                  </span>
                )}
              </>
            ) : undefined
          }
        >
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
                subtitle={
                  <>
                    {[j.company, j.location, j.postedAt, j.via && t("via", { source: j.via })].filter(Boolean).join(" · ")}
                    {j.sponsors && <span className="mt-0.5 block text-footnote font-medium text-sage">{t("sponsors")}</span>}
                  </>
                }
              />
            ))
          )}
        </ListSection>

        {unsure && (
          <ListSection id="waiting" header={t("waitTitle")} footer={t("waitFooter")}>
            <ListRow
              href="https://www.usa.gov/job-training"
              external
              icon={<GraduationCap />}
              iconColor="var(--sage)"
              title={t("waitTraining")}
              subtitle={t("waitTrainingSub")}
            />
            <ListRow
              href="https://www.usa.gov/learn-english"
              external
              icon={<Languages />}
              iconColor="var(--sage)"
              title={t("waitEnglish")}
              subtitle={t("waitEnglishSub")}
            />
            <ListRow icon={<HeartHandshake />} iconColor="var(--lavender)" title={t("waitVolunteer")} subtitle={t("waitVolunteerSub")} />
          </ListSection>
        )}
      </GroupedList>
    </Screen>
  );
}
