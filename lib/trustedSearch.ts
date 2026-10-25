import "server-only";
import en from "@/messages/en.json";
import { getItem as getChecklistItem, ITEMS, type ChecklistItem } from "./checklist";
import { baseUrl, isTrusted, localizedVersion, NONPROFIT_DOMAINS, sourceType, type LocalizedUrl, type SourceType } from "./links";
import { retrieve, sourceBody, sourceTitle } from "./sources";
import { isSerpConfigured, serpSearch } from "./serp";
import type { Locale } from "./types";

// Retrieval for Ask Landed's legal answers: the curated source library and the checklist
// first; only if neither has anything relevant, a live web search restricted to
// allowlisted domains. Every result carries a trusted URL to cite.

export interface TrustedResult {
  title: string;
  url: string;
  sourceType: SourceType;
  excerpt: string;
  from: "library" | "checklist" | "web";
}

type ItemText = { title: string; short: string; body: string; steps: Record<string, string>; links: Record<string, string> };
const TEXT = en.checklist.items as Record<string, ItemText>;

const STOP = new Set(
  "a an the is are was be to of in on for and or what how do does i my me you your it this that with can should will if at as by from about who which why when where get".split(" ")
);
const tokens = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9-]+/)
    .filter((t) => t.length > 1 && !STOP.has(t));

const pick = (url: LocalizedUrl, locale: Locale) => localizedVersion(url, locale) ?? baseUrl(url);

/** A checklist item's text and links (English text; the model answers in the user's language). */
export function itemDetails(item: ChecklistItem, locale: Locale) {
  const text = TEXT[item.id];
  return {
    id: item.id,
    title: text.title,
    explanation: text.body,
    statusDependent: Boolean(item.statusDependent),
    hasDeadline: Boolean(item.deadline),
    page: `/legal/checklist/${item.id}`,
    howTo: item.howTo.map((s, i) => ({
      step: text.steps[`s${i + 1}`],
      link: s.link ? pick(s.link.url, locale) : undefined,
    })),
    links: item.links.map((l, i) => ({ title: text.links[`l${i + 1}`], url: pick(l.url, locale), sourceType: sourceType(baseUrl(l.url)) })),
  };
}

export const getItemDetails = (id: string, locale: Locale) => {
  const item = getChecklistItem(id);
  return item ? itemDetails(item, locale) : null;
};

function searchChecklist(query: string, locale: Locale): TrustedResult[] {
  const q = tokens(query);
  if (!q.length) return [];
  return ITEMS.map((item) => {
    const t = TEXT[item.id];
    const title = new Set(tokens(`${t.title} ${t.short}`));
    const body = new Set(tokens(`${t.body} ${Object.values(t.steps).join(" ")}`));
    const score = q.reduce((n, w) => n + (title.has(w) ? 2 : 0) + (body.has(w) ? 1 : 0), 0);
    return { item, score };
  })
    .filter((x) => x.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .flatMap(({ item }) => {
      const d = itemDetails(item, locale);
      const excerpt = `${d.explanation} Steps: ${d.howTo.map((s, i) => `${i + 1}. ${s.step}`).join(" ")}`;
      return d.links
        .filter((l): l is typeof l & { sourceType: SourceType } => Boolean(l.sourceType))
        .map((l) => ({ title: l.title, url: l.url, sourceType: l.sourceType, excerpt, from: "checklist" as const }));
    });
}

const SITES = ["uscis.gov", "usa.gov", "irs.gov", "ssa.gov", "dol.gov", "cbp.gov", "justice.gov", "consumerfinance.gov", "ftc.gov", "healthcare.gov", ...NONPROFIT_DOMAINS];

async function searchWeb(query: string): Promise<TrustedResult[]> {
  if (!isSerpConfigured()) return [];
  try {
    const data = await serpSearch<{ organic_results?: { title?: string; link?: string; snippet?: string }[] }>({
      engine: "google",
      q: `${query} (${SITES.map((s) => `site:${s}`).join(" OR ")})`,
      hl: "en",
      gl: "us",
      num: "8",
    });
    return (data.organic_results ?? [])
      .filter((r) => r.link && r.title && isTrusted(r.link)) // never show a non-allowlisted result
      .slice(0, 4)
      .map((r) => ({ title: r.title!, url: r.link!, sourceType: sourceType(r.link!)!, excerpt: r.snippet ?? "", from: "web" as const }));
  } catch (err) {
    console.error("[trusted-search] SerpApi failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

export async function searchTrustedSources(query: string, locale: Locale): Promise<TrustedResult[]> {
  const library: TrustedResult[] = retrieve(query, 3)
    .filter((s) => isTrusted(s.url))
    .map((s) => ({ title: sourceTitle(s, locale), url: s.url, sourceType: sourceType(s.url)!, excerpt: sourceBody(s, locale).slice(0, 1500), from: "library" }));
  const results = [...library, ...searchChecklist(query, locale)];
  const unique = [...new Map(results.map((r) => [r.url, r])).values()];
  return unique.length ? unique.slice(0, 6) : searchWeb(query);
}
