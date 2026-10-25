"use client";

import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { Link } from "@/i18n/routing";
import { RowChevron } from "../LampIcons";
import { useOpenLink } from "../browser/InAppBrowser";

interface ListRowProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Leading line icon, drawn in `iconColor` (sage, oat, clay, lavender…). */
  icon?: ReactNode;
  iconColor?: string; // CSS color, e.g. "var(--system-blue)"
  leading?: ReactNode; // custom leading element (checkbox, date badge, avatar)
  value?: ReactNode;
  trailing?: ReactNode;
  href?: string;
  external?: boolean;
  onClick?: () => void;
  chevron?: boolean;
  disabled?: boolean;
  destructive?: boolean;
  tint?: boolean;
  ariaLabel?: string;
  multilineTitle?: boolean;
  /** Pin the leading element to the first line instead of centering it. */
  leadingTop?: boolean;
}

/** Lamplight icons are bare 1.75-stroke line drawings in a meaning color, never filled squares. */
export function IconSquare({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span
      className="flex h-[26px] w-[26px] shrink-0 items-center justify-center [&>svg]:h-[22px] [&>svg]:w-[22px] [&>svg]:[stroke-width:1.75]"
      style={{ color }}
      aria-hidden
    >
      {children}
    </span>
  );
}

export function ListRow({
  title,
  subtitle,
  icon,
  iconColor,
  leading,
  value,
  trailing,
  href,
  external,
  onClick,
  chevron,
  disabled,
  destructive,
  tint,
  ariaLabel,
  multilineTitle = true,
  leadingTop,
}: ListRowProps) {
  const openLink = useOpenLink();
  const interactive = Boolean(href || onClick) && !disabled;
  const showChevron = chevron ?? (Boolean(href) && !external);
  const lead = leading ?? (icon ? <IconSquare color={iconColor ?? "var(--muted)"}>{icon}</IconSquare> : null);

  const content = (
    <>
      {lead && <span className={`flex shrink-0 ${leadingTop ? "items-start pt-[14px]" : "items-center"}`}>{lead}</span>}
      <span className="row-body relative flex min-h-[52px] min-w-0 flex-1 items-center gap-3 py-[14px] pr-4">
        <span className="min-w-0 flex-1 text-start">
          <span
            className={`block text-body ${multilineTitle ? "" : "truncate"} ${
              destructive ? "text-red-text" : tint ? "text-tint" : disabled ? "text-secondary-label" : ""
            }`}
          >
            {title}
          </span>
          {subtitle && <span className="mt-0.5 block text-subheadline text-secondary-label">{subtitle}</span>}
        </span>
        {value && <span className="shrink-0 text-body text-secondary-label">{value}</span>}
        {trailing}
        {showChevron && <RowChevron />}
        {external && <ExternalLink size={16} strokeWidth={1.75} className="shrink-0 text-tertiary-label" aria-hidden />}
      </span>
    </>
  );

  const base = `list-row relative flex w-full items-stretch gap-3.5 pl-4 ${
    interactive ? "transition-colors duration-200 active:bg-fill" : ""
  } ${disabled ? "cursor-default" : ""}`;

  if (href && !disabled) {
    if (external) {
      // Every external page opens in the in-app browser.
      return (
        <button type="button" onClick={() => openLink(href)} className={base} aria-label={ariaLabel}>
          {content}
        </button>
      );
    }
    return (
      <Link href={href} className={base} aria-label={ariaLabel}>
        {content}
      </Link>
    );
  }
  if (onClick && !disabled) {
    return (
      <button type="button" onClick={onClick} className={base} aria-label={ariaLabel}>
        {content}
      </button>
    );
  }
  return (
    <div className={base} aria-disabled={disabled || undefined} aria-label={ariaLabel}>
      {content}
    </div>
  );
}
