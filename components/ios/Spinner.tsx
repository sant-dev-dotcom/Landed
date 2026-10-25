/** iOS activity indicator (8 fading spokes). */
export function Spinner({ size = 20, label }: { size?: number; label?: string }) {
  return (
    <span role="status" aria-label={label} className="inline-flex text-secondary-label">
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        style={{ animation: "ios-spin 0.9s steps(8) infinite" }}
        aria-hidden
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <rect
            key={i}
            x="11"
            y="1.5"
            width="2.2"
            height="6"
            rx="1.1"
            fill="currentColor"
            opacity={0.2 + (i / 8) * 0.8}
            transform={`rotate(${i * 45} 12 12)`}
          />
        ))}
      </svg>
    </span>
  );
}

/** Centered spinner with calm, specific loading copy. */
export function LoadingBlock({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center" aria-live="polite">
      <Spinner size={28} />
      <p className="text-subheadline text-secondary-label">{text}</p>
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="list-row flex items-center gap-3.5 py-[14px] pl-4 pr-4" aria-hidden>
      <span className="h-[26px] w-[26px] animate-pulse rounded-full bg-fill" />
      <span className="flex-1 space-y-2">
        <span className="block h-3.5 w-2/3 animate-pulse rounded bg-fill" />
        <span className="block h-3 w-1/3 animate-pulse rounded bg-fill" />
      </span>
    </div>
  );
}
