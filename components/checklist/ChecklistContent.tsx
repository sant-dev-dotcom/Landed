"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { ListSection } from "@/components/ios/ListSection";
import { ProgressBar } from "@/components/ios/ProgressBar";
import { RowChevron } from "@/components/LampIcons";
import { HowToSteps } from "@/components/checklist/HowToSteps";
import { AskLandedButton } from "@/components/assistant/Assistant";
import { itemsFor, SECTIONS, type ChecklistItem, type ChecklistState } from "@/lib/checklist";
import { useChecklist, useProfile } from "@/lib/hooks";
import { setItemDone } from "@/lib/storage";
import type { Profile } from "@/lib/types";

export function ChecklistContent() {
  const t = useTranslations("checklist");
  const [profile] = useProfile();
  const [state] = useChecklist();
  const items = itemsFor(profile);
  const done = items.filter((i) => state[i.id]?.done).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <h2 className="text-title2">{t("title")}</h2>
        <div className="flex flex-col gap-2">
          <p className="text-subheadline text-secondary-label">{t("progress", { done, total: items.length })}</p>
          <ProgressBar value={items.length ? done / items.length : 0} label={t("progress", { done, total: items.length })} />
        </div>
        <AskLandedButton />
      </div>

      {SECTIONS.map((section) => {
        const list = items.filter((i) => i.section === section);
        if (!list.length) return null;
        return (
          <ListSection key={section} id={`section-${section}`} header={t(`sections.${section}`)}>
            {list.map((item) => (
              <ChecklistRow key={item.id} item={item} state={state} profile={profile} />
            ))}
          </ListSection>
        );
      })}
    </div>
  );
}

function ChecklistRow({ item, state, profile }: { item: ChecklistItem; state: ChecklistState; profile: Profile | null }) {
  const t = useTranslations("checklist");
  const ti = useTranslations("checklist.items");
  const [open, setOpen] = useState(false);
  const done = Boolean(state[item.id]?.done);
  const title = ti(`${item.id}.title`);
  const panelId = `howto-${item.id}`;

  return (
    <div className="list-row px-4 py-[14px]">
      <div className="flex items-start gap-3.5">
        <button
          type="button"
          onClick={() => setItemDone(item.id, !done)}
          aria-label={done ? t("markItemNotDone", { title }) : t("markItemDone", { title })}
          aria-pressed={done}
          className="-m-[11px] flex h-11 w-11 shrink-0 items-center justify-center"
        >
          <span className="lamp-check" data-checked={done} aria-hidden />
        </button>
        <Link href={`/legal/checklist/${item.id}`} className="flex min-w-0 flex-1 items-start gap-2">
          <span className="min-w-0 flex-1">
            <span className={`block text-body ${done ? "text-secondary-label line-through" : ""}`}>{title}</span>
            {!done && <span className="mt-0.5 block text-subheadline text-secondary-label">{ti(`${item.id}.short`)}</span>}
          </span>
          <RowChevron />
        </Link>
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="pressable ms-9 mt-1 flex min-h-[40px] items-center gap-1 text-callout text-tint"
      >
        {t("howToToggle")}
        <ChevronDown size={18} strokeWidth={1.75} className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <div id={panelId} className="ms-9 pb-1 pt-2">
          <HowToSteps item={item} profile={profile} />
        </div>
      )}
    </div>
  );
}
