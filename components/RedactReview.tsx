"use client";

import { useRef, useState } from "react";
import { EyeOff, Undo2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { intlTag } from "@/i18n/languages";
import type { Box, RedactKind } from "@/lib/redactRules";
import type { RedactionScan } from "@/lib/redact";
import { Button } from "./ios/Button";

interface Bar {
  id: number;
  box: Box;
  kind?: RedactKind;
}

/**
 * "Check before sending": the photo with black bars over private details. Drag across the
 * image to cover something else; tap a bar to uncover it. Only the covered copy is sent.
 */
export function RedactReview({
  image,
  scan,
  onSend,
  onCancel,
}: {
  image: string;
  scan: RedactionScan;
  onSend: (boxes: Box[]) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("scan");
  const locale = useLocale();
  const [bars, setBars] = useState<Bar[]>(() => scan.findings.map((f, i) => ({ id: i, box: f.box, kind: f.kind })));
  const [history, setHistory] = useState<Bar[][]>([]);
  const [draft, setDraft] = useState<Box | null>(null);
  const area = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; bar?: number; moved: boolean } | null>(null);

  const change = (next: Bar[]) => {
    setHistory((h) => [...h, bars]);
    setBars(next);
  };

  // Screen point → image pixels.
  const toImage = (clientX: number, clientY: number) => {
    const r = area.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(scan.width, ((clientX - r.left) / r.width) * scan.width)),
      y: Math.max(0, Math.min(scan.height, ((clientY - r.top) / r.height) * scan.height)),
    };
  };
  const rect = (a: { x: number; y: number }, b: { x: number; y: number }): Box => ({
    x0: Math.min(a.x, b.x),
    y0: Math.min(a.y, b.y),
    x1: Math.max(a.x, b.x),
    y1: Math.max(a.y, b.y),
  });
  const pct = (b: Box) => ({
    left: `${(b.x0 / scan.width) * 100}%`,
    top: `${(b.y0 / scan.height) * 100}%`,
    width: `${((b.x1 - b.x0) / scan.width) * 100}%`,
    height: `${((b.y1 - b.y0) / scan.height) * 100}%`,
  });

  const kinds = [...new Set(bars.map((b) => b.kind).filter((k): k is RedactKind => Boolean(k)))];
  const kindList = new Intl.ListFormat(intlTag(locale), { type: "conjunction" }).format(kinds.map((k) => t(`kind_${k}`)));

  return (
    <div className="flex flex-col gap-5 px-5 pb-8 pt-2">
      <div className="flex flex-col gap-2">
        <h2 className="flex items-center gap-2 text-title3">
          <EyeOff size={20} strokeWidth={1.75} className="text-sage" aria-hidden />
          {t("reviewTitle")}
        </h2>
        <p className="text-body text-label-soft">{t("reviewIntro")}</p>
        <p className="text-subheadline text-secondary-label" aria-live="polite">
          {!scan.ocrOk ? t("ocrFailed") : t("foundCount", { count: bars.filter((b) => b.kind).length, kinds: kindList })}
        </p>
      </div>

      <div
        ref={area}
        className="relative w-full touch-none select-none overflow-hidden rounded-tile border border-separator"
        onPointerDown={(e) => {
          const p = toImage(e.clientX, e.clientY);
          const target = (e.target as HTMLElement).closest<HTMLElement>("[data-bar]");
          drag.current = { ...p, bar: target ? Number(target.dataset.bar) : undefined, moved: false };
          area.current!.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const p = toImage(e.clientX, e.clientY);
          if (Math.abs(p.x - drag.current.x) + Math.abs(p.y - drag.current.y) > 6) drag.current.moved = true;
          if (drag.current.moved) setDraft(rect(drag.current, p));
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          setDraft(null);
          if (!d) return;
          if (!d.moved) {
            // A tap on a bar uncovers it.
            if (d.bar !== undefined) change(bars.filter((b) => b.id !== d.bar));
            return;
          }
          const box = rect(d, toImage(e.clientX, e.clientY));
          if (box.x1 - box.x0 > 8 && box.y1 - box.y0 > 6) change([...bars, { id: Date.now(), box }]);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDraft(null);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt={t("reviewImageAlt")} className="block w-full" draggable={false} />
        {bars.map((b) => (
          <button
            key={b.id}
            type="button"
            data-bar={b.id}
            aria-label={t("uncover")}
            className="absolute bg-black"
            style={pct(b.box)}
          />
        ))}
        {draft && <span className="pointer-events-none absolute bg-black/70 ring-2 ring-sage" style={pct(draft)} aria-hidden />}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-footnote text-secondary-label">{t("reviewHelp")}</p>
        <button
          type="button"
          disabled={!history.length}
          onClick={() => {
            setBars(history[history.length - 1]);
            setHistory((h) => h.slice(0, -1));
          }}
          className="pressable flex min-h-[44px] shrink-0 items-center gap-1.5 px-2 text-callout text-tint disabled:opacity-40"
        >
          <Undo2 size={17} strokeWidth={1.75} aria-hidden />
          {t("undo")}
        </button>
      </div>

      <div className="flex flex-col gap-2.5">
        <Button onClick={() => onSend(bars.map((b) => b.box))}>{t("sendCovered")}</Button>
        <Button variant="tinted" onClick={onCancel}>
          {t("cancelScan")}
        </Button>
      </div>
    </div>
  );
}
