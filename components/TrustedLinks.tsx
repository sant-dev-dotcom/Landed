"use client";

import { ExternalLink } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { baseUrl, domainOf, sourceType, type SourceType, type TrustedLink } from "@/lib/links";
import { intlTag } from "@/i18n/languages";
import { useOpenLink } from "./browser/InAppBrowser";
import { ButtonLink } from "./ios/Button";
import { ShieldIcon } from "./LampIcons";

/** "Official" (sage, .gov) or "Nonprofit" (lavender). */
export function SourceBadge({ type }: { type: SourceType }) {
  const t = useTranslations("checklist");
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border border-separator px-2 py-0.5 text-caption1 ${
        type === "official" ? "text-sage" : "text-lavender"
      }`}
    >
      {t(type)}
    </span>
  );
}

/** "Checked October 2026" from a YYYY-MM-DD date. */
export function useCheckedLabel() {
  const t = useTranslations("checklist");
  const locale = useLocale();
  return (iso?: string) => {
    if (!iso) return null;
    const [y, m] = iso.split("-").map(Number);
    const date = new Intl.DateTimeFormat(intlTag(locale), { month: "long", year: "numeric" }).format(new Date(y, m - 1, 1));
    return t("checked", { date });
  };
}

/** A trusted link as a list row: title, domain + badge, and when it was last checked. */
export function TrustedLinkRow({ link, title, summary }: { link: TrustedLink; title: string; summary?: string }) {
  const open = useOpenLink();
  const checked = useCheckedLabel();
  const url = baseUrl(link.url);
  const type = sourceType(url);
  if (!type) return null; // never show a link that isn't on the allowlist
  return (
    <button
      type="button"
      onClick={() => open(url, { localized: link.url, summary })}
      className="list-row flex w-full items-start gap-3 px-4 py-[14px] text-start transition-colors duration-200 active:bg-fill"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-body text-tint">{title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-2 text-footnote text-secondary-label">
          {domainOf(url)}
          <SourceBadge type={type} />
        </span>
        {link.lastVerified && <span className="mt-1 block text-caption1 text-secondary-label">{checked(link.lastVerified)}</span>}
      </span>
      <ExternalLink size={16} strokeWidth={1.75} className="mt-1 shrink-0 text-tertiary-label" aria-hidden />
    </button>
  );
}

/** A compact link chip: domain + badge (used under "How to Do It" steps and chat answers). */
export function LinkChip({ url, title, localized, summary }: { url: string; title?: string; localized?: TrustedLink["url"]; summary?: string }) {
  const open = useOpenLink();
  const type = sourceType(url);
  if (!type) return null;
  return (
    <button
      type="button"
      onClick={() => open(url, { localized, summary })}
      className="pressable inline-flex min-h-[36px] max-w-full items-center gap-2 rounded-full border border-separator px-3 text-footnote text-tint"
    >
      <span className="truncate">{title || domainOf(url)}</span>
      <SourceBadge type={type} />
    </button>
  );
}

/** The "Talk to free legal help" card for anything that depends on immigration status. */
export function LegalHelpCard() {
  const t = useTranslations("legalHelpCard");
  return (
    <div className="flex flex-col gap-3 rounded-status bg-indigo-tint p-5">
      <div className="flex items-center gap-3">
        <ShieldIcon size={22} detail className="shrink-0 text-lavender" />
        <p className="text-headline">{t("title")}</p>
      </div>
      <p className="text-body text-label-soft">{t("body")}</p>
      <ButtonLink href="/legal/help" size="medium" className="self-start">
        {t("button")}
      </ButtonLink>
    </div>
  );
}
