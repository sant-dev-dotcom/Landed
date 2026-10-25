"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";

export interface AlertAction {
  label: string;
  onPress: () => void;
  style?: "default" | "cancel" | "destructive";
}

interface AlertProps {
  open: boolean;
  onClose: () => void;
  title: string;
  message?: string;
  actions: AlertAction[];
}

/** iOS-style alert. Two actions sit side by side; three or more stack. Cancel is always offered by callers. */
export function Alert({ open, onClose, title, message, actions }: AlertProps) {
  const stacked = actions.length > 2;
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-[60] bg-black/60"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount role="alertdialog">
              <motion.div
                className="fixed left-1/2 top-1/2 z-[60] w-[min(300px,calc(100vw-48px))] overflow-hidden rounded-cell border border-separator bg-cell text-center outline-none"
                style={{ x: "-50%", y: "-50%" }}
                initial={{ opacity: 0, scale: 1.15 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
              >
                <div className="px-5 pb-5 pt-6">
                  <Dialog.Title className="text-headline font-medium">{title}</Dialog.Title>
                  {message ? (
                    <Dialog.Description className="mt-2 text-subheadline text-label-soft">{message}</Dialog.Description>
                  ) : (
                    <Dialog.Description className="sr-only">{title}</Dialog.Description>
                  )}
                </div>
                <div className={`hairline-t flex ${stacked ? "flex-col" : "flex-row"}`}>
                  {actions.map((a, i) => (
                    <button
                      key={a.label}
                      type="button"
                      onClick={a.onPress}
                      className={`min-h-[52px] flex-1 px-2 text-body active:bg-fill ${
                        a.style === "destructive" ? "text-red-text" : "text-tint"
                      } ${a.style === "cancel" ? "font-medium" : ""} ${
                        i > 0 ? (stacked ? "hairline-t" : "border-s border-separator") : ""
                      }`}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
