// Case-specific / high-risk question detection. Layer 1 is fast keyword rules;
// layer 2 (an LLM check) is only used when the rules say "ambiguous".
// Kept dependency-free so `npm run test:classify` can run it directly with Node.

export type RuleVerdict = "case_specific" | "general" | "ambiguous";

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[¿?¡!.,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// First-person + legal action. Accents are stripped before matching.
const CASE_PATTERNS: RegExp[] = [
  // English
  /\bshould i (apply|file|sign|travel|leave|go|pay|marry|get married|accept|answer|respond|hire)\b/,
  /\bcan i (travel|leave|go back|go home|visit|work|stay|apply|file|get|renew|change my)\b/,
  /\b(am|will|would) i (be )?(eligible|qualify|deported|removed|detained|approved|denied|arrested)\b/,
  /\bwill (they|ice|uscis|the judge) (deport|detain|arrest|deny|approve|take)\b/,
  /\b(do|does) i (qualify|need a waiver|have a case)\b/,
  /\bmy (case|status|court date|hearing|asylum|petition|application|visa|green card|work permit|ead|tps|daca|interview|denial|rfe|deportation|removal|parole|overstay|a-?number)\b/,
  /\bshould i (fight|appeal|reopen)\b/,
  /\bwhat (are|is) my (chances|options|odds)\b/,
  /\b(i overstayed|i was denied|i got denied|i was arrested|i have a hearing|i missed my)\b/,
  // Spanish
  /\bdebo (aplicar|solicitar|pedir|firmar|viajar|salir|pagar|casarme|aceptar|responder|contestar|presentar)\b/,
  /\bpuedo (viajar|salir|regresar|volver|ir a|visitar|trabajar|quedarme|aplicar|solicitar|pedir|renovar|cambiar)\b/,
  /\b(soy|sere|estoy) (elegible|calificad[oa])\b/,
  /\b(califico|calificaria)\b/,
  /\bme (van a|pueden|podrian) (deportar|detener|arrestar|negar|quitar)\b/,
  /\b(me deportaran|me deportan|me negaran|me aprobaran)\b/,
  /\bmi (caso|estatus|estado migratorio|cita en la corte|corte|audiencia|asilo|peticion|solicitud|visa|tarjeta verde|green card|permiso de trabajo|tps|daca|entrevista|negacion|deportacion|parole|numero a)\b/,
  /\bque (posibilidades|chances|opciones) tengo\b/,
  /\b(me quede|me negaron|me arrestaron|tengo una audiencia|tengo corte|perdi mi)\b/,
];

const FIRST_PERSON = /\b(i|me|my|mine|i'm|im|yo|me|mi|mis|tengo|estoy|soy|puedo|debo)\b/;
const LEGAL_TOPIC =
  /\b(visa|green card|residen\w*|citizen\w*|ciudadan\w*|asylum|asilo|deport\w*|removal|ice|uscis|court|corte|judge|juez|hearing|audiencia|permit|permiso|ead|tps|daca|parole|waiver|perdon|status|estatus|immigra\w*|inmigra\w*|travel|viaj\w*|petition|peticion)\b/;

// Immigration, tax, benefits, housing-rights and workplace-rights topics. Answers about these
// must come only from trusted sources (Ask Landed calls searchTrustedSources first).
const LEGAL_AREA =
  /\b(visa|green card|residen\w*|citizen\w*|ciudadan\w*|asylum|asilo|deport\w*|removal|uscis|ice|court|corte|judge|juez|hearing|audiencia|permit|permiso|ead|tps|daca|parole|waiver|status|estatus|immigra\w*|inmigra\w*|travel\w*|viaj\w*|petition|peticion|i-?\d{2,3}|form|formulario|tax\w*|impuesto\w*|itin|irs|w-?7|benefit\w*|beneficio\w*|snap|food stamps|medicaid|wic|public charge|carga publica|lease|rent|renta|evict\w*|desalojo|landlord|tenant|inquilino|wages?|salario|overtime|horas extra|lawyer|abogad\w*|notario|scams?|estafas?|social security|seguro social|ssn|selective service)\b/;

export const isLegalTopic = (question: string) => LEGAL_AREA.test(normalize(question));

export function classifyRules(question: string): RuleVerdict {
  const q = normalize(question);
  if (CASE_PATTERNS.some((re) => re.test(q))) return "case_specific";
  if (FIRST_PERSON.test(q) && LEGAL_TOPIC.test(q)) return "ambiguous";
  return "general";
}

/**
 * Full two-layer check. `llmCheck` is optional; without it, ambiguous questions are
 * treated as case-specific (the safe default: they still get an answer plus a help CTA).
 */
export async function classify(
  question: string,
  llmCheck?: (q: string) => Promise<boolean>
): Promise<{ isCaseSpecific: boolean; via: "rules" | "llm" | "default" }> {
  const verdict = classifyRules(question);
  if (verdict === "case_specific") return { isCaseSpecific: true, via: "rules" };
  if (verdict === "general") return { isCaseSpecific: false, via: "rules" };
  if (llmCheck) {
    try {
      return { isCaseSpecific: await llmCheck(question), via: "llm" };
    } catch {
      // fall through
    }
  }
  return { isCaseSpecific: true, via: "default" };
}

export const CLASSIFIER_PROMPT = `Decide if a question asks for advice about the asker's own legal or immigration case
(for example: whether they should file, travel, whether they are eligible, what will happen in their case).
General questions about how things work are NOT case-specific.
Return JSON: { "isCaseSpecific": boolean }`;
