import "server-only";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { createCache } from "./cache";
import { isTrusted } from "./links";
import { generateJSON } from "./llm";

// Server-side reading of trusted pages for the in-app browser: whether a page may be
// framed, which official translations it links to, and a clean reading view of its main
// content. Only allowlisted URLs are ever fetched, with no cookies and nothing about the
// user. Results are cached in memory for 24 hours and never stored or re-published.

const DAY = 24 * 60 * 60 * 1000;
// A plain browser user agent: some agencies (e.g. ssa.gov) refuse requests that look like bots.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const MAX_BYTES = 3_000_000;

interface Fetched {
  url: string; // after redirects
  html: string;
  headers: Record<string, string>;
}

const pageCache = new Map<string, { at: number; page: Fetched }>();

function remember<V>(map: Map<string, { at: number } & V>, key: string, value: { at: number } & V) {
  if (map.size >= 100) map.delete(map.keys().next().value!);
  map.set(key, value);
}

export async function fetchTrusted(url: string): Promise<Fetched> {
  if (!isTrusted(url)) throw new Error("untrusted");
  const hit = pageCache.get(url);
  if (hit && Date.now() - hit.at < DAY) return hit.page;
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  // A redirect must not leave the allowlist.
  if (!isTrusted(res.url)) throw new Error("redirected off the allowlist");
  const type = res.headers.get("content-type") ?? "";
  const html = type.includes("html") ? (await res.text()).slice(0, MAX_BYTES) : "";
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => (headers[k] = v));
  const page = { url: res.url, html, headers };
  remember(pageCache, url, { at: Date.now(), page });
  return page;
}

/** True when the page's headers let another site show it in a frame. */
export function allowsFraming(headers: Record<string, string>) {
  if (headers["x-frame-options"]) return false; // DENY, SAMEORIGIN and ALLOW-FROM all exclude us
  const ancestors = (headers["content-security-policy"] ?? "").match(/frame-ancestors([^;]*)/i)?.[1]?.trim();
  return !ancestors || ancestors.split(/\s+/).includes("*");
}

/** Normalize an hreflang/lang value to the app's locale codes ("zh-Hans" → "zh", "es-US" → "es"). */
export function normLang(tag: string) {
  const t = tag.toLowerCase();
  if (t.startsWith("zh")) return /hant|tw|hk/.test(t) ? "zh-hant" : "zh";
  if (t === "prs") return "fa";
  return t.split(/[-_]/)[0];
}

/** The page's own language and the official translations it links to (trusted URLs only). */
export function pageLanguages(page: Fetched) {
  const { document } = parseHTML(page.html);
  const lang = normLang(document.documentElement?.getAttribute("lang") || "en");
  const alternates: Record<string, string> = {};
  for (const el of document.querySelectorAll('link[rel="alternate"][hreflang]')) {
    const code = normLang(el.getAttribute("hreflang") || "");
    const href = el.getAttribute("href");
    if (!href || code === "x-default") continue;
    try {
      const abs = new URL(href, page.url).href;
      if (isTrusted(abs) && !alternates[code]) alternates[code] = abs;
    } catch {
      // skip malformed hrefs
    }
  }
  return { lang, alternates };
}

// ---- Reading view ----

export type Part = string | { text: string; href: string };
export interface Block {
  kind: "h" | "p" | "li";
  level?: number; // headings: 2–4
  ordered?: boolean; // list items
  parts: Part[];
}

const BLOCK_LIMIT = 160;
const CHAR_LIMIT = 24_000;

type El = Element & { tagName: string };

function inline(node: Node, base: string, out: Part[]) {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 3) {
      out.push(child.textContent ?? "");
    } else if (child.nodeType === 1) {
      const el = child as El;
      const tag = el.tagName.toLowerCase();
      if (tag === "a" && el.getAttribute("href")) {
        const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
        let href = "";
        try {
          href = new URL(el.getAttribute("href")!, base).href;
        } catch {
          // keep as text
        }
        if (text) out.push(/^https:/.test(href) ? { text, href } : text);
      } else if (tag === "br") {
        out.push(" ");
      } else if (!["script", "style", "img", "svg", "button", "form"].includes(tag)) {
        inline(el, base, out);
      }
    }
  }
}

function clean(parts: Part[]): Part[] {
  const merged: Part[] = [];
  for (const p of parts) {
    const last = merged[merged.length - 1];
    if (typeof p === "string" && typeof last === "string") merged[merged.length - 1] = last + p;
    else merged.push(p);
  }
  return merged
    .map((p) => (typeof p === "string" ? p.replace(/\s+/g, " ") : p))
    .filter((p, i, a) => (typeof p === "string" ? p.trim() || (i > 0 && i < a.length - 1) : true));
}

const textOf = (parts: Part[]) => parts.map((p) => (typeof p === "string" ? p : p.text)).join("");

/** Main content of a page as headings, paragraphs and list items, with links kept. */
export function extractReading(page: Fetched) {
  const { document } = parseHTML(page.html);
  const article = new Readability(document as unknown as Document).parse();
  if (!article?.content) throw new Error("no readable content");
  const { document: doc } = parseHTML(`<!doctype html><html><body>${article.content}</body></html>`);
  const blocks: Block[] = [];
  let chars = 0;
  const walk = (node: Element) => {
    for (const el of Array.from(node.children) as El[]) {
      if (blocks.length >= BLOCK_LIMIT || chars >= CHAR_LIMIT) return;
      const tag = el.tagName.toLowerCase();
      let block: Block | null = null;
      if (/^h[1-6]$/.test(tag)) block = { kind: "h", level: Math.min(4, Math.max(2, Number(tag[1]))), parts: [] };
      else if (tag === "p" || tag === "dd" || tag === "dt" || tag === "blockquote") block = { kind: "p", parts: [] };
      else if (tag === "li") block = { kind: "li", ordered: el.parentElement?.tagName.toLowerCase() === "ol", parts: [] };
      if (block) {
        const parts: Part[] = [];
        // List items can hold nested lists; read only the item's own text here.
        if (tag === "li") {
          for (const c of Array.from(el.childNodes)) {
            if (c.nodeType === 1 && ["ul", "ol"].includes((c as El).tagName.toLowerCase())) continue;
            const wrap = doc.createElement("span");
            wrap.appendChild(c.cloneNode(true));
            inline(wrap, page.url, parts);
          }
        } else {
          inline(el, page.url, parts);
        }
        block.parts = clean(parts);
        const text = textOf(block.parts).trim();
        if (text) {
          blocks.push(block);
          chars += text.length;
        }
        if (tag === "li") for (const sub of Array.from(el.children) as El[]) if (/^(ul|ol)$/i.test(sub.tagName)) walk(sub);
      } else {
        walk(el);
      }
    }
  };
  walk(doc.body);
  return { title: article.title || "", blocks };
}

// ---- AI-formatted page (government pages that can't be framed) ----

const TEXT_LIMIT = 30_000;
const AI_CHUNK = 12_000;

/** The page's visible text, one block per line, with links as [[n|text]] markers. */
export function pageText(page: Fetched) {
  const { document } = parseHTML(page.html);
  const title = (document.querySelector("title")?.textContent ?? "").replace(/\s+/g, " ").trim();
  const description =
    document.querySelector('meta[name="description"]')?.getAttribute("content") ??
    document.querySelector('meta[property="og:description"]')?.getAttribute("content") ??
    "";
  for (const el of document.querySelectorAll(
    'script,style,noscript,svg,iframe,template,nav,footer,[role="navigation"],[aria-hidden="true"],.usa-banner,.usa-skipnav,.usa-footer,.usa-identifier'
  ))
    el.remove();

  const links: string[] = [];
  const lines: string[] = [];
  let line = "";
  const BLOCK = /^(p|div|section|article|main|aside|header|h[1-6]|li|ul|ol|table|tr|td|th|dl|dt|dd|form|fieldset|label|blockquote|br|hr)$/;
  const end = () => {
    const l = line.replace(/\s+/g, " ").trim();
    if (l && l !== lines[lines.length - 1]) lines.push(l);
    line = "";
  };
  const walk = (node: Node) => {
    for (const c of Array.from(node.childNodes)) {
      if (c.nodeType === 3) {
        line += c.textContent ?? "";
        continue;
      }
      if (c.nodeType !== 1) continue;
      const el = c as El;
      const tag = el.tagName.toLowerCase();
      if (tag === "a" && el.getAttribute("href")) {
        const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
        let href = "";
        try {
          href = new URL(el.getAttribute("href")!, page.url).href;
        } catch {
          // keep as text
        }
        if (text && /^https:/.test(href)) {
          links.push(href);
          line += ` [[${links.length}|${text}]] `;
        } else line += ` ${text} `;
        continue;
      }
      if (tag === "input" || tag === "select" || tag === "textarea") {
        const name = el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.getAttribute("name");
        if (name && el.getAttribute("type") !== "hidden") line += ` (field: ${name}) `;
        continue;
      }
      const block = BLOCK.test(tag);
      if (block) end();
      if (/^h[1-6]$/.test(tag)) line += "#".repeat(Number(tag[1])) + " ";
      if (tag === "li") line += "- ";
      walk(el);
      if (block) end();
    }
  };
  if (document.body) walk(document.body);
  end();
  return { title, description, text: lines.join("\n").slice(0, TEXT_LIMIT), links };
}

/** [[n|text]] markers → link parts, using the page's own link table. Unknown n stay as text. */
function decodeMarkers(text: string, links: string[]): Part[] {
  const parts: Part[] = [];
  let last = 0;
  for (const m of text.matchAll(/\[\[(\d+)\|([^\]]*)\]\]/g)) {
    parts.push(text.slice(last, m.index));
    const href = links[Number(m[1]) - 1];
    parts.push(href ? { text: m[2], href } : m[2]);
    last = m.index! + m[0].length;
  }
  parts.push(text.slice(last));
  return clean(parts);
}

const formatPrompt = (translateTo?: string) => `You turn the text of a web page from a US government agency or a trusted nonprofit into a clean, easy-to-read page inside an app for immigrants.
${translateTo ? `Then translate everything into ${translateTo}, using plain, simple words.` : "Keep the page's own language. Do not translate."}
Keep the meaning and wording faithful. Never add facts, advice, or anything that is not in the text.
Remove: site menus and navigation, "skip to main content", the "official website of the United States government" banner, cookie or survey notices, social media links, breadcrumbs, footer links, "last reviewed/updated" lines.
Keep: all real content, alerts about this topic, instructions, eligibility, fees, dates and numbers, and form names exactly as written (I-94, I-765, W-7…).
Organize it into short sections with headings, short paragraphs and lists.
If the page is an interactive online tool or form, explain in 2-4 sentences what it is for and what it asks for (only from the text), and keep the link to use it.
Links are written as [[n|link text]]. Keep the links you keep with exactly the same n${translateTo ? " (translate only the link text)" : ""}. Never invent new n.
Also decide "requiresSite": true when the page's main task can only be finished on the website itself (or an online system it links to): using an online tool or search, applying or filing online, changing or updating information online, signing in to an account, paying, or booking an appointment. This includes pages that explain how to do such a task online. Pages that only give information are false.
If requiresSite is true, "siteAction" is one short, concrete sentence${translateTo ? ` in ${translateTo}` : " in the page's language"} saying what the person has to do on the website, naming the site (for example "Look up and print your I-94 record on the CBP website." or "Change your address online on the USCIS website."). Otherwise "".
Return JSON: { "title": string, "requiresSite": boolean, "siteAction": string, "blocks": [{ "kind": "h" | "p" | "li", "level"?: 2 | 3, "ordered"?: boolean, "text": string }] }`;

type AiBlock = { kind?: string; level?: number; ordered?: boolean; text?: string };

export interface FormattedPage {
  title: string;
  blocks: Block[];
  /** Arranged by AI (false: the plain extraction fallback). */
  ai: boolean;
  /** Using this page means going to the website (online tool, application, payment, account…). */
  requiresSite: boolean;
  /** What the person has to do there, in the output language. */
  siteAction: string;
}

async function formatWithAI(source: ReturnType<typeof pageText>, pageUrl: string, translateTo?: string) {
  // JavaScript-only tools have no text in their HTML: use the title and the site's description.
  const isTool = source.text.length < 200;
  const body = isTool
    ? `${source.title}\n${source.description}\n(This page is an interactive online tool on ${new URL(pageUrl).hostname}; it only works on that website.)\n[[1|Open the tool]]`
    : source.text;
  const links = isTool ? [pageUrl] : source.links;
  const chunks: string[] = [];
  for (let i = 0; i < body.length; i += AI_CHUNK) chunks.push(body.slice(i, i + AI_CHUNK));
  const outs = await Promise.all(
    chunks.map((c, i) =>
      generateJSON<{ title?: string; requiresSite?: boolean; siteAction?: string; blocks?: AiBlock[] }>({
        system: formatPrompt(translateTo),
        user: `${chunks.length > 1 ? `Part ${i + 1} of ${chunks.length} of the page.\n` : ""}Page title: ${source.title}\n\n${c}`,
        temperature: 0.1,
      })
    )
  );
  const blocks: Block[] = outs
    .flatMap((o) => o.blocks ?? [])
    .filter((b): b is AiBlock & { text: string } => typeof b.text === "string" && Boolean(b.text.trim()))
    .map((b) => ({
      kind: b.kind === "h" || b.kind === "li" ? b.kind : "p",
      level: b.kind === "h" ? Math.min(3, Math.max(2, Number(b.level) || 2)) : undefined,
      ordered: b.kind === "li" ? Boolean(b.ordered) : undefined,
      parts: decodeMarkers(b.text.replace(/^#+\s*/, ""), links),
    }));
  if (!blocks.length) throw new Error("AI returned no content");
  // A tool whose content only loads in the browser always needs the website.
  const requiresSite = isTool || outs.some((o) => o.requiresSite === true);
  const siteAction = requiresSite ? String(outs.find((o) => typeof o.siteAction === "string" && o.siteAction.trim())?.siteAction ?? "").slice(0, 300) : "";
  return { title: String(outs[0].title || source.title), blocks, requiresSite, siteAction };
}

// AI-formatted pages, shared through Valkey when configured: each one costs a Gemini call.
const formatted = createCache<FormattedPage>("page", { ttlSeconds: DAY / 1000, memoryMax: 100 });

/**
 * Reading view for a government page that can't be framed: its text, arranged by AI into a
 * clean page (in the page's language, or translated when `translateTo` is set). Falls back to
 * the plain Readability extraction if the AI is unavailable. Cached 24 hours per URL + language.
 */
export async function formattedPage(page: Fetched, translateTo?: string): Promise<FormattedPage> {
  const key = `${page.url}|${translateTo ?? ""}`;
  const hit = await formatted.get(key);
  if (hit) return hit;
  let data: FormattedPage;
  try {
    data = { ...(await formatWithAI(pageText(page), page.url, translateTo)), ai: true };
  } catch (err) {
    if (translateTo) throw err;
    console.error("[pages] AI formatting failed, using plain extraction:", err instanceof Error ? err.message.slice(0, 200) : err);
    // Not cached: the plain view is cheap, and a short AI outage shouldn't stick for a day.
    return { ...extractReading(page), ai: false, requiresSite: false, siteAction: "" };
  }
  await formatted.set(key, data);
  return data;
}
