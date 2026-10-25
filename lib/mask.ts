import { isLocale, type Locale } from "@/i18n/languages";

/** Mask anything that looks like an ID number (A-numbers, receipt numbers) to its last 4 chars. */
export function maskIds(text: string): string {
  return text
    .replace(/\bA[-\s]?\d{3}[-\s]?\d{3}[-\s]?\d{3}\b/gi, (m) => "A-•••" + m.replace(/\D/g, "").slice(-4))
    .replace(/\b[A-Z]{3}\d{10}\b/g, (m) => "•••" + m.slice(-4))
    .replace(/\b\d{9,}\b/g, (m) => "•••" + m.slice(-4));
}

/** Deep-mask every string in a JSON-like value. */
export function maskDeep<T>(value: T): T {
  if (typeof value === "string") return maskIds(value) as T;
  if (Array.isArray(value)) return value.map(maskDeep) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, maskDeep(v)])) as T;
  }
  return value;
}

export const asLocale = (v: unknown): Locale => (isLocale(v) ? v : "en");
export const clip = (v: unknown, max = 500) => (typeof v === "string" ? v.slice(0, max) : "");
