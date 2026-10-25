import { NextResponse } from "next/server";
import { COMMON_RULES, generateJSON, isLLMConfigured, languageName } from "@/lib/llm";
import { credentialFallback } from "@/lib/fallbacks";
import { asLocale, clip } from "@/lib/mask";

interface Credential {
  overview: string;
  boardName?: string;
  boardUrl?: string;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { workBackground?: string; city?: string; locale?: string };
  const locale = asLocale(body.locale);
  const work = clip(body.workBackground, 80).trim();
  const city = clip(body.city, 60) || "Houston, TX";
  if (!work) return NextResponse.json({ error: "empty" }, { status: 400 });

  const fallback = credentialFallback(work, city, locale);

  if (isLLMConfigured()) {
    try {
      const out = await generateJSON<Credential>({
        system: `You give a short general overview of how a profession is licensed in the US, for a newcomer.
${COMMON_RULES(languageName(locale, req))}
Write 2-4 sentences in the pattern: "In the US, [profession] is usually (or is not usually) a licensed profession. Licensing is handled by state boards." Then name the typical general steps (education review, exam, English test) only as "often" or "usually".
Never say whether this person is eligible, how long it will take them, or that they will qualify.
Return JSON: { "overview": string, "boardName": string | null }`,
        user: `Profession: ${work}\nCity: ${city}`,
        temperature: 0.3,
      });
      return NextResponse.json({
        overview: clip(out.overview, 900),
        boardName: fallback.boardName ?? (out.boardName ? clip(out.boardName, 120) : undefined),
        // Links come only from our curated list or a plain search, never from the model.
        boardUrl: fallback.boardUrl,
      });
    } catch (err) {
      console.error("[credential] LLM failed:", err instanceof Error ? err.message : err);
    }
  }
  return NextResponse.json({ ...fallback, sample: true });
}
