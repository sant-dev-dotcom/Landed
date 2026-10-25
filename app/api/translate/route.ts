import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { localeForTag, matchLanguage } from "@/i18n/languages";
import { describeLanguage, flatten, translateMessages, type MessageTree } from "@/lib/translateUi";
import { clip } from "@/lib/mask";

// Translates the app UI into a language the user typed in. The result goes back to the
// device (IndexedDB) and is never stored here, apart from a small in-memory cache.

export const maxDuration = 60;

const cache = new Map<string, unknown>();

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { language?: string };
  const input = clip(body.language, 40).replace(/[\p{C}{}<>]/gu, "").trim();
  if (!input) return NextResponse.json({ error: "empty" }, { status: 400 });

  const known = matchLanguage(input);
  if (known) return NextResponse.json({ locale: known });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const key = input.toLowerCase();
  if (cache.has(key)) return NextResponse.json(cache.get(key));

  try {
    const opts = { apiKey, retries: 2 };
    const language = await describeLanguage(input, opts);
    if (!language) return NextResponse.json({ error: "unknown_language" }, { status: 422 });
    const bundled = localeForTag(language.tag) ?? matchLanguage(language.name);
    if (bundled) return NextResponse.json({ locale: bundled });

    const en = JSON.parse(await readFile(path.join(process.cwd(), "messages", "en.json"), "utf8")) as MessageTree;
    const name = language.name === language.nativeName ? language.name : `${language.name} (${language.nativeName})`;
    const { messages, untranslated, errors } = await translateMessages(en, name, opts);
    // Mostly English means the calls failed; don't hand that back as a translation.
    if (untranslated.length > Object.keys(flatten(en)).length / 4) {
      throw new Error(`${untranslated.length} strings untranslated. ${errors[0] ?? ""}`);
    }

    const result = { language, messages };
    if (cache.size >= 20) cache.delete(cache.keys().next().value!);
    cache.set(key, result);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[translate] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "translate_failed" }, { status: 502 });
  }
}
