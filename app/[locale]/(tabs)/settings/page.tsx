"use client";

import { useState } from "react";
import { Bell, Globe, Info, MapPin, RotateCcw, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { CUSTOM_LOCALE } from "@/i18n/languages";
import { NavBar } from "@/components/ios/NavBar";
import { GroupedList } from "@/components/ios/GroupedList";
import { ListSection } from "@/components/ios/ListSection";
import { ListRow } from "@/components/ios/ListRow";
import { Screen } from "@/components/ios/Screen";
import { Toggle } from "@/components/ios/Toggle";
import { Alert } from "@/components/ios/Alert";
import { useToast } from "@/components/ios/Toast";
import { LanguageSheet, useCurrentLanguageName } from "@/components/LanguagePicker";
import { useProfile, useSettings } from "@/lib/hooks";
import { clearAllData, saveSettings } from "@/lib/storage";
import type { Locale } from "@/lib/types";

export default function SettingsPage() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const th = useTranslations("home");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const toast = useToast();
  const languageName = useCurrentLanguageName();
  const [profile] = useProfile();
  const [settings] = useSettings();
  const [confirm, setConfirm] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [denied, setDenied] = useState(false);

  const setNotifications = async (on: boolean) => {
    if (on && typeof Notification !== "undefined" && Notification.permission !== "granted") {
      const p = await Notification.requestPermission().catch(() => "denied" as NotificationPermission);
      if (p !== "granted") {
        setDenied(true);
        return;
      }
    }
    setDenied(false);
    await saveSettings({ ...settings, notifications: on });
  };

  return (
    <Screen push>
      <NavBar title={t("title")} back={{ href: "/home", label: th("title") }} />
      <GroupedList className="pt-4">
        {profile && (
          <ListSection header={t("profile")}>
            <ListRow icon={<MapPin size={18} strokeWidth={2} />} iconColor="var(--muted)" title={t("city")} value={profile.city} />
            <ListRow
              href="/onboarding"
              icon={<RotateCcw size={18} strokeWidth={2} />}
              iconColor="var(--system-gray)"
              title={t("editProfile")}
            />
          </ListSection>
        )}

        <ListSection>
          <ListRow
            icon={<Globe size={18} strokeWidth={2} />}
            iconColor="var(--sage)"
            title={t("language")}
            value={languageName}
            chevron
            onClick={() => setLanguageOpen(true)}
          />
        </ListSection>

        <ListSection footer={denied ? t("notificationsDenied") : t("notificationsFooter")}>
          <ListRow
            icon={<Bell size={18} strokeWidth={2} />}
            iconColor="var(--oat)"
            title={t("notifications")}
            trailing={<Toggle checked={settings.notifications} onChange={setNotifications} label={t("notifications")} />}
          />
        </ListSection>

        <ListSection header={t("privacy")} footer={t("privacyFooter")}>
          <ListRow
            icon={<Trash2 size={18} strokeWidth={2} />}
            iconColor="var(--clay)"
            title={t("deleteData")}
            destructive
            onClick={() => setConfirm(true)}
          />
        </ListSection>

        <ListSection header={t("about")} footer={t("aboutFooter")}>
          <ListRow icon={<Info size={18} strokeWidth={2} />} iconColor="var(--system-gray)" title={t("version")} value="0.1.0" />
        </ListSection>
      </GroupedList>

      <Alert
        open={confirm}
        onClose={() => setConfirm(false)}
        title={t("deleteTitle")}
        message={t("deleteBody")}
        actions={[
          { label: tc("cancel"), style: "cancel", onPress: () => setConfirm(false) },
          {
            label: t("deleteConfirm"),
            style: "destructive",
            onPress: async () => {
              await clearAllData();
              try {
                sessionStorage.clear();
              } catch {
                /* ignore */
              }
              setConfirm(false);
              toast(t("deleted"));
              // A typed-in language's translation was just deleted with everything else.
              router.replace("/", locale === CUSTOM_LOCALE ? { locale: "en" } : undefined);
            },
          },
        ]}
      />
      <LanguageSheet open={languageOpen} onClose={() => setLanguageOpen(false)} />
    </Screen>
  );
}
