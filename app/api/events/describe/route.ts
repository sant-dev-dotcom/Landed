import { NextResponse } from "next/server";
import { createCache } from "@/lib/cache";
import { languageName } from "@/lib/llm";
import { asLocale, clip } from "@/lib/mask";
import { isMuseConfigured, museText } from "@/lib/muse";

// A general description for an event whose listing and page have none: what an event with this
// name usually is, from the name and venue only, written by Meta's Muse Spark. It never states
// dates, times, prices or rules, and the screen labels it as general and AI-written. Cached for a
// week per name + venue + language.

const cache = createCache<string>("describe", { ttlSeconds: 7 * 24 * 60 * 60, memoryMax: 200 });

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const title = clip(params.get("title"), 160).replace(/[\p{C}]/gu, " ").trim();
  const venue = clip(params.get("venue"), 120).replace(/[\p{C}]/gu, " ").trim();
  if (!title) return NextResponse.json({ error: "no_title" }, { status: 400 });
  if (!isMuseConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const language = languageName(asLocale(params.get("lang")), req);
  // "muse:" so descriptions cached from the earlier Gemini version aren't reused.
  const key = `muse:${title}|${venue}|${language}`.toLowerCase();
  const hit = await cache.get(key);
  if (hit) return NextResponse.json({ description: hit });

  try {
    const text = await museText(
      `You write a short, general description of a kind of event for someone who recently moved to the US, in ${language}.
You only know the event's name and where it is. Say what an event like this usually involves and who it is usually for.
Write 2 short, plain sentences. Use words like "usually" or "often", because you don't know the details of this one.
Never state a date, time, price, cost, age limit, registration rule, language, or any other specific fact that is not in the name.
Reply with only the 2 sentences: no title, quotes or other text.`,
      `Event name: ${title}${venue ? `\nPlace: ${venue}` : ""}`
    );
    const description = clip(text.replace(/^["“]|["”]$/g, "").replace(/\s+/g, " ").trim(), 400);
    if (!description) throw new Error("empty");
    await cache.set(key, description);
    return NextResponse.json({ description });
  } catch (err) {
    console.error("[events/describe] failed:", err instanceof Error ? err.message.slice(0, 200) : err);
    return NextResponse.json({ error: "failed" }, { status: 502 });
  }
}
