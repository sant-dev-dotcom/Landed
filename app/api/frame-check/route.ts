import { NextResponse } from "next/server";
import { allowsFraming, fetchTrusted } from "@/lib/pages";
import { isTrusted } from "@/lib/links";

// Can this page be shown in the in-app browser's iframe? Checks X-Frame-Options and
// CSP frame-ancestors. Only allowlisted URLs are checked; anything else opens outside.
export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url") ?? "";
  if (!isTrusted(url)) return NextResponse.json({ embeddable: false, reason: "untrusted" });
  try {
    const page = await fetchTrusted(url);
    return NextResponse.json({ embeddable: allowsFraming(page.headers), url: page.url });
  } catch (err) {
    return NextResponse.json({ embeddable: false, reason: err instanceof Error ? err.message : "error" });
  }
}
