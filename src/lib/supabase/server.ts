import "server-only";

import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { serverEnv } from "@/lib/env";
import { readImpersonationCookie } from "@/lib/auth/super-admin-cookie";

/**
 * Server-side Supabase client bound to the request's cookie jar.
 *
 * Use this inside Server Components, Server Actions and Route Handlers.
 * It reads & writes the Supabase auth cookies via `next/headers`, so
 * every render sees the fresh session.
 *
 * B6.1 — When a verified `oplaris_impersonate` cookie is present, the
 * client adds an `X-Oplaris-Impersonate` header to every PostgREST
 * request. `private.current_garage()` honours that header ONLY when
 * the JWT also carries `is_super_admin=true`, so the header is inert
 * for regular staff.
 *
 * Never import this file from a Client Component — `server-only` will
 * blow the build if you try.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const env = serverEnv();
  const store = await cookies();
  const impersonation = await readImpersonationCookie();

  const globalHeaders: Record<string, string> = {};
  if (impersonation) {
    globalHeaders["x-oplaris-impersonate"] = impersonation.garageId;
  }

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (toSet) => {
          try {
            for (const { name, value, options } of toSet) {
              store.set(name, value, options as CookieOptions);
            }
          } catch {
            // Server Component — intentional no-op.
          }
        },
      },
      global: { headers: globalHeaders },
    },
  );
}
