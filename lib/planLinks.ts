// A "Learn More" link for every step of the 90-day plan. The AI suggests links, but only
// trusted ones (lib/links.ts) are kept; every other step gets a checked page for its topic.
// No server-only imports: used by /api/plan and by Home, so plans saved before this get links too.
import { baseUrl, isTrusted, localizedVersion, type LocalizedUrl } from "./links";
import type { PlanStep } from "./types";

/** Topics in order: the first whose words appear in the step's title or explanation wins. */
const TOPICS: { match: RegExp; url: LocalizedUrl }[] = [
  { match: /\bi-?94\b|important papers|documentos importantes|passport|pasaporte/i, url: "https://i94.cbp.dhs.gov/" },
  { match: /\baddress\b|dirección|direccion|\bmov(e|ing)\b|mudanza/i, url: { en: "https://www.uscis.gov/addresschange", es: "https://www.uscis.gov/es/cambiodedireccion" } },
  { match: /work permit|permiso de trabajo|\bead\b|i-765/i, url: { en: "https://www.uscis.gov/i-765", es: "https://www.uscis.gov/es/i-765" } },
  { match: /scam|estafa|notario|fraud|fraude/i, url: { en: "https://www.uscis.gov/avoid-scams", es: "https://www.uscis.gov/es/evite-las-estafas-de-inmigracion" } },
  { match: /court|corte|hearing|audiencia/i, url: "https://acis.eoir.justice.gov/en/" },
  { match: /legal|lawyer|abogad|attorney|immigration|inmigraci/i, url: "https://www.immigrationlawhelp.org/" },
  { match: /social security|seguro social|\bssn\b/i, url: { en: "https://www.ssa.gov/number-card", es: "https://www.ssa.gov/es/number-card" } },
  { match: /\bitin\b/i, url: { en: "https://www.irs.gov/tin/itin/individual-taxpayer-identification-number-itin", es: "https://www.irs.gov/es/tin/itin/individual-taxpayer-identification-number-itin" } },
  { match: /\btax(es)?\b|impuesto/i, url: { en: "https://www.irs.gov/filing", es: "https://www.irs.gov/es/filing" } },
  { match: /\bbank|banco|cuenta|credit union|cooperativa/i, url: "https://www.consumerfinance.gov/consumer-tools/bank-accounts/" },
  { match: /credit|crédito|credito/i, url: "https://www.consumerfinance.gov/consumer-tools/credit-reports-and-scores/" },
  { match: /\bphone|teléfono|telefono|celular|\bcell\b|sim card/i, url: "https://www.lifelinesupport.org/" },
  { match: /driver|licencia|state id|\bid card|identificaci/i, url: "https://www.usa.gov/state-motor-vehicle-services" },
  { match: /school|escuela|enroll|inscrib|children|hijos|niños|ninos/i, url: { en: "https://usahello.org/education/children/", es: "https://usahello.org/es/educacion/ninos/" } },
  { match: /english|inglés|ingles|\besl\b/i, url: "https://usahello.org/education/learn-english-language/" },
  { match: /insurance|seguro médico|seguro medico|coverage|cobertura/i, url: { en: "https://www.healthcare.gov/immigrants/", es: "https://www.cuidadodesalud.gov/es/immigrants/" } },
  { match: /health|salud|clinic|clínica|clinica|doctor|médic|medic|dentist/i, url: "https://findahealthcenter.hrsa.gov/" },
  { match: /food|comida|alimento|groceries|despensa|snap\b/i, url: "https://www.usa.gov/food-help" },
  { match: /\brent\b|housing|apartment|vivienda|alquiler|renta|landlord|inquilino|lease|contrato/i, url: "https://www.usa.gov/housing-help" },
  { match: /wage|salario|rights at work|derechos .*trabajo|overtime/i, url: "https://www.dol.gov/agencies/whd/minimum-wage" },
  { match: /\bjob|work|trabajo|empleo|résumé|resume|currículum|curriculum|career|licens|certif/i, url: "https://www.usa.gov/job-training" },
];

/** When no topic matches: a trusted page for the step's category. */
const BY_CATEGORY: Record<PlanStep["category"], LocalizedUrl> = {
  legal: "https://www.immigrationlawhelp.org/",
  money: "https://www.consumerfinance.gov/consumer-tools/bank-accounts/",
  health: "https://findahealthcenter.hrsa.gov/",
  jobs: "https://www.usa.gov/job-training",
  social: "https://usahello.org/life-in-usa/",
  daily: "https://usahello.org/life-in-usa/",
};

/** The step's link: the AI's if it's a trusted site, otherwise a checked page for its topic. */
export function learnMoreFor(step: Pick<PlanStep, "title" | "why" | "category" | "sourceUrl">, locale = "en"): string {
  if (step.sourceUrl && isTrusted(step.sourceUrl)) return step.sourceUrl;
  const text = `${step.title} ${step.why ?? ""}`;
  const url = TOPICS.find((t) => t.match.test(text))?.url ?? BY_CATEGORY[step.category] ?? BY_CATEGORY.daily;
  return localizedVersion(url, locale) ?? baseUrl(url);
}
