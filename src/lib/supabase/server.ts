import "server-only";

import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { serverEnv } from "@/lib/env";

/**
 * Server-side Supabase client bound to the request's cookie jar.
 *
 * Use this inside Server Components, Server Actions and Route Handlers.
 * It reads & writes the Supabase auth cookies via `next/headers`, so
 * every render sees the fresh session.
 *
 * Never import this file from a Client Component — `server-only` will
 * blow the build if you try.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const env = serverEnv();
  const store = await cookies();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (toSet) => {
          // Server Components cannot mutate cookies; the proxy refreshes
          // the session on every request so ignoring a stray set here is
          // safe. In Server Actions / Route Handlers, mutation works.
          try {
            for (const { name, value, options } of toSet) {
              store.set(name, value, options as CookieOptions);
            }
          } catch {
            // Server Component — intentional no-op.
          }
        },
      },
    },
  );
}
