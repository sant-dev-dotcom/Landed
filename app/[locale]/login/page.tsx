"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ios/Button";
import { ListSection } from "@/components/ios/ListSection";
import { Screen } from "@/components/ios/Screen";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { supabase } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { startSync } from "@/lib/sync";

const PASSWORD_MIN = 8;

// Supabase error codes we have our own words for; anything else shows the generic error.
const ERROR_KEYS: Record<string, string> = {
  invalid_credentials: "invalidCredentials",
  user_already_exists: "emailTaken",
  email_exists: "emailTaken",
  email_not_confirmed: "notConfirmed",
  weak_password: "weakPassword",
  over_request_rate_limit: "rateLimited",
  over_email_send_rate_limit: "rateLimited",
  email_address_invalid: "badEmail",
};

function LoginForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const params = useSearchParams();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error") === "link" ? t("errors.badLink") : null);
  const [checkEmail, setCheckEmail] = useState(false);

  const next = params.get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : null;

  const enter = async (userId: string) => {
    // Bring the account's saved answers and data onto this device, then open the app in
    // their language. A full page load, so the middleware sees the new session cookie.
    // Someone who already has a profile never goes back through onboarding: "Get started"
    // on the landing page sends signed-out people here with next=/<locale>/onboarding, and
    // finishing it again would overwrite their saved answers and plan.
    const profile = await startSync(userId).catch(() => null);
    const toOnboarding = safeNext?.split(/[?#]/)[0].split("/")[2] === "onboarding";
    const target = profile
      ? (safeNext && !toOnboarding ? safeNext : `/${profile.locale}/home`)
      : `/${locale}/onboarding`;
    window.location.replace(target);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (mode === "signup" && password.length < PASSWORD_MIN) {
      setError(t("errors.weakPassword", { min: PASSWORD_MIN }));
      return;
    }
    setBusy(true);
    try {
      if (mode === "signin") {
        const { data, error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        await enter(data.user.id);
      } else {
        const { data, error } = await supabase().auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(safeNext ?? `/${locale}/onboarding`)}`,
          },
        });
        if (error) throw error;
        // With email confirmation on (Supabase's default) there's no session until the link is opened.
        if (data.session && data.user) await enter(data.user.id);
        else setCheckEmail(true);
      }
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      setError(t(`errors.${ERROR_KEYS[code] ?? "generic"}`, { min: PASSWORD_MIN }));
    } finally {
      setBusy(false);
    }
  };

  const switchMode = () => {
    setMode((m) => (m === "signin" ? "signup" : "signin"));
    setError(null);
  };

  if (checkEmail) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-largeTitle">{t("checkEmailTitle")}</h1>
        <p className="text-body text-label-soft">{t("checkEmailBody", { email: email.trim() })}</p>
        <Button variant="tinted" onClick={() => (setCheckEmail(false), setMode("signin"))}>
          {t("backToSignIn")}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-7" noValidate>
      <div>
        <p className="text-note italic text-secondary-label">Landed</p>
        <h1 className="mt-2 text-largeTitle">{mode === "signin" ? t("signInTitle") : t("signUpTitle")}</h1>
        <p className="mt-3 text-body text-label-soft">{mode === "signin" ? t("signInIntro") : t("signUpIntro")}</p>
      </div>

      {!isSupabaseConfigured() && <p className="text-subheadline text-red-text">{t("notConfigured")}</p>}

      <ListSection footer={mode === "signup" ? t("passwordHint", { min: PASSWORD_MIN }) : undefined}>
        <label className="list-row flex pl-4">
          <span className="row-body relative flex flex-1 flex-col pr-4 pt-2">
            <span className="text-footnote text-secondary-label">{t("email")}</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              required
              maxLength={254}
              className="min-h-[44px] bg-transparent text-body outline-none placeholder:text-tertiary-label"
            />
            <span className="row-sep absolute bottom-0 left-0 right-0 h-[0.5px] bg-separator" aria-hidden />
          </span>
        </label>
        <label className="list-row flex pl-4">
          <span className="row-body relative flex flex-1 flex-col pr-4 pt-2">
            <span className="text-footnote text-secondary-label">{t("password")}</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
              maxLength={200}
              className="min-h-[44px] bg-transparent text-body outline-none placeholder:text-tertiary-label"
            />
          </span>
        </label>
      </ListSection>

      {error && (
        <p role="alert" className="text-center text-subheadline text-red-text">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2.5">
        <Button type="submit" disabled={busy || !email.trim() || !password}>
          {mode === "signin" ? t("signIn") : t("signUp")}
        </Button>
        <Button variant="plain" onClick={switchMode}>
          {mode === "signin" ? t("noAccount") : t("haveAccount")}
        </Button>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Screen plain withTabBar={false}>
      <div className="pt-safe">
        <div className="flex min-h-[60px] items-center justify-end px-5 pt-2">
          <LanguageSwitcher />
        </div>
        <div className="px-5 pb-10 pt-4">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </Screen>
  );
}
