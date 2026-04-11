import { NextResponse, type NextRequest } from "next/server";

import { refreshSupabaseSession } from "@/lib/supabase/proxy-client";

/**
 * Next.js 16 edge proxy (was `middleware.ts` pre-16). Runs before every
 * matched request. Responsibilities:
 *
 *   1. Refresh the Supabase session cookies (rotates expiring tokens).
 *   2. Gate `/app/*` behind authentication — unauthenticated users are
 *      bounced to `/login?next=<path>`.
 *   3. Leave public surfaces (`/`, `/login`, `/status`, `/kiosk`,
 *      `/api/twilio/*`, `/api/status/*`, `/api/approvals/*`,
 *      `/api/kiosk/*`, `/api/online/*`) untouched — they either have
 *      their own auth or are intentionally unauthenticated.
 *
 * Role enforcement lives one level deeper, inside Server Actions /
 * layouts, via `requireRole()`. The proxy is a coarse guard; fine-grained
 * authorisation lives next to the code that reads or writes the data.
 */

const AUTH_PAGE = "/login";

// Regex — paths that require an authenticated staff session.
const REQUIRES_AUTH = /^\/app(\/.*)?$/;

// Regex — paths that bypass the session refresh entirely (static assets).
// The matcher config already excludes most of these, but being explicit
// keeps it safe if matcher ever drifts.
const BYPASS = /^\/_next\/|^\/favicon\.ico$|^\/.*\.(svg|png|jpg|jpeg|gif|webp|woff2?)$/i;

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname, searchParams } = request.nextUrl;

  if (BYPASS.test(pathname)) {
    return NextResponse.next({ request });
  }

  const { user, response } = await refreshSupabaseSession(request);

  if (REQUIRES_AUTH.test(pathname) && !user) {
    const url = request.nextUrl.clone();
    url.pathname = AUTH_PAGE;
    url.searchParams.set("next", pathname + (searchParams.size ? `?${searchParams}` : ""));
    return NextResponse.redirect(url);
  }

  // If a logged-in user hits /login, bounce them back into the app.
  if (user && pathname === AUTH_PAGE) {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Run on every request except static assets + Next internals.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)",
  ],
};
