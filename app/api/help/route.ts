import { NextResponse } from "next/server";
import { findHelp } from "@/lib/help";
import { clip } from "@/lib/mask";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const city = clip(searchParams.get("city"), 60) || "Houston, TX";
  const q = clip(searchParams.get("q"), 80).trim();
  const { listings, sample } = await findHelp(city, q);
  return NextResponse.json(sample ? { listings, sample } : { listings });
}
