// "Things to Take Care Of": structure, links and personalization from data/checklist.json.
// The words (titles, explanations, steps, link titles) live in messages/<locale>.json under
// "checklist.items.<id>" so they are translated with the rest of the UI.
import data from "@/data/checklist.json";
import type { TrustedLink } from "./links";
import type { Profile } from "./types";

export type SectionId = "start" | "money" | "work" | "family" | "protect" | "status";
// "renterGuide": a state we have checked renter-rights sources for (the four below).
type Requirement = "children" | "texas" | "florida" | "arizona" | "newYork" | "renterGuide";

export interface ChecklistLink extends TrustedLink {
  /** Only shown when the profile matches (e.g. a Texas-only page). */
  requires?: Requirement;
}

export interface ChecklistItem {
  id: string;
  section: SectionId;
  /** Shown only to people this applies to. */
  requires?: Requirement;
  /** Depends on immigration status: always shows the "Talk to free legal help" card. */
  statusDependent?: boolean;
  /** Has a date to track; offers "Add a Date for This" with this document type. */
  deadline?: { docType: string };
  links: ChecklistLink[];
  /** One entry per "How to Do It" step (text is checklist.items.<id>.steps.s<n>). */
  howTo: { link?: ChecklistLink }[];
}

export const SECTIONS = data.sections as SectionId[];
export const ITEMS = data.items as ChecklistItem[];

export const getItem = (id: string) => ITEMS.find((i) => i.id === id);

const STATES: Partial<Record<Requirement, string>> = { texas: "TX", florida: "FL", arizona: "AZ", newYork: "NY" };
const STATE_NAMES: Record<string, string> = { texas: "TX", florida: "FL", arizona: "AZ", "new york": "NY" };

/**
 * The two-letter state in the city from onboarding: "Houston, TX", or what someone typed
 * under "Other" ("Houston, Texas", "houston tx"). Null when it doesn't say.
 */
export function stateOf(city: string): string | null {
  const c = city.trim().toLowerCase().replace(/\.$/, "");
  const code = c.match(/[,\s]\s*([a-z]{2})$/)?.[1];
  if (code) return code.toUpperCase();
  const name = Object.keys(STATE_NAMES).find((n) => c === n || c.endsWith(` ${n}`) || c.endsWith(`,${n}`));
  return name ? STATE_NAMES[name] : null;
}

function meets(req: Requirement | undefined, p: Profile | null) {
  if (!req) return true;
  if (!p) return false;
  if (req === "children") return p.hasChildren;
  const state = stateOf(p.city);
  if (req === "renterGuide") return state !== null && Object.values(STATES).includes(state);
  return state === STATES[req];
}

/** The items for this person, in section order. */
export const itemsFor = (p: Profile | null) => ITEMS.filter((i) => meets(i.requires, p));

/** Links that apply to this person. */
export const linksFor = (links: ChecklistLink[], p: Profile | null) => links.filter((l) => meets(l.requires, p));

/** Saved completion state, keyed by item id (IndexedDB "landed:checklist"). */
export type ChecklistState = Record<string, { done: boolean; doneAt?: string }>;
