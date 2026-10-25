import "server-only";
import { CUSTOM_LOCALE, languageInfo, type Locale } from "@/i18n/languages";
import { museText } from "./muse";

// Muse Spark handles chat and general AI tasks. Translation requests explicitly select
// Gemini with onlyGemini. Providers never substitute for one another.

export interface LLMRequest {
  system: string;
  user: string;
  image?: { mimeType: string; base64: string };
  temperature?: number;
  /** Use only these Gemini models, in order (no other model or provider). */
  onlyGemini?: string[];
}

type Provider = "muse" | "gemini";

// A provider whose key was rejected (401/403) is skipped until the server restarts.
const rejected = new Set<Provider>();

export function isLLMConfigured() {
  return Boolean(process.env.MUSE_API_KEY) && !rejected.has("muse");
}

export function isGeminiConfigured(models?: readonly string[]) {
  return Boolean(process.env.GEMINI_API_KEY) && !rejected.has("gemini") &&
    (models ?? geminiModels()).some((model) => (unavailable.get(model) ?? 0) <= Date.now());
}

export async function generateJSON<T>(req: LLMRequest): Promise<T> {
  const provider: Provider = req.onlyGemini ? "gemini" : "muse";
  if (req.onlyGemini ? !isGeminiConfigured(req.onlyGemini) : !isLLMConfigured()) {
    throw new Error(req.onlyGemini ? "Gemini is not configured" : "Muse Spark is not configured");
  }
  try {
    const raw = provider === "gemini" ? await callGemini(req) : await museText(req.system, req.user, {
      image: req.image ? `data:${req.image.mimeType};base64,${req.image.base64}` : undefined,
      timeoutMs: 45_000,
    });
    return parseJSON<T>(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/HTTP (401|403)\b/.test(message)) rejected.add(provider);
    console.error(`[llm] ${provider} failed:`, message);
    throw err;
  }
}

function parseJSON<T>(raw: string): T {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "");
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.search(/[[{]/);
    const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1)) as T;
    throw new Error("Model did not return JSON");
  }
}

// Gemini models to try, in order. Free-tier keys get a separate daily quota per model
// (500/day for the Flash-Lite models, only 20/day for gemini-3.5-flash), so when one runs out
// the next is used instead of failing. gemini-2.5-flash is closed to new keys.
// GEMINI_MODEL can be one model or a comma-separated list.
const DEFAULT_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.5-flash"];
/** Only the Flash-Lite models (the second takes over when the first's daily quota runs out). */
export const FLASH_LITE_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];

/** Models whose daily quota is used up (or that don't exist for this key), until when. */
const unavailable = new Map<string, number>();

function geminiModels() {
  const list = (process.env.GEMINI_MODEL ?? "").split(",").map((m) => m.trim()).filter(Boolean);
  const now = Date.now();
  return (list.length ? list : DEFAULT_MODELS).filter((m) => (unavailable.get(m) ?? 0) <= now);
}

/** Seconds from Google's "retryDelay": "16278s", else an hour. */
function retryAfter(detail: string) {
  const s = Number(detail.match(/"retryDelay":\s*"(\d+)s"/)?.[1]);
  return (Number.isFinite(s) && s > 0 ? s : 3600) * 1000;
}

async function callGemini(req: LLMRequest): Promise<string> {
  const parts: unknown[] = [{ text: req.user }];
  if (req.image) parts.push({ inline_data: { mime_type: req.image.mimeType, data: req.image.base64 } });
  const now = Date.now();
  const models = req.onlyGemini ? req.onlyGemini.filter((m) => (unavailable.get(m) ?? 0) <= now) : geminiModels();
  if (!models.length) throw new Error(`Gemini: daily quota used up on ${req.onlyGemini ? req.onlyGemini.join(", ") : "every model"}`);

  let lastError = "";
  for (const model of models) {
    let res: Response;
    // Per-minute limits (429) usually clear in seconds: retry twice before moving on.
    for (let attempt = 0; ; attempt++) {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: req.system }] },
          contents: [{ role: "user", parts }],
          generationConfig: { responseMimeType: "application/json", temperature: req.temperature ?? 0.3 },
        }),
        signal: AbortSignal.timeout(45_000),
      });
      if (res.status !== 429 || attempt >= 2) break;
      const detail = await res.clone().text();
      if (/PerDay/i.test(detail)) break; // a daily cap won't clear in seconds
      await new Promise((r) => setTimeout(r, 2500 * (attempt + 1)));
    }
    if (res.ok) {
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("");
      if (text) return text;
      lastError = `${model}: no text`;
      continue;
    }
    const detail = await res.text();
    lastError = `${model} HTTP ${res.status}${/PerDay/i.test(detail) ? " (daily quota used up)" : ""}: ${detail.slice(0, 200)}`;
    // Out of quota for today, or not available to this key: skip it until it resets.
    if (res.status === 429 && /PerDay/i.test(detail)) unavailable.set(model, Date.now() + retryAfter(detail));
    else if (res.status === 404) unavailable.set(model, Date.now() + 24 * 3600 * 1000);
    else if (res.status !== 429 && res.status < 500) break; // a request problem: another model won't help
  }
  throw new Error(`Gemini ${lastError}`);
}

/** The language to answer in. A typed-in language arrives in the x-landed-language header (see lib/client.ts). */
export function languageName(locale: Locale, req: Request): string {
  if (locale === CUSTOM_LOCALE) {
    let name = "";
    try {
      name = decodeURIComponent(req.headers.get("x-landed-language") ?? "");
    } catch {
      // Malformed header: answer in English.
    }
    return name.replace(/[\p{C}{}<>"]/gu, "").trim().slice(0, 40) || "English";
  }
  const l = languageInfo(locale);
  if (!l) return "English";
  return l.english === l.native ? l.english : `${l.english} (${l.native})`;
}

export const COMMON_RULES = (language: string) =>
  `Respond in ${language}. Use plain language at a 6th-grade reading level. ` +
  `Return strict JSON only, matching the schema. Never provide legal advice.`;
