// Verify every trusted link: checklist links, "How to Do It" step links (every language
// version) and the curated source corpus. Fails on any URL that is broken or not on the
// allowlist in lib/links.ts.
// Run with: npm run check-links             (check only)
//           npm run check-links -- --write  (also set lastVerified on links that pass)
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { allUrls, isTrusted, type TrustedLink } from "../lib/links.ts";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const write = process.argv.includes("--write");
const today = new Date().toISOString().slice(0, 10);

interface Step {
  link?: TrustedLink;
}
interface Item {
  id: string;
  links: TrustedLink[];
  howTo: Step[];
}
const checklist = JSON.parse(readFileSync("data/checklist.json", "utf8")) as { sections: string[]; items: Item[] };

// Every link object, with where it lives (for the report).
const links: { where: string; link: TrustedLink }[] = [];
for (const item of checklist.items) {
  item.links.forEach((link, i) => links.push({ where: `${item.id} link ${i + 1}`, link }));
  item.howTo.forEach((s, i) => s.link && links.push({ where: `${item.id} step ${i + 1}`, link: s.link }));
}
const sourceUrls = readdirSync("data/sources")
  .filter((f) => f.endsWith(".md"))
  .map((f) => ({ where: `source ${f}`, url: readFileSync(`data/sources/${f}`, "utf8").match(/^url:\s*(\S+)/m)?.[1] ?? "" }));

async function check(url: string): Promise<string | null> {
  if (!isTrusted(url)) return "not on the trusted allowlist";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        redirect: "follow",
        headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
        signal: AbortSignal.timeout(30_000),
      });
      await res.body?.cancel();
      if (/page-not-found|pagina-no-disponible|cfg-page-not-found/.test(res.url)) return `redirects to a "not found" page (${res.url})`;
      if (res.ok) return null;
      if (attempt === 1 || res.status < 500) return `HTTP ${res.status}`;
    } catch (err) {
      if (attempt === 1) return err instanceof Error ? ((err.cause as { code?: string })?.code ?? err.message) : String(err);
    }
  }
  return "unreachable";
}

const unique = [...new Set([...links.flatMap((l) => allUrls(l.link.url)), ...sourceUrls.map((s) => s.url)])];
const results = new Map<string, string | null>();
// A few at a time: government sites rate-limit bursts.
for (let i = 0; i < unique.length; i += 6) {
  await Promise.all(unique.slice(i, i + 6).map(async (u) => results.set(u, await check(u))));
}

let broken = 0;
for (const { where, link } of links) {
  const bad = allUrls(link.url).filter((u) => results.get(u));
  for (const u of bad) {
    broken++;
    console.log(`FAIL  ${where}: ${u}  (${results.get(u)})`);
  }
  if (!bad.length && write) link.lastVerified = today;
}
for (const { where, url } of sourceUrls) {
  if (results.get(url)) {
    broken++;
    console.log(`FAIL  ${where}: ${url}  (${results.get(url)})`);
  }
}

if (write) writeFileSync("data/checklist.json", JSON.stringify(checklist, null, 2) + "\n", "utf8");
console.log(`\n${unique.length - [...results.values()].filter(Boolean).length}/${unique.length} URLs OK${write ? `, lastVerified set to ${today} on passing links` : ""}`);
process.exit(broken ? 1 : 0);
