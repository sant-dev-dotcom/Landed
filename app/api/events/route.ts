import { NextResponse } from "next/server";
import { findEvents } from "@/lib/events";
import { asLocale, clip } from "@/lib/mask";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const city = clip(searchParams.get("city"), 60) || "Houston, TX";
  const locale = asLocale(searchParams.get("locale"));
  const { events, sample } = await findEvents(city, locale);
  return NextResponse.json(sample ? { events, sample } : { events });
}
