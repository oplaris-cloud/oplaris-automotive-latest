import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { serverEnv } from "@/lib/env";

/**
 * Refresh helper used by `src/proxy.ts`. Creates a short-lived Supabase
 * server client bound to the incoming request + mutable response, so the
 * `@supabase/ssr` library can rotate expired refresh tokens and set fresh
 * auth cookies back on the response headers.
 *
 * We return BOTH the user and the response because the proxy uses the
 * user to gate routes, and must return the same response instance so the
 * cookies it set actually reach the browser.
 */
export async function refreshSupabaseSession(request: NextRequest) {
  // Start from a passthrough response. Anything Supabase adds to its
  // cookies will be copied over.
  let response = NextResponse.next({ request });

  const env = serverEnv();
  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          // Copy the cookies onto both the incoming request (so the next
          // getAll sees them) and a freshly-cloned response, per the
          // official @supabase/ssr Next.js recipe.
          for (const { name, value } of toSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of toSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { user, response };
}
