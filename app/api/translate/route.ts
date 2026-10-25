import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { localeForTag, matchLanguage } from "@/i18n/languages";
import { describeLanguage, flatten, translateMessages, type MessageTree } from "@/lib/translateUi";
import { createCache } from "@/lib/cache";
import { clip } from "@/lib/mask";

// Translates the app UI into a language the user typed in. The result goes back to the
// device (IndexedDB). Finished translations are cached for 30 days (in Valkey when configured),
// so the next person who picks the same language gets it in about a second.

export const maxDuration = 60;

const cache = createCache<unknown>("translate", { ttlSeconds: 30 * 24 * 60 * 60, memoryMax: 20 });

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { language?: string };
  const input = clip(body.language, 40).replace(/[\p{C}{}<>]/gu, "").trim();
  if (!input) return NextResponse.json({ error: "empty" }, { status: 400 });

  const known = matchLanguage(input);
  if (known) return NextResponse.json({ locale: known });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  // Keyed by the English text too: after en.json changes, languages are translated again
  // instead of serving a translation that is missing the new strings.
  const raw = await readFile(path.join(process.cwd(), "messages", "en.json"), "utf8");
  const key = `${createHash("sha256").update(raw).digest("hex").slice(0, 16)}:${input.toLowerCase()}`;
  const hit = await cache.get(key);
  if (hit !== undefined) return NextResponse.json(hit);

  try {
    const opts = { apiKey, retries: 2 };
    const language = await describeLanguage(input, opts);
    if (!language) return NextResponse.json({ error: "unknown_language" }, { status: 422 });
    const bundled = localeForTag(language.tag) ?? matchLanguage(language.name);
    if (bundled) return NextResponse.json({ locale: bundled });

    const en = JSON.parse(raw) as MessageTree;
    const name = language.name === language.nativeName ? language.name : `${language.name} (${language.nativeName})`;
    const { messages, untranslated, errors } = await translateMessages(en, name, opts);
    // Mostly English means the calls failed; don't hand that back as a translation.
    if (untranslated.length > Object.keys(flatten(en)).length / 4) {
      throw new Error(`${untranslated.length} strings untranslated. ${errors[0] ?? ""}`);
    }

    const result = { language, messages };
    await cache.set(key, result);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[translate] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "translate_failed" }, { status: 502 });
  }
}
