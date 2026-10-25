import { NextResponse } from "next/server";
import { fetchTrusted, formattedPage, pageLanguages } from "@/lib/pages";
import { FLASH_LITE_MODELS, isGeminiConfigured, languageName } from "@/lib/llm";
import { isTrusted } from "@/lib/links";
import { asLocale } from "@/lib/mask";

// AI translation of a trusted page (government or an allowlisted nonprofit) into a chosen
// language, as a clean reading view. Only used when the site has no version of its own in
// that language. The page's text is arranged and translated by the AI in one pass, alongside
// the arranged original for the "Original" side of the switch. Shown only to the person
// viewing it, never stored or re-published; cached in memory for 24 hours per URL + language.

export const maxDuration = 60;

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const url = params.get("url") ?? "";
  // Either one of the app's languages ("lang"), or any language the person typed ("name",
  // e.g. "Tigrinya"): plain letters only, since it goes into the AI's instructions.
  const typed = (params.get("name") ?? "").replace(/[^\p{L}\p{M} ()'-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 40);
  const locale = asLocale(params.get("lang"));
  if (!isTrusted(url)) return NextResponse.json({ error: "untrusted" }, { status: 400 });
  if (!typed && locale === "en" && params.get("lang") !== "en") return NextResponse.json({ error: "bad_language" }, { status: 400 });
  if (!isGeminiConfigured(FLASH_LITE_MODELS)) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  try {
    const page = await fetchTrusted(url);
    const [original, translated] = await Promise.all([formattedPage(page), formattedPage(page, typed || languageName(locale, req))]);
    return NextResponse.json({
      url: page.url,
      sourceLang: pageLanguages(page).lang,
      original: { title: original.title, blocks: original.blocks, aiFormatted: original.ai, requiresSite: original.requiresSite, siteAction: original.siteAction, siteNotice: original.siteNotice },
      translated: { title: translated.title, blocks: translated.blocks, requiresSite: translated.requiresSite, siteAction: translated.siteAction, siteNotice: translated.siteNotice },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[translate-page] failed:", detail.slice(0, 300));
    return NextResponse.json(
      { error: "translate_failed", ...(process.env.NODE_ENV !== "production" ? { detail } : {}) },
      { status: 502 }
    );
  }
}
