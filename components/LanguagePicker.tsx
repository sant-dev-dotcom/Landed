"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { CUSTOM_LOCALE, LANGUAGES, languageInfo, type LanguageInfo, type Locale } from "@/i18n/languages";
import { useApplyLanguage, type LanguageChoice } from "@/lib/language";
import { getCustomLanguage, type CustomLanguage } from "@/lib/storage";
import { ListSection } from "./ios/ListSection";
import { ListRow } from "./ios/ListRow";
import { SearchField } from "./ios/SearchField";
import { BarButton, Sheet } from "./ios/Sheet";
import { LoadingBlock } from "./ios/Spinner";

const Tick = ({ on }: { on: boolean }) =>
  on ? <Check size={20} strokeWidth={2} className="shrink-0 text-tint" aria-hidden /> : null;

/** The translation key for an error thrown by useApplyLanguage. */
export function languageErrorKey(err: unknown) {
  const code = err instanceof Error ? err.message : "";
  return code === "not_configured" ? "notConfigured" : code === "unknown_language" ? "unknownLanguage" : "translateFailed";
}

/** The language the UI is in right now, written in itself. */
export function useCurrentLanguageName() {
  const locale = useLocale();
  const [custom, setCustom] = useState<CustomLanguage | null>(null);
  useEffect(() => {
    if (locale === CUSTOM_LOCALE) getCustomLanguage().then(setCustom);
  }, [locale]);
  return locale === CUSTOM_LOCALE ? custom?.nativeName ?? "" : languageInfo(locale)?.native ?? locale;
}

interface PickerProps {
  value: LanguageChoice | null;
  onChange: (choice: LanguageChoice) => void;
  /** Enter pressed in the "Another language" field. */
  onSubmit?: () => void;
  /** A language typed in earlier, offered again so it isn't translated twice. */
  saved: CustomLanguage | null;
}

export function LanguagePicker({ value, onChange, onSubmit, saved }: PickerProps) {
  const t = useTranslations("language");
  const tc = useTranslations("common");
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const hit = (s: string) => s.toLowerCase().includes(q);
  const presets = LANGUAGES.filter((l: LanguageInfo) => !q || hit(l.native) || hit(l.english) || l.aliases?.some(hit));
  const showSaved = saved && (!q || hit(saved.name) || hit(saved.nativeName));
  const on = (code: Locale) => value?.kind === "preset" && value.code === code;
  const custom = value?.kind === "custom" ? value : null;

  return (
    <div className="flex flex-col gap-3">
      <SearchField value={query} onChange={setQuery} placeholder={t("search")} cancelLabel={tc("cancel")} clearLabel={tc("close")} />
      <ListSection footer={custom ? t("otherFooter") : undefined}>
        {presets.map((l) => (
          <ListRow
            key={l.code}
            title={<span lang={l.code}>{l.native}</span>}
            subtitle={l.native !== l.english ? l.english : undefined}
            onClick={() => onChange({ kind: "preset", code: l.code })}
            trailing={<Tick on={on(l.code)} />}
          />
        ))}
        {showSaved && (
          <ListRow
            title={<span lang={saved.tag}>{saved.nativeName}</span>}
            subtitle={saved.nativeName !== saved.name ? saved.name : undefined}
            onClick={() => onChange({ kind: "preset", code: CUSTOM_LOCALE })}
            trailing={<Tick on={on(CUSTOM_LOCALE)} />}
          />
        )}
        <ListRow
          title={t("other")}
          onClick={() => onChange({ kind: "custom", name: custom?.name ?? query.trim() })}
          trailing={<Tick on={Boolean(custom)} />}
        />
        {custom && (
          <form
            className="list-row pl-4"
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit?.();
            }}
          >
            <input
              autoFocus
              value={custom.name}
              onChange={(e) => onChange({ kind: "custom", name: e.target.value })}
              placeholder={t("otherPlaceholder")}
              aria-label={t("otherPlaceholder")}
              maxLength={40}
              enterKeyHint="go"
              className="min-h-[52px] w-full bg-transparent pr-4 text-body outline-none placeholder:text-tertiary-label"
            />
          </form>
        )}
      </ListSection>
    </div>
  );
}

/** Language picker in a sheet: tapping a language switches right away; a typed one is translated first. */
export function LanguageSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("language");
  const tc = useTranslations("common");
  const locale = useLocale() as Locale;
  const apply = useApplyLanguage();
  const [choice, setChoice] = useState<LanguageChoice | null>(null);
  const [saved, setSaved] = useState<CustomLanguage | null>(null);
  const [translating, setTranslating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setChoice({ kind: "preset", code: locale });
    setError(null);
    getCustomLanguage().then(setSaved);
  }, [open, locale]);

  const run = async (c: LanguageChoice) => {
    if (c.kind === "custom" && !c.name.trim()) return;
    setError(null);
    if (c.kind === "custom") setTranslating(c.name.trim());
    try {
      await apply(c);
      onClose();
    } catch (err) {
      setError(t(languageErrorKey(err)));
    } finally {
      setTranslating(null);
    }
  };

  const isCustom = choice?.kind === "custom";

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("choose")}
      trailing={
        isCustom ? (
          <BarButton bold disabled={!choice.name.trim() || Boolean(translating)} onClick={() => run(choice)}>
            {t("translate")}
          </BarButton>
        ) : (
          <BarButton bold onClick={onClose}>
            {tc("done")}
          </BarButton>
        )
      }
    >
      {translating ? (
        <LoadingBlock text={t("translating", { language: translating })} />
      ) : (
        <div className="px-5 pb-8 pt-2">
          {error && (
            <p role="alert" className="pb-3 text-subheadline text-red-text">
              {error}
            </p>
          )}
          <LanguagePicker
            value={choice}
            saved={saved}
            onChange={(c) => {
              setChoice(c);
              if (c.kind === "preset") run(c);
            }}
            onSubmit={() => choice && run(choice)}
          />
        </div>
      )}
    </Sheet>
  );
}
