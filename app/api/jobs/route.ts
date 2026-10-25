import { NextResponse } from "next/server";
import { isSerpConfigured, serpLocation, serpSearch } from "@/lib/serp";
import { jobsFallback } from "@/lib/fallbacks";
import { clip } from "@/lib/mask";
import { isWorkStatus, type JobListing, type WorkStatus } from "@/lib/types";

interface SerpJob {
  title?: string;
  company_name?: string;
  location?: string;
  via?: string;
  share_link?: string;
  apply_options?: { title?: string; link?: string }[];
  detected_extensions?: { posted_at?: string };
  description?: string;
}

const anyOf = (...parts: RegExp[]) => new RegExp(parts.map((r) => r.source).join("|"), "i");

// Every US employer must check work authorization (Form I-9), so a listing that promises to
// skip it ("no papers needed", "cash only, no SSN") is a common sign of wage theft or a scam
// aimed at immigrants. These are left out, and the screen says how many.
const RED_FLAGS = anyOf(
  /\b(no|sin)\s+(papers?|papeles|documents?|documentos?|ssn|social security|seguro social|work permit|permiso de trabajo)\b/,
  /\bno (id|i-9)\s+(needed|required)\b/,
  /\b(cash only|paid in cash|solo (en )?efectivo|pago en efectivo)\b/,
  /\b(undocumented (ok|welcome)|no questions asked)\b/
);

// What a listing says about who it can hire. Most listings say nothing; those are kept.
const CITIZENS_ONLY = anyOf(
  /\bmust be an? (u\.?s\.?|united states) citizen\b(?! or)/,
  /\b(u\.?s\.?|united states) citizenship (is )?required\b/,
  /\b(u\.?s\.?|us) citizens only\b/,
  /\b(active |current )?(secret|top secret|ts\/sci|security) clearance\b/
);
const CITIZENS_OR_GREEN_CARD = anyOf(
  /\b(u\.?s\.?|us) citizens? (and|or) (green card holders?|(lawful )?permanent residents?) only\b/,
  /\b(green card|gc) holders? only\b/,
  /\bmust be an? (u\.?s\.?|us) citizen or (green card holder|(lawful )?permanent resident)\b/
);
const NO_SPONSORSHIP = anyOf(
  /\b(no|not|unable to|cannot|can't|will not|won't|does not|do not|doesn't|don't)\s+(provide |offer |support )?(visa |immigration |h-?1b )?sponsor(ship)?\b/,
  /\bwithout (the need for )?(current or future |future )?(visa |employer |immigration )?sponsorship\b/,
  /\bnot eligible for (visa |immigration )?sponsorship\b/,
  /\bsponsorship (is )?not (available|provided|offered)\b/
);
// Only for F-1 students on OPT/CPT: none of the choices on the Jobs tab.
const STUDENTS_ONLY = anyOf(/\b(opt|cpt|opt\/cpt|f-?1) (candidates |students )?only\b/);
const SPONSORS = anyOf(
  /\b(visa |h-?1b |immigration )?sponsorship (is )?(available|provided|offered|considered)\b/,
  /\bwith (visa |h-?1b )sponsorship\b/,
  /\b(will|can|may) sponsor\b/,
  /\bh-?1b (sponsorship|transfers?)\b/,
  /\bopen to (visa )?sponsorship\b/
);

/** Whether the listing says someone with this authorization can't be hired. */
function excludedFor(status: WorkStatus | null, text: string) {
  if (status && status !== "none" && status !== "citizen" && STUDENTS_ONLY.test(text)) return true;
  if (status === "greenCard") return CITIZENS_ONLY.test(text);
  if (status === "workPermit") return CITIZENS_ONLY.test(text) || CITIZENS_OR_GREEN_CARD.test(text);
  if (status === "visa") return CITIZENS_ONLY.test(text) || CITIZENS_OR_GREEN_CARD.test(text) || NO_SPONSORSHIP.test(text);
  return false;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const city = clip(searchParams.get("city"), 60) || "Houston, TX";
  const q = clip(searchParams.get("q"), 80).trim() || "entry level";
  // Only used to filter this search; never logged or stored.
  const rawStatus = searchParams.get("status");
  const status = isWorkStatus(rawStatus) ? rawStatus : null;

  if (isSerpConfigured()) {
    try {
      const data = await serpSearch<{ jobs_results?: SerpJob[] }>({
        engine: "google_jobs",
        // People on employer-sponsored visas need an employer who will file a petition for them.
        q: status === "visa" ? `${q} visa sponsorship` : q,
        location: serpLocation(city),
        hl: "en",
        gl: "us",
      });
      const listed = (data.jobs_results || []).filter((j) => j.title);
      const text = (j: SerpJob) => `${j.title} ${j.description ?? ""}`;
      const safe = listed.filter((j) => !RED_FLAGS.test(text(j)));
      const fits = safe.filter((j) => !excludedFor(status, text(j)));
      const jobs: JobListing[] = fits.slice(0, 20).map((j) => ({
        title: j.title!,
        company: j.company_name,
        location: j.location,
        link: j.apply_options?.[0]?.link || j.share_link,
        postedAt: j.detected_extensions?.posted_at,
        via: j.via?.replace(/^via\s+/i, ""),
        sponsors: status === "visa" && SPONSORS.test(text(j)) ? true : undefined,
      }));
      if (listed.length) {
        return NextResponse.json({ jobs, hidden: listed.length - safe.length, hiddenForStatus: safe.length - fits.length });
      }
    } catch (err) {
      console.error("[jobs] SerpApi failed:", err instanceof Error ? err.message : err);
    }
  }
  return NextResponse.json({ jobs: jobsFallback(searchParams.get("q") || "", city), sample: true });
}
