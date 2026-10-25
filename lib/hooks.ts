"use client";

import { useCallback, useEffect, useState } from "react";
import { intlTag } from "@/i18n/languages";
import { getChecklist, getCustomInterests, getDates, getEventInterests, getPlan, getProfile, getSettings, getWorkStatus, type Settings } from "./storage";
import type { ChecklistState } from "./checklist";
import type { EventInterest } from "./interests";
import type { PlanStep, Profile, TrackedDate, WorkStatus } from "./types";

function useStored<T>(loader: () => Promise<T>, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [ready, setReady] = useState(false);
  const reload = useCallback(() => {
    loader().then((v) => {
      setValue(v);
      setReady(true);
    });
  }, [loader]);

  useEffect(() => {
    reload();
    const on = () => reload();
    window.addEventListener("landed:storage", on);
    return () => window.removeEventListener("landed:storage", on);
  }, [reload]);

  return [value, ready] as const;
}

export const useProfile = () => useStored<Profile | null>(getProfile, null);
export const usePlan = () => useStored<PlanStep[]>(getPlan, []);
export const useSettings = () => useStored<Settings>(getSettings, { notifications: false });
export const useChecklist = () => useStored<ChecklistState>(getChecklist, {});
export const useWorkStatus = () => useStored<WorkStatus | null>(getWorkStatus, null);
export const useEventInterests = () => useStored<EventInterest[]>(getEventInterests, []);
export const useCustomInterests = () => useStored<string[]>(getCustomInterests, []);

export function useDates() {
  const [dates, ready] = useStored<TrackedDate[]>(getDates, []);
  const sorted = [...dates].sort((a, b) => a.date.localeCompare(b.date));
  return [sorted, ready] as const;
}

/** Whole days from today (local) to an ISO date. Negative = past. */
export function daysUntil(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const target = new Date(y, (m || 1) - 1, d || 1);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** The next date that has not passed yet, or the most recent past one if all have passed. */
export function nextDate(dates: TrackedDate[]): TrackedDate | undefined {
  const sorted = [...dates].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.find((d) => daysUntil(d.date) >= 0) ?? sorted[sorted.length - 1];
}

export type Status = "green" | "yellow" | "red" | "empty";

export function statusFor(dates: TrackedDate[]): { status: Status; next?: TrackedDate; days?: number } {
  if (!dates.length) return { status: "empty" };
  const past = dates.filter((d) => daysUntil(d.date) < 0 && daysUntil(d.date) > -30);
  if (past.length) {
    const p = past[past.length - 1];
    return { status: "red", next: p, days: daysUntil(p.date) };
  }
  const next = nextDate(dates)!;
  const days = daysUntil(next.date);
  if (days < 0) return { status: "green", next, days };
  if (days <= 60) return { status: "red", next, days };
  if (days <= 180) return { status: "yellow", next, days };
  return { status: "green", next, days };
}

export function formatDate(iso: string, locale: string, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y) return iso;
  return new Intl.DateTimeFormat(intlTag(locale), opts).format(new Date(y, (m || 1) - 1, d || 1));
}
