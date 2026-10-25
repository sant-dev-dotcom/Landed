import type { Locale } from "@/i18n/languages";

export type { Locale };

export interface Profile {
  locale: Locale;
  name?: string;
  originCountry: string;
  languages: string[];
  city: string; // e.g. "Houston, TX"
  monthsInUS: number;
  hasChildren: boolean;
  workBackground?: string; // e.g. "Registered nurse"
  biggestChallenge?: string; // free text / comma-separated chips
  createdAt: string;
}

export interface PlanStep {
  id: string;
  title: string;
  why: string;
  category: "legal" | "money" | "social" | "jobs" | "health" | "daily";
  dueInDays?: number;
  done: boolean;
  sourceUrl?: string;
}

export interface TrackedDate {
  id: string;
  docType: string; // "Work permit", "Passport", "USCIS notice", etc.
  label: string; // "Work permit expires"
  date: string; // ISO (YYYY-MM-DD)
  note?: string; // general, non-advisory context
  reminder: boolean;
  createdFrom: "scan" | "manual";
}

export interface ScanResult {
  documentKind: string;
  summary: string;
  dates: { label: string; date: string }[];
  terms: { term: string; meaning: string }[];
  riskLevel: "low" | "medium" | "high";
  riskReason?: string;
  suggestedNextStep: string;
}

export interface GroundedAnswer {
  answer: string;
  sources: { title: string; url: string }[];
  isCaseSpecific: boolean;
  redirectToHelp: boolean;
}

export interface HelpListing {
  name: string;
  type: "nonprofit" | "accredited_rep" | "attorney" | "clinic" | "unknown";
  address?: string;
  phone?: string;
  website?: string;
  languages?: string[];
  cost?: "free" | "low" | "paid" | "unknown";
  distanceText?: string;
  rating?: number;
}

export interface EventLink {
  /** Site name, e.g. "simpletix.com". */
  source: string;
  link: string;
  /** "tickets": a ticket or registration page; "info": more information only. */
  type: "tickets" | "info";
}

export interface EventListing {
  /** Stable id for the details screen (from title + date). */
  id?: string;
  title: string;
  when?: string;
  startDate?: string;
  venue?: string;
  location?: string;
  link?: string;
  description?: string;
  /** Ticket / registration and info pages, from the event listing. */
  links?: EventLink[];
  thumbnail?: string;
  /** Built-in sample listing (no live search available). */
  sample?: boolean;
}

/** What the event's own page says (/api/events/details). */
export interface EventDetails {
  description?: string;
  /** The description was rewritten in plain language by AI from the page's own text. */
  aiSummary?: boolean;
  /** Lowest and highest ticket price, if the page publishes them. */
  price?: { min: number; max: number; currency: string };
  /** true: free; false: paid tickets; undefined: the page doesn't say. */
  free?: boolean;
  organizer?: string;
}

export interface JobListing {
  title: string;
  company?: string;
  location?: string;
  link?: string;
  postedAt?: string;
  via?: string;
}

export interface SavedQuestion {
  id: string;
  question: string;
  answer?: GroundedAnswer;
  askedAt: string;
}

export interface PrepSummary {
  summaryLocale: string;
  summaryEnglish: string;
}
