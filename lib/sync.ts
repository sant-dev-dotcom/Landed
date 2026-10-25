"use client";

import { del, get, set } from "idb-keyval";
import { clearAllData } from "./storage";
import { supabase } from "./supabase/client";
import { isSupabaseConfigured } from "./supabase/config";
import type { Profile } from "./types";

// Keeps the device's IndexedDB in step with the signed-in account in Supabase, so a person
// who signs in on any device gets their onboarding answers, language and saved data back.
//
// - Sign-in (startSync): the account's data is written to the device. Anything the device
//   has that the account doesn't (e.g. saved before signing up) is uploaded.
// - Every save on the device marks that key dirty and uploads it shortly after. Dirty keys
//   are remembered across reloads, so an edit made offline isn't overwritten on next load.
// - Sign-out (stopSync) uploads what's pending, then clears the device.
//
// Tables: supabase/migrations/*_user_data.sql (row level security: own rows only).

const PREFIX = "landed:";
const OWNER = "landed:owner"; // account the device's data belongs to
const DIRTY = "landed:dirty"; // keys saved here but not uploaded yet
const DATA_KEYS = ["plan", "dates", "questions", "settings", "customLanguage", "checklist", "prep", "chat"] as const;
type DataKey = (typeof DATA_KEYS)[number];
type SyncKey = "profile" | DataKey;

const isSyncKey = (k: string): k is SyncKey => k === "profile" || (DATA_KEYS as readonly string[]).includes(k);

let userId: string | null = null;
const dirty = new Set<SyncKey>();
let timer: ReturnType<typeof setTimeout> | null = null;

interface ProfileRow {
  id: string;
  locale: string;
  name: string | null;
  origin_country: string;
  languages: string[];
  city: string;
  months_in_us: number;
  has_children: boolean;
  work_background: string | null;
  biggest_challenge: string | null;
  created_at: string;
}

const toRow = (id: string, p: Profile): ProfileRow & { updated_at: string } => ({
  id,
  locale: p.locale,
  name: p.name ?? null,
  origin_country: p.originCountry,
  languages: p.languages,
  city: p.city,
  months_in_us: p.monthsInUS,
  has_children: p.hasChildren,
  work_background: p.workBackground ?? null,
  biggest_challenge: p.biggestChallenge ?? null,
  created_at: p.createdAt,
  updated_at: new Date().toISOString(),
});

const fromRow = (r: ProfileRow): Profile => ({
  locale: r.locale as Profile["locale"],
  name: r.name ?? undefined,
  originCountry: r.origin_country,
  languages: r.languages ?? [],
  city: r.city,
  monthsInUS: r.months_in_us,
  hasChildren: r.has_children,
  workBackground: r.work_background ?? undefined,
  biggestChallenge: r.biggest_challenge ?? undefined,
  createdAt: r.created_at,
});

const saveDirty = () => set(DIRTY, [...dirty]).catch(() => {});

/** Called by storage.ts after every save or delete of a `landed:*` key. */
export function queuePush(fullKey: string) {
  if (!isSupabaseConfigured() || !fullKey.startsWith(PREFIX)) return;
  const key = fullKey.slice(PREFIX.length);
  if (!isSyncKey(key)) return;
  dirty.add(key);
  saveDirty();
  if (userId && !timer) timer = setTimeout(flush, 400);
}

async function pushOne(id: string, key: SyncKey) {
  const sb = supabase();
  const value = await get(PREFIX + key);
  if (key === "profile") {
    const { error } = value
      ? await sb.from("profiles").upsert(toRow(id, value as Profile))
      : await sb.from("profiles").delete().eq("id", id);
    if (error) throw error;
    return;
  }
  const { error } =
    value === undefined || value === null
      ? await sb.from("user_data").delete().eq("user_id", id).eq("key", key)
      : await sb.from("user_data").upsert({ user_id: id, key, value, updated_at: new Date().toISOString() });
  if (error) throw error;
}

/** Uploads every dirty key now. Keys that fail stay dirty for the next try. */
export async function flush() {
  timer = null;
  const id = userId;
  if (!id || !dirty.size) return;
  const keys = [...dirty];
  dirty.clear();
  const failed: SyncKey[] = [];
  for (const k of keys) {
    try {
      await pushOne(id, k);
    } catch (err) {
      console.warn("[sync] upload failed:", k, err instanceof Error ? err.message : err);
      failed.push(k);
    }
  }
  failed.forEach((k) => dirty.add(k));
  await saveDirty();
}

/**
 * Links the device to this account and brings its data down. Returns the profile now on
 * the device (null if they haven't done onboarding yet). Safe to call more than once.
 */
export async function startSync(id: string): Promise<Profile | null> {
  if (!isSupabaseConfigured()) return null;
  const owner = await get<string>(OWNER).catch(() => undefined);
  if (owner && owner !== id) await clearAllData(); // someone else's data was on this device
  dirty.clear();
  if (owner === id) ((await get<SyncKey[]>(DIRTY).catch(() => undefined)) ?? []).forEach((k) => dirty.add(k));

  const sb = supabase();
  const [profileRes, dataRes] = await Promise.all([
    sb.from("profiles").select("*").eq("id", id).maybeSingle<ProfileRow>(),
    sb.from("user_data").select("key, value").eq("user_id", id),
  ]);
  if (profileRes.error || dataRes.error) {
    // Tables missing or offline: the app keeps working from the device; nothing is uploaded.
    console.warn("[sync] download failed:", (profileRes.error ?? dataRes.error)?.message);
    return (await get<Profile>(PREFIX + "profile").catch(() => undefined)) ?? null;
  }

  const remote = new Map<SyncKey, unknown>((dataRes.data ?? []).map((r) => [r.key as SyncKey, r.value]));
  if (profileRes.data) remote.set("profile", fromRow(profileRes.data));

  for (const key of ["profile", ...DATA_KEYS] as SyncKey[]) {
    if (dirty.has(key)) continue; // a local edit that hasn't been uploaded yet wins
    if (remote.has(key)) await set(PREFIX + key, remote.get(key));
    else if ((await get(PREFIX + key)) !== undefined) dirty.add(key); // only on this device: upload it
  }

  await set(OWNER, id);
  userId = id;
  window.dispatchEvent(new CustomEvent("landed:storage", { detail: "*" }));
  await flush();
  return (await get<Profile>(PREFIX + "profile")) ?? null;
}

/** Sign-out: upload anything pending, then clear this device. */
export async function stopSync() {
  await flush().catch(() => {});
  userId = null;
  dirty.clear();
  await clearAllData();
  await del(DIRTY).catch(() => {});
}

/** Delete My Data: removes everything saved in the account, forum posts included (the account itself stays). */
export async function deleteAccountData() {
  const id = userId;
  if (!id) return;
  dirty.clear();
  const sb = supabase();
  await Promise.all([
    sb.from("profiles").delete().eq("id", id),
    sb.from("user_data").delete().eq("user_id", id),
    sb.from("forum_replies").delete().eq("author_id", id),
    sb.from("forum_posts").delete().eq("author_id", id),
  ]);
}
