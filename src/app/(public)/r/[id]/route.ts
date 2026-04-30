import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * P2.1 — public short-link redirect.
 *
 * `/r/<6-char-id>` looks up the row in `public.short_links` (admin
 * client; no user JWT on this surface), refuses to redirect past
 * `expires_at`, and 302s to the stored `target_url` otherwise. A
 * tampered or unknown id returns 404 (not a redirect to "/" or any
 * silent-success state — visitors should know the link is dead).
 *
 * Anonymous traffic is rate-limited at the proxy / TLS layer; this
 * handler does not add its own bucket because the input space is
 * 56^6 ≈ 30.8 B ids and the table grows only as the manager hands
 * out approval requests. Enumeration cost vs return is unattractive.
 */

const SHORT_ID_RE = /^[A-Za-z0-9]{6}$/;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  if (!SHORT_ID_RE.test(id)) {
    return new NextResponse(null, { status: 404 });
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("short_links")
    .select("target_url, expires_at, used_count")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    return new NextResponse(null, { status: 404 });
  }

  if (new Date(data.expires_at) < new Date()) {
    // Static expired page — same response for "expired" + "exhausted"
    // so an attacker can't distinguish reasons for failure.
    return NextResponse.redirect(new URL("/r/expired", request.url), {
      status: 302,
    });
  }

  // Bump the counter inline. Tried `void` first — Next.js terminates
  // the route handler context as soon as the redirect response is
  // returned, so the unawaited promise was dropped before the UPDATE
  // landed (verified empirically on dev — used_count stuck at 0). One
  // extra round-trip vs a stale counter; reliability wins.
  await supabase
    .from("short_links")
    .update({
      used_count: data.used_count + 1,
      last_used_at: new Date().toISOString(),
    })
    .eq("id", id);

  return NextResponse.redirect(data.target_url, { status: 302 });
}
