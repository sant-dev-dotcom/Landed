import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { CUSTOM_LOCALE, isLocale, isRtl } from "@/i18n/languages";
import { ToastProvider } from "@/components/ios/Toast";
import { CustomLocaleProvider } from "@/components/CustomLocaleProvider";
import { BrowserProvider } from "@/components/browser/InAppBrowser";
import { AssistantProvider } from "@/components/assistant/Assistant";
import "../globals.css";

export const metadata: Metadata = {
  title: "Landed",
  description: "Understand your documents, track important dates, and find trusted help in your first year in the US.",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Landed" },
  icons: { icon: "/pwa-icon/192", apple: "/pwa-icon/180" },
  other: { "mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#131211",
  colorScheme: "dark",
};

const inter = Inter({
  subsets: ["latin", "latin-ext", "cyrillic", "cyrillic-ext", "greek", "vietnamese"],
  style: ["normal", "italic"],
  variable: "--font-inter",
  display: "swap",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();

  const app = (
    <ToastProvider>
      {/* Every external link opens in the in-app browser; Ask Landed is available on every screen. */}
      <BrowserProvider>
        <AssistantProvider>
          {/* Phone-width column; centered on larger screens over the grouped background. */}
          <div className="relative mx-auto min-h-dvh w-full max-w-app bg-grouped md:shadow-[0_0_0_1px_var(--separator)]">
            {children}
          </div>
        </AssistantProvider>
      </BrowserProvider>
    </ToastProvider>
  );

  return (
    <html lang={locale} dir={isRtl(locale) ? "rtl" : "ltr"} className={inter.variable}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {locale === CUSTOM_LOCALE ? <CustomLocaleProvider english={messages}>{app}</CustomLocaleProvider> : app}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
