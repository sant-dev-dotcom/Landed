import { NextResponse } from "next/server";
import { generateJSON, isLLMConfigured, languageName } from "@/lib/llm";
import { prepFallback } from "@/lib/fallbacks";
import { asLocale, clip, maskDeep, maskIds } from "@/lib/mask";
import type { PrepSummary, TrackedDate } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    dates?: TrackedDate[];
    questions?: string[];
    profile?: { city?: string; originCountry?: string; name?: string };
    locale?: string;
  };
  const locale = asLocale(body.locale);
  const dates = (Array.isArray(body.dates) ? body.dates : []).slice(0, 20).map((d) => ({
    label: maskIds(clip(d.label, 100)),
    date: clip(d.date, 10),
    docType: clip(d.docType, 60),
  }));
  const questions = (Array.isArray(body.questions) ? body.questions : [])
    .map((q) => maskIds(clip(q, 300).trim()))
    .filter(Boolean)
    .slice(0, 5);
  const profile = {
    city: clip(body.profile?.city, 60) || undefined,
    originCountry: clip(body.profile?.originCountry, 60) || undefined,
    name: clip(body.profile?.name, 40) || undefined,
    locale,
  };

  if (isLLMConfigured()) {
    try {
      const lang = languageName(locale, req);
      const out = await generateJSON<PrepSummary>({
        system: `Create a one-page appointment preparation summary for someone meeting a lawyer or accredited representative.
Write it twice: first in ${lang}, then in English. If ${lang} is English, both versions are the same English text.
Include: a one-line intro (name, city and country of origin if given), the dates and document types they have, their questions (keep their meaning; translate them), and a general checklist of things to bring.
Use plain language at a 6th-grade reading level. Do not give legal advice or guess at their case. Do not include ID numbers.
Return JSON: { "summaryLocale": string, "summaryEnglish": string } where each is markdown using "#", "##", "-" and "1." only.`,
        user: JSON.stringify({ profile, dates, questions }),
        temperature: 0.2,
      });
      if (out.summaryLocale && out.summaryEnglish) {
        return NextResponse.json({
          summary: maskDeep({ summaryLocale: clip(out.summaryLocale, 6000), summaryEnglish: clip(out.summaryEnglish, 6000) }),
        });
      }
    } catch (err) {
      console.error("[prep] LLM failed:", err instanceof Error ? err.message : err);
    }
  }
  return NextResponse.json({ summary: prepFallback(dates, questions, profile), sample: true });
}
