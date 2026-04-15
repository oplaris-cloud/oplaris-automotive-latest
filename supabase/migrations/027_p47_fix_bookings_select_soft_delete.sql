-- 027_p47_fix_bookings_select_soft_delete.sql
-- Fix for the soft-delete RLS footgun introduced in 026_p47_checkin_routing:
-- adding `deleted_at IS NULL` to the SELECT qual made any UPDATE that sets
-- `deleted_at` fail with 42501 — Postgres re-evaluates the SELECT qual
-- against the NEW row on UPDATE (by design, so a caller can never "blind
-- write" a row it can't then see).
--
-- Keep the service/role visibility rules, but filter soft-deleted rows at
-- the query level (same pattern as customers/vehicles).

drop policy if exists bookings_select on public.bookings;
create policy bookings_select on public.bookings
  for select to authenticated
  using (
    garage_id = private.current_garage()
    and (
      private.is_manager()
      or (private.has_role('mot_tester') and service = 'mot')
      or (
        private.has_role('mechanic')
        and (service in ('electrical','maintenance') or passed_from_job_id is not null)
      )
    )
  );
