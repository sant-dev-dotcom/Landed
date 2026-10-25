import "server-only";
import { isSerpConfigured, serpSearch } from "./serp";
import { helpFallback } from "./fallbacks";
import type { HelpListing } from "./types";

// Free and low-cost legal help near a city (Google Maps via SerpApi, or curated samples).
// Shared by /api/help and the Ask Landed assistant's findLegalHelp tool.

interface MapsResult {
  place_id?: string;
  title?: string;
  address?: string;
  phone?: string;
  website?: string;
  rating?: number;
  type?: string;
  types?: string[];
  description?: string;
  extensions?: Record<string, string[]>[];
}

const has = (text: string, re: RegExp) => re.test(text);

function inferType(text: string): HelpListing["type"] {
  const t = text.toLowerCase();
  if (has(t, /accredited|board of immigration appeals|doj recognized/)) return "accredited_rep";
  if (has(t, /law school|school of law|law center|university|college/) && has(t, /clinic/)) return "clinic";
  if (has(t, /catholic charities|legal aid|nonprofit|non-profit|ministr|refugee|services collaborative|raices|ymca|baker ?ripley|interfaith|lutheran|human rights|center for|foundation|charities|legal services/))
    return "nonprofit";
  if (has(t, /clinic/)) return "clinic";
  if (has(t, /law firm|attorney|abogad|lawyer|law office|esq|pllc|p\.c\.|llp|& associates|law group/)) return "attorney";
  return "unknown";
}

function inferCost(type: HelpListing["type"], text: string): HelpListing["cost"] {
  const t = text.toLowerCase();
  if (has(t, /\bfree\b|gratis|pro bono/)) return "free";
  if (type === "clinic") return "free";
  if (type === "nonprofit" || type === "accredited_rep") return "low";
  if (type === "attorney") return "paid";
  return "unknown";
}

function inferLanguages(text: string): string[] | undefined {
  const langs: string[] = [];
  if (/spanish|español|espanol|hablamos|bilingual|bilingüe|latino|hispan/i.test(text)) langs.push("Spanish");
  if (/vietnamese|tiếng việt/i.test(text)) langs.push("Vietnamese");
  if (/arabic|dari|pashto|farsi/i.test(text)) langs.push("Arabic/Dari");
  return langs.length ? ["English", ...langs] : undefined;
}

function normalize(r: MapsResult): HelpListing | null {
  if (!r.title) return null;
  const ext = (r.extensions || []).flatMap((e) => Object.values(e).flat()).join(" ");
  const text = [r.title, r.type, ...(r.types || []), r.description, ext].filter(Boolean).join(" ");
  const type = inferType(text);
  return {
    name: r.title,
    type,
    address: r.address,
    phone: r.phone,
    website: r.website,
    rating: r.rating,
    languages: inferLanguages(text),
    cost: inferCost(type, text),
  };
}

export async function findHelp(city: string, q = ""): Promise<{ listings: HelpListing[]; sample: boolean }> {
  if (isSerpConfigured()) {
    try {
      const queries = q
        ? [`${q} immigration ${city}`]
        : [`free immigration legal services ${city}`, `immigration legal aid nonprofit ${city}`, `law school immigration clinic ${city}`];
      const pages = await Promise.all(
        queries.map((query) =>
          serpSearch<{ local_results?: MapsResult[] }>({ engine: "google_maps", type: "search", q: query, hl: "en", gl: "us" }).catch(
            () => ({ local_results: [] as MapsResult[] })
          )
        )
      );
      const seen = new Set<string>();
      const listings: HelpListing[] = [];
      for (const r of pages.flatMap((p) => p.local_results || [])) {
        const key = r.place_id || r.title || "";
        if (!key || seen.has(key)) continue;
        seen.add(key);
        const l = normalize(r);
        if (l) listings.push(l);
      }
      // Nonprofits, clinics and accredited reps first; attorneys last.
      const rank: Record<HelpListing["type"], number> = { nonprofit: 0, accredited_rep: 0, clinic: 1, unknown: 2, attorney: 3 };
      listings.sort((a, b) => rank[a.type] - rank[b.type] || (b.rating ?? 0) - (a.rating ?? 0));
      if (listings.length) return { listings: listings.slice(0, 25), sample: false };
    } catch (err) {
      console.error("[help] SerpApi failed:", err instanceof Error ? err.message : err);
    }
  }
  return { listings: helpFallback(city), sample: true };
}
