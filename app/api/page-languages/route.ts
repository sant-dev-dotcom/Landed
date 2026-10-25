import { NextResponse } from "next/server";
import { fetchTrusted, pageLanguages } from "@/lib/pages";
import { isTrusted } from "@/lib/links";

// The page's own language and its official translations (<link rel="alternate" hreflang>),
// so the in-app browser can open the site's own version before trying AI translation.
export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url") ?? "";
  if (!isTrusted(url)) return NextResponse.json({ error: "untrusted" }, { status: 400 });
  try {
    const page = await fetchTrusted(url);
    return NextResponse.json(pageLanguages(page), { headers: { "cache-control": "private, max-age=86400" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "error" }, { status: 502 });
  }
}
