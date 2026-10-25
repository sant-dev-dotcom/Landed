// Line icons from the Lamplight reference screens: 24-unit grid, 1.75 stroke, round caps.

interface IconProps {
  size?: number;
  className?: string;
  /** Explore tiles add a detail line (a check on the shield, a band across the case). */
  detail?: boolean;
}

const base = (size: number, className?: string) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className,
  "aria-hidden": true,
});

export function HomeIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" />
    </svg>
  );
}

export function ShieldIcon({ size = 24, className, detail }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z" />
      {detail && <path d="M9 12l2 2 4-4" />}
    </svg>
  );
}

export function PeopleIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M3 20c0-3 3-5 6-5s6 2 6 5M15 15c3 0 6 1.5 6 4.5" />
    </svg>
  );
}

export function CaseIcon({ size = 24, className, detail }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d={detail ? "M9 7V5h6v2M3 13h18" : "M9 7V5h6v2"} />
    </svg>
  );
}

export function ClockIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function WarningIcon({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M12 3l10 18H2z" />
      <path d="M12 10v5M12 18h0" />
    </svg>
  );
}

/** The "›" chevron used on tappable rows. */
export function RowChevron() {
  return (
    <span className="inline-block shrink-0 text-body text-tertiary-label rtl:-scale-x-100" aria-hidden>
      ›
    </span>
  );
}
