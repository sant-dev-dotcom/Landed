import { NextResponse } from "next/server";
import { COMMON_RULES, generateJSON, isLLMConfigured, languageName } from "@/lib/llm";
import { scanFallback } from "@/lib/fallbacks";
import { SAMPLE_IDS, type SampleId } from "@/lib/demoLetters";
import { asLocale, clip, maskDeep } from "@/lib/mask";
import type { ScanResult } from "@/lib/types";

// PRIVACY: the image lives only in this request's memory. It is never written to
// disk, never logged, and never returned. Do not add logging of `body` here.

export const maxDuration = 60;

const MAX_BASE64 = 6_000_000; // ~4.5MB image
const MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

const systemPrompt = (language: string) => `You read a photo of a document or letter and explain it to someone new to the US.
${COMMON_RULES(language)}
Tasks:
1. Identify the general kind of document (e.g., "USCIS receipt notice", "lease", "medical bill", "school notice").
2. Summarize what it says in 2-4 sentences.
3. List any dates and what they are for. Dates must be ISO format YYYY-MM-DD.
4. Define up to 5 difficult terms.
5. Set riskLevel:
   - "high" if it mentions a court hearing, removal, denial, request for evidence (RFE), notice of intent to deny, deadline to respond, eviction, or legal action.
   - "medium" if it requires a response or payment.
   - "low" otherwise.
6. suggestedNextStep must be general (e.g., "Talk to free legal help before the date shown").
Rules:
- Do not tell the user what to file or what their outcome will be.
- Do not output full ID numbers, A-numbers, or receipt numbers; mask all but last 4 characters.
- Do not repeat the person's full name.
- If the image is unreadable or not a document, say so in summary, set documentKind to "Unreadable" and return empty dates and terms.
Return JSON: { "documentKind": string, "summary": string, "dates": [{ "label": string, "date": "YYYY-MM-DD" }], "terms": [{ "term": string, "meaning": string }], "riskLevel": "low"|"medium"|"high", "riskReason"?: string, "suggestedNextStep": string }`;

function normalize(r: Partial<ScanResult>): ScanResult {
  const risk = r.riskLevel === "high" || r.riskLevel === "medium" ? r.riskLevel : "low";
  return maskDeep({
    documentKind: clip(r.documentKind, 80) || "Document",
    summary: clip(r.summary, 1200),
    dates: (Array.isArray(r.dates) ? r.dates : [])
      .filter((d) => d && /^\d{4}-\d{2}-\d{2}/.test(String(d.date)))
      .slice(0, 8)
      .map((d) => ({ label: clip(d.label, 80), date: String(d.date).slice(0, 10) })),
    terms: (Array.isArray(r.terms) ? r.terms : []).slice(0, 5).map((t) => ({ term: clip(t.term, 60), meaning: clip(t.meaning, 300) })),
    riskLevel: risk,
    riskReason: r.riskReason ? clip(r.riskReason, 300) : undefined,
    suggestedNextStep: clip(r.suggestedNextStep, 300),
  });
}

export async function POST(req: Request) {
  let body: { image?: string; mimeType?: string; locale?: string; sampleId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const locale = asLocale(body.locale);
  const sampleId = SAMPLE_IDS.includes(body.sampleId as SampleId) ? (body.sampleId as SampleId) : undefined;
  const image = typeof body.image === "string" ? body.image.replace(/^data:[^;]+;base64,/, "") : "";
  const mimeType = MIME.has(String(body.mimeType)) ? String(body.mimeType) : "image/jpeg";

  if (image.length > MAX_BASE64) return NextResponse.json({ error: "too_large" }, { status: 413 });

  if (image && isLLMConfigured()) {
    try {
      const raw = await generateJSON<Partial<ScanResult>>({
        system: systemPrompt(languageName(locale, req)),
        user: "Explain this document.",
        image: { mimeType, base64: image },
        temperature: 0.2,
      });
      return NextResponse.json({ result: normalize(raw) });
    } catch (err) {
      console.error("[scan] LLM failed:", err instanceof Error ? err.message : "unknown");
    }
  }

  if (sampleId) return NextResponse.json({ result: scanFallback(sampleId, locale), sample: true });
  return NextResponse.json({ error: "not_configured" }, { status: 503 });
}
