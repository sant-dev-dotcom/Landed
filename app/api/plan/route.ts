import { NextResponse } from "next/server";
import { COMMON_RULES, generateJSON, isLLMConfigured, languageName } from "@/lib/llm";
import { planFallback } from "@/lib/fallbacks";
import { asLocale, clip, maskDeep } from "@/lib/mask";
import type { PlanStep, Profile } from "@/lib/types";

const CATEGORIES = new Set(["legal", "money", "social", "jobs", "health", "daily"]);

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Partial<Profile>;
  const profile: Profile = {
    locale: asLocale(body.locale),
    originCountry: clip(body.originCountry, 60),
    languages: Array.isArray(body.languages) ? body.languages.slice(0, 5).map((l) => clip(l, 30)) : [],
    city: clip(body.city, 60) || "Houston, TX",
    monthsInUS: Number(body.monthsInUS) || 0,
    hasChildren: Boolean(body.hasChildren),
    workBackground: clip(body.workBackground, 80) || undefined,
    biggestChallenge: clip(body.biggestChallenge, 200) || undefined,
    createdAt: new Date().toISOString(),
  };

  if (isLLMConfigured()) {
    try {
      const system = `You help people who recently moved to the United States plan their first 90 days.
${COMMON_RULES(languageName(profile.locale, req))} Use simple, warm, plain language.
Return 6-10 general steps that apply to most newcomers in ${profile.city}.
Never determine legal eligibility, recommend immigration filings, or give legal strategy.
For any legal topic, the step should be "learn about" or "talk to free legal help."
Prioritize what the person says feels hardest. Include at least one legal, one money, one health and one social step.
Return JSON: { "steps": [{ "id": string, "title": string (max 60 chars), "why": string (1-2 sentences), "category": "legal"|"money"|"social"|"jobs"|"health"|"daily", "dueInDays": number, "done": false, "sourceUrl"?: string (only official or well-known nonprofit sites) }] }`;
      const user = `Profile (no names or IDs):
- From: ${profile.originCountry || "unknown"}
- City: ${profile.city}
- Months in US: ${profile.monthsInUS}
- Has children: ${profile.hasChildren ? "yes" : "no"}
- Work background: ${profile.workBackground || "not given"}
- Feels hardest: ${profile.biggestChallenge || "not given"}`;
      const out = await generateJSON<{ steps: PlanStep[] }>({ system, user, temperature: 0.5 });
      const steps = (out.steps || [])
        .filter((s) => s && s.title)
        .slice(0, 10)
        .map((s, i) => ({
          id: `step-${i + 1}`,
          title: clip(s.title, 90),
          why: clip(s.why, 300),
          category: (CATEGORIES.has(s.category) ? s.category : "daily") as PlanStep["category"],
          dueInDays: Number.isFinite(Number(s.dueInDays)) ? Math.max(1, Math.min(90, Number(s.dueInDays))) : undefined,
          done: false,
          sourceUrl: typeof s.sourceUrl === "string" && /^https:\/\//.test(s.sourceUrl) ? s.sourceUrl : undefined,
        }));
      if (steps.length >= 6) return NextResponse.json({ steps: maskDeep(steps) });
    } catch (err) {
      console.error("[plan] LLM failed, using fallback:", err instanceof Error ? err.message : err);
    }
  }
  return NextResponse.json({ steps: planFallback(profile), sample: true });
}
