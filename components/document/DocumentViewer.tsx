"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { OpenDocument } from "@/lib/documentSession";

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/**
 * The covered copy of the document, with the words that weren't covered laid over it as
 * invisible, selectable text (like a PDF's text layer). Pinch or use − / + to zoom; drag to move
 * around a zoomed page. `onPick` gets the selected text ("" when nothing is selected).
 */
export function DocumentViewer({ doc, onPick }: { doc: OpenDocument; onPick: (text: string) => void }) {
  const t = useTranslations("document");
  const page = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  // Rendered width / image width, so each word's text is sized to its box on screen.
  const [scale, setScale] = useState(0);
  const [zoom, setZoom] = useState(1);
  // Two-finger pinch: the fingers' starting distance and zoom.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);

  useEffect(() => {
    const el = page.current;
    if (!el) return;
    const measure = () => setScale(el.clientWidth / doc.width);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc.width]);

  useEffect(() => {
    const onChange = () => {
      const sel = document.getSelection();
      const inside = sel && !sel.isCollapsed && sel.anchorNode && layer.current?.contains(sel.anchorNode);
      onPick(inside ? sel.toString().replace(/\s+/g, " ").trim().slice(0, 1500) : "");
    };
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, [onPick]);

  const distance = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const down = (e: ReactPointerEvent) => {
    if (e.pointerType !== "touch") return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) pinch.current = { distance: distance(), zoom };
  };
  const move = (e: ReactPointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) setZoom(clampZoom((pinch.current.zoom * distance()) / pinch.current.distance));
  };
  const up = (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  const hasText = doc.lines.some((l) => l.some(Boolean));

  return (
    <div className="relative flex h-full flex-col">
      {/* Scrolls both ways once zoomed. Pinch is handled here, so the browser only pans. */}
      <div
        className="min-h-0 flex-1 overflow-auto px-4 pb-4 pt-3"
        style={{ touchAction: "pan-x pan-y" }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <div
          ref={page}
          className="relative select-none overflow-hidden rounded-tile border border-separator bg-white shadow-[0_6px_18px_rgba(0,0,0,0.35)]"
          style={{ width: `${zoom * 100}%` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={doc.image} alt={t("imageAlt", { kind: doc.result.documentKind })} className="block h-auto w-full" draggable={false} />
          {scale > 0 && (
            <div ref={layer} className="doc-text absolute inset-0 select-text" aria-label={t("textLayer")}>
              {doc.lines.map((line, li) =>
                line.map((w, wi) =>
                  w ? (
                    <span
                      key={`${li}-${wi}`}
                      className="absolute whitespace-pre leading-none text-transparent"
                      style={{
                        left: pct(w.box.x0, doc.width),
                        top: pct(w.box.y0, doc.height),
                        width: pct(w.box.x1 - w.box.x0, doc.width),
                        height: pct(w.box.y1 - w.box.y0, doc.height),
                        fontSize: `${Math.max(4, (w.box.y1 - w.box.y0) * scale * 0.9)}px`,
                      }}
                    >
                      {/* The space keeps words apart when a selection is copied. */}
                      {w.text + (wi === line.length - 1 ? "\n" : " ")}
                    </span>
                  ) : null
                )
              )}
            </div>
          )}
        </div>
        <p className="mt-3 px-1 text-footnote text-secondary-label">{hasText ? t("highlightHint") : t("noTextLayer")}</p>
      </div>

      <div className="absolute right-6 top-5 flex items-center gap-1 rounded-full border border-separator bg-cell/90 p-1 shadow-[0_4px_12px_rgba(0,0,0,0.35)] backdrop-blur">
        <button
          type="button"
          onClick={() => setZoom((z) => clampZoom(Math.round((z - 0.5) * 2) / 2))}
          disabled={zoom <= MIN_ZOOM}
          aria-label={t("zoomOut")}
          className="pressable flex h-9 w-9 items-center justify-center rounded-full text-label disabled:opacity-30"
        >
          <Minus size={18} strokeWidth={2} aria-hidden />
        </button>
        <span className="min-w-[3ch] text-center text-footnote tabular-nums text-secondary-label" aria-live="polite">
          {t("zoomLevel", { percent: Math.round(zoom * 100) })}
        </span>
        <button
          type="button"
          onClick={() => setZoom((z) => clampZoom(Math.round((z + 0.5) * 2) / 2))}
          disabled={zoom >= MAX_ZOOM}
          aria-label={t("zoomIn")}
          className="pressable flex h-9 w-9 items-center justify-center rounded-full text-label disabled:opacity-30"
        >
          <Plus size={18} strokeWidth={2} aria-hidden />
        </button>
      </div>
    </div>
  );
}
