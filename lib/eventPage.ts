import "server-only";
import { parseHTML } from "linkedom";
import { clip } from "./mask";
import type { EventDetails } from "./types";

// Reading an event's own web page: its structured event data (schema.org JSON-LD, which most
// ticket sites publish) or its summary tags. Only public https pages are fetched, with nothing
// about the user. Used for the event details screen, and to check events found by web search.

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

/** Public web pages only: no IP literals, localhost or internal names. */
export function isPublicHttps(raw: string) {
  try {
    const u = new URL(raw);
    const h = u.hostname.toLowerCase();
    if (u.protocol !== "https:" || !h.includes(".")) return false;
    if (/^[\d.]+$/.test(h) || h.includes(":") || h.startsWith("[")) return false;
    return !/(^|\.)(localhost|local|internal|lan|home|corp)$/.test(h);
  } catch {
    return false;
  }
}

export async function fetchPage(url: string, timeoutMs = 12_000) {
  let current = url;
  // Follow redirects by hand so every hop is checked.
  for (let hop = 0; hop < 5; hop++) {
    if (!isPublicHttps(current)) throw new Error("not a public page");
    const res = await fetch(current, {
      redirect: "manual",
      headers: { "user-agent": UA, accept: "text/html" },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const next = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && next) {
      current = new URL(next, current).href;
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (!(res.headers.get("content-type") ?? "").includes("html")) throw new Error("not a web page");
    return (await res.text()).slice(0, 1_500_000);
  }
  throw new Error("too many redirects");
}

type Json = Record<string, unknown>;

/** schema.org Event objects anywhere in the page's JSON-LD (including @graph and arrays). */
function findEvents(node: unknown, out: Json[] = []): Json[] {
  if (Array.isArray(node)) node.forEach((n) => findEvents(n, out));
  else if (node && typeof node === "object") {
    const o = node as Json;
    const type = ([] as unknown[]).concat(o["@type"] ?? []).map(String);
    if (type.some((t) => /Event$/.test(t))) out.push(o);
    if (o["@graph"]) findEvents(o["@graph"], out);
  }
  return out;
}

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…" };

/** Plain text from a description that may hold HTML, escaped HTML, entities or JSON escapes. */
export const clean = (s: unknown) => {
  if (typeof s !== "string") return "";
  const decode = (t: string) =>
    t.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
      e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e.toLowerCase()] ?? m)
    );
  // Decode twice (some sites double-escape), then drop tags.
  return decode(decode(s))
    .replace(/<\/(p|div|li|h\d)>|<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\\[nrt]/g, " ")
    .replace(/\\(['"\\/])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
};

function pageEvents(document: Document): Json[] {
  const events: Json[] = [];
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      findEvents(JSON.parse(s.textContent ?? ""), events);
    } catch {
      // ignore malformed blocks
    }
  }
  return events;
}

/** Price, free or paid, and organizer from one schema.org Event. */
function offerDetails(ev: Json | undefined): Pick<EventDetails, "price" | "free" | "organizer"> {
  // Prices from offers (an object, an array, or an AggregateOffer).
  const offers = ([] as unknown[]).concat(ev?.offers ?? []) as Json[];
  const prices: number[] = [];
  let currency = "USD";
  for (const o of offers) {
    for (const k of ["price", "lowPrice", "highPrice"]) {
      const n = Number(String(o?.[k] ?? "").replace(/[^\d.]/g, ""));
      if (o?.[k] !== undefined && o?.[k] !== "" && Number.isFinite(n)) prices.push(n);
    }
    if (typeof o?.priceCurrency === "string") currency = o.priceCurrency;
  }
  const accessibleFree = ev?.isAccessibleForFree;
  // A free ticket next to paid ones (free for job seekers, paid for exhibitors) means anyone
  // can go for free: say free, not the exhibitor price.
  const free =
    accessibleFree === true || accessibleFree === "true" || accessibleFree === "True" || prices.some((p) => p === 0)
      ? true
      : prices.length
        ? false
        : undefined;
  const paid = free ? [] : prices.filter((p) => p > 0);
  const organizer = ([] as unknown[]).concat(ev?.organizer ?? []).map((o) => clean((o as Json)?.name))[0];
  return {
    price: paid.length ? { min: Math.min(...paid), max: Math.max(...paid), currency } : undefined,
    free,
    organizer: organizer || undefined,
  };
}

/** What the page says about its (first) event, for the event details screen. */
export function readDetails(html: string): EventDetails {
  const { document } = parseHTML(html);
  const ev = pageEvents(document)[0];
  const meta = (sel: string) => document.querySelector(sel)?.getAttribute("content") ?? "";
  const description = clip(clean(ev?.description) || clean(meta('meta[property="og:description"]')) || clean(meta('meta[name="description"]')), 2000);
  return { description: description || undefined, ...offerDetails(ev) };
}

/* ---------------- Checking an event found by web search ---------------- */

/** Lowercase words without accents or punctuation. */
const norm = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const STOP = new Set(["with", "from", "your", "this", "that", "will", "event", "events", "free", "houston", "2026", "2027"]);
const keyWords = (s: string) => norm(s).split(" ").filter((w) => w.length > 3 && !STOP.has(w));
/** Share of `words` that appear in `among`. */
const overlap = (words: string[], among: Set<string>) => (words.length ? words.filter((w) => among.has(w)).length / words.length : 0);

const MONTHS = [
  ["january", "jan", "enero"],
  ["february", "feb", "febrero"],
  ["march", "mar", "marzo"],
  ["april", "apr", "abril"],
  ["may", "may", "mayo"],
  ["june", "jun", "junio"],
  ["july", "jul", "julio"],
  ["august", "aug", "agosto"],
  ["september", "sep", "sept", "septiembre"],
  ["october", "oct", "octubre"],
  ["november", "nov", "noviembre"],
  ["december", "dec", "diciembre"],
];

/** Whether the page shows this date (YYYY-MM-DD) in any common way. */
function hasDate(raw: string, text: string, iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  if (raw.includes(iso)) return true; // structured data, e.g. "startDate":"2026-11-12T18:00"
  if (new RegExp(`(^|[^\\d])0?${m}/0?${d}(/(${y}|${String(y).slice(2)}))?([^\\d]|$)`).test(raw)) return true;
  const names = MONTHS[m - 1].join("|");
  return new RegExp(`\\b(${names}) 0?${d}(st|nd|rd|th)?\\b|\\b0?${d}(st|nd|rd|th)? (de )?(${names})\\b`).test(text);
}

export interface SearchedEvent {
  title: string;
  date: string;
  /** As the search wrote it, e.g. "6:00 pm - 8:00 pm". */
  time?: string;
  /** A sentence the search said it copied from the page. */
  quote?: string;
}

/** Whether the page shows the start time in `time` (12-hour, or 24-hour in structured data). */
function timeOnPage(time: string | undefined, raw: string): boolean {
  const m = time?.toLowerCase().match(/(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/);
  if (!m) return false;
  const hour = Number(m[1]);
  const min = m[2] ?? "00";
  const pm = m[3].startsWith("p");
  const h24 = String((hour % 12) + (pm ? 12 : 0)).padStart(2, "0");
  const ampm = pm ? "p\\.?m\\.?" : "a\\.?m\\.?";
  return (
    new RegExp(`(^|[^\\d])0?${hour}(:${min})?\\s*${ampm}`).test(raw) || (min === "00" && new RegExp(`(^|[^\\d])0?${hour}\\s*${ampm}`).test(raw)) || raw.includes(`t${h24}:${min}`)
  );
}

export interface CheckedEvent {
  /** The page's own date when its event data gives one (it wins over the search's). */
  date: string;
  /** The search's time, only when the page shows that start time and the date is unchanged. */
  time?: string;
  venue?: string;
  address?: string;
  /** The page's own words: the search's quote if it is really on the page, or the page's event description. */
  description?: string;
  /** The description is the search's quote, found on the page. */
  quoted: boolean;
  details: EventDetails;
}

/**
 * Whether the page really lists this event: its title and date are on the page. Returns what
 * the page says, or null when the page can't be read or doesn't match.
 */
export function checkEvent(html: string, found: SearchedEvent, window: { from: string; to: string }): CheckedEvent | null {
  const { document } = parseHTML(html);
  const want = keyWords(found.title);

  // 1. The page's structured event data, when one of its events has this title.
  const best = pageEvents(document)
    .map((ev) => ({ ev, score: overlap(want, new Set(keyWords(clean(ev.name)))) }))
    .sort((a, b) => b.score - a.score)[0];
  if (best && best.score >= 0.6) {
    const date = String(best.ev.startDate ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < window.from || date > window.to) return null;
    const place = (([] as unknown[]).concat(best.ev.location ?? [])[0] ?? {}) as Json;
    const address = place.address as Json | string | undefined;
    const description = clip(clean(best.ev.description), 1200);
    const quote = quoteOnPage(found.quote, norm(clean(html)));
    // Street, city, state; some sites already put the city and state in the street line.
    const parts = typeof address === "string" ? [address] : [address?.streetAddress, address?.addressLocality, address?.addressRegion];
    const street = parts
      .map(clean)
      .filter(Boolean)
      .reduce((out, p) => (out.toLowerCase().includes(p.toLowerCase()) ? out : out ? `${out}, ${p}` : p), "");
    return {
      date,
      time: date === found.date && timeOnPage(found.time, html.toLowerCase()) ? found.time : undefined,
      venue: clean(place.name) || undefined,
      address: street || undefined,
      description: quote ?? (description || undefined),
      quoted: Boolean(quote),
      details: { description: description || undefined, ...offerDetails(best.ev) },
    };
  }

  // 2. Otherwise the page text (script contents included, where app-style pages keep their
  //    data) must have the title's words and the date.
  const raw = html.toLowerCase();
  const text = norm(clean(html));
  if (overlap(want, new Set(text.split(" "))) < 0.6 || !hasDate(raw, text, found.date)) return null;
  const description = quoteOnPage(found.quote, text);
  return {
    date: found.date,
    time: timeOnPage(found.time, raw) ? found.time : undefined,
    description,
    quoted: Boolean(description),
    details: { description },
  };
}

/** The quote, if it is really the page's own words: otherwise undefined. */
function quoteOnPage(quote: string | undefined, pageText: string): string | undefined {
  const q = clip(clean(quote ?? ""), 600);
  const words = norm(q).split(" ").filter(Boolean);
  if (words.length < 6) return undefined;
  // At least 80% of its runs of 8 words must be on the page, which allows a small slip
  // (a dropped word or symbol) but not a sentence the model wrote itself.
  const runs = Math.max(1, words.length - 7);
  let found = 0;
  for (let i = 0; i < runs; i++) if (pageText.includes(words.slice(i, i + 8).join(" "))) found++;
  return found / runs >= 0.8 ? q : undefined;
}
