"use client";

import { useEffect, type ReactNode } from "react";
import { flush, startSync } from "@/lib/sync";
import { supabase } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/** Links this device to the signed-in account on load, and uploads pending saves before the page goes away. */
export function SyncProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    supabase()
      .auth.getUser()
      .then(({ data }) => data.user && startSync(data.user.id))
      .catch(() => {});
    const onHide = () => document.visibilityState === "hidden" && flush();
    const onOnline = () => flush();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("online", onOnline);
    };
  }, []);
  return <>{children}</>;
}
