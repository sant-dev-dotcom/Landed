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

const item = "flex min-h-[44px] min-w-[60px] flex-col items-center gap-1 text-caption2";

export function TabBar() {
  const t = useTranslations("tabs");
  const ta = useTranslations("assistant");
  const pathname = usePathname();
  const { open } = useAssistant();

  return (
    <nav
      aria-label={t("label")}
      className="no-print bar-blur hairline-t fixed bottom-0 left-1/2 z-40 w-full max-w-app -translate-x-1/2 touch-none overscroll-none pb-safe"
    >
      <ul className="flex min-h-[50px] items-start justify-around pt-[10px]">
        {TABS.map(({ key, href, Icon, match }) => {
          const active = match.some((m) => pathname === m || pathname.startsWith(m + "/"));
          return (
            <li key={key}>
              <Link href={href} aria-current={active ? "page" : undefined} className={`${item} ${active ? "text-tint" : "text-secondary-label"}`}>
                <Icon size={24} />
                {t(key)}
              </Link>
            </li>
          );
        })}
        <li>
          {/* Ask Landed opens over whatever screen you're on. */}
          <button type="button" onClick={() => open()} aria-label={ta("title")} className={`${item} text-secondary-label`}>
            <MessageCircle size={24} strokeWidth={1.75} aria-hidden />
            {ta("tab")}
          </button>
        </li>
      </ul>
    </nav>
  );
}
