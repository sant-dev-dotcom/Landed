// Machine-translates the UI message catalog (messages/en.json) with Gemini.
// Shared by /api/translate (a language the user types in) and scripts/translate-messages.ts
// (the bundled languages). No "server-only" or "@/" imports so the script runs under plain Node,
// but never import this from client code: it needs the API key.
import { IntlMessageFormat } from "intl-messageformat";

export const TRANSLATE_MODEL = "gemini-3.5-flash-lite";

export type MessageTree = { [key: string]: string | MessageTree };

interface Options {
  apiKey: string;
  model?: string;
  /** Extra attempts after a 429/5xx. The API route keeps this low to stay inside its time limit. */
  retries?: number;
}

export interface LanguageDescription {
  name: string;
  nativeName: string;
  tag: string;
  rtl: boolean;
}

// Strings that must stay exactly as written in English.
const KEEP = new Set(["common.appName", "language.en", "language.es"]);
const keep = (path: string, value: string) => KEEP.has(path) || /^https?:\/\//.test(value);

// Strings per request. Fewer requests matter more than speed: free-tier keys have low per-minute limits.
const CHUNK = 60;

export function flatten(tree: MessageTree, prefix = "", out: Record<string, string> = {}) {
  for (const [k, v] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[path] = v;
    else flatten(v, path, out);
  }
  return out;
}

export function unflatten(flat: Record<string, string>): MessageTree {
  const root: MessageTree = {};
  for (const [path, value] of Object.entries(flat)) {
    const keys = path.split(".");
    let node = root;
    for (const k of keys.slice(0, -1)) node = (node[k] ??= {}) as MessageTree;
    node[keys[keys.length - 1]] = value;
  }
  return root;
}

/** Sorted ICU argument names, or null if the message doesn't parse. */
function argNames(message: string): string | null {
  try {
    const names = new Set<string>();
    type El = { type: number; value?: unknown; options?: Record<string, { value: El[] }>; children?: El[] };
    const walk = (els: El[]) => {
      for (const el of els) {
        // 1-6: argument, number, date, time, select, plural
        if (el.type >= 1 && el.type <= 6 && typeof el.value === "string") names.add(el.value);
        if (el.options) for (const o of Object.values(el.options)) walk(o.value);
        if (el.children) walk(el.children);
      }
    };
    walk(new IntlMessageFormat(message, "en").getAst() as El[]);
    return [...names].sort().join(",");
  } catch {
    return null;
  }
}

const valid = (source: string, out: unknown): out is string =>
  typeof out === "string" && out.trim() !== "" && argNames(out) !== null && argNames(out) === argNames(source);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// When a model's free daily quota runs out, the next one takes over (each has its own quota).
const FALLBACK_MODELS = ["gemini-3.1-flash-lite"];
const outOfQuota = new Set<string>();

async function gemini<T>(system: string, user: string, { apiKey, model = TRANSLATE_MODEL, retries = 1 }: Options): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const current = [model, ...FALLBACK_MODELS].find((m) => !outOfQuota.has(m));
    if (!current) throw new Error("Gemini: daily quota used up on every model");
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${current}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
      }),
      signal: AbortSignal.timeout(55_000),
    });
    if (res.status === 429 && /PerDay/i.test(await res.clone().text())) {
      outOfQuota.add(current);
      attempt--; // switching models isn't a retry
      continue;
    }
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      await sleep(1500 * 2 ** attempt);
      continue;
    }
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const text: string | undefined = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("");
    if (!text) throw new Error("Gemini returned no text");
    return JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "")) as T;
  }
}

/** Identify what the user typed ("tigrinya", "ትግርኛ", "Tigrinia"). Null if it isn't a language. */
export async function describeLanguage(input: string, opts: Options): Promise<LanguageDescription | null> {
  const out = await gemini<Partial<LanguageDescription> & { isLanguage?: boolean }>(
    `Identify the human language named in the user's text. It may be written in any language or script and may have typos.
Return JSON: { "isLanguage": boolean, "name": string (English name), "nativeName": string (the language's name written in that language), "tag": string (BCP 47 tag, e.g. "ti" or "zh-Hant"), "rtl": boolean (written right to left) }.
Set isLanguage to false if the text is not a human language.`,
    input,
    opts
  );
  if (!out?.isLanguage || typeof out.name !== "string" || !out.name.trim()) return null;
  let tag = typeof out.tag === "string" ? out.tag : "";
  try {
    tag = Intl.getCanonicalLocales(tag)[0] ?? "";
  } catch {
    tag = "";
  }
  return {
    name: out.name.trim().slice(0, 60),
    nativeName: (typeof out.nativeName === "string" && out.nativeName.trim() ? out.nativeName : out.name).trim().slice(0, 60),
    tag: tag || "en",
    rtl: out.rtl === true,
  };
}

const systemPrompt = (language: string) => `You translate the user interface of "Landed", a phone app that helps immigrants who are new to the United States understand their letters, track important dates, find free legal help, meet people and find jobs.
Translate every value into ${language}. Use plain, warm, everyday words that someone with little schooling understands. Keep app text short: buttons and titles stay short.
Rules:
- Return a JSON object with exactly the same keys. Each value is the translation of that key's value.
- Values use ICU MessageFormat. Keep every {placeholder} name unchanged. In "{count, plural, one {...} other {...}}" keep "count", "plural", the category words and "#" unchanged and translate only the text inside the branches. You may add the plural categories ${language} needs (zero, two, few, many). Every plural must keep "other".
- Never put an apostrophe (') directly before "{". Write apostrophes as ’.
- Keep unchanged: "Landed", URLs, agency and organization names (USCIS, FTC, DOJ, EOIR, FDIC, ImmigrationLawHelp.org, TexasLawHelp.org, State Bar of Texas, US Department of Labor), form names like I-94, and the word "notario".
- Translate country names and US terms (green card, work permit) into the words ${language} speakers normally use.`;

async function translateBatch(entries: [string, string][], language: string, opts: Options): Promise<Record<string, unknown>> {
  return gemini<Record<string, unknown>>(systemPrompt(language), JSON.stringify(Object.fromEntries(entries)), opts);
}

/**
 * Translate a message catalog. Strings that come back broken (missing keys, changed placeholders,
 * bad ICU syntax) are retried once, then left in English so the UI never breaks.
 */
export async function translateMessages(messages: MessageTree, language: string, opts: Options) {
  const flat = flatten(messages);
  const todo = Object.entries(flat).filter(([k, v]) => !keep(k, v));
  const result: Record<string, string> = { ...flat };
  const errors: string[] = [];

  const run = async (entries: [string, string][]) => {
    const chunks: [string, string][][] = [];
    for (let i = 0; i < entries.length; i += CHUNK) chunks.push(entries.slice(i, i + CHUNK));
    const outs = await Promise.all(
      chunks.map((c) =>
        translateBatch(c, language, opts).catch((err) => {
          errors.push(err instanceof Error ? err.message : String(err));
          return {};
        })
      )
    );
    const failed: [string, string][] = [];
    chunks.forEach((chunk, i) => {
      for (const [k, v] of chunk) {
        const out = (outs[i] as Record<string, unknown>)[k];
        if (valid(v, out)) result[k] = out;
        else failed.push([k, v]);
      }
    });
    return failed;
  };

  let failed = await run(todo);
  if (failed.length) failed = await run(failed);
  return { messages: unflatten(result), untranslated: failed.map(([k]) => k), errors };
}
