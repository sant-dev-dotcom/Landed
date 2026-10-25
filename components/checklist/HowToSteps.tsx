"use client";

import { useTranslations } from "next-intl";
import { baseUrl } from "@/lib/links";
import { linksFor, type ChecklistItem } from "@/lib/checklist";
import type { Profile } from "@/lib/types";
import { LinkChip } from "../TrustedLinks";

/** The numbered "How to Do It" steps, each with its own trusted link when it has one. */
export function HowToSteps({ item, profile }: { item: ChecklistItem; profile: Profile | null }) {
  const t = useTranslations("checklist.items");
  return (
    <ol className="flex flex-col gap-3.5">
      {item.howTo.map((step, i) => {
        const text = t(`${item.id}.steps.s${i + 1}`);
        const link = step.link && linksFor([step.link], profile)[0];
        return (
          <li key={i} className="flex gap-3">
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-separator text-caption1 text-secondary-label"
              aria-hidden
            >
              {i + 1}
            </span>
            <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
              <p className="text-body text-label-soft">{text}</p>
              {link && <LinkChip url={baseUrl(link.url)} localized={link.url} summary={text} />}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
