/**
 * B5.4 — Global spotlight (Cmd+K) fanout endpoint.
 *
 * Manager-only. Uses the user-session Supabase client so RLS keeps
 * results inside the caller's garage. Empty / whitespace-only query
 * collapses to an empty group payload (no DB hits).
 */
import { NextResponse } from "next/server";

import { requireManager } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EMPTY_GROUPS, searchSpotlight } from "@/lib/spotlight/search";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // requireManager() throws redirect on missing session — the
  // spotlight modal only renders inside the AppShell so this is a
  // belt-and-braces gate, not the primary defence.
  await requireManager();

  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";

  if (!q || q.trim().length === 0) {
    return NextResponse.json({ groups: EMPTY_GROUPS });
  }

  const supabase = await createSupabaseServerClient();
  const groups = await searchSpotlight(supabase, q);
  return NextResponse.json({ groups });
}
