// P50 — typed filter helpers for Supabase Realtime channel filters.
//
// Belt-and-braces with RLS: every app-side filter must include
// `garage_id=eq.<uuid>` so the server doesn't fan out cross-tenant
// payloads that would then be dropped by RLS. This file is the only
// blessed way to construct those filter strings — calling the helpers
// raises on malformed input.
//
// The PostgREST/Realtime filter grammar Supabase accepts:
//   "<column>=<op>.<value>"          single-column, single-value
//   "and=(c1.op1.v1,c2.op2.v2)"      multi-clause with AND combinator

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(label: string, v: string): void {
  if (!UUID_RE.test(v)) {
    throw new Error(`realtime/filters: invalid UUID for ${label}: ${v}`);
  }
}

/** `garage_id=eq.<uuid>` (or AND-combined with an extra clause). */
export function garageFilter(garageId: string, extra?: string): string {
  assertUuid("garageId", garageId);
  if (extra && !/^[a-z0-9_]+=[a-z]+\.[a-z0-9_,()-]+$/i.test(extra)) {
    throw new Error(`realtime/filters: invalid extra clause: ${extra}`);
  }
  return extra
    ? `and=(garage_id.eq.${garageId},${extra})`
    : `garage_id=eq.${garageId}`;
}

/** `id=in.(<uuid>,<uuid>,...)` for status-page session-scoped filters. */
export function idInFilter(ids: readonly string[]): string {
  if (ids.length === 0) {
    throw new Error("realtime/filters: idInFilter requires ≥1 id");
  }
  for (const id of ids) assertUuid("id", id);
  return `id=in.(${ids.join(",")})`;
}

/** `<column>=eq.<uuid>` for per-row subscriptions (job_id, customer_id, …). */
export function eqUuidFilter(column: string, value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(column)) {
    throw new Error(`realtime/filters: invalid column name: ${column}`);
  }
  assertUuid(column, value);
  return `${column}=eq.${value}`;
}
