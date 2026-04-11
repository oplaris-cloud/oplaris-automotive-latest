"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { publicEnv } from "@/lib/env.public";

/**
 * Browser-side Supabase client. Only used from Client Components that
 * genuinely need realtime subscriptions or interactive queries (e.g. the
 * bay board later on). Every mutation of any kind should still go
 * through a Server Action, because only the server can trust role and
 * garage claims.
 *
 * A singleton is fine here — the cookie store is shared across the
 * whole page and `createBrowserClient` is cheap to call anyway.
 */
let cached: SupabaseClient | undefined;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (cached) return cached;
  cached = createBrowserClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  return cached;
}
