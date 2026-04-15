import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  CUSTOMER_KIND_COPY,
  firstNameOf,
  isCustomerVisibleKind,
  type CustomerFriendlyCopy,
} from "./customer-labels";

/**
 * P54 — Server-side fetch for the Job Activity feed.
 *
 * Reads from the `public.job_timeline_events` view (security_invoker = on
 * + the underlying tables' RLS) then shapes per-audience:
 *
 *   - staff    → full detail, first-name attribution (last names are
 *                internal staff privacy, not customer-facing). Managers
 *                who need full names can see them elsewhere.
 *   - customer → filtered to the curated kind subset + friendly labels.
 *                No enum values leak.
 *
 * Realtime stays in the client shim (`JobDetailRealtime` + a new
 * `JobActivityRealtime` shim for job_status_events). This function is
 * RSC-only; callers call it inside their `page.tsx`.
 */

export interface TimelineRow {
  eventId: string;
  kind: string;
  at: string;
  actorStaffId: string | null;
  actorFirstName: string | null;
  payload: Record<string, unknown>;
  /** Customer-ready copy. Populated only when `audience === 'customer'`. */
  customerCopy?: CustomerFriendlyCopy | null;
}

export interface FetchOptions {
  audience: "staff" | "customer";
  limit?: number;
  /** Supply a client with elevated privileges (admin) for the public
   *  status page, where the caller is anon but already HMAC-verified. */
  client?: SupabaseClient;
}

interface ViewRow {
  event_id: string;
  job_id: string;
  garage_id: string;
  kind: string;
  actor_staff_id: string | null;
  at: string;
  payload: Record<string, unknown>;
}

export async function getJobTimelineEvents(
  jobId: string,
  opts: FetchOptions,
): Promise<TimelineRow[]> {
  const client = opts.client ?? (await createSupabaseServerClient());
  const limit = opts.limit ?? 100;

  const { data, error } = await client
    .from("job_timeline_events")
    .select("event_id, job_id, garage_id, kind, actor_staff_id, at, payload")
    .eq("job_id", jobId)
    // Sort newest first. The secondary order on `event_id` pins ties
    // (same-millisecond `at` values, e.g. two work sessions the RPC
    // closed in one transaction) to a deterministic shape across
    // re-fetches.
    .order("at", { ascending: false })
    .order("event_id", { ascending: true })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  const rows = data as ViewRow[];

  // Hydrate actor first-names in one batched query. The view stores
  // actor_staff_id but not the display name; we join via staff table.
  const actorIds = Array.from(
    new Set(rows.map((r) => r.actor_staff_id).filter((x): x is string => !!x)),
  );

  const nameById = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: staff } = await client
      .from("staff")
      .select("id, full_name")
      .in("id", actorIds);
    for (const s of (staff ?? []) as { id: string; full_name: string }[]) {
      nameById.set(s.id, s.full_name);
    }
  }

  const shaped: TimelineRow[] = rows.map((r) => {
    const fullName = r.actor_staff_id ? nameById.get(r.actor_staff_id) : null;
    const first = firstNameOf(fullName ?? null);
    return {
      eventId: r.event_id,
      kind: r.kind,
      at: r.at,
      actorStaffId: r.actor_staff_id,
      actorFirstName: first,
      payload: r.payload ?? {},
    };
  });

  if (opts.audience === "customer") {
    // Filter to curated subset + apply copy map. Build once; any row
    // whose builder returns null gets dropped (e.g. internal status
    // transitions like draft → checked_in).
    const result: TimelineRow[] = [];
    for (const row of shaped) {
      if (!isCustomerVisibleKind(row.kind)) continue;
      const builder = CUSTOMER_KIND_COPY[row.kind]!;
      const copy = builder({
        payload: row.payload,
        actorFirstName: row.actorFirstName,
      });
      if (!copy) continue;
      result.push({ ...row, customerCopy: copy });
    }
    return result;
  }

  return shaped;
}
