import { NextResponse } from "next/server";
import { extractReading, fetchTrusted, formattedPage, pageLanguages } from "@/lib/pages";
import { isOfficial, isTrusted } from "@/lib/links";

// Reading view of a trusted page, for sites that refuse to be framed (most .gov sites send
// X-Frame-Options). Government pages are arranged by AI into a clean page in their own
// language; other trusted pages use a plain extraction. Shown only to the person viewing it,
// never stored; cached in memory for 24 hours.

export const maxDuration = 60;

export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url") ?? "";
  if (!isTrusted(url)) return NextResponse.json({ error: "untrusted" }, { status: 400 });
  try {
    const page = await fetchTrusted(url);
    const view = isOfficial(page.url) ? await formattedPage(page) : { ...extractReading(page), ai: false, requiresSite: false, siteAction: "" };
    if (!view.blocks.length) throw new Error("no readable content");
    return NextResponse.json({
      url: page.url,
      lang: pageLanguages(page).lang,
      title: view.title,
      blocks: view.blocks,
      aiFormatted: view.ai,
      requiresSite: view.requiresSite,
      siteAction: view.siteAction,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "error" }, { status: 502 });
  }
}
