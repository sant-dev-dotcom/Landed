"use client";

import type { DocLine } from "./documentText";
import type { ScanResult } from "./types";

// The document open on the document screen, kept in this tab's memory only: never written to
// storage, so it's gone on reload or when the person closes it (the photo is never saved).

export interface OpenDocument {
  /** The covered copy that was sent (data: URL). */
  image: string;
  width: number;
  height: number;
  /** Words that weren't covered, with where they are on the image. */
  lines: DocLine[];
  result: ScanResult;
  sample?: boolean;
}

let current: OpenDocument | null = null;

export const openDocument = (doc: OpenDocument) => {
  current = doc;
};
export const getOpenDocument = () => current;
export const closeDocument = () => {
  current = null;
};
