import type { ReactNode } from "react";

/** Page body: 20px side margins, 28px between sections. */
export function GroupedList({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-col gap-7 px-5 pb-8 pt-2 ${className}`}>{children}</div>;
}
