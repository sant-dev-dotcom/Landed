"use client";

import { useId } from "react";
import { motion } from "framer-motion";

interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}

/** Surface track with a hairline; the chosen segment is sage. */
export function SegmentedControl<T extends string>({ options, value, onChange, label }: SegmentedControlProps<T>) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-control border border-separator bg-cell p-[3px]">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className="relative min-h-[40px] flex-1 px-2 text-callout"
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-[11px] bg-tint-fill"
                transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
              />
            )}
            <span className={`relative ${active ? "font-medium text-on-accent" : "text-secondary-label"}`}>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
