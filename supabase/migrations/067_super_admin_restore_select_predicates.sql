-- 067_super_admin_restore_select_predicates.sql — restore lost RLS detail
--
-- Migration 065 over-simplified the SELECT policies on jobs /
-- bookings / job_parts / work_logs when adding the
-- `OR private.is_super_admin()` overlay. The originals had additional
-- predicates (mechanic-assignment scoping, deleted_at = null,
-- mot_tester service-type filter on bookings) which my one-liner
-- replacement dropped, widening regular-staff visibility.
--
-- This migration re-creates each policy with the FULL original
-- predicate wrapped in `(...) OR private.is_super_admin()` so the
-- super_admin read overlay is additive only.
--
-- jobs_select: original used (own-garage) AND (deleted is null) AND
-- (staff_or_manager OR assigned). Restore + super_admin overlay.

begin;

-- jobs
drop policy if exists jobs_select on public.jobs;
create policy jobs_select on public.jobs
  for select to authenticated
  using (
    (
      garage_id = private.current_garage()
      and deleted_at is null
      and (
        private.is_staff_or_manager()
        or exists (
          select 1 from public.job_assignments ja
          where ja.job_id = jobs.id and ja.staff_id = auth.uid()
        )
      )
    )
    or private.is_super_admin()
  );

-- bookings — mig 027 original
drop policy if exists bookings_select on public.bookings;
create policy bookings_select on public.bookings
  for select to authenticated
  using (
    (
      garage_id = private.current_garage()
      and (
        private.is_manager()
        or (private.has_role('mot_tester') and service = 'mot')
        or (
          private.has_role('mechanic')
          and (
            service in ('electrical','maintenance')
            or passed_from_job_id is not null
          )
        )
      )
    )
    or private.is_super_admin()
  );

-- job_parts
drop policy if exists job_parts_select on public.job_parts;
create policy job_parts_select on public.job_parts
  for select to authenticated
  using (
    (
      garage_id = private.current_garage()
      and (
        private.is_staff_or_manager()
        or exists (
          select 1 from public.job_assignments ja
          where ja.job_id = job_parts.job_id and ja.staff_id = auth.uid()
        )
      )
    )
    or private.is_super_admin()
  );

-- work_logs
drop policy if exists work_logs_select on public.work_logs;
create policy work_logs_select on public.work_logs
  for select to authenticated
  using (
    (
      garage_id = private.current_garage()
      and (
        private.is_staff_or_manager()
        or exists (
          select 1 from public.job_assignments ja
          where ja.job_id = work_logs.job_id and ja.staff_id = auth.uid()
        )
      )
    )
    or private.is_super_admin()
  );

-- job_charges and invoices use a different shape — they read garage_id
-- from public.staff. Recreate with super_admin overlay.
drop policy if exists job_charges_select on public.job_charges;
create policy job_charges_select on public.job_charges
  for select to authenticated
  using (
    garage_id = (select garage_id from public.staff where id = auth.uid())
    or private.is_super_admin()
  );

drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices
  for select to authenticated
  using (
    garage_id = (select garage_id from public.staff where id = auth.uid())
    or private.is_super_admin()
  );

commit;
