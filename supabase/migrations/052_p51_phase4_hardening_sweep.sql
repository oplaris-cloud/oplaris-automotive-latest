-- 052_p51_phase4_hardening_sweep.sql
--
-- Pre-Phase-4 RLS hardening sweep, spec'd in
-- `docs/redesign/PRE_PHASE_4_HARDENING.md > RLS — write-side gaps`.
--
-- Same class of bug as migrations 049 (work_logs) and 050 (job_parts):
-- the `WITH CHECK` clause on the INSERT policies of `job_charges`,
-- `invoices`, `approval_requests`, and `job_assignments` did not
-- enforce that the `job_id` being written points at a job in the same
-- garage as the row's own `garage_id`. The FK on `<table>.job_id →
-- jobs.id` only verifies existence, not tenancy. A staff member in
-- garage B could INSERT a row with `(garage_id=B, job_id=<garage-A
-- job>)` — polluting their own tenant's table with rows pointing at
-- another tenant's job UUIDs and providing a job-UUID existence
-- oracle across tenants. Tenant wall on reads stays intact; the
-- write side didn't enforce the relationship.
--
-- Each policy below adds:
--   `EXISTS jobs j WHERE j.id = <table>.job_id
--                    AND j.garage_id = <table>.garage_id`
-- and preserves every existing predicate verbatim. This is a rule-
-- compliance fix (CLAUDE.md Rule #3 — every INSERT has a working
-- WITH CHECK), not a refactor. The predicate-style normalisation
-- (staff-subquery → `private.current_garage()`) is tracked
-- separately in PRE_PHASE_4_HARDENING.md > "RLS — predicate-style
-- normalisation" and is OUT OF SCOPE here.
--
-- Why each table:
--   * job_charges_insert     — pre-052 had only the staff-subquery
--                              garage-wall predicate; gap is identical
--                              to 050's job_parts gap. Extending
--                              `markAsInvoiced` / `markAsPaid` paths
--                              transitively rely on the row's
--                              tenancy chain being honest.
--   * invoices_insert        — same predicate, same gap. Invoice
--                              lifecycle (migrations 045 + 046)
--                              cannot be trusted otherwise.
--   * approval_requests_insert — token-issuance path. Without the
--                              EXISTS check, a session could mint an
--                              approval token whose stored `job_id`
--                              points cross-tenant; the public
--                              approval-token route handler then
--                              looks up the job and serves another
--                              tenant's data when the token resolves.
--   * job_assignments_insert  — manager-only gate is unchanged. Gap
--                              is the same: a B-manager could
--                              fabricate an assignment row pointing
--                              at an A-job UUID, polluting B's
--                              `job_assignments` and giving B-techs
--                              an oracle on A-job IDs through their
--                              own tenant-scoped reads.
--
-- USING clauses on the corresponding tables are unchanged: this
-- migration is INSERT-side only. UPDATE-side gaps on `job_charges`
-- and `invoices` were closed by migration 051. UPDATE-side on
-- `approval_requests` is intentionally absent (no UPDATE policy →
-- no direct UPDATE from authenticated; lifecycle moves through
-- SECURITY DEFINER on the public route handler).
--
-- Application-layer impact: every direct-INSERT call site already
-- writes `garage_id = session.garageId` and references jobs in the
-- same garage. No application code change needed. Verified call
-- sites:
--   * job_charges    : src/app/(app)/app/jobs/charges/actions.ts
--   * invoices       : src/app/(app)/app/jobs/charges/actions.ts
--                      (`getOrCreateInvoice`)
--   * approval_requests : src/lib/approvals/issue.ts (server-only)
--   * job_assignments  : src/app/(app)/app/bookings/actions.ts
--                      (`createJobFromCheckIn`),
--                      src/app/(app)/app/jobs/[id]/actions.ts
--                      (`assignTechnician`)

begin;

-- =============================================================================
-- job_charges_insert
-- =============================================================================
alter policy job_charges_insert on public.job_charges
  with check (
    garage_id = (select staff.garage_id from public.staff where staff.id = auth.uid())
    and exists (
      select 1 from public.jobs j
       where j.id = job_charges.job_id
         and j.garage_id = job_charges.garage_id
    )
  );

-- =============================================================================
-- invoices_insert
-- =============================================================================
alter policy invoices_insert on public.invoices
  with check (
    garage_id = (select staff.garage_id from public.staff where staff.id = auth.uid())
    and exists (
      select 1 from public.jobs j
       where j.id = invoices.job_id
         and j.garage_id = invoices.garage_id
    )
  );

-- =============================================================================
-- approval_requests_insert
-- =============================================================================
alter policy approval_requests_insert on public.approval_requests
  with check (
    garage_id = private.current_garage()
    and requested_by = auth.uid()
    and exists (
      select 1 from public.jobs j
       where j.id = approval_requests.job_id
         and j.garage_id = approval_requests.garage_id
    )
  );

-- =============================================================================
-- job_assignments_insert
-- =============================================================================
alter policy job_assignments_insert on public.job_assignments
  with check (
    garage_id = private.current_garage()
    and private.is_manager()
    and exists (
      select 1 from public.jobs j
       where j.id = job_assignments.job_id
         and j.garage_id = job_assignments.garage_id
    )
  );

commit;
