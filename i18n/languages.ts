// The languages Landed ships with (messages/<code>.json), in picker order.
// No imports: this file is shared by the app, the API routes and scripts/translate-messages.ts.

export interface LanguageInfo {
  code: string;
  native: string;
  english: string;
  rtl?: boolean;
  /** Other names people type for this language (lowercase). */
  aliases?: string[];
}

export const LANGUAGES = [
  { code: "en", native: "English", english: "English" },
  { code: "es", native: "Español", english: "Spanish", aliases: ["castellano"] },
  { code: "ar", native: "العربية", english: "Arabic", rtl: true },
  { code: "fr", native: "Français", english: "French" },
  { code: "zh", native: "简体中文", english: "Simplified Chinese", aliases: ["chinese", "mandarin", "中文"] },
  { code: "ko", native: "한국어", english: "Korean" },
  { code: "ht", native: "Kreyòl Ayisyen", english: "Haitian Creole", aliases: ["creole", "haitian", "kreyol"] },
  { code: "rw", native: "Ikinyarwanda", english: "Kinyarwanda" },
  { code: "sw", native: "Kiswahili", english: "Swahili" },
  { code: "am", native: "አማርኛ", english: "Amharic" },
  { code: "fa", native: "فارسی/دری", english: "Persian/Dari", rtl: true, aliases: ["persian", "dari", "farsi", "فارسی", "دری"] },
  { code: "ps", native: "پښتو", english: "Pashto", rtl: true, aliases: ["pushto"] },
  { code: "so", native: "Af Soomaali", english: "Somali", aliases: ["soomaali"] },
  { code: "ur", native: "اُردُو", english: "Urdu", rtl: true, aliases: ["اردو"] },
  { code: "pt", native: "Português", english: "Portuguese" },
  { code: "ru", native: "Русский", english: "Russian" },
  { code: "uk", native: "Українська", english: "Ukrainian" },
  { code: "vi", native: "Tiếng Việt", english: "Vietnamese" },
  { code: "my", native: "မြန်မာစာ", english: "Burmese", aliases: ["myanmar"] },
  { code: "hi", native: "हिन्दी", english: "Hindi" },
  { code: "ne", native: "नेपाली", english: "Nepali" },
  { code: "pa", native: "ਪੰਜਾਬੀ", english: "Punjabi", aliases: ["panjabi"] },
  { code: "tl", native: "Tagalog", english: "Tagalog", aliases: ["filipino"] },
] as const satisfies readonly LanguageInfo[];

/** BCP 47 "undetermined": a language the user typed in, translated on demand and kept on the device. */
export const CUSTOM_LOCALE = "und";

export type BundledLocale = (typeof LANGUAGES)[number]["code"];
export type Locale = BundledLocale | typeof CUSTOM_LOCALE;

export const LOCALES: Locale[] = [...LANGUAGES.map((l) => l.code), CUSTOM_LOCALE];

export const isLocale = (v: unknown): v is Locale => typeof v === "string" && (LOCALES as string[]).includes(v);

export const languageInfo = (code: string): LanguageInfo | undefined => LANGUAGES.find((l) => l.code === code);

export const isRtl = (code: string) => Boolean(languageInfo(code)?.rtl);

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s*\(.*\)\s*$/, "")
    .trim();

/** The bundled language a typed name refers to ("farsi", "Français", "mandarin"…), if any. */
export function matchLanguage(name: string): BundledLocale | undefined {
  const q = normalize(name);
  if (!q) return undefined;
  const hit = LANGUAGES.find((l: LanguageInfo) =>
    [l.code, l.english, l.native, ...l.native.split("/"), ...(l.aliases ?? [])].some((n) => normalize(n) === q)
  );
  return hit?.code;
}

/** The bundled language for a BCP 47 tag, if any. Traditional Chinese is not the bundled Simplified one. */
export function localeForTag(tag: string): BundledLocale | undefined {
  const t = tag.toLowerCase();
  const primary = ({ prs: "fa", pes: "fa", fil: "tl" } as Record<string, string>)[t.split(/[-_]/)[0]] ?? t.split(/[-_]/)[0];
  if (primary === "zh" && /hant|-tw|-hk|-mo/.test(t)) return undefined;
  return LANGUAGES.find((l) => l.code === primary)?.code;
}

const INTL_TAG: Record<string, string> = { en: "en-US", es: "es-US", zh: "zh-CN" };

/** A tag Intl APIs accept. A custom language uses the tag CustomLocaleProvider sets on <html lang>. */
export function intlTag(locale: string): string {
  let tag = locale;
  if (locale === CUSTOM_LOCALE) tag = typeof document !== "undefined" ? document.documentElement.lang : "en";
  tag = INTL_TAG[tag] ?? tag;
  try {
    return tag && tag !== CUSTOM_LOCALE && Intl.getCanonicalLocales(tag).length ? tag : "en-US";
  } catch {
    return "en-US";
  }
}
