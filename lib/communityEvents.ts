"use client";

import { getJSON, postJSON } from "./client";
import { maskIds } from "./mask";
import { getSampleRsvps, saveSampleRsvps } from "./storage";
import { supabase } from "./supabase/client";
import { isSupabaseConfigured } from "./supabase/config";
import type { EventDraft, PostedEvent } from "./types";
import type { EventInterest } from "./interests";

// Events posted on the Community tab: real ones in Supabase (supabase/migrations/*_community_events.sql)
// and sample ones written by Muse Spark for the demo. RSVPs to real events are saved in the
// account; RSVPs to samples stay on this device.

interface Row {
  id: string;
  author_id: string;
  title: string;
  description: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  venue: string | null;
  address: string | null;
  city: string;
  cost: string | null;
  interests: string[];
}

const COLUMNS = "id, author_id, title, description, event_date, start_time, end_time, venue, address, city, cost, interests";
const today = () => new Date().toLocaleDateString("en-CA"); // the device's own YYYY-MM-DD

async function me() {
  const { data } = await supabase().auth.getSession();
  return data.session?.user.id ?? null;
}

/** Real events posted in this city from today on, with RSVP counts and this person's RSVPs. */
export async function listPosted(city: string): Promise<PostedEvent[]> {
  if (!isSupabaseConfigured()) return [];
  const sb = supabase();
  const { data, error } = await sb
    .from("community_events")
    .select(COLUMNS)
    .eq("city", city)
    .gte("event_date", today())
    .order("event_date", { ascending: true })
    .limit(50)
    .returns<Row[]>();
  if (error) throw error;
  const rows = data ?? [];
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [counts, mine, user] = await Promise.all([
    sb.rpc("rsvp_counts", { event_ids: ids }),
    sb.from("community_event_rsvps").select("event_id").in("event_id", ids).returns<{ event_id: string }[]>(),
    me(),
  ]);
  const going = new Map(((counts.data ?? []) as { event_id: string; going: number }[]).map((c) => [c.event_id, Number(c.going)]));
  const mineSet = new Set((mine.data ?? []).map((r) => r.event_id));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    date: r.event_date,
    startTime: r.start_time ?? undefined,
    endTime: r.end_time ?? undefined,
    venue: r.venue ?? undefined,
    address: r.address ?? undefined,
    city: r.city,
    cost: r.cost ?? undefined,
    interests: r.interests ?? [],
    going: going.get(r.id) ?? 0,
    rsvp: mineSet.has(r.id),
    mine: r.author_id === user,
  }));
}

/** Sample events from Muse Spark for these filters, with this device's RSVPs applied. */
export async function listSamples(city: string, locale: string, interests: EventInterest[], custom: string[], country: string): Promise<PostedEvent[]> {
  const params = new URLSearchParams({ city, lang: locale });
  if (interests.length) params.set("interests", interests.join(","));
  custom.forEach((c) => params.append("custom", c));
  if (country) params.set("country", country);
  const [{ events }, rsvps] = await Promise.all([getJSON<{ events: PostedEvent[] }>(`/api/community-events/samples?${params}`), getSampleRsvps()]);
  return events.map((e) => (rsvps.includes(e.id) ? { ...e, rsvp: true, going: e.going + 1 } : e));
}

/** Whether a posted event fits the person's filters (no filters: everything fits). */
export function matchesFilters(e: PostedEvent, interests: EventInterest[], custom: string[]) {
  if (e.sample || (!interests.length && !custom.length)) return true;
  if (e.interests.some((i) => (interests as string[]).includes(i))) return true;
  const text = `${e.title} ${e.description}`.toLowerCase();
  return custom.some((c) => c.toLowerCase().split(/\s+/).filter((w) => w.length > 2).some((w) => text.includes(w)));
}

/** Say you're going (or not). Returns the event with its new count. */
export async function setRsvp(e: PostedEvent, going: boolean): Promise<PostedEvent> {
  if (e.rsvp === going) return e;
  if (e.sample) {
    const list = await getSampleRsvps();
    await saveSampleRsvps(going ? [...new Set([...list, e.id])] : list.filter((id) => id !== e.id));
  } else {
    const sb = supabase();
    const { error } = going
      ? await sb.from("community_event_rsvps").insert({ event_id: e.id })
      : await sb.from("community_event_rsvps").delete().eq("event_id", e.id);
    if (error) throw error;
  }
  return { ...e, rsvp: going, going: Math.max(0, e.going + (going ? 1 : -1)) };
}

/** Muse Spark fills in the event from a few words, a flyer photo (data: URL), or both. */
export const draftEvent = (input: { description?: string; image?: string; city: string; lang: string }) =>
  postJSON<EventDraft>("/api/community-events/draft", { ...input, today: today() });

/** Post the event. Anything that looks like an ID number is masked first. */
export async function postEvent(d: EventDraft, city: string): Promise<string> {
  const clean = (s: string, max: number) => maskIds(s.trim()).slice(0, max) || null;
  const { data, error } = await supabase()
    .from("community_events")
    .insert({
      title: clean(d.title, 120),
      description: clean(d.description, 2000) ?? "",
      event_date: d.date,
      start_time: clean(d.startTime, 20),
      end_time: clean(d.endTime, 20),
      venue: clean(d.venue, 120),
      address: clean(d.address, 200),
      city,
      cost: clean(d.cost, 60),
      interests: d.interests.slice(0, 10),
    })
    .select("id")
    .single<{ id: string }>();
  if (error) throw error;
  return data.id;
}

export async function deletePosted(id: string) {
  const { error } = await supabase().from("community_events").delete().eq("id", id);
  if (error) throw error;
}

// The list shown on the Community tab, kept for this tab session so an event's own screen can
// open it (sample events exist only in this list).
const KEY = "landed:posted-events";
export function cachePosted(events: PostedEvent[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(events));
  } catch {
    /* ignore */
  }
}
export function cachedPosted(id: string): PostedEvent | undefined {
  try {
    return (JSON.parse(sessionStorage.getItem(KEY) || "[]") as PostedEvent[]).find((e) => e.id === id);
  } catch {
    return undefined;
  }
}
export function updateCachedPosted(e: PostedEvent) {
  try {
    const list = JSON.parse(sessionStorage.getItem(KEY) || "[]") as PostedEvent[];
    sessionStorage.setItem(KEY, JSON.stringify(list.map((x) => (x.id === e.id ? e : x))));
  } catch {
    /* ignore */
  }
}
