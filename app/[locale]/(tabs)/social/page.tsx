"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarPlus, Check, ChevronDown, Globe, Plus, Search, ShieldCheck, Ticket, X } from "lucide-react";
import { NavBar } from "@/components/ios/NavBar";
import { GroupedList } from "@/components/ios/GroupedList";
import { ListSection } from "@/components/ios/ListSection";
import { ListRow } from "@/components/ios/ListRow";
import { SegmentedControl } from "@/components/ios/SegmentedControl";
import { Screen } from "@/components/ios/Screen";
import { Button, ButtonLink } from "@/components/ios/Button";
import { Spinner } from "@/components/ios/Spinner";
import { DateBadge } from "@/components/EventDateBadge";
import { ForumSection } from "@/components/ForumSection";
import { PostedEventsSection } from "@/components/PostedEventsSection";
import { getJSON, getJSONLines } from "@/lib/client";
import { cacheEvents } from "@/lib/eventCache";
import { demoEvents } from "@/lib/demoEvents";
import { useCustomInterests, useEventInterests, useProfile } from "@/lib/hooks";
import {
  cleanCustomInterest,
  CUSTOM_INTEREST_LENGTH,
  EVENT_INTERESTS,
  MAX_CUSTOM_INTERESTS,
  type EventInterest,
} from "@/lib/interests";
import { saveCustomInterests, saveEventInterests } from "@/lib/storage";
import type { EventListing } from "@/lib/types";

const EVENTS_PER_PAGE = 5;
// Remembered for the tab session, so coming back from an event opens the same page.
const PAGE_KEY = "landed:eventsPage";
const VIEW_KEY = "landed:eventsView";

function readPage() {
  try {
    return Number(sessionStorage.getItem(PAGE_KEY)) || 0;
  } catch {
    return 0;
  }
}

/** One line from /api/events/discover. */
type DiscoverLine =
  | { type: "search"; id: string; query: string }
  | { type: "searched"; id: string; query: string; results: number }
  | { type: "read"; id: string; site: string }
  | { type: "check"; id: string; site: string; ok: boolean }
  | { type: "done"; events: EventListing[]; cached?: boolean }
  | { type: "error" };

/** What Muse Spark did while searching, shown live. */
interface Step {
  id: string;
  /** "check": an event the search found, checked against its page (`ok` if confirmed). */
  kind: "search" | "read" | "check";
  text: string;
  results?: number;
  ok?: boolean;
  done: boolean;
}

const signature = (interests: string[], custom: string[]) => [...interests].sort().join(",") + "|" + [...custom].sort().join(",");

export default function CommunityPage() {
  const t = useTranslations("community");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [profile, ready] = useProfile();
  const [saved, savedReady] = useEventInterests();
  const [savedCustom, customReady] = useCustomInterests();
  const city = profile?.city || "Houston, TX";
  const country = profile?.originCountry && profile.originCountry !== "Unknown" ? profile.originCountry : "";
  const [picked, setPicked] = useState<EventInterest[]>([]);
  const [custom, setCustom] = useState<string[]>([]);
  // Hydrate once. IndexedDB notifications can arrive after a newer filter click.
  const pickedRef = useRef<EventInterest[] | null>(null);
  const customRef = useRef<string[] | null>(null);
  const pendingSave = useRef(Promise.resolve());
  const [draft, setDraft] = useState("");
  const [events, setEvents] = useState<EventListing[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [sample, setSample] = useState(false);
  // Where the list came from: Muse Spark web search for their interests, or the general listing.
  const [source, setSource] = useState<"muse" | "general">("general");
  const [museFailed, setMuseFailed] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [showSteps, setShowSteps] = useState(false);
  // The interests the shown list was searched for, to tell when the picks have changed.
  const [searched, setSearched] = useState("|");
  // The same filters, for the events posted on Landed.
  const [filters, setFilters] = useState<{ interests: EventInterest[]; custom: string[] } | null>(null);
  const [page, setPage] = useState(0);
  const running = useRef<AbortController | null>(null);

  useEffect(() => setPage(readPage()), []);
  useEffect(() => {
    if (savedReady && pickedRef.current === null) {
      pickedRef.current = saved;
      setPicked(saved);
    }
  }, [savedReady, saved]);
  useEffect(() => {
    if (customReady && customRef.current === null) {
      customRef.current = savedCustom;
      setCustom(savedCustom);
    }
  }, [customReady, savedCustom]);

  const initialEvents = useMemo(() => demoEvents(city, locale), [city, locale]);
  const displayedEvents = events ?? initialEvents;
  useEffect(() => cacheEvents(displayedEvents), [displayedEvents]);
  const pageCount = Math.ceil(displayedEvents.length / EVENTS_PER_PAGE);
  // A shorter list (new city or language) can leave the saved page past the end.
  const current = Math.min(page, Math.max(0, pageCount - 1));
  const pageEvents = displayedEvents.slice(current * EVENTS_PER_PAGE, (current + 1) * EVENTS_PER_PAGE);

  const goToPage = (p: number) => {
    setPage(p);
    try {
      sessionStorage.setItem(PAGE_KEY, String(p));
    } catch {
      // ignore
    }
  };

  const show = (list: EventListing[], from: "muse" | "general", isSample = false) => {
    setEvents(list);
    cacheEvents(list);
    setSource(from);
    setSample(isSample);
  };

  const loadGeneral = useCallback(async (signal: AbortSignal) => {
    try {
      const d = await getJSON<{ events: EventListing[]; sample?: boolean }>(`/api/events?city=${encodeURIComponent(city)}&locale=${locale}`, signal);
      if (!signal.aborted) show(d.events, "general", Boolean(d.sample));
    } catch {
      if (!signal.aborted) show(demoEvents(city, locale), "general", true);
    }
  }, [city, locale]);

  const find = useCallback(
    async (interests: EventInterest[], typed: string[]) => {
      running.current?.abort();
      const controller = new AbortController();
      running.current = controller;
      // A stalled request must not leave the action disabled indefinitely.
      const timeout = setTimeout(() => {
        controller.abort();
        if (running.current === controller) setSearching(false);
      }, 60_000);
      setSearching(true);
      setEvents(null);
      setMuseFailed(false);
      setSteps([]);
      setShowSteps(false);
      setSearched(signature(interests, typed));
      setFilters({ interests, custom: typed });
      goToPage(0);
      const params = new URLSearchParams({ city, lang: locale });
      if (interests.length) params.set("interests", interests.join(","));
      typed.forEach((c) => params.append("custom", c));
      if (country) params.set("country", country);

      let finished = false;
      const onLine = (line: DiscoverLine) => {
        if (controller.signal.aborted) return;
        if (line.type === "done") finished = true;
        if (line.type === "search") {
          setSteps((s) => [...s, { id: line.id, kind: "search", text: line.query, done: false }]);
        } else if (line.type === "searched") {
          setSteps((s) =>
            s.some((x) => x.id === line.id)
              ? s.map((x) => (x.id === line.id ? { ...x, done: true, results: line.results } : x))
              : [...s, { id: line.id, kind: "search", text: line.query, results: line.results, done: true }]
          );
        } else if (line.type === "read") {
          setSteps((s) => [...s, { id: line.id, kind: "read", text: line.site, done: true }]);
        } else if (line.type === "check") {
          setSteps((s) => [...s, { id: line.id, kind: "check", text: line.site, ok: line.ok, done: true }]);
        } else if (line.type === "done") {
          show(line.events, "muse");
        } else {
          throw new Error("search failed");
        }
      };
      try {
        if (!interests.length && !typed.length) {
          await loadGeneral(controller.signal);
          return;
        }
        try {
          await getJSONLines<DiscoverLine>(`/api/events/discover?${params}`, onLine, controller.signal);
          if (!finished) throw new Error("stream ended early");
        } catch {
          if (controller.signal.aborted) return;
          // Web search unavailable: show the general listing instead, and say so.
          setMuseFailed(true);
          await loadGeneral(controller.signal);
        }
      } finally {
        clearTimeout(timeout);
        if (running.current === controller) {
          running.current = null;
          setSearching(false);
        }
      }
    },
    [city, country, locale, loadGeneral]
  );

  // Which events are showing: found on the web (Muse Spark search) or posted on Landed.
  // Remembered for the tab session.
  const [view, setView] = useState<"web" | "landed">("web");
  useEffect(() => {
    try {
      if (sessionStorage.getItem(VIEW_KEY) === "landed") setView("landed");
    } catch {
      // ignore
    }
  }, []);
  const switchView = (v: "web" | "landed") => {
    setView(v);
    try {
      sessionStorage.setItem(VIEW_KEY, v);
    } catch {
      // ignore
    }
  };

  // Restore saved filters for posted events. Muse discovery is explicitly button-driven.
  const loaded = ready && savedReady && customReady;
  useEffect(() => {
    if (!loaded) return;
    setFilters({ interests: pickedRef.current ?? saved, custom: customRef.current ?? savedCustom });
    // Only when the profile or saved picks first load, not on every pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, city, locale]);

  // Start with the general SerpApi feed, even when interests were saved previously.
  // Local samples stay visible until it arrives; selecting interests never starts Muse.
  useEffect(() => {
    if (!ready) return;
    void find([], []);
    const request = running.current;
    return () => request?.abort();
  }, [ready, find]);

  useEffect(() => () => running.current?.abort(), []);

  // Preserve write order when several chips are tapped before storage finishes.
  const persist = (save: () => Promise<void>) => {
    pendingSave.current = pendingSave.current.catch(() => {}).then(save);
  };

  const toggle = (id: EventInterest) => {
    const selected = pickedRef.current ?? picked;
    const next = selected.includes(id) ? selected.filter((p) => p !== id) : [...selected, id];
    pickedRef.current = next;
    setPicked(next);
    persist(() => saveEventInterests(next));
  };

  const addCustom = (e: FormEvent) => {
    e.preventDefault();
    const value = cleanCustomInterest(draft);
    const selected = customRef.current ?? custom;
    if (!value || selected.length >= MAX_CUSTOM_INTERESTS) return;
    if (!selected.some((c) => c.toLowerCase() === value.toLowerCase())) {
      const next = [...selected, value];
      customRef.current = next;
      setCustom(next);
      persist(() => saveCustomInterests(next));
    }
    setDraft("");
  };

  const removeCustom = (value: string) => {
    const next = (customRef.current ?? custom).filter((c) => c !== value);
    customRef.current = next;
    setCustom(next);
    persist(() => saveCustomInterests(next));
  };

  const interests = EVENT_INTERESTS.filter((i) => i.id !== "homeCountry" || country);
  const searchingWeb = searching && searched !== "|";
  // The picks differ from what the showing list was found for.
  const changed =
    view === "web" ? signature(picked, custom) !== searched : !filters || signature(picked, custom) !== signature(filters.interests, filters.custom);
  const hasAny = picked.length > 0 || custom.length > 0;
  const searches = steps.filter((s) => s.kind === "search").length;
  const reads = steps.filter((s) => s.kind === "read").length;

  const footer =
    events === null || sample ? tc("sampleData") : source === "muse" ? t("museFooter") : museFailed ? t("museFailed") : t("eventsFooter");

  const chip = (on: boolean) =>
    `pressable min-h-[44px] rounded-full px-4 text-callout ${on ? "bg-tint-fill font-medium text-on-accent" : "border border-separator bg-cell text-label"}`;

  return (
    <Screen>
      <NavBar title={t("title")} large>
        <div className="pt-3">
          <SegmentedControl
            label={t("viewLabel")}
            value={view}
            onChange={switchView}
            options={[
              { value: "web", label: t("viewWeb") },
              { value: "landed", label: t("viewLanded") },
            ]}
          />
        </div>
      </NavBar>
      <GroupedList>
        {view === "landed" && (
          <ButtonLink href="/social/create" icon={<CalendarPlus size={20} strokeWidth={1.75} aria-hidden />}>
            {t("createEvent")}
          </ButtonLink>
        )}

        <ListSection id="interests" header={t("interestsTitle")} footer={view === "web" ? t("interestsFooter") : t("interestsFooterLanded")} bare>
          <div role="group" aria-labelledby="interests-heading" className="flex flex-wrap gap-2">
            {interests.map(({ id }) => {
              const on = picked.includes(id);
              return (
                <button key={id} type="button" aria-pressed={on} onClick={() => toggle(id)} className={chip(on)}>
                  {t(`interest_${id}`, { country })}
                </button>
              );
            })}
            {custom.map((c) => (
              <span key={c} className="flex min-h-[44px] items-center gap-1 rounded-full bg-tint-fill pl-4 pr-1 text-callout font-medium text-on-accent">
                {c}
                <button
                  type="button"
                  onClick={() => removeCustom(c)}
                  aria-label={t("removeCustom", { name: c })}
                  className="pressable flex h-10 w-10 items-center justify-center rounded-full"
                >
                  <X size={16} strokeWidth={2} aria-hidden />
                </button>
              </span>
            ))}
          </div>

          {custom.length < MAX_CUSTOM_INTERESTS && (
            <form onSubmit={addCustom} className="flex items-center gap-2 rounded-cell bg-cell pl-4 pr-1.5">
              <label htmlFor="custom-interest" className="sr-only">
                {t("customLabel")}
              </label>
              <input
                id="custom-interest"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={CUSTOM_INTEREST_LENGTH}
                placeholder={t("customPlaceholder")}
                className="min-h-[48px] min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-tertiary-label"
              />
              <Button
                type="submit"
                variant="plain"
                size="small"
                icon={<Plus size={18} strokeWidth={2} aria-hidden />}
                disabled={!cleanCustomInterest(draft)}
              >
                {t("customAdd")}
              </Button>
            </form>
          )}

          <Button
            size="medium"
            variant={changed ? "filled" : "tinted"}
            icon={<Search size={18} strokeWidth={1.75} aria-hidden />}
            onClick={() => (view === "web"
              ? find(pickedRef.current ?? picked, customRef.current ?? custom)
              : setFilters({ interests: pickedRef.current ?? picked, custom: customRef.current ?? custom }))}
            disabled={view === "web" && searching && !changed}
            className="self-start"
          >
            {hasAny ? t("findEvents") : t("showAllEvents")}
          </Button>
        </ListSection>

        {/* Muse Spark's searches, live while it works, then folded into one line. */}
        {view === "web" && (searchingWeb || steps.length > 0) && (
          <section aria-labelledby="live-heading" className="flex flex-col gap-3 rounded-cell bg-cell p-4">
            {searchingWeb ? (
              <h2 id="live-heading" className="flex items-center gap-2 text-headline">
                <Spinner size={16} />
                {t("liveTitle")}
              </h2>
            ) : (
              <button
                type="button"
                onClick={() => setShowSteps((v) => !v)}
                aria-expanded={showSteps}
                className="pressable flex min-h-[44px] items-center justify-between gap-2 text-start"
              >
                <h2 id="live-heading" className="text-subheadline text-secondary-label">
                  {t("liveSummary", { searches, reads })}
                </h2>
                <ChevronDown size={18} strokeWidth={1.75} aria-hidden className={`shrink-0 text-tertiary-label transition-transform ${showSteps ? "rotate-180" : ""}`} />
              </button>
            )}
            {(searchingWeb || showSteps) && (
              <ol aria-live="polite" className="flex flex-col gap-2.5">
                {steps.length === 0 && <li className="text-subheadline text-secondary-label">{t("liveStarting")}</li>}
                {steps.map((s) => (
                  <li key={s.id} className="flex items-start gap-2.5 text-subheadline">
                    <span
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center ${s.kind === "check" && !s.ok ? "text-tertiary-label" : "text-sage"}`}
                      aria-hidden
                    >
                      {s.kind === "read" ? (
                        <Globe size={16} strokeWidth={1.75} />
                      ) : s.kind === "check" ? (
                        s.ok ? <ShieldCheck size={16} strokeWidth={1.75} /> : <X size={16} strokeWidth={2} />
                      ) : s.done ? (
                        <Check size={16} strokeWidth={2} />
                      ) : (
                        <Spinner size={14} />
                      )}
                    </span>
                    <span className={`min-w-0 flex-1 ${s.kind === "check" && !s.ok ? "text-secondary-label" : "text-label-soft"}`}>
                      {s.kind === "read"
                        ? t("liveRead", { site: s.text })
                        : s.kind === "check"
                          ? t(s.ok ? "liveConfirmed" : "liveNotConfirmed", { site: s.text })
                          : t("liveSearch", { query: s.text })}
                      {s.kind === "search" && s.done && (
                        <span className="text-secondary-label"> · {t("liveResults", { count: s.results ?? 0 })}</span>
                      )}
                    </span>
                  </li>
                ))}
                {searchingWeb && steps.length > 0 && steps.every((s) => s.done) && (
                  <li className="text-subheadline text-secondary-label">{t("liveChecking")}</li>
                )}
              </ol>
            )}
          </section>
        )}

        {view === "web" && (
          <ListSection id="events" header={source === "muse" ? t("eventsForYou") : t("events")} footer={footer} bare>
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
              {displayedEvents.length === 0 ? (
                <ListRow title={<span className="text-secondary-label">{source === "muse" ? t("noMatches") : t("noEvents")}</span>} />
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
        )}

        {view === "landed" && filters && (
          <PostedEventsSection city={city} country={country} interests={filters.interests} custom={filters.custom} />
        )}

        <ForumSection />
      </GroupedList>
    </Screen>
  );
}
