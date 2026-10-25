// Kinds of events people can pick on the Community tab. Labels live in messages under
// "community.interest_<id>"; `search` is what the web search looks for (in English, since
// most listings are).

export const EVENT_INTERESTS = [
  { id: "jobs", search: "job fairs, career workshops and hiring events" },
  { id: "english", search: "free English classes, conversation groups and language exchanges" },
  { id: "legal", search: "free legal clinics and know-your-rights workshops for immigrants" },
  { id: "health", search: "free health fairs, clinics and wellness events" },
  { id: "family", search: "free family and kids events" },
  { id: "culture", search: "cultural festivals and heritage celebrations" },
  { id: "social", search: "newcomer meetups, community gatherings and volunteer days" },
  // Uses the country from onboarding, e.g. "events for the Venezuelan community".
  { id: "homeCountry", search: "community events for people from {country}" },
] as const;

export type EventInterest = (typeof EVENT_INTERESTS)[number]["id"];

export const isEventInterest = (v: unknown): v is EventInterest => EVENT_INTERESTS.some((i) => i.id === v);

/** Interests people type themselves ("salsa dancing", "chess club"). */
export const MAX_CUSTOM_INTERESTS = 5;
export const CUSTOM_INTEREST_LENGTH = 60;

/** One line of plain words: no line breaks, quotes or brackets that could reshape the search prompt. */
export const cleanCustomInterest = (s: string) =>
  s
    .replace(/[\p{C}"`{}<>[\]\\]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CUSTOM_INTEREST_LENGTH);
