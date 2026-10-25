"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Wraps a screen's content with iOS-like entry motion: pushed screens slide in
 * from the right, root screens fade. Reduced motion always fades.
 */
export function Screen({
  children,
  push = false,
  plain = false,
  withTabBar = true,
}: {
  children: ReactNode;
  push?: boolean;
  plain?: boolean;
  withTabBar?: boolean;
}) {
  const reduce = useReducedMotion();
  const initial = reduce || !push ? { opacity: 0 } : { x: "30%", opacity: 0 };
  return (
    <motion.main
      initial={initial}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: push && !reduce ? 0.35 : 0.2, ease: [0.32, 0.72, 0, 1] }}
      className={`min-h-dvh ${plain ? "bg-bg" : "bg-grouped"} ${
        withTabBar ? "pb-[calc(var(--tab-bar-space)+16px)]" : ""
      }`}
    >
      {children}
    </motion.main>
  );
}
