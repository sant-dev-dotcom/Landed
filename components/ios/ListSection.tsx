import type { ReactNode } from "react";

interface ListSectionProps {
  header?: ReactNode;
  headerTrailing?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  /** Render children without the rounded surface card (e.g. horizontal card rows). */
  bare?: boolean;
  id?: string;
}

/** A titled group: 20px medium heading, then a surface card with hairline-split rows. */
export function ListSection({ header, headerTrailing, footer, children, bare, id }: ListSectionProps) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      {(header || headerTrailing) && (
        <div className="flex items-baseline justify-between gap-2">
          {header && (
            <h2 id={headingId} className="text-title3">
              {header}
            </h2>
          )}
          {headerTrailing}
        </div>
      )}
      {bare ? children : <div className="list-section overflow-hidden rounded-cell bg-cell">{children}</div>}
      {footer && <div className="-mt-1 px-1 text-footnote text-secondary-label">{footer}</div>}
    </section>
  );
}
