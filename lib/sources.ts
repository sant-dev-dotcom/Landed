import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { Locale } from "./types";

// Curated, team-written source summaries in /data/sources. Each file has
// frontmatter (title, title_es, url, topics) and an English body, then a
// `---es---` separator and the Spanish body.

export interface Source {
  id: string;
  title: string;
  titleEs: string;
  url: string;
  topics: string[];
  bodyEn: string;
  bodyEs: string;
}

let corpus: Source[] | null = null;

function load(): Source[] {
  if (corpus) return corpus;
  const dir = path.join(process.cwd(), "data", "sources");
  corpus = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((file) => {
      const raw = fs.readFileSync(path.join(dir, file), "utf8").replace(/\r\n/g, "\n");
      const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      if (!m) throw new Error(`Bad source file: ${file}`);
      const meta: Record<string, string> = {};
      for (const line of m[1].split("\n")) {
        const i = line.indexOf(":");
        if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
      }
      const [bodyEn, bodyEs = ""] = m[2].split("\n---es---\n");
      return {
        id: file.replace(/\.md$/, ""),
        title: meta.title,
        titleEs: meta.title_es || meta.title,
        url: meta.url,
        topics: (meta.topics || "").split(",").map((t) => t.trim()).filter(Boolean),
        bodyEn: bodyEn.trim(),
        bodyEs: bodyEs.trim(),
      };
    });
  return corpus;
}

const STOP = new Set(
  (
    "a an the is are was be to of in on for and or what how do does i my me you your it this that with can " +
    "should will if at as by from about who which why when where el la los las un una es son de del en y o que " +
    "como cual por para con mi mis yo se su sus lo le al hay qué cómo"
  ).split(" ")
);

const tokenize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9-]+/)
    .map((t) => t.replace(/^-+|-+$/g, ""))
    .filter((t) => t.length > 1 && !STOP.has(t));

export function retrieve(question: string, k = 4): Source[] {
  const q = tokenize(question);
  if (!q.length) return [];
  const scored = load().map((s) => {
    const topics = new Set(s.topics.flatMap(tokenize));
    const title = new Set(tokenize(`${s.title} ${s.titleEs}`));
    const body = tokenize(`${s.bodyEn} ${s.bodyEs}`);
    const bodySet = new Set(body);
    let score = 0;
    for (const t of q) {
      if (topics.has(t)) score += 3;
      if (title.has(t)) score += 2;
      if (bodySet.has(t)) score += 1;
    }
    // Multi-word topic phrases ("work permit", "green card") get a bonus.
    const qs = q.join(" ");
    for (const topic of s.topics) {
      const phrase = tokenize(topic).join(" ");
      if (phrase.includes(" ") && qs.includes(phrase)) score += 4;
    }
    return { s, score };
  });
  return scored
    .filter((x) => x.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((x) => x.s);
}

export function getSource(id: string) {
  return load().find((s) => s.id === id);
}

export const sourceTitle = (s: Source, locale: Locale) => (locale === "es" ? s.titleEs : s.title);
export const sourceBody = (s: Source, locale: Locale) => (locale === "es" && s.bodyEs ? s.bodyEs : s.bodyEn);
