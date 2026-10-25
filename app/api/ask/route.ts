import { NextResponse } from "next/server";
import { CLASSIFIER_PROMPT, classify } from "@/lib/classify";
import { COMMON_RULES, generateJSON, isLLMConfigured, languageName } from "@/lib/llm";
import { getSource, retrieve, sourceBody, sourceTitle, type Source } from "@/lib/sources";
import { caseSpecificIntro, dontKnow } from "@/lib/fallbacks";
import { asLocale, clip, maskDeep } from "@/lib/mask";
import type { GroundedAnswer, Locale } from "@/lib/types";

export const maxDuration = 60;

const systemPrompt = (language: string, isCaseSpecific: boolean, excerpts: string) =>
  `You answer general questions about life in the US for newcomers.
${COMMON_RULES(language)}
Only use the SOURCES provided below. If the sources do not answer the question, say you do not know and suggest free legal help or the official website.
Cite sources by returning their title and url, exactly as given.
isCaseSpecific = ${isCaseSpecific}.
If isCaseSpecific is true, do NOT answer the specific case. Explain briefly why it depends on the person's situation, give general background from sources if relevant, and set redirectToHelp=true.
Never predict outcomes, recommend filings, or determine eligibility. Keep the answer under 140 words.
You may use simple markdown in "answer": **bold** for key facts and short lists with one item per line. No tables or headings.
SOURCES:
${excerpts}
Return JSON: { "answer": string, "sources": [{ "title": string, "url": string }], "isCaseSpecific": boolean, "redirectToHelp": boolean }`;

const cite = (s: Source, locale: Locale) => ({ title: sourceTitle(s, locale), url: s.url });

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { question?: string; locale?: string };
  const locale = asLocale(body.locale);
  const question = clip(body.question, 600).trim();
  if (!question) return NextResponse.json({ error: "empty" }, { status: 400 });

  const llm = isLLMConfigured();

  // 1. Case-specific detection (rules first, LLM only when ambiguous).
  const { isCaseSpecific } = await classify(
    question,
    llm
      ? async (q) =>
          (await generateJSON<{ isCaseSpecific: boolean }>({ system: CLASSIFIER_PROMPT, user: q, temperature: 0 }))
            .isCaseSpecific === true
      : undefined
  );

  // 2. Retrieve trusted excerpts. Case-specific questions always include how to find help.
  let sources = retrieve(question, 4);
  if (isCaseSpecific) {
    const help = getSource("free-legal-help");
    if (help && !sources.some((s) => s.id === help.id)) sources = [...sources.slice(0, 3), help];
  }

  // 3. Grounded LLM answer.
  if (llm && sources.length) {
    try {
      const excerpts = sources
        .map((s, i) => `[${i + 1}] title: ${sourceTitle(s, locale)}\nurl: ${s.url}\n${sourceBody(s, locale)}`)
        .join("\n\n");
      const out = await generateJSON<GroundedAnswer>({
        system: systemPrompt(languageName(locale, req), isCaseSpecific, excerpts),
        user: question,
        temperature: 0.2,
      });
      // Only allow citations that were actually provided.
      const allowed = new Map(sources.map((s) => [s.url, cite(s, locale)]));
      let cited = (out.sources || []).map((s) => allowed.get(s?.url)).filter(Boolean) as GroundedAnswer["sources"];
      if (!cited.length) cited = [cite(sources[0], locale)];
      const answer: GroundedAnswer = {
        answer: clip(out.answer, 2000),
        sources: Array.from(new Map(cited.map((c) => [c.url, c])).values()),
        isCaseSpecific,
        redirectToHelp: isCaseSpecific || Boolean(out.redirectToHelp),
      };
      return NextResponse.json({ answer: maskDeep(answer) });
    } catch (err) {
      console.error("[ask] LLM failed, using extractive answer:", err instanceof Error ? err.message : err);
    }
  }

  // Fallback: extractive answer straight from the curated sources.
  if (!sources.length) {
    const answer: GroundedAnswer = { answer: dontKnow(locale), sources: [], isCaseSpecific, redirectToHelp: true };
    return NextResponse.json({ answer, sample: true });
  }
  const top = sources[0];
  const paragraphs = sourceBody(top, locale).split(/\n\s*\n/);
  const text = isCaseSpecific
    ? `${caseSpecificIntro(locale)}\n\n${paragraphs.join("\n\n")}`
    : paragraphs.slice(0, 2).join("\n\n");
  const answer: GroundedAnswer = {
    answer: text,
    sources: sources.slice(0, isCaseSpecific ? 3 : 2).map((s) => cite(s, locale)),
    isCaseSpecific,
    redirectToHelp: isCaseSpecific,
  };
  return NextResponse.json({ answer, sample: !llm });
}
