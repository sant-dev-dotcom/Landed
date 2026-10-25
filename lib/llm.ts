import "server-only";
import { CUSTOM_LOCALE, languageInfo, type Locale } from "@/i18n/languages";

// Provider-agnostic LLM client. Supports text + one optional image, JSON output.
// LLM_PROVIDER=muse uses Meta Muse Spark through an OpenAI-compatible endpoint and
// falls back to Gemini if that call fails and a Gemini key is set.

export interface LLMRequest {
  system: string;
  user: string;
  image?: { mimeType: string; base64: string };
  temperature?: number;
}

type Provider = "muse" | "gemini";

// A provider whose key was rejected (401/403) is skipped until the server restarts.
const rejected = new Set<Provider>();

function providers(): Provider[] {
  const preferred = (process.env.LLM_PROVIDER || "gemini").toLowerCase() as Provider;
  const available: Provider[] = [];
  if (process.env.MUSE_API_KEY && !rejected.has("muse")) available.push("muse");
  if (process.env.GEMINI_API_KEY && !rejected.has("gemini") && geminiModels().length) available.push("gemini");
  return available.sort((a, b) => (a === preferred ? -1 : b === preferred ? 1 : 0));
}

export function isLLMConfigured() {
  return providers().length > 0;
}

export async function generateJSON<T>(req: LLMRequest): Promise<T> {
  const order = providers();
  if (order.length === 0) throw new Error("No LLM provider configured");
  const errors: string[] = [];
  for (const p of order) {
    try {
      const raw = p === "muse" ? await callMuse(req) : await callGemini(req);
      return parseJSON<T>(raw);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/HTTP (401|403)\b/.test(message)) rejected.add(p);
      errors.push(`${p}: ${message.slice(0, 200)}`);
      console.error(`[llm] ${p} failed:`, message);
    }
  }
  throw new Error(errors.join(" | "));
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
  const models = geminiModels();
  if (!models.length) throw new Error("Gemini: every model's daily quota is used up");

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

async function callMuse(req: LLMRequest): Promise<string> {
  const base = (process.env.MUSE_API_BASE || "https://api.llama.com/compat/v1").replace(/\/$/, "");
  const model = process.env.MUSE_MODEL || "muse-spark";
  const userContent: unknown[] = [{ type: "text", text: req.user }];
  if (req.image) {
    userContent.push({ type: "image_url", image_url: { url: `data:${req.image.mimeType};base64,${req.image.base64}` } });
  }
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.MUSE_API_KEY}` },
    body: JSON.stringify({
      model,
      temperature: req.temperature ?? 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: userContent },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`Muse HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? data?.completion_message?.content?.text;
  if (!text) throw new Error("Muse returned no text");
  return typeof text === "string" ? text : JSON.stringify(text);
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
