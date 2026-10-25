import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { isLocale } from "./i18n/languages";
import { isSupabaseConfigured } from "./lib/supabase/config";
import { supabaseFor } from "./lib/supabase/server";

const intl = createMiddleware(routing);

// Pages anyone can open: the landing page and sign-in. Everything else needs a signed-in account.
const PUBLIC_PAGES = new Set(["", "login"]);

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");
  const [, first = "", ...rest] = pathname.split("/");

  // No locale yet: next-intl redirects to /<locale>/..., and that request is checked here.
  if (!isApi && !isLocale(first)) return intl(req);
  const res = isApi ? NextResponse.next() : intl(req);

  if (!isSupabaseConfigured()) {
    // Without Supabase keys the app runs open in development (see README), never in production.
    if (process.env.NODE_ENV !== "production") return res;
    return NextResponse.json({ error: "auth_not_configured" }, { status: 503 });
  }

  // Checks the session with Supabase and refreshes its cookies on `res` if needed.
  const {
    data: { user },
  } = await supabaseFor(req, res).auth.getUser();

  if (isApi) {
    if (user || pathname.startsWith("/api/auth/")) return res;
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const page = rest.join("/");
  if (user && page === "login") return redirectWithCookies(new URL(`/${first}/home`, req.url), res);
  if (user || PUBLIC_PAGES.has(page)) return res;

  const login = new URL(`/${first}/login`, req.url);
  login.searchParams.set("next", pathname + req.nextUrl.search);
  return redirectWithCookies(login, res);
}

/** A redirect that keeps any session cookies Supabase just refreshed. */
function redirectWithCookies(url: URL, from: NextResponse) {
  const out = NextResponse.redirect(url);
  from.cookies.getAll().forEach((c) => out.cookies.set(c));
  return out;
}

export const config = {
  // Everything, API routes included, except Next internals, PWA files and anything with a file extension.
  matcher: ["/((?!_next|_vercel|pwa-icon|manifest.webmanifest|.*\\..*).*)"],
};
