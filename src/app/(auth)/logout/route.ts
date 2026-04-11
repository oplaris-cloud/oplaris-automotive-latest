import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * POST /logout — ends the staff session.
 *
 * We use a POST Route Handler (not a GET link) so browsers and
 * prefetching middleware can't accidentally log users out, and so the
 * form submission is CSRF-safe by default in Next.js (Server Actions +
 * route handlers share the same cookie-origin checks when hit from the
 * same origin).
 *
 * `supabase.auth.signOut()` revokes the refresh token server-side and
 * removes the cookies from the response.
 */
export async function POST(_request: NextRequest): Promise<NextResponse> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  // Absolute URL required for NextResponse.redirect()
  return NextResponse.redirect(new URL("/login", _request.url), { status: 303 });
}
