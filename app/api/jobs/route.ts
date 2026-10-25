import { NextResponse } from "next/server";
import { isSerpConfigured, serpLocation, serpSearch } from "@/lib/serp";
import { jobsFallback } from "@/lib/fallbacks";
import { clip } from "@/lib/mask";
import type { JobListing } from "@/lib/types";

interface SerpJob {
  title?: string;
  company_name?: string;
  location?: string;
  via?: string;
  share_link?: string;
  apply_options?: { title?: string; link?: string }[];
  detected_extensions?: { posted_at?: string };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const city = clip(searchParams.get("city"), 60) || "Houston, TX";
  const q = clip(searchParams.get("q"), 80).trim() || "entry level";

  if (isSerpConfigured()) {
    try {
      const data = await serpSearch<{ jobs_results?: SerpJob[] }>({
        engine: "google_jobs",
        q,
        location: serpLocation(city),
        hl: "en",
        gl: "us",
      });
      const jobs: JobListing[] = (data.jobs_results || [])
        .filter((j) => j.title)
        .slice(0, 20)
        .map((j) => ({
          title: j.title!,
          company: j.company_name,
          location: j.location,
          link: j.apply_options?.[0]?.link || j.share_link,
          postedAt: j.detected_extensions?.posted_at,
          via: j.via?.replace(/^via\s+/i, ""),
        }));
      if (jobs.length) return NextResponse.json({ jobs });
    } catch (err) {
      console.error("[jobs] SerpApi failed:", err instanceof Error ? err.message : err);
    }
  }
  return NextResponse.json({ jobs: jobsFallback(searchParams.get("q") || "", city), sample: true });
}
