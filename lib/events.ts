import "server-only";
import { isSerpConfigured, serpLocation, serpSearch } from "./serp";
import { eventsFallback } from "./fallbacks";
import type { EventLink, EventListing, Locale } from "./types";

// Newcomer-friendly events near a city (Google Events via SerpApi, or curated samples).
// Shared by /api/events and the Ask Landed assistant's findEvents tool.

interface SerpEvent {
  title?: string;
  date?: { start_date?: string; when?: string };
  address?: string[];
  link?: string;
  description?: string;
  venue?: { name?: string };
  ticket_info?: { source?: string; link?: string; link_type?: string }[];
  thumbnail?: string;
}

/** A short, stable id from the title and date, so a listing can be opened on its own screen. */
export function eventId(title: string, date = "") {
  let h = 5381;
  for (const c of `${title}|${date}`) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0;
  return h.toString(36);
}

function links(e: SerpEvent): EventLink[] {
  const out = (e.ticket_info ?? [])
    .filter((t) => t.link && /^https:\/\//.test(t.link))
    .map((t) => ({
      source: t.source || new URL(t.link!).hostname.replace(/^www\./, ""),
      link: t.link!,
      type: (t.link_type === "tickets" ? "tickets" : "info") as EventLink["type"],
    }));
  // Ticket pages first.
  return out.sort((a, b) => (a.type === b.type ? 0 : a.type === "tickets" ? -1 : 1)).slice(0, 4);
}

export async function findEvents(
  city: string,
  locale: Locale,
  /** Extra searches, e.g. "Venezuelan community", "Spanish-language church". */
  extra: string[] = []
): Promise<{ events: EventListing[]; sample: boolean }> {
  const name = city.split(",")[0];
  if (isSerpConfigured()) {
    try {
      const queries = [
        ...extra.map((q) => `${q} ${name}`),
        `free ESL classes ${name}`,
        `community events immigrants ${name}`,
        `job fair ${name}`,
        locale === "es" ? `eventos en español ${name}` : `newcomer welcome event ${name}`,
      ].slice(0, 5);
      const pages = await Promise.all(
        queries.map((q) =>
          serpSearch<{ events_results?: SerpEvent[] }>({
            engine: "google_events",
            q,
            location: serpLocation(city),
            hl: locale === "es" ? "es" : "en",
            gl: "us",
          }).catch(() => ({ events_results: [] as SerpEvent[] }))
        )
      );
      // Interleave queries so the feed mixes ESL, community and jobs.
      const lists = pages.map((p) => p.events_results || []);
      const seen = new Set<string>();
      const events: EventListing[] = [];
      for (let i = 0; i < 6; i++) {
        for (const list of lists) {
          const e = list[i];
          if (!e?.title || seen.has(e.title)) continue;
          seen.add(e.title);
          const eventLinks = links(e);
          events.push({
            id: eventId(e.title, e.date?.start_date),
            title: e.title,
            when: e.date?.when,
            startDate: e.date?.start_date,
            venue: e.venue?.name,
            location: e.address?.join(", "),
            link: e.link ?? eventLinks[0]?.link,
            description: e.description,
            links: eventLinks,
            thumbnail: e.thumbnail,
          });
        }
      }
      if (events.length) return { events: events.slice(0, 12), sample: false };
    } catch (err) {
      console.error("[events] SerpApi failed:", err instanceof Error ? err.message : err);
    }
  }
  return { events: eventsFallback(city, locale).map((e) => ({ ...e, id: eventId(e.title, e.startDate), sample: true })), sample: true };
}
