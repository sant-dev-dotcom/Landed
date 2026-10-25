"use client";

import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { Button, ButtonLink } from "@/components/ios/Button";
import { ListSection } from "@/components/ios/ListSection";
import { Screen } from "@/components/ios/Screen";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { getProfile } from "@/lib/storage";

export default function Landing() {
  const t = useTranslations("landing");
  const locale = useLocale();
  const router = useRouter();
  const [hasProfile, setHasProfile] = useState(false);

  useEffect(() => {
    getProfile().then((p) => setHasProfile(Boolean(p)));
  }, []);

  const stats = [1, 2, 3] as const;

  return (
    <Screen plain withTabBar={false}>
      <div className="pt-safe">
        <div className="flex min-h-[60px] items-center justify-end px-5 pt-2">
          <LanguageSwitcher />
        </div>
        <div className="px-5 pb-[calc(170px+env(safe-area-inset-bottom))]">
          <p className="mt-4 text-note italic text-secondary-label">Landed</p>
          <h1 className="mt-2 text-largeTitle">{t("hero")}</h1>
          <p className="mt-4 text-headline text-label-soft">{t("sub")}</p>

          <div className="mt-10">
            <ListSection id="why" header={t("whyTitle")} footer={t("statsFooter")} bare>
              <p className="text-body text-label-soft">{t("whyIntro")}</p>
              <div className="flex flex-col gap-2.5">
                {stats.map((i) => (
                  <div key={i} className="flex items-start gap-4 rounded-card bg-cell p-[18px]">
                    <span className="min-w-[4.5rem] text-title1 text-tint">{t(`stat${i}Value`)}</span>
                    <p className="text-subheadline text-label-soft">{t(`stat${i}`)}</p>
                  </div>
                ))}
              </div>
            </ListSection>
          </div>

          <blockquote className="mt-10 text-[1.5rem] italic leading-snug text-label-soft">“{t("pitch")}”</blockquote>

          <div className="mt-10">
            <ListSection header={t("privacyTitle")} bare>
              <div className="flex gap-3.5 rounded-card bg-cell p-[18px]">
                <Lock size={22} strokeWidth={1.75} className="mt-0.5 shrink-0 text-sage" aria-hidden />
                <p className="text-body text-label-soft">{t("privacy")}</p>
              </div>
            </ListSection>
          </div>
        </div>
      </div>

      {/* Primary action pinned above the safe area */}
      <div className="bar-blur hairline-t fixed bottom-0 left-1/2 z-20 w-full max-w-app -translate-x-1/2 space-y-2.5 px-5 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3">
        {hasProfile ? (
          <ButtonLink href="/home">{t("continueToHome")}</ButtonLink>
        ) : (
          <ButtonLink href="/onboarding">{t("getStarted")}</ButtonLink>
        )}
        <Button variant="tinted" onClick={() => router.push(`/onboarding?demo=1`)} lang={locale}>
          {t("demoPersona")}
        </Button>
      </div>
    </Screen>
  );
}
