"use client";

import { intlTag, languageInfo } from "@/i18n/languages";
import type { Profile } from "./types";

// English name of the typed-in language while it's active (set by CustomLocaleProvider).
// Sent with API calls so AI answers come back in that language.
let customLanguage: string | null = null;
export const setActiveCustomLanguage = (name: string | null) => {
  customLanguage = name;
};

const languageHeader = (): Record<string, string> =>
  customLanguage ? { "x-landed-language": encodeURIComponent(customLanguage) } : {};

/** GET a stream of JSON lines (one object per line), calling onLine for each as it arrives. */
export async function getJSONLines<T>(url: string, onLine: (line: T) => void, signal?: AbortSignal): Promise<void> {
  const res = await fetch(url, { headers: languageHeader(), signal });
  if (!res.ok || !res.body) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
    let end;
    while ((end = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, end).trim();
      buffer = buffer.slice(end + 1);
      if (line) onLine(JSON.parse(line) as T);
    }
    if (done) break;
  }
}

export async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...languageHeader() },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error || `HTTP ${res.status}`), { code: data?.error, status: res.status });
  return data as T;
}

export async function getJSON<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { headers: languageHeader(), signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export const DEMO_PERSONA: Omit<Profile, "createdAt" | "locale"> = {
  name: "Maria",
  originCountry: "Venezuela",
  languages: ["Spanish"],
  city: "Houston, TX",
  monthsInUS: 2,
  hasChildren: false,
  workBackground: "Registered nurse",
  biggestChallenge: "paperwork, finding work, English",
};

const COUNTRY_LANG: Record<string, string> = {
  Venezuela: "Spanish",
  Mexico: "Spanish",
  Honduras: "Spanish",
  Guatemala: "Spanish",
  "El Salvador": "Spanish",
  Cuba: "Spanish",
  Colombia: "Spanish",
  India: "Hindi",
  Vietnam: "Vietnamese",
  Nigeria: "English",
  Ukraine: "Ukrainian",
  Afghanistan: "Dari",
};

export function languagesFor(country: string, locale: string): string[] {
  const set = new Set<string>();
  const chosen = customLanguage && locale === "und" ? customLanguage : languageInfo(locale)?.english;
  if (chosen && locale !== "en") set.add(chosen);
  if (COUNTRY_LANG[country]) set.add(COUNTRY_LANG[country]);
  if (locale === "en") set.add("English");
  return [...set];
}

const LANG_ES: Record<string, string> = {
  Spanish: "español",
  English: "inglés",
  Hindi: "hindi",
  Telugu: "telugu",
  Vietnamese: "vietnamita",
  Igbo: "igbo",
  Ukrainian: "ucraniano",
  Russian: "ruso",
  Dari: "dari",
  Pashto: "pastún",
  "Arabic/Dari": "árabe/dari",
};

export function languageList(langs: string[], locale: string) {
  const names = locale === "es" ? langs.map((l) => LANG_ES[l] ?? l) : langs;
  return new Intl.ListFormat(intlTag(locale), { type: "conjunction" }).format(names);
}

/** Downscale an image file to a JPEG data URL (keeps uploads small, strips EXIF). */
export async function fileToJpeg(file: Blob, maxSide = 1600): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    return drawToJpeg(img, maxSide);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function svgToJpeg(svg: string, scale = 1.5): Promise<string> {
  const img = await loadImage("data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg));
  return drawToJpeg(img, Math.max(img.naturalWidth, img.naturalHeight) * scale);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image_load_failed"));
    img.src = src;
  });
}

function drawToJpeg(img: HTMLImageElement, maxSide: number) {
  const w = img.naturalWidth || 850;
  const h = img.naturalHeight || 1100;
  const scale = Math.min(maxSide / Math.max(w, h), 4);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const data = canvas.toDataURL("image/jpeg", 0.85);
  canvas.width = canvas.height = 0; // release the bitmap
  return data;
}
