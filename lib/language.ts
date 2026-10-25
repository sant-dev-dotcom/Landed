"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/routing";
import { CUSTOM_LOCALE, matchLanguage, type Locale } from "@/i18n/languages";import { postJSON } from "./client";
import { getCustomLanguage, getProfile, saveCustomLanguage, saveProfile, type CustomLanguage } from "./storage";

export type LanguageChoice = { kind: "preset"; code: Locale } | { kind: "custom"; name: string };

export async function setLocalePreference(locale: Locale) {
  const p = await getProfile();
  if (p && p.locale !== locale) await saveProfile({ ...p, locale });
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export const isSavedCustom = (name: string, saved: CustomLanguage | null) =>
  Boolean(saved && (same(name, saved.name) || same(name, saved.nativeName)));

/** Error codes thrown by applyLanguage: "not_configured" | "unknown_language" | "translate_failed". */
export function useApplyLanguage() {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();

  return async (choice: LanguageChoice, href: string = pathname) => {
    let target: Locale;
    if (choice.kind === "preset") {
      target = choice.code;
    } else {
      const known = matchLanguage(choice.name);
      const saved = await getCustomLanguage();
      if (known) {
        target = known;
      } else if (isSavedCustom(choice.name, saved)) {
        target = CUSTOM_LOCALE;
      } else {
        const res = await postJSON<{ locale?: Locale } & Partial<Pick<CustomLanguage, "messages">> & { language?: Omit<CustomLanguage, "messages"> }>(
          "/api/translate",
          { language: choice.name }
        ).catch((err: { code?: string }) => {
          throw new Error(err.code || "translate_failed");
        });
        if (res.locale) {
          target = res.locale;
        } else if (res.language && res.messages) {
          await saveCustomLanguage({ ...res.language, messages: res.messages });
          target = CUSTOM_LOCALE;
        } else {
          throw new Error("translate_failed");
        }
      }
    }
    await setLocalePreference(target);
    // Already on the custom locale: CustomLocaleProvider picks up the new messages from storage.
    if (target === locale) return false;
    router.replace(href, { locale: target });
    return true;
  };
}
