"use client";

import { clear, del, get, set } from "idb-keyval";
import { maskIds } from "./mask";
import { queuePush } from "./sync";
import type { ChecklistState } from "./checklist";
import type { EventInterest } from "./interests";
import type { PlanStep, PrepSummary, Profile, SavedQuestion, TrackedDate, WorkStatus } from "./types";

// Everything the app remembers lives in this browser's IndexedDB, and is copied to the
// signed-in account in Supabase (lib/sync.ts) so it comes back on any device.
// Only these keys are ever written. Never images, never full ID numbers.
export const KEYS = {
  profile: "landed:profile",
  plan: "landed:plan",
  dates: "landed:dates",
  questions: "landed:questions",
  settings: "landed:settings",
  customLanguage: "landed:customLanguage",
  checklist: "landed:checklist",
  prep: "landed:prep",
  chat: "landed:chat",
  // Not in lib/sync.ts on purpose: immigration status never leaves this device.
  workStatus: "landed:workStatus",
  // The kinds of events picked or typed on the Community tab (this device only).
  eventInterests: "landed:eventInterests",
  eventCustom: "landed:eventCustom",
  // RSVPs to sample events (they aren't real, so they aren't saved in the account).
  sampleRsvps: "landed:sampleRsvps",
} as const;

/** The last appointment-prep summary, kept so the person (and Ask Landed) can find it again. */
export interface SavedPrep {
  questions: string[];
  summary: PrepSummary;
  createdAt: string;
}

export interface Settings {
  notifications: boolean;
}

/** A language the user typed in, with the UI translated into it. */
export interface CustomLanguage {
  name: string; // English name, e.g. "Tigrinya"
  nativeName: string;
  tag: string; // BCP 47
  rtl: boolean;
  messages: Record<string, unknown>;
}

async function safeGet<T>(key: string, fallback: T): Promise<T> {
  try {
    const v = await get<T>(key);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

async function safeSet(key: string, value: unknown) {
  try {
    await set(key, value);
  } catch {
    // Private mode or storage blocked: the app still works for this session.
  }
  queuePush(key);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("landed:storage", { detail: key }));
}

export const getProfile = () => safeGet<Profile | null>(KEYS.profile, null);
export const saveProfile = (p: Profile) => safeSet(KEYS.profile, p);

export const getPlan = () => safeGet<PlanStep[]>(KEYS.plan, []);
export const savePlan = (steps: PlanStep[]) => safeSet(KEYS.plan, steps);

export const getDates = () => safeGet<TrackedDate[]>(KEYS.dates, []);
export const saveDates = (dates: TrackedDate[]) => safeSet(KEYS.dates, dates);

export async function addDate(d: TrackedDate) {
  const dates = await getDates();
  await saveDates([...dates, { ...d, note: d.note ? maskIds(d.note) : d.note, label: maskIds(d.label) }]);
}

export async function updateDate(id: string, patch: Partial<TrackedDate>) {
  const dates = await getDates();
  await saveDates(dates.map((d) => (d.id === id ? { ...d, ...patch } : d)));
}

export async function removeDate(id: string) {
  const dates = await getDates();
  await saveDates(dates.filter((d) => d.id !== id));
}

export const getQuestions = () => safeGet<SavedQuestion[]>(KEYS.questions, []);
export const saveQuestions = (q: SavedQuestion[]) => safeSet(KEYS.questions, q.slice(-30));

export const getSettings = () => safeGet<Settings>(KEYS.settings, { notifications: false });
export const saveSettings = (s: Settings) => safeSet(KEYS.settings, s);

export const getChecklist = () => safeGet<ChecklistState>(KEYS.checklist, {});
export async function setItemDone(id: string, done: boolean) {
  const state = await getChecklist();
  await safeSet(KEYS.checklist, { ...state, [id]: done ? { done: true, doneAt: new Date().toISOString() } : { done: false } });
}

export const getPrep = () => safeGet<SavedPrep | null>(KEYS.prep, null);
export const savePrep = (p: SavedPrep) => safeSet(KEYS.prep, p);

/** Chat history is kept on the device only when the person turns on "Save chat". */
export const getSavedChat = <T,>() => safeGet<T | null>(KEYS.chat, null);
export const saveChat = (c: unknown) => safeSet(KEYS.chat, c);
export const deleteSavedChat = async () => {
  try {
    await del(KEYS.chat);
  } catch {
    // ignore
  }
  queuePush(KEYS.chat);
};

export const getWorkStatus = () => safeGet<WorkStatus | null>(KEYS.workStatus, null);
export const saveWorkStatus = (s: WorkStatus) => safeSet(KEYS.workStatus, s);

export const getEventInterests = () => safeGet<EventInterest[]>(KEYS.eventInterests, []);
export const saveEventInterests = (i: EventInterest[]) => safeSet(KEYS.eventInterests, i);
export const getSampleRsvps = () => safeGet<string[]>(KEYS.sampleRsvps, []);
export const saveSampleRsvps = (ids: string[]) => safeSet(KEYS.sampleRsvps, ids);
export const getCustomInterests = () => safeGet<string[]>(KEYS.eventCustom, []);
export const saveCustomInterests = (c: string[]) => safeSet(KEYS.eventCustom, c);

export const getCustomLanguage = () => safeGet<CustomLanguage | null>(KEYS.customLanguage, null);
export const saveCustomLanguage = (c: CustomLanguage) => safeSet(KEYS.customLanguage, c);

export async function clearAllData() {
  try {
    await Promise.all(Object.values(KEYS).map((k) => del(k)));
    await clear();
  } catch {
    // ignore
  }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("landed:storage", { detail: "*" }));
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
