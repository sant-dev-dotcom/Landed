"use client";

import type { EventListing } from "./types";

// Public event listings (no user data), kept for this tab session so an event's details
// screen can be opened from the Community list and the back button works.
const KEY = "landed:event-results";

export function cacheEvents(events: EventListing[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(events));
  } catch {
    /* ignore */
  }
}

export function cachedEvent(id: string): EventListing | undefined {
  try {
    return (JSON.parse(sessionStorage.getItem(KEY) || "[]") as EventListing[]).find((e) => e.id === id);
  } catch {
    return undefined;
  }
}
