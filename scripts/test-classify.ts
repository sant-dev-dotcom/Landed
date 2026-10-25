// Run with: npm run test:classify  (Node 22.18+/23.6+ strips TypeScript types natively)
import { classifyRules } from "../lib/classify.ts";

const cases: [string, boolean][] = [
  // case-specific (EN)
  ["Can I travel to Mexico while my asylum case is pending?", true],
  ["Should I apply for a green card through my husband?", true],
  ["Am I eligible for TPS?", true],
  ["Will I be deported if I miss my court date?", true],
  ["What are my chances at my hearing?", true],
  // case-specific (ES)
  ["¿Puedo viajar a Venezuela?", true],
  ["¿Debo aplicar para asilo?", true],
  ["¿Soy elegible para la tarjeta verde?", true],
  ["¿Me van a deportar si pierdo mi trabajo?", true],
  ["Tengo una pregunta sobre mi caso", true],
  // general
  ["What's the difference between a green card and a work permit?", false],
  ["What is an I-94?", false],
  ["How do I know if a lawyer is real?", false],
  ["¿Qué es un notario y por qué debo tener cuidado?", false],
  ["How do I open a bank account?", false],
  ["¿Cómo encuentro una clínica de salud?", false],
];

let failed = 0;
for (const [q, expected] of cases) {
  const verdict = classifyRules(q);
  // "ambiguous" counts as case-specific when no LLM is available (safe default).
  const got = verdict !== "general";
  const ok = got === expected;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  [${verdict}]  ${q}`);
}
console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exit(failed ? 1 : 0);
