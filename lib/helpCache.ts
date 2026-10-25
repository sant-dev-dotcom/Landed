"use client";

import type { HelpListing } from "./types";

// Public search results only (no user data), kept for this tab session so the
// detail screen can be pushed and the back button works.
const KEY = "landed:help-results";

export function cacheListings(listings: HelpListing[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(listings));
  } catch {
    /* ignore */
  }
}

export function cachedListings(): HelpListing[] {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}
