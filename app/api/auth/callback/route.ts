import { NextResponse, type NextRequest } from "next/server";
import { isLocale } from "@/i18n/languages";
import { supabaseFor } from "@/lib/supabase/server";

// The link in Supabase's confirmation email lands here. Swaps the one-time code for a
// session cookie, then continues into the app.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const next = req.nextUrl.searchParams.get("next") ?? "/";
  const safe = next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
  const res = NextResponse.redirect(new URL(safe, req.url));
  if (code) {
    const { error } = await supabaseFor(req, res).auth.exchangeCodeForSession(code);
    if (!error) return res;
  }
  const locale = safe.split("/")[1];
  return NextResponse.redirect(new URL(`/${isLocale(locale) ? locale : "en"}/login?error=link`, req.url));
}
