import { NextResponse } from "next/server";
import { parseHTML } from "linkedom";
import { generateJSON, isLLMConfigured, languageName } from "@/lib/llm";
import { asLocale, clip } from "@/lib/mask";
import type { EventDetails } from "@/lib/types";

// What an event's own page says: its description, ticket prices and whether it's free.
// Read from the page's structured event data (schema.org JSON-LD, which most ticket sites
// publish) or its summary tags. Only public https pages are fetched, with nothing about the
// user; results are cached in memory for 24 hours. Optionally rewritten in plain words in the
// user's language, using only the page's own facts.

export const maxDuration = 30;

const DAY = 24 * 60 * 60 * 1000;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const cache = new Map<string, { at: number; data: EventDetails }>();

/** Public web pages only: no IP literals, localhost or internal names. */
function isPublicHttps(raw: string) {
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

async function fetchPage(url: string) {
  let current = url;
  // Follow redirects by hand so every hop is checked.
  for (let hop = 0; hop < 5; hop++) {
    if (!isPublicHttps(current)) throw new Error("not a public page");
    const res = await fetch(current, {
      redirect: "manual",
      headers: { "user-agent": UA, accept: "text/html" },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
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
const clean = (s: unknown) => {
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

function readDetails(html: string): EventDetails {
  const { document } = parseHTML(html);
  const events: Json[] = [];
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      findEvents(JSON.parse(s.textContent ?? ""), events);
    } catch {
      // ignore malformed blocks
    }
  }
  const ev = events[0];
  const meta = (sel: string) => document.querySelector(sel)?.getAttribute("content") ?? "";
  const description = clip(clean(ev?.description) || clean(meta('meta[property="og:description"]')) || clean(meta('meta[name="description"]')), 2000);

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
  const free =
    accessibleFree === true || accessibleFree === "true" || accessibleFree === "True"
      ? true
      : prices.length
        ? prices.every((p) => p === 0)
        : undefined;
  const paid = prices.filter((p) => p > 0);
  const organizer = ([] as unknown[]).concat(ev?.organizer ?? []).map((o) => clean((o as Json)?.name))[0];

  return {
    description: description || undefined,
    price: paid.length ? { min: Math.min(...paid), max: Math.max(...paid), currency } : undefined,
    free,
    organizer: organizer || undefined,
  };
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const url = params.get("url") ?? "";
  const locale = asLocale(params.get("lang"));
  const title = clip(params.get("title"), 200);
  if (!isPublicHttps(url)) return NextResponse.json({ error: "bad_url" }, { status: 400 });

  const language = languageName(locale, req);
  const key = `${url}|${language}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < DAY) return NextResponse.json(hit.data);

  let details: EventDetails = {};
  try {
    details = readDetails(await fetchPage(url));
  } catch {
    // The page couldn't be read (blocked, login wall): the screen shows what the listing has.
  }

  // Plain-language summary in the user's language, from the page's own words only.
  if (details.description && details.description.length > 60 && isLLMConfigured()) {
    try {
      const out = await generateJSON<{ summary?: string }>({
        system: `Rewrite an event description for a newcomer to the US in ${language}.
Write 2-4 short, plain sentences: what happens, who it's for, and anything to bring or know.
Use ONLY facts from the text. Never add details, prices, times or places that aren't in it. Keep names, dates, times and prices exactly.
Return JSON: { "summary": string }`,
        user: `Event: ${title}\n\n${details.description}`,
        temperature: 0.2,
      });
      if (typeof out.summary === "string" && out.summary.trim()) {
        details = { ...details, description: clip(out.summary.trim(), 1200), aiSummary: true };
      }
    } catch {
      // keep the page's own description
    }
  }

  if (cache.size >= 200) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), data: details });
  return NextResponse.json(details);
}
