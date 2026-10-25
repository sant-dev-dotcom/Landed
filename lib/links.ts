// Trusted-link allowlist. Every link Landed shows as a source (checklist, "How to Do It"
// steps, assistant answers) must pass isTrusted(). Government sites (.gov) are "official";
// a short list of reviewed nonprofits are "nonprofit". No imports: shared by the app,
// the API routes and scripts/check-links.ts.

export type SourceType = "official" | "nonprofit";

/** A URL, or one URL per language when the site has its own translations. */
export type LocalizedUrl = string | { en: string; [lang: string]: string };

export interface TrustedLink {
  url: LocalizedUrl;
  /** ISO date (YYYY-MM-DD) the URL last passed `npm run check-links`. */
  lastVerified?: string;
}

/** Reviewed nonprofits. Subdomains count (www., espanol., …). */
export const NONPROFIT_DOMAINS = [
  "usahello.org",
  "immigrationlawhelp.org",
  "ilrc.org",
  "texaslawhelp.org",
  "floridalawhelp.org",
  "azlawhelp.org",
  "lawhelpny.org",
  // The FCC's Lifeline phone-discount program, run for the FCC by USAC (not a .gov address).
  "lifelinesupport.org",
  "lawhelp.org",
  "nilc.org",
];

function host(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? u.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

const under = (h: string, domain: string) => h === domain || h.endsWith("." + domain);

/** "official" for any .gov site, "nonprofit" for the reviewed list, null for everything else. */
export function sourceType(url: string): SourceType | null {
  const h = host(url);
  if (!h) return null;
  if (h.endsWith(".gov")) return "official";
  if (NONPROFIT_DOMAINS.some((d) => under(h, d))) return "nonprofit";
  return null;
}

export const isTrusted = (url: string) => sourceType(url) !== null;
export const isOfficial = (url: string) => sourceType(url) === "official";

/** "www.uscis.gov" → "uscis.gov" for display. */
export function domainOf(url: string) {
  return (host(url) ?? url).replace(/^www\./, "");
}

/** The English URL of a link. */
export const baseUrl = (url: LocalizedUrl) => (typeof url === "string" ? url : url.en);

/** The site's own version in this language, if one is stored. */
export function localizedVersion(url: LocalizedUrl, locale: string): string | undefined {
  if (typeof url === "string" || locale === "en") return undefined;
  return url[locale];
}

/** Every URL a link can resolve to (for the link checker). */
export const allUrls = (url: LocalizedUrl) => (typeof url === "string" ? [url] : Object.values(url));
