import type { AbstractIntlMessages } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";
import { CUSTOM_LOCALE, isLocale } from "./languages";

type Tree = Record<string, unknown>;

// English underneath every language, so a string that hasn't been translated yet shows in
// English instead of as a missing key.
function merge(base: Tree, over: Tree): Tree {
  const out: Tree = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = v && typeof v === "object" && base[k] && typeof base[k] === "object" ? merge(base[k] as Tree, v as Tree) : v;
  }
  return out;
}

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;
  if (!isLocale(locale)) locale = routing.defaultLocale;
  const en = (await import("../messages/en.json")).default as Tree;
  // A custom language's messages live on the device; the server renders English underneath them.
  if (locale === "en" || locale === CUSTOM_LOCALE) return { locale, messages: en as AbstractIntlMessages };
  const own = (await import(`../messages/${locale}.json`)).default as Tree;
  return { locale, messages: merge(en, own) as AbstractIntlMessages };
});
