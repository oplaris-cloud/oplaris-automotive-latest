"use client";

// P50 — per-surface client shims.
//
// Each export is a tiny "headless" component a Server Component drops in
// to subscribe to the table(s) relevant to its view. All real rendering
// stays in the surrounding RSC; the shim's only job is to call
// `router.refresh()` on incoming postgres_changes frames.
//
// Conventions:
//   * Manager-/staff-scoped pages pass `garageId`; the shim builds the
//     `garage_id=eq.<uuid>` filter via the typed helper (rule #1).
//   * Detail pages pass an entity id; per-row subscriptions filter by
//     that id so the WS doesn't get every row in the table.
//   * Status page (public) passes the signed-session job ids; never the
//     garage id (rule #8).
//
// The hook validates inputs at runtime via zod (`use-realtime.ts`), so a
// new caller passing a non-whitelisted table or a malformed filter
// throws on mount.

import {
  useRealtimeRouterRefresh,
  garageFilter,
  eqUuidFilter,
  idInFilter,
} from "./use-realtime";

// ---------------------------------------------------------------------------
// Sidebar badge — every staff page in (app)/layout.
// Manager + mechanic both watch bookings; the badge re-counts on refresh.
// ---------------------------------------------------------------------------

export function SidebarBadgeRealtime({ garageId }: { garageId: string }) {
  useRealtimeRouterRefresh({
    table: "bookings",
    filter: garageFilter(garageId),
  });
  return null;
}

// ---------------------------------------------------------------------------
// Today dashboard — KPIs + queues update on bookings/jobs/work_logs change.
// ---------------------------------------------------------------------------

export function TodayRealtime({ garageId }: { garageId: string }) {
  useRealtimeRouterRefresh({ table: "bookings",  filter: garageFilter(garageId) });
  useRealtimeRouterRefresh({ table: "jobs",      filter: garageFilter(garageId) });
  useRealtimeRouterRefresh({ table: "work_logs", filter: garageFilter(garageId) });
  return null;
}

// ---------------------------------------------------------------------------
// My Work — covers new assignments (job_assignments), status flips (jobs),
// pass-back events (job_passbacks), check-ins (bookings), and own-timer
// state (work_logs).
// ---------------------------------------------------------------------------

export function MyWorkRealtime({ garageId }: { garageId: string }) {
  useRealtimeRouterRefresh({ table: "jobs",             filter: garageFilter(garageId) });
  useRealtimeRouterRefresh({ table: "job_assignments",  filter: garageFilter(garageId) });
  useRealtimeRouterRefresh({ table: "work_logs",        filter: garageFilter(garageId) });
  useRealtimeRouterRefresh({ table: "bookings",         filter: garageFilter(garageId) });
  useRealtimeRouterRefresh({ table: "job_passbacks",    filter: garageFilter(garageId) });
  return null;
}

// ---------------------------------------------------------------------------
// Bookings list (manager).
// ---------------------------------------------------------------------------

export function BookingsListRealtime({ garageId }: { garageId: string }) {
  useRealtimeRouterRefresh({ table: "bookings", filter: garageFilter(garageId) });
  return null;
}

// ---------------------------------------------------------------------------
// Jobs list (manager).
// ---------------------------------------------------------------------------

export function JobsListRealtime({ garageId }: { garageId: string }) {
  useRealtimeRouterRefresh({ table: "jobs",            filter: garageFilter(garageId) });
  useRealtimeRouterRefresh({ table: "work_logs",       filter: garageFilter(garageId) });
  useRealtimeRouterRefresh({ table: "job_assignments", filter: garageFilter(garageId) });
  return null;
}

// ---------------------------------------------------------------------------
// Job detail — manager (`/app/jobs/[id]`) AND tech (`/app/tech/job/[id]`).
// Per-row subscriptions on the seven tables a job page renders.
// ---------------------------------------------------------------------------

export function JobDetailRealtime({ jobId }: { jobId: string }) {
  useRealtimeRouterRefresh({ table: "jobs",              filter: eqUuidFilter("id", jobId) });
  useRealtimeRouterRefresh({ table: "work_logs",         filter: eqUuidFilter("job_id", jobId) });
  useRealtimeRouterRefresh({ table: "job_charges",       filter: eqUuidFilter("job_id", jobId) });
  useRealtimeRouterRefresh({ table: "job_parts",         filter: eqUuidFilter("job_id", jobId) });
  useRealtimeRouterRefresh({ table: "job_passbacks",     filter: eqUuidFilter("job_id", jobId) });
  useRealtimeRouterRefresh({ table: "approval_requests", filter: eqUuidFilter("job_id", jobId) });
  useRealtimeRouterRefresh({ table: "invoices",          filter: eqUuidFilter("job_id", jobId) });
  useRealtimeRouterRefresh({ table: "job_assignments",   filter: eqUuidFilter("job_id", jobId) });
  // P54 — status transitions feed the unified Job Activity timeline.
  useRealtimeRouterRefresh({ table: "job_status_events", filter: eqUuidFilter("job_id", jobId) });
  return null;
}

// ---------------------------------------------------------------------------
// Customers / Vehicles list + detail.
// ---------------------------------------------------------------------------

export function CustomersListRealtime({ garageId }: { garageId: string }) {
  useRealtimeRouterRefresh({ table: "customers", filter: garageFilter(garageId) });
  useRealtimeRouterRefresh({ table: "vehicles",  filter: garageFilter(garageId) });
  return null;
}

export function CustomerDetailRealtime({
  customerId,
}: {
  customerId: string;
}) {
  useRealtimeRouterRefresh({ table: "customers",         filter: eqUuidFilter("id", customerId) });
  useRealtimeRouterRefresh({ table: "vehicles",          filter: eqUuidFilter("customer_id", customerId) });
  useRealtimeRouterRefresh({ table: "jobs",              filter: eqUuidFilter("customer_id", customerId) });
  useRealtimeRouterRefresh({ table: "approval_requests", filter: eqUuidFilter("customer_id", customerId) });
  return null;
}

export function VehiclesListRealtime({ garageId }: { garageId: string }) {
  useRealtimeRouterRefresh({ table: "vehicles", filter: garageFilter(garageId) });
  return null;
}

export function VehicleDetailRealtime({ vehicleId }: { vehicleId: string }) {
  useRealtimeRouterRefresh({ table: "vehicles", filter: eqUuidFilter("id", vehicleId) });
  useRealtimeRouterRefresh({ table: "jobs",     filter: eqUuidFilter("vehicle_id", vehicleId) });
  return null;
}

// ---------------------------------------------------------------------------
// Stock + Warranties (Warranties redirects to Stock so one shim covers both).
// ---------------------------------------------------------------------------

export function StockRealtime({ garageId }: { garageId: string }) {
  useRealtimeRouterRefresh({ table: "stock_items",     filter: garageFilter(garageId) });
  useRealtimeRouterRefresh({ table: "stock_movements", filter: garageFilter(garageId) });
  useRealtimeRouterRefresh({ table: "warranties",      filter: garageFilter(garageId) });
  return null;
}

// ---------------------------------------------------------------------------
// Reports — debounced 10 s because aggregates are expensive.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Messages page (migration 047). Twilio status callbacks update rows
// in `sms_outbox` — manager sees delivery state flip from sent →
// delivered (or failed) without a refresh. No debounce: status
// updates arrive on a per-message cadence, not a flood.
// ---------------------------------------------------------------------------

export function MessagesRealtime({ garageId }: { garageId: string }) {
  useRealtimeRouterRefresh({ table: "sms_outbox", filter: garageFilter(garageId) });
  return null;
}

export function ReportsRealtime({ garageId }: { garageId: string }) {
  useRealtimeRouterRefresh({ table: "jobs",        filter: garageFilter(garageId), debounceMs: 10_000 });
  useRealtimeRouterRefresh({ table: "work_logs",   filter: garageFilter(garageId), debounceMs: 10_000 });
  useRealtimeRouterRefresh({ table: "job_charges", filter: garageFilter(garageId), debounceMs: 10_000 });
  useRealtimeRouterRefresh({ table: "invoices",    filter: garageFilter(garageId), debounceMs: 10_000 });
  return null;
}

// ---------------------------------------------------------------------------
// Settings → Staff. Other settings pages (garage details, stock locations)
// don't sit in the publication; nothing to subscribe to.
// ---------------------------------------------------------------------------

export function StaffSettingsRealtime({ garageId }: { garageId: string }) {
  useRealtimeRouterRefresh({ table: "staff", filter: garageFilter(garageId) });
  return null;
}

// ---------------------------------------------------------------------------
// Bay board.
// ---------------------------------------------------------------------------

export function BayBoardRealtime({ garageId }: { garageId: string }) {
  useRealtimeRouterRefresh({ table: "jobs",            filter: garageFilter(garageId) });
  useRealtimeRouterRefresh({ table: "job_assignments", filter: garageFilter(garageId) });
  useRealtimeRouterRefresh({ table: "work_logs",       filter: garageFilter(garageId) });
  useRealtimeRouterRefresh({ table: "bays",            filter: garageFilter(garageId) });
  return null;
}

// ---------------------------------------------------------------------------
// Customer status page — public, ephemeral session.
// Strictly session-scoped: filter on the verified job ids, never the
// garage id (rule #8). The caller MUST pass jobIds derived from the
// signed-cookie session, not from a query string or client state.
// ---------------------------------------------------------------------------

export function StatusPageRealtime({
  jobIds,
}: {
  jobIds: readonly string[];
}) {
  // Caller must pass ≥1 id; if they have zero jobs there's nothing to
  // subscribe to and they shouldn't render the shim. We still need to
  // call the hooks unconditionally per the rules of React hooks, so the
  // filters are pre-computed up here. `idInFilter` validates the UUIDs.
  const ids = idInFilter(jobIds);
  const byJob = `job_id=in.(${jobIds.join(",")})`;
  useRealtimeRouterRefresh({ table: "jobs",              filter: ids });
  useRealtimeRouterRefresh({ table: "work_logs",         filter: byJob });
  useRealtimeRouterRefresh({ table: "job_charges",       filter: byJob });
  useRealtimeRouterRefresh({ table: "approval_requests", filter: byJob });
  useRealtimeRouterRefresh({ table: "job_passbacks",     filter: byJob });
  return null;
}
