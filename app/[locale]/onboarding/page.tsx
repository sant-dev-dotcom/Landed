"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronLeft } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ios/Button";
import { ListSection } from "@/components/ios/ListSection";
import { ListRow } from "@/components/ios/ListRow";
import { ProgressBar } from "@/components/ios/ProgressBar";
import { Toggle } from "@/components/ios/Toggle";
import { LoadingBlock } from "@/components/ios/Spinner";
import { LanguagePicker, languageErrorKey } from "@/components/LanguagePicker";
import { DEMO_PERSONA, languagesFor, postJSON } from "@/lib/client";
import { useApplyLanguage, type LanguageChoice } from "@/lib/language";
import { getCustomLanguage, savePlan, saveProfile, type CustomLanguage } from "@/lib/storage";
import type { Locale, PlanStep, Profile } from "@/lib/types";

const COUNTRIES = ["Venezuela", "Mexico", "Honduras", "Guatemala", "El Salvador", "Cuba", "Colombia", "India", "Vietnam", "Nigeria", "Ukraine", "Afghanistan"];
const CITIES = ["Houston, TX", "Dallas, TX", "Austin, TX", "Miami, FL", "Phoenix, AZ", "New York, NY"];
const TIMES = [0, 3, 9, 18];
const HARD = ["paperwork", "money", "work", "people", "english", "housing", "health"] as const;
const TOTAL = 6;

export default function OnboardingPage() {
  return (
    <Suspense>
      <Onboarding />
    </Suspense>
  );
}

function Onboarding() {
  const t = useTranslations("onboarding");
  const tc = useTranslations("common");
  const tl = useTranslations("language");
  const tcountry = useTranslations("countries");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const params = useSearchParams();
  const reduce = useReducedMotion();
  const isDemo = params.get("demo") === "1";

  const [step, setStep] = useState(() => Math.min(TOTAL, Math.max(1, Number(params.get("step")) || 1)));
  const [dir, setDir] = useState(1);
  const applyLanguage = useApplyLanguage();
  const [lang, setLang] = useState<LanguageChoice>({ kind: "preset", code: locale });
  const [savedLanguage, setSavedLanguage] = useState<CustomLanguage | null>(null);
  const [translating, setTranslating] = useState<string | null>(null);
  const [langError, setLangError] = useState<ReturnType<typeof languageErrorKey> | null>(null);
  const [country, setCountry] = useState("");
  const [otherCountry, setOtherCountry] = useState("");
  const [city, setCity] = useState("");
  const [otherCity, setOtherCity] = useState("");
  const [months, setMonths] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [kids, setKids] = useState(false);
  const [work, setWork] = useState("");
  const [hard, setHard] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    getCustomLanguage().then(setSavedLanguage);
  }, []);

  useEffect(() => {
    if (!isDemo) return;
    setCountry(DEMO_PERSONA.originCountry);
    setCity(DEMO_PERSONA.city);
    setMonths(DEMO_PERSONA.monthsInUS);
    setName(DEMO_PERSONA.name!);
    setWork(locale === "es" ? "Enfermera registrada" : DEMO_PERSONA.workBackground!);
    setHard(["paperwork", "work", "english"]);
    setStep(TOTAL);
  }, [isDemo, locale]);

  const go = (n: number) => {
    setDir(n > step ? 1 : -1);
    setStep(n);
    window.scrollTo(0, 0);
  };

  const finalCountry = country === "__other" ? otherCountry.trim() : country;
  const finalCity = city === "__other" ? otherCity.trim() : city;

  const canContinue =
    (step === 1 && (lang.kind === "preset" || Boolean(lang.name.trim()))) ||
    (step === 2 && Boolean(finalCountry)) ||
    (step === 3 && Boolean(finalCity)) ||
    (step === 4 && months !== null) ||
    step === 5 ||
    step === 6;

  const next = async () => {
    if (step === 1 && !(lang.kind === "preset" && lang.code === locale)) {
      // Switch the UI language (translating it first if it was typed in), then continue on step 2.
      setLangError(null);
      if (lang.kind === "custom") setTranslating(lang.name.trim());
      try {
        if (await applyLanguage(lang, "/onboarding?step=2")) return;
      } catch (err) {
        setLangError(languageErrorKey(err));
        return;
      } finally {
        setTranslating(null);
      }
    }
    if (step < TOTAL) go(step + 1);
    else finish();
  };

  const finish = async () => {
    setBusy(true);
    setError(false);
    const profile: Profile = {
      locale,
      name: name.trim() || undefined,
      originCountry: finalCountry || "Unknown",
      languages: languagesFor(finalCountry, locale),
      city: finalCity || "Houston, TX",
      monthsInUS: months ?? 0,
      hasChildren: kids,
      workBackground: work.trim() || undefined,
      biggestChallenge: hard.length ? hard.map((h) => t(`hard_${h}`)).join(", ") : undefined,
      createdAt: new Date().toISOString(),
    };
    try {
      await saveProfile(profile);
      const { steps } = await postJSON<{ steps: PlanStep[] }>("/api/plan", profile);
      await savePlan(steps);
      router.replace("/home");
    } catch {
      setError(true);
      setBusy(false);
    }
  };

  const optional = step === 5 || step === 6;
  const title = [t("langTitle"), t("countryTitle"), t("cityTitle"), t("timeTitle"), t("aboutTitle"), t("hardTitle")][step - 1];

  const Check_ = ({ on }: { on: boolean }) =>
    on ? <Check size={20} strokeWidth={2} className="shrink-0 text-tint" aria-hidden /> : null;

  if (busy || translating) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-grouped">
        <LoadingBlock text={translating ? tl("translating", { language: translating }) : t("making")} />
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-grouped pb-[calc(96px+env(safe-area-inset-bottom))]">
      <header className="bar-blur sticky top-0 z-30 pt-safe">
        <div className="flex min-h-[44px] items-center justify-between px-2">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => go(step - 1)}
              className="pressable flex min-h-[44px] min-w-[44px] items-center text-body text-tint"
              aria-label={tc("back")}
            >
              <ChevronLeft size={28} strokeWidth={2.25} aria-hidden className="rtl:-scale-x-100" />
              {tc("back")}
            </button>
          ) : (
            <span className="min-w-[44px]" />
          )}
          <span className="text-footnote text-secondary-label">{t("progress", { current: step, total: TOTAL })}</span>
          {optional ? (
            <button
              type="button"
              onClick={() => (step < TOTAL ? go(step + 1) : finish())}
              className="pressable min-h-[44px] min-w-[44px] px-2 text-body text-tint"
            >
              {tc("skip")}
            </button>
          ) : (
            <span className="min-w-[44px]" />
          )}
        </div>
        <div className="px-5 pb-2">
          <ProgressBar value={step / TOTAL} label={t("progress", { current: step, total: TOTAL })} />
        </div>
      </header>

      <AnimatePresence mode="wait" initial={false} custom={dir}>
        <motion.div
          key={step}
          custom={dir}
          initial={reduce ? { opacity: 0 } : { x: dir * 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { x: dir * -40, opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
        >
          <h1 className="px-5 pb-5 pt-5 text-title1">{title}</h1>
          {isDemo && step === TOTAL && <p className="px-5 pb-5 text-note italic text-secondary-label">{t("demoNote")}</p>}

          <div className="flex flex-col gap-7 px-5">
            {step === 1 && (
              <div>
                {langError && (
                  <p role="alert" className="pb-3 text-subheadline text-red-text">
                    {tl(langError)}
                  </p>
                )}
                <LanguagePicker value={lang} onChange={setLang} onSubmit={() => canContinue && next()} saved={savedLanguage} />
              </div>
            )}

            {step === 2 && (
              <ListSection>
                {COUNTRIES.map((c) => (
                  <ListRow key={c} title={tcountry(c)} onClick={() => setCountry(c)} trailing={<Check_ on={country === c} />} />
                ))}
                <ListRow title={t("countryOther")} onClick={() => setCountry("__other")} trailing={<Check_ on={country === "__other"} />} />
                {country === "__other" && (
                  <div className="list-row pl-4">
                    <input
                      autoFocus
                      value={otherCountry}
                      onChange={(e) => setOtherCountry(e.target.value)}
                      placeholder={t("countryPlaceholder")}
                      aria-label={t("countryPlaceholder")}
                      maxLength={60}
                      className="min-h-[52px] w-full bg-transparent pr-4 text-body outline-none placeholder:text-tertiary-label"
                    />
                  </div>
                )}
              </ListSection>
            )}

            {step === 3 && (
              <ListSection>
                {CITIES.map((c) => (
                  <ListRow key={c} title={c} onClick={() => setCity(c)} trailing={<Check_ on={city === c} />} />
                ))}
                <div className="list-row pl-4">
                  <input
                    value={otherCity}
                    onFocus={() => setCity("__other")}
                    onChange={(e) => {
                      setCity("__other");
                      setOtherCity(e.target.value);
                    }}
                    placeholder={t("cityPlaceholder")}
                    aria-label={t("cityPlaceholder")}
                    maxLength={60}
                    className="min-h-[52px] w-full bg-transparent pr-4 text-body outline-none placeholder:text-tertiary-label"
                  />
                </div>
              </ListSection>
            )}

            {step === 4 && (
              <ListSection>
                {TIMES.map((m, i) => (
                  <ListRow key={m} title={t(`time${i}`)} onClick={() => setMonths(m)} trailing={<Check_ on={months === m} />} />
                ))}
              </ListSection>
            )}

            {step === 5 && (
              <ListSection footer={t("aboutFooter")}>
                <label className="list-row flex pl-4">
                  <span className="row-body relative flex flex-1 flex-col pr-4 pt-2">
                    <span className="text-footnote text-secondary-label">{t("nameLabel")}</span>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={t("namePlaceholder")}
                      maxLength={40}
                      autoComplete="given-name"
                      className="min-h-[44px] bg-transparent text-body outline-none placeholder:text-tertiary-label"
                    />
                    <span className="row-sep absolute bottom-0 left-0 right-0 h-[0.5px] bg-separator" aria-hidden />
                  </span>
                </label>
                <ListRow title={t("kidsLabel")} trailing={<Toggle checked={kids} onChange={setKids} label={t("kidsLabel")} />} />
                <label className="list-row flex pl-4">
                  <span className="row-body relative flex flex-1 flex-col pr-4 pt-2">
                    <span className="text-footnote text-secondary-label">{t("workLabel")}</span>
                    <input
                      value={work}
                      onChange={(e) => setWork(e.target.value)}
                      placeholder={t("workPlaceholder")}
                      maxLength={80}
                      className="min-h-[44px] bg-transparent text-body outline-none placeholder:text-tertiary-label"
                    />
                  </span>
                </label>
              </ListSection>
            )}

            {step === 6 && (
              <div>
                <div className="flex flex-wrap gap-2" role="group" aria-label={t("hardTitle")}>
                  {HARD.map((h) => {
                    const on = hard.includes(h);
                    return (
                      <button
                        key={h}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setHard((s) => (on ? s.filter((x) => x !== h) : [...s, h]))}
                        className={`pressable flex min-h-[44px] items-center gap-1.5 rounded-full border px-4 text-body ${
                          on ? "border-transparent bg-tint-fill font-medium text-on-accent" : "border-separator bg-cell"
                        }`}
                      >
                        {on && <Check size={16} strokeWidth={2} aria-hidden />}
                        {t(`hard_${h}`)}
                      </button>
                    );
                  })}
                </div>
                <p className="px-1 pt-4 text-footnote text-secondary-label">{t("hardFooter")}</p>
              </div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      <div className="bar-blur hairline-t fixed bottom-0 left-1/2 z-20 w-full max-w-app -translate-x-1/2 px-5 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3">
        {error && <p className="pb-2 text-center text-subheadline text-red-text">{tc("error")}</p>}
        <Button onClick={next} disabled={!canContinue}>
          {step === TOTAL ? t("finish") : tc("continue")}
        </Button>
      </div>
    </main>
  );
}
