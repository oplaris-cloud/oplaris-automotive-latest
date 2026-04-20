-- 049_p51_work_logs_check_assignment_and_job_tenant.sql
--
-- Tightens the WITH CHECK clauses on `work_logs_insert` and
-- `work_logs_update` to mirror the visibility logic in
-- `work_logs_select`. Closes two policy gaps surfaced by the RLS
-- tests added 2026-04-11 (tests/rls/work_logs.test.ts +
-- tests/rls/mechanic_isolation.test.ts):
--
-- Gap #4 — "mechanic CANNOT log time against a job they're not
--   assigned to": previously WITH CHECK only required
--   `garage_id = current_garage() AND staff_id = auth.uid()`, with
--   no assignment check. A mechanic could INSERT a work_log for any
--   job in their own garage, even one they're not in
--   `job_assignments` for. Violates CLAUDE.md Rule #2 + the P51
--   single-job-timeline invariant (only the assigned tech owns the
--   timer). Manager / mot_tester bypass via `is_staff_or_manager()`
--   matches the current SELECT policy.
--
-- Gap #5 — "cross-tenant mechanic cannot log work on another
--   garage's job": previously WITH CHECK did not enforce that
--   `job_id` belongs to the same `garage_id` as the row being
--   written. FK on `work_logs.job_id → jobs.id` only verifies
--   existence, not tenancy. A mechanic in garage B could INSERT a
--   work_log with `(garage_id=B, job_id=<garage-A job>,
--   staff_id=B)` — polluting their own tenant's `work_logs` with
--   rows pointing at another tenant's job UUIDs + providing a
--   job-UUID existence oracle across tenants. Tenant-wall on reads
--   is intact, but the write-side policy didn't enforce the
--   relationship.
--
-- Both WITH CHECKs now require:
--   1. garage_id = current_garage()        (existing)
--   2. staff_id  = auth.uid()              (existing)
--   3. EXISTS jobs j WHERE j.id = work_logs.job_id
--                      AND j.garage_id = work_logs.garage_id
--                                           (new — closes #5)
--   4. is_staff_or_manager() OR EXISTS job_assignments for
--      (work_logs.job_id, auth.uid())      (new — closes #4)
--
-- USING clauses are unchanged: `work_logs_update` keeps its current
-- (garage_id = current_garage() AND staff_id = auth.uid()) visibility
-- because an existing-row visibility filter separate from the
-- new-row WITH CHECK is correct for UPDATE (you can only mutate rows
-- you own, but the mutated shape must still satisfy the full
-- predicate).
--
-- Application-layer impact: the direct-INSERT call sites in
-- `src/app/(app)/app/jobs/work-logs/actions.ts` were audited pre-
-- migration. `startWork` (user session, RLS-enforced) is the only
-- tightened path; managers/mot_testers pass via `is_staff_or_manager()`,
-- mechanics pass via `job_assignments` — which the P51 pass-back flow
-- writes first via `claim_passback()` before a mechanic can start
-- work. `managerLogWork` uses the service-role admin client and is
-- unaffected. The three P55 SECURITY DEFINER RPCs (`pause_work_log`,
-- `resume_work_log`, `complete_work_log`) also bypass RLS and are
-- unaffected.

begin;

alter policy work_logs_insert on public.work_logs
  with check (
    garage_id = private.current_garage()
    and staff_id = auth.uid()
    and exists (
      select 1 from public.jobs j
       where j.id = work_logs.job_id
         and j.garage_id = work_logs.garage_id
    )
    and (
      private.is_staff_or_manager()
      or exists (
        select 1 from public.job_assignments ja
         where ja.job_id = work_logs.job_id
           and ja.staff_id = auth.uid()
      )
    )
  );

alter policy work_logs_update on public.work_logs
  with check (
    garage_id = private.current_garage()
    and staff_id = auth.uid()
    and exists (
      select 1 from public.jobs j
       where j.id = work_logs.job_id
         and j.garage_id = work_logs.garage_id
    )
    and (
      private.is_staff_or_manager()
      or exists (
        select 1 from public.job_assignments ja
         where ja.job_id = work_logs.job_id
           and ja.staff_id = auth.uid()
      )
    )
  );

commit;
