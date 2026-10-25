"use client";

import { useRef, useState } from "react";
import { Search, XCircle } from "lucide-react";

interface SearchFieldProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: (v: string) => void;
  placeholder: string;
  cancelLabel: string;
  clearLabel?: string;
}

export function SearchField({ value, onChange, onSubmit, placeholder, cancelLabel, clearLabel = "Clear" }: SearchFieldProps) {
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  return (
    <form
      role="search"
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.(value);
        ref.current?.blur();
      }}
    >
      <label className="flex min-h-[44px] flex-1 items-center gap-2 rounded-control border border-separator bg-cell px-3">
        <Search size={18} strokeWidth={1.75} className="shrink-0 text-secondary-label" aria-hidden />
        <input
          ref={ref}
          type="search"
          enterKeyHint="search"
          value={value}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          className="min-h-[42px] min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-secondary-label [&::-webkit-search-cancel-button]:hidden"
        />
        {value && (
          <button
            type="button"
            aria-label={clearLabel}
            onClick={() => {
              onChange("");
              ref.current?.focus();
            }}
            className="-mr-1 flex h-9 w-9 items-center justify-center text-secondary-label"
          >
            <XCircle size={18} strokeWidth={2} fill="currentColor" className="text-tertiary-label [&>*:not(circle)]:stroke-[var(--surface)]" />
          </button>
        )}
      </label>
      {focused && (
        <button
          type="button"
          className="pressable min-h-[44px] text-body text-tint"
          onClick={() => {
            onChange("");
            onSubmit?.("");
            ref.current?.blur();
          }}
        >
          {cancelLabel}
        </button>
      )}
    </form>
  );
}
