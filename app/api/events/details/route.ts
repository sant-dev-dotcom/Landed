import { NextResponse } from "next/server";
import { fetchPage, isPublicHttps, readDetails } from "@/lib/eventPage";
import { FLASH_LITE_MODELS, generateJSON, isGeminiConfigured, languageName } from "@/lib/llm";
import { asLocale, clip } from "@/lib/mask";
import type { EventDetails } from "@/lib/types";

// What an event's own page says: its description, ticket prices and whether it's free
// (lib/eventPage.ts). Results are cached in memory for 24 hours. Optionally rewritten in plain
// words in the user's language, using only the page's own facts.

export const maxDuration = 30;

const DAY = 24 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; data: EventDetails }>();

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
  if (details.description && details.description.length > 60 && isGeminiConfigured(FLASH_LITE_MODELS)) {
    try {
      const out = await generateJSON<{ summary?: string }>({
        system: `Rewrite an event description for a newcomer to the US in ${language}.
Write 2-4 short, plain sentences: what happens, who it's for, and anything to bring or know.
Use ONLY facts from the text. Never add details, prices, times or places that aren't in it. Keep names, dates, times and prices exactly.
Return JSON: { "summary": string }`,
        user: `Event: ${title}\n\n${details.description}`,
        temperature: 0.2,
        onlyGemini: FLASH_LITE_MODELS,
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
