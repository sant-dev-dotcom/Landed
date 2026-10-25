"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";

interface NavBarProps {
  title: string;
  /** Root screens of a tab use a 38px title that collapses on scroll. */
  large?: boolean;
  back?: { href: string; label: string };
  leading?: ReactNode;
  /** Italic aside on the bar's leading edge above a large title (e.g. "Day 61 in Houston"). */
  eyebrow?: ReactNode;
  trailing?: ReactNode;
  /** Rendered under the large title (e.g. a search field). */
  children?: ReactNode;
}

export function NavBar({ title, large = false, back, leading, eyebrow, trailing, children }: NavBarProps) {
  const tc = useTranslations("common");
  // A long previous-screen title collapses to a generic "Back".
  const backLabel = back && back.label.length > 12 ? tc("back") : back?.label;
  const [scrolled, setScrolled] = useState(false);
  const [collapsed, setCollapsed] = useState(!large);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 2);
      if (large) setCollapsed(y > 44);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [large]);

  return (
    <>
      <header
        className={`no-print sticky top-0 z-30 pt-safe transition-[background-color,box-shadow] duration-200 ${
          scrolled ? "bar-blur hairline-b" : large ? "bg-transparent" : "bar-blur"
        }`}
      >
        <div className="relative flex min-h-[52px] items-center px-3 pt-2">
          <div className="z-10 flex min-w-0 flex-1 items-center">
            {back ? (
              <Link
                href={back.href}
                className="pressable flex min-h-[44px] min-w-[44px] items-center pr-2 text-body text-tint"
                aria-label={back.label}
              >
                <ChevronLeft size={26} strokeWidth={1.75} aria-hidden className="-ml-1 rtl:-scale-x-100" />
                <span className="max-w-[110px] truncate">{backLabel}</span>
              </Link>
            ) : eyebrow ? (
              <span
                className={`truncate px-2 text-note italic text-secondary-label transition-opacity duration-200 ${
                  collapsed ? "opacity-0" : "opacity-100"
                }`}
              >
                {eyebrow}
              </span>
            ) : (
              leading
            )}
          </div>
          <div
            className={`pointer-events-none absolute inset-x-[120px] truncate pt-2 text-center text-body font-medium transition-opacity duration-200 ${
              collapsed ? "opacity-100" : "opacity-0"
            }`}
            aria-hidden={large && !collapsed}
          >
            {title}
          </div>
          <div className="z-10 flex flex-1 items-center justify-end gap-1 pe-2">{trailing}</div>
        </div>
      </header>
      {large && (
        <div className="px-5 pb-2 pt-1.5">
          <h1 className="text-largeTitle">{title}</h1>
          {children}
        </div>
      )}
      {!large && <h1 className="sr-only">{title}</h1>}
      {!large && children}
    </>
  );
}

export function NavIconButton({
  label,
  onClick,
  href,
  children,
}: {
  label: string;
  onClick?: () => void;
  href?: string;
  children: ReactNode;
}) {
  const cls = "pressable flex h-11 min-w-[44px] items-center justify-center rounded-full px-2 text-tint";
  if (href)
    return (
      <Link href={href} className={cls} aria-label={label}>
        {children}
      </Link>
    );
  return (
    <button type="button" className={cls} aria-label={label} onClick={onClick}>
      {children}
    </button>
  );
}

/** 44px round avatar button: surface fill, warm hairline, the person's initial. */
export function AvatarButton({ label, href, children }: { label: string; href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="pressable flex h-11 w-11 items-center justify-center rounded-full border border-separator bg-cell text-body"
    >
      <span aria-hidden className="flex items-center justify-center">
        {children}
      </span>
    </Link>
  );
}
