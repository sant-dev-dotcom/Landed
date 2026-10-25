"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

let client: SupabaseClient | null = null;

/** The browser's Supabase client. The session is kept in cookies so the middleware can read it. */
export const supabase = () => (client ??= createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY));
