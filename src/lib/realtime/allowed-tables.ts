// P50 — runtime whitelist of tables a client may subscribe to.
//
// Mirrors the supabase_realtime publication (migration 035). Adding a
// table here without also adding it to the publication, or vice versa,
// is a bug — the realtime hook will throw at runtime if a caller tries
// to subscribe to anything not on this list. New surface? Add to BOTH.

export const ALLOWED_TABLES = [
  "bookings",
  "jobs",
  "work_logs",
  "job_assignments",
  "job_charges",
  "job_parts",
  "job_passbacks",
  // P54 — status transition audit. Added to supabase_realtime
  // publication in migration 036.
  "job_status_events",
  "approval_requests",
  "invoices",
  "customers",
  "vehicles",
  "stock_items",
  "stock_movements",
  "warranties",
  "staff",
  "bays",
  // Migration 047 — Messages page subscribes to row updates (status
  // flips from queued → sent → delivered) so the manager sees Twilio
  // delivery reports land live without a refresh.
  "sms_outbox",
  // P3.3 (migration 060) — Manager pages refresh when a tech submits a
  // completion checklist so JobActivity timeline + audit log reflect
  // the new entry without a hard reload.
  "job_completion_checks",
] as const;

export type AllowedTable = (typeof ALLOWED_TABLES)[number];

export function isAllowedTable(name: string): name is AllowedTable {
  return (ALLOWED_TABLES as readonly string[]).includes(name);
}
