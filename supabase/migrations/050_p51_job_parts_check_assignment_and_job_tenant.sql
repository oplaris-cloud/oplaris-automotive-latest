-- 050_p51_job_parts_check_assignment_and_job_tenant.sql
--
-- Mirrors migration 049 on `public.job_parts`. Tightens the WITH CHECK
-- clauses on `job_parts_insert` and `job_parts_update` to close the
-- same write-side tenancy gap that 049 closed on `work_logs`.
--
-- Gap — "cross-tenant job_parts pollution": the pre-050 WITH CHECK did
--   not enforce that `job_id` belongs to the same `garage_id` as the
--   row being written. FK on `job_parts.job_id → jobs.id` only verifies
--   existence, not tenancy. A mechanic in garage B could INSERT a
--   job_parts row with `(garage_id=B, job_id=<garage-A job>,
--   added_by=B)` — polluting their own tenant's `job_parts` with rows
--   pointing at another tenant's job UUIDs + providing a job-UUID
--   existence oracle across tenants. Tenant wall on reads stays
--   intact; write side didn't enforce the relationship. Same class of
--   gap surfaced during the mechanic/MOT audit triage on 2026-04-20,
--   same pattern as migration 049's fix on work_logs.
--
-- Both WITH CHECKs now require:
--   1. garage_id = current_garage()        (existing)
--   2. added_by  = auth.uid()              (existing)
--   3. EXISTS jobs j WHERE j.id = job_parts.job_id
--                      AND j.garage_id = job_parts.garage_id
--                                           (new — closes the gap)
--   4. is_staff_or_manager() OR EXISTS job_assignments for
--      (job_parts.job_id, auth.uid())      (matches 049 shape)
--
-- Note on the INSERT predicate #4: the pre-050 clause was
-- `private.is_manager() OR EXISTS job_assignments`. Migration 050
-- widens the manager-only bypass to `private.is_staff_or_manager()`
-- (= manager OR mot_tester) so the shape matches 049 exactly and a
-- future reader can `diff` the two policies side-by-side without
-- having to hold two different helper functions in their head. In
-- practice this grants a mot_tester-only session the same INSERT
-- bypass as a manager — which matches the "mot_tester is staff, not
-- a tech" mental model already baked into `is_staff_or_manager()`.
-- Mechanics still require a `job_assignments` row (unchanged).
--
-- USING clauses are unchanged: `job_parts_update` keeps its current
-- (garage_id = current_garage() AND is_manager()) visibility, so the
-- set of sessions that can see a row to UPDATE it is not relaxed
-- here. WITH CHECK is the shape filter on the post-UPDATE row; USING
-- is the pre-UPDATE visibility gate. Symmetric to the 049 approach.
--
-- Application-layer impact: the direct-INSERT call sites
-- (`src/app/(app)/app/jobs/parts/actions.ts > addJobPart`,
-- `src/app/(app)/app/tech/job/[id]/AddPartSheet.tsx`) pass `added_by =
-- session.userId` and `garage_id = session.garageId` and reference
-- real jobs in the same garage. Managers + mot_testers pass via
-- `is_staff_or_manager()`; mechanics pass via `job_assignments` — the
-- same path the `addJobPart` fieldset enforces at the zod layer.
-- `updateJobPart` / `deleteJobPart` are manager-only per their server
-- action gates + the existing USING clause, so the relaxed #4 clause
-- in UPDATE WITH CHECK is dominated by USING in practice.

begin;

alter policy job_parts_insert on public.job_parts
  with check (
    garage_id = private.current_garage()
    and added_by = auth.uid()
    and exists (
      select 1 from public.jobs j
       where j.id = job_parts.job_id
         and j.garage_id = job_parts.garage_id
    )
    and (
      private.is_staff_or_manager()
      or exists (
        select 1 from public.job_assignments ja
         where ja.job_id = job_parts.job_id
           and ja.staff_id = auth.uid()
      )
    )
  );

alter policy job_parts_update on public.job_parts
  with check (
    garage_id = private.current_garage()
    and added_by = auth.uid()
    and exists (
      select 1 from public.jobs j
       where j.id = job_parts.job_id
         and j.garage_id = job_parts.garage_id
    )
    and (
      private.is_staff_or_manager()
      or exists (
        select 1 from public.job_assignments ja
         where ja.job_id = job_parts.job_id
           and ja.staff_id = auth.uid()
      )
    )
  );

commit;
