"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Link } from "@/i18n/routing";
import { useOpenLink } from "../browser/InAppBrowser";

type Variant = "filled" | "tinted" | "plain" | "destructive" | "gray";
type Size = "large" | "medium" | "small";

// Lamplight: the primary action is sage with dark text; the secondary is a hairline outline.
const variants: Record<Variant, string> = {
  filled: "bg-tint-fill text-on-accent font-medium",
  tinted: "border border-separator bg-transparent text-label",
  plain: "bg-transparent text-tint font-medium",
  destructive: "bg-red-tint text-red-text font-medium",
  gray: "bg-cell text-label",
};

const sizes: Record<Size, string> = {
  // 52px tall, 16px corners, 18px label
  large: "min-h-[52px] w-full rounded-button px-7 text-[1.125rem] leading-tight",
  // 44px tall, 14px corners, 16px label
  medium: "min-h-[44px] rounded-control px-5 text-callout",
  small: "min-h-[44px] rounded-control px-4 text-callout",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
}

export function buttonClass(variant: Variant = "filled", size: Size = "large", extra = "") {
  return [
    "pressable inline-flex items-center justify-center gap-2 text-center",
    "disabled:opacity-40 disabled:cursor-not-allowed",
    variants[variant],
    sizes[size],
    variant === "plain" && size !== "large" ? "px-2" : "",
    extra,
  ].join(" ");
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "filled", size = "large", icon, className = "", children, type = "button", ...rest },
  ref
) {
  return (
    <button ref={ref} type={type} className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
    </button>
  );
});

export function ButtonLink({
  href,
  variant = "filled",
  size = "large",
  icon,
  className = "",
  children,
  external,
  ...rest
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
  external?: boolean;
  "aria-label"?: string;
}) {
  const cls = buttonClass(variant, size, className);
  const openLink = useOpenLink();
  if (/^(tel:|mailto:)/.test(href)) {
    return (
      <a href={href} className={cls} {...rest}>
        {icon}
        {children}
      </a>
    );
  }
  if (external || /^https?:/.test(href)) {
    // Every external page opens in the in-app browser.
    return (
      <button type="button" onClick={() => openLink(href)} className={cls} {...rest}>
        {icon}
        {children}
      </button>
    );
  }
  return (
    <Link href={href} className={cls} {...rest}>
      {icon}
      {children}
    </Link>
  );
}
