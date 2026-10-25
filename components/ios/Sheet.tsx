"use client";

import { useEffect, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useDragControls, useReducedMotion, type PanInfo } from "framer-motion";

export type Detent = "medium" | "large";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  detent?: Detent;
  leading?: ReactNode; // e.g. Cancel
  trailing?: ReactNode; // e.g. Done / Share
  children: ReactNode;
}

const EASE = [0.32, 0.72, 0, 1] as const;

/** iOS bottom sheet: grabber, medium/large detents, dimmed backdrop, swipe down to dismiss. */
export function Sheet({ open, onClose, title, detent = "large", leading, trailing, children }: SheetProps) {
  const reduce = useReducedMotion();
  const controls = useDragControls();
  const [current, setCurrent] = useState<Detent>(detent);

  useEffect(() => {
    if (open) setCurrent(detent);
  }, [open, detent]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) {
      if (current === "large" && detent === "medium") setCurrent("medium");
      else onClose();
    } else if (info.offset.y < -60 && current === "medium") {
      setCurrent("large");
    }
  };

  const height = current === "large" ? "calc(100dvh - env(safe-area-inset-top) - 12px)" : "min(60dvh, 560px)";

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-black/60"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: EASE }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                className="fixed bottom-0 left-1/2 z-50 flex w-full max-w-app flex-col overflow-hidden rounded-t-sheet border-x border-t border-separator bg-grouped outline-none"
                style={{ x: "-50%", height }}
                initial={reduce ? { opacity: 0 } : { y: "100%" }}
                animate={reduce ? { opacity: 1 } : { y: 0, height }}
                exit={reduce ? { opacity: 0 } : { y: "100%" }}
                transition={{ duration: 0.38, ease: EASE }}
                drag={reduce ? false : "y"}
                dragControls={controls}
                dragListener={false}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0.05, bottom: 0.6 }}
                onDragEnd={onDragEnd}
              >
                <div
                  className="shrink-0 cursor-grab touch-none select-none"
                  onPointerDown={(e) => controls.start(e)}
                >
                  <div className="flex justify-center pt-[5px]">
                    <span className="h-[5px] w-9 rounded-full bg-tertiary-label" aria-hidden />
                  </div>
                  <div className="relative flex min-h-[44px] items-center px-2">
                    <div className="z-10 flex flex-1 items-center">{leading}</div>
                    <Dialog.Title className="pointer-events-none absolute inset-x-24 truncate text-center text-body font-medium">
                      {title}
                    </Dialog.Title>
                    <div className="z-10 flex flex-1 items-center justify-end gap-1">{trailing}</div>
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-safe">{children}</div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

/** Text button for sheet / nav bar corners. */
export function BarButton({
  children,
  onClick,
  bold,
  disabled,
  ariaLabel,
}: {
  children: ReactNode;
  onClick?: () => void;
  bold?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`pressable flex min-h-[44px] min-w-[44px] items-center justify-center px-2 text-body text-tint disabled:opacity-40 ${
        bold ? "font-medium" : ""
      }`}
    >
      {children}
    </button>
  );
}
