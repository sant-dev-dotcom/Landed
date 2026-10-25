"use client";

import * as Switch from "@radix-ui/react-switch";

/** Switch, 51×31: sage track when on, warm hairline track when off. Wrapped in a 44px hit area. */
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <Switch.Root
      checked={checked}
      onCheckedChange={onChange}
      aria-label={label}
      className="group relative flex h-11 w-[51px] shrink-0 items-center"
    >
      <span
        className={`absolute inset-x-0 top-1/2 h-[31px] -translate-y-1/2 rounded-full transition-colors duration-200 ${
          checked ? "bg-tint-fill" : "bg-separator"
        }`}
        aria-hidden
      />
      <Switch.Thumb className="relative ml-[2px] block h-[27px] w-[27px] rounded-full bg-paper shadow-[0_2px_6px_rgba(0,0,0,0.35)] transition-transform duration-200 ease-ios data-[state=checked]:translate-x-[20px]" />
    </Switch.Root>
  );
}
