// Shapes shared by the Ask Landed client and /api/assistant. No imports.

/** The slices of on-device data the assistant can ask for. */
export type Store = "profile" | "dates" | "checklist" | "plan" | "prepSummaries";
export const STORES: Store[] = ["profile", "dates", "checklist", "plan", "prepSummaries"];

export interface DataFilters {
  /** dates: only those within the next N days (past ones from the last 30 days included). */
  withinDays?: number;
  /** checklist / plan: only done or only open items. */
  status?: "done" | "open";
  /** checklist: only items finished in the last N days. */
  sinceDays?: number;
}

export interface DataRequest {
  store: Store;
  filters?: DataFilters;
}

export interface ChatLink {
  type: "external" | "internal";
  url: string;
  title: string;
  sourceType?: "official" | "nonprofit";
}

/** A change the assistant suggests. Nothing is saved until the person taps Confirm. */
export type Proposal =
  | { kind: "markDone" | "markNotDone"; itemId: string }
  | { kind: "addDate"; label: string; date: string; docType: string };

export interface AssistantAnswer {
  text: string;
  links: ChatLink[];
  /** Which of the person's data stores the answer used. */
  usedData: Store[];
  /** Legal content: shows sources and "AI explanation · Not legal advice". */
  isLegal: boolean;
  /** Show the "Talk to free legal help" card. */
  helpCard: boolean;
  proposals: Proposal[];
  /** 2–3 short questions the person might ask next, in their language. */
  followUps?: string[];
  /** Answered without the AI (it was unavailable): only saved data and quoted sources. */
  limited?: boolean;
}

export interface AssistantRequest {
  message: string;
  locale: string;
  history: { role: "user" | "assistant"; text: string }[];
  context?: { itemId?: string };
  /** Only the slices the question needs (see routeStores) or the server asked for. */
  data: Partial<Record<Store, unknown>>;
}

export type AssistantResponse = { answer: AssistantAnswer } | { needData: DataRequest[] };

/** Pages inside the app the assistant may link to. */
export const INTERNAL_ROUTE = /^\/(home|legal|legal\/checklist|legal\/checklist\/[A-Za-z]+|legal\/help|legal\/ask|social|jobs|settings)$/;

// Keyword/intent router (EN + ES): which stores a question is about. Questions in other
// languages start with none; the server asks for what it needs with getUserData.
const ROUTES: [Store, RegExp][] = [
  ["profile", /\b(city|live|living|profile|language|languages|country|from|kids|children|background|first|start|priorit|ciudad|vivo|perfil|idioma|idiomas|pa[ií]s|hijos|primero|empezar)\b/i],
  [
    "dates",
    /\b(dates?|expire[sd]?|expiration|deadline|when|coming up|upcoming|next \d+ (days|weeks|months)|hearing|appointment|permit|first|fechas?|vence|vencimiento|plazo|cu[aá]ndo|pr[oó]xim\w*|audiencia|cita|permiso|primero)\b/i,
  ],
  ["checklist", /\b(list|left|finish\w*|done|complete\w*|checklist|tasks?|to ?do|items?|first|start|priorit|lista|falta\w*|termin\w*|hecho|hice|tareas?|primero|empezar)\b/i],
  ["plan", /\b(plan|next step|steps|90|first|start|paso|pasos|primero)\b/i],
  ["prepSummaries", /\b(lawyer|attorney|ask the|my questions|prep\w*|summary|abogad[oa]|mis preguntas|resumen|preparar)\b/i],
];

export function routeStores(message: string, context?: { itemId?: string }): Store[] {
  const stores = new Set<Store>(ROUTES.filter(([, re]) => re.test(message)).map(([s]) => s));
  if (context?.itemId) stores.add("checklist");
  return [...stores];
}
