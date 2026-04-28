import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireManager } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const moveSchema = z.object({
  jobId: z.string().uuid(),
  bayId: z.string().uuid(),
});

/**
 * POST /api/bay-board/move — move a job to a different bay.
 * Manager-only. Used by the drag-and-drop bay board.
 *
 * P2.4 (2026-04-28) — every successful move now writes an audit_log
 * row (action='bay_assigned' on null→bay, 'bay_changed' on bay→bay).
 * The new `job_timeline_events.bay_change` kind picks them up so the
 * manager can see "Bay 2 → Bay 4" entries on the unified job feed.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  await requireManager();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = moveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  // Read the previous bay first so the audit-log entry can record
  // from→to. Two bays in two reads is cheap; a single UPDATE … RETURNING
  // would also work but supabase-js doesn't expose RETURNING for
  // arbitrary columns. Idempotency: if the new bay matches the old one,
  // skip both the UPDATE and the audit insert (no actual change).
  const { data: jobRow } = await supabase
    .from("jobs")
    .select("bay_id, garage_id")
    .eq("id", parsed.data.jobId)
    .maybeSingle();
  if (!jobRow) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  const fromBayId =
    (jobRow as { bay_id: string | null; garage_id: string }).bay_id ?? null;
  if (fromBayId === parsed.data.bayId) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  // Resolve names for both ends so the audit_log meta is human-friendly
  // when the manager reviews the timeline weeks later. RLS on `bays`
  // already filters cross-tenant.
  const ids = [parsed.data.bayId];
  if (fromBayId) ids.push(fromBayId);
  const { data: bayRows } = await supabase
    .from("bays")
    .select("id, name")
    .in("id", ids);
  const bayName = new Map<string, string>();
  for (const b of (bayRows ?? []) as { id: string; name: string }[]) {
    bayName.set(b.id, b.name);
  }

  const { error } = await supabase
    .from("jobs")
    .update({ bay_id: parsed.data.bayId })
    .eq("id", parsed.data.jobId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Best-effort audit-log write via the SECURITY DEFINER RPC (direct
  // INSERT on audit_log is service_role only — see migration 011).
  // A failed insert shouldn't roll back the move (the customer-facing
  // state is the bay_id on the row, not the audit trail) but we
  // surface the error in server logs so missing entries can be
  // reconciled later.
  const { error: auditErr } = await supabase.rpc("write_audit_log", {
    p_action: fromBayId ? "bay_changed" : "bay_assigned",
    p_target_table: "jobs",
    p_target_id: parsed.data.jobId,
    p_meta: {
      from_bay_id: fromBayId,
      from_bay_name: fromBayId ? bayName.get(fromBayId) ?? null : null,
      to_bay_id: parsed.data.bayId,
      to_bay_name: bayName.get(parsed.data.bayId) ?? null,
      source: "bay_board_drag",
    },
  });
  if (auditErr) {
    console.error(
      "[bay-board/move] write_audit_log failed:",
      auditErr.code,
      auditErr.message,
    );
  }

  return NextResponse.json({ ok: true });
}
