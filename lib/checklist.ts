// "Things to Take Care Of": structure, links and personalization from data/checklist.json.
// The words (titles, explanations, steps, link titles) live in messages/<locale>.json under
// "checklist.items.<id>" so they are translated with the rest of the UI.
import data from "@/data/checklist.json";
import type { TrustedLink } from "./links";
import type { Profile } from "./types";

export type SectionId = "start" | "money" | "work" | "family" | "protect" | "status";
type Requirement = "children" | "texas";

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

function meets(req: Requirement | undefined, p: Profile | null) {
  if (!req) return true;
  if (!p) return false;
  if (req === "children") return p.hasChildren;
  return /,\s*TX$/i.test(p.city);
}

/** The items for this person, in section order. */
export const itemsFor = (p: Profile | null) => ITEMS.filter((i) => meets(i.requires, p));

/** Links that apply to this person. */
export const linksFor = (links: ChecklistLink[], p: Profile | null) => links.filter((l) => meets(l.requires, p));

/** Saved completion state, keyed by item id (IndexedDB "landed:checklist"). */
export type ChecklistState = Record<string, { done: boolean; doneAt?: string }>;
