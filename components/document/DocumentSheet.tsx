"use client";

import { useRef, type ReactNode } from "react";
import { motion, useDragControls, useReducedMotion, type PanInfo } from "framer-motion";
import { useTranslations } from "next-intl";

export type SheetDetent = "peek" | "half" | "full";
const ORDER: SheetDetent[] = ["peek", "half", "full"];
const HEIGHT: Record<SheetDetent, string> = {
  peek: "calc(140px + env(safe-area-inset-bottom))",
  half: "55%",
  full: "calc(100% - 12px)",
};
const EASE = [0.32, 0.72, 0, 1] as const;

/**
 * A bottom sheet over the document that never blocks it (no backdrop): peek shows a summary,
 * half and full show `children`. Drag or tap the grabber to resize. `above` floats just over the
 * sheet's top edge and moves with it (the "Ask about this" pill).
 */
export function DocumentSheet({
  detent,
  onDetent,
  peek,
  header,
  above,
  children,
}: {
  detent: SheetDetent;
  onDetent: (d: SheetDetent) => void;
  peek: ReactNode;
  header: ReactNode;
  above?: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations("document");
  const reduce = useReducedMotion();
  const controls = useDragControls();
  const at = ORDER.indexOf(detent);
  // A drag ends with a click on the grabber too: skip that one.
  const dragged = useRef(false);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    dragged.current = true;
    // Up a step, or down a step; a fast flick goes all the way.
    if (info.velocity.y < -800 || info.offset.y < -60) onDetent(info.velocity.y < -1500 ? "full" : ORDER[Math.min(2, at + 1)]);
    else if (info.velocity.y > 800 || info.offset.y > 60) onDetent(info.velocity.y > 1500 ? "peek" : ORDER[Math.max(0, at - 1)]);
  };

  return (
    <motion.section
      aria-label={t("sheetLabel")}
      className="absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-sheet border-x border-t border-separator bg-grouped shadow-[0_-8px_28px_rgba(0,0,0,0.45)]"
      initial={false}
      animate={{ height: HEIGHT[detent] }}
      transition={{ duration: reduce ? 0 : 0.35, ease: EASE }}
      drag={reduce ? false : "y"}
      dragControls={controls}
      dragListener={false}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={0.15}
      onDragEnd={onDragEnd}
    >
      {above && <div className="pointer-events-none absolute inset-x-4 bottom-full mb-3 flex justify-center [&>*]:pointer-events-auto">{above}</div>}

      {/* Grabber: drag it, or tap to go up a step (from full, back to peek). */}
      <button
        type="button"
        className="flex shrink-0 cursor-grab touch-none justify-center pb-1 pt-2"
        onPointerDown={(e) => {
          dragged.current = false;
          controls.start(e);
        }}
        onClick={() => {
          if (dragged.current) {
            dragged.current = false;
            return;
          }
          onDetent(detent === "full" ? "peek" : ORDER[at + 1]);
        }}
        aria-label={detent === "full" ? t("sheetCollapse") : t("sheetExpand")}
        aria-expanded={detent !== "peek"}
      >
        <span className="h-[5px] w-9 rounded-full bg-tertiary-label" aria-hidden />
      </button>

      {detent === "peek" ? (
        <div className="min-h-0 flex-1 overflow-hidden px-4 pb-safe">{peek}</div>
      ) : (
        <>
          <div className="shrink-0 px-4 pb-2">{header}</div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-safe">{children}</div>
        </>
      )}
    </motion.section>
  );
}
