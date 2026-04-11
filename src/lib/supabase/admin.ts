import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { serverEnv } from "@/lib/env";

/**
 * Service-role Supabase client. **Bypasses RLS** — use with extreme care
 * and never outside a Server Action, Route Handler or admin script.
 *
 * Justified use cases:
 *   - `scripts/seed-dev-users.ts` — create auth users for local dev
 *   - `/api/kiosk/booking`, `/api/online/booking` — write bookings with
 *     garage_id resolved from subdomain, not trusted input
 *   - `/api/status/*` — public status page using private schema
 *   - `/api/approvals/[token]` — single-use token flows
 *
 * Anything else should use `createSupabaseServerClient()` + RLS.
 */
export function createSupabaseAdminClient(): SupabaseClient {
  const env = serverEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
