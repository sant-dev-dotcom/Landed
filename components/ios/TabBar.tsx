"use client";

import { MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/routing";
import { CaseIcon, HomeIcon, PeopleIcon, ShieldIcon } from "../LampIcons";
import { useAssistant } from "../assistant/Assistant";

const TABS = [
  { key: "home", href: "/home", Icon: HomeIcon, match: ["/home", "/settings"] },
  { key: "legal", href: "/legal", Icon: ShieldIcon, match: ["/legal"] },
  { key: "community", href: "/social", Icon: PeopleIcon, match: ["/social"] },
  { key: "jobs", href: "/jobs", Icon: CaseIcon, match: ["/jobs"] },
] as const;

// Each tab is its own pill; the current one is filled sage.
const item = "pressable flex min-h-[52px] w-full flex-col items-center justify-center gap-0.5 rounded-full px-1 text-caption2 transition-colors duration-200";

/** A floating pill above the bottom of the screen (its height is --tab-bar-space in globals.css). */
export function TabBar() {
  const t = useTranslations("tabs");
  const ta = useTranslations("assistant");
  const pathname = usePathname();
  const { open } = useAssistant();

  return (
    <nav
      aria-label={t("label")}
      className="no-print pointer-events-none fixed bottom-0 left-1/2 z-40 w-full max-w-app -translate-x-1/2 px-3 pb-[calc(env(safe-area-inset-bottom)+12px)]"
    >
      <ul className="bar-blur pointer-events-auto flex touch-none items-center gap-1 overscroll-none rounded-full border border-separator p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
        {TABS.map(({ key, href, Icon, match }) => {
          const active = match.some((m) => pathname === m || pathname.startsWith(m + "/"));
          return (
            <li key={key} className="min-w-0 flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`${item} ${active ? "bg-tint-fill font-medium text-on-accent" : "text-secondary-label active:bg-fill"}`}
              >
                <Icon size={22} />
                {t(key)}
              </Link>
            </li>
          );
        })}
        <li className="min-w-0 flex-1">
          {/* Ask Landed opens over whatever screen you're on. */}
          <button type="button" onClick={() => open()} aria-label={ta("title")} className={`${item} text-secondary-label active:bg-fill`}>
            <MessageCircle size={22} strokeWidth={1.75} aria-hidden />
            {ta("tab")}
          </button>
        </li>
      </ul>
    </nav>
  );
}
