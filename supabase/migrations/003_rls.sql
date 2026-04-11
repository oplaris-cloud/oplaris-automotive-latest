-- 003_rls.sql — Row-Level Security policies
-- Source: docs/redesign/BACKEND_SPEC.md §2
--
-- Rules enforced here:
--   * every public table has RLS enabled (already done by tail loop in 001)
--   * no USING (true), no USING (auth.uid() IS NOT NULL)
--   * every INSERT/UPDATE has WITH CHECK
--   * garage_id never writable by `authenticated` after insert
--   * mechanics see only jobs they're assigned to
--   * no DELETE policies — hard delete is via private.* SECURITY DEFINER

begin;

-- =============================================================================
-- Baseline grants. RLS is the row-level filter; these grants are the
-- table-level gate that lets PostgREST + the `authenticated` role reach
-- the tables at all. Without them, RLS never even runs — Postgres rejects
-- the statement with `permission denied for table`.
--
-- Supabase normally seeds these via an event trigger on `CREATE TABLE`
-- (`grant all on all tables in schema public to anon, authenticated,
-- service_role`), but our migrations create tables in raw psql so we
-- have to be explicit.
-- =============================================================================

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
-- anon is read-only to nothing in public; the anti-enumeration / kiosk
-- routes use the service_role key server-side and never the anon role.

-- =============================================================================
-- garages — read-only to authenticated for their own row
-- =============================================================================

create policy garages_select on garages for select to authenticated
  using (id = private.current_garage());

-- No insert/update/delete policy. Tenant rows are seeded out-of-band.

-- =============================================================================
-- staff
-- =============================================================================

create policy staff_select on staff for select to authenticated
  using (garage_id = private.current_garage());

-- Insert handled by Auth Hook + SECURITY DEFINER. No policy = no direct insert.
-- Updates allowed only on (full_name, phone) via column grant in 002.
create policy staff_update_self on staff for update to authenticated
  using (id = auth.uid() and garage_id = private.current_garage())
  with check (id = auth.uid() and garage_id = private.current_garage());

-- =============================================================================
-- customers
-- =============================================================================

create policy customers_select on customers for select to authenticated
  using (garage_id = private.current_garage() and deleted_at is null);

create policy customers_insert on customers for insert to authenticated
  with check (
    garage_id = private.current_garage()
    and private.is_staff_or_manager()
  );

create policy customers_update on customers for update to authenticated
  using (garage_id = private.current_garage())
  with check (garage_id = private.current_garage());

-- =============================================================================
-- vehicles
-- =============================================================================

create policy vehicles_select on vehicles for select to authenticated
  using (garage_id = private.current_garage() and deleted_at is null);

create policy vehicles_insert on vehicles for insert to authenticated
  with check (
    garage_id = private.current_garage()
    and private.is_staff_or_manager()
  );

create policy vehicles_update on vehicles for update to authenticated
  using (garage_id = private.current_garage())
  with check (garage_id = private.current_garage());

-- =============================================================================
-- mot_history_cache
-- =============================================================================

create policy mot_cache_select on mot_history_cache for select to authenticated
  using (garage_id = private.current_garage());

create policy mot_cache_insert on mot_history_cache for insert to authenticated
  with check (garage_id = private.current_garage() and private.is_manager());

create policy mot_cache_update on mot_history_cache for update to authenticated
  using (garage_id = private.current_garage())
  with check (garage_id = private.current_garage() and private.is_manager());

-- =============================================================================
-- bays
-- =============================================================================

create policy bays_select on bays for select to authenticated
  using (garage_id = private.current_garage());

create policy bays_insert on bays for insert to authenticated
  with check (garage_id = private.current_garage() and private.is_manager());

create policy bays_update on bays for update to authenticated
  using (garage_id = private.current_garage() and private.is_manager())
  with check (garage_id = private.current_garage() and private.is_manager());

-- =============================================================================
-- jobs — mechanics see only their assigned jobs
-- =============================================================================

create policy jobs_select on jobs for select to authenticated
  using (
    garage_id = private.current_garage()
    and deleted_at is null
    and (
      private.is_staff_or_manager()
      or exists (
        select 1 from job_assignments ja
        where ja.job_id = jobs.id and ja.staff_id = auth.uid()
      )
    )
  );

create policy jobs_insert on jobs for insert to authenticated
  with check (
    garage_id = private.current_garage()
    and private.is_manager()
  );

create policy jobs_update on jobs for update to authenticated
  using (
    garage_id = private.current_garage()
    and (
      private.is_staff_or_manager()
      or exists (
        select 1 from job_assignments ja
        where ja.job_id = jobs.id and ja.staff_id = auth.uid()
      )
    )
  )
  with check (garage_id = private.current_garage());

-- =============================================================================
-- job_assignments
-- =============================================================================

create policy job_assignments_select on job_assignments for select to authenticated
  using (
    garage_id = private.current_garage()
    and (private.is_staff_or_manager() or staff_id = auth.uid())
  );

create policy job_assignments_insert on job_assignments for insert to authenticated
  with check (garage_id = private.current_garage() and private.is_manager());

create policy job_assignments_delete on job_assignments for delete to authenticated
  using (garage_id = private.current_garage() and private.is_manager());

-- =============================================================================
-- work_logs
-- =============================================================================

create policy work_logs_select on work_logs for select to authenticated
  using (
    garage_id = private.current_garage()
    and (
      private.is_staff_or_manager()
      or exists (
        select 1 from job_assignments ja
        where ja.job_id = work_logs.job_id and ja.staff_id = auth.uid()
      )
    )
  );

create policy work_logs_insert on work_logs for insert to authenticated
  with check (
    garage_id = private.current_garage()
    and staff_id = auth.uid()
    and exists (
      select 1 from job_assignments ja
      where ja.job_id = work_logs.job_id and ja.staff_id = auth.uid()
    )
  );

create policy work_logs_update on work_logs for update to authenticated
  using (garage_id = private.current_garage() and staff_id = auth.uid())
  with check (garage_id = private.current_garage() and staff_id = auth.uid());

-- =============================================================================
-- job_parts
-- =============================================================================

create policy job_parts_select on job_parts for select to authenticated
  using (
    garage_id = private.current_garage()
    and (
      private.is_staff_or_manager()
      or exists (
        select 1 from job_assignments ja
        where ja.job_id = job_parts.job_id and ja.staff_id = auth.uid()
      )
    )
  );

create policy job_parts_insert on job_parts for insert to authenticated
  with check (
    garage_id = private.current_garage()
    and added_by = auth.uid()
    and (
      private.is_manager()
      or exists (
        select 1 from job_assignments ja
        where ja.job_id = job_parts.job_id and ja.staff_id = auth.uid()
      )
    )
  );

create policy job_parts_update on job_parts for update to authenticated
  using (garage_id = private.current_garage() and private.is_manager())
  with check (garage_id = private.current_garage() and private.is_manager());

-- =============================================================================
-- approval_requests
-- =============================================================================

create policy approval_requests_select on approval_requests for select to authenticated
  using (
    garage_id = private.current_garage()
    and (
      private.is_staff_or_manager()
      or exists (
        select 1 from job_assignments ja
        where ja.job_id = approval_requests.job_id and ja.staff_id = auth.uid()
      )
    )
  );

create policy approval_requests_insert on approval_requests for insert to authenticated
  with check (
    garage_id = private.current_garage()
    and requested_by = auth.uid()
  );

-- Updates only via SECURITY DEFINER (the public route handler validating tokens).
-- No update policy = no direct update from authenticated.

-- =============================================================================
-- warranties
-- =============================================================================

create policy warranties_select on warranties for select to authenticated
  using (garage_id = private.current_garage());

create policy warranties_insert on warranties for insert to authenticated
  with check (garage_id = private.current_garage() and private.is_manager());

create policy warranties_update on warranties for update to authenticated
  using (garage_id = private.current_garage() and private.is_manager())
  with check (garage_id = private.current_garage() and private.is_manager());

-- =============================================================================
-- stock_items, stock_movements
-- =============================================================================

create policy stock_items_select on stock_items for select to authenticated
  using (garage_id = private.current_garage());

create policy stock_items_insert on stock_items for insert to authenticated
  with check (garage_id = private.current_garage() and private.is_manager());

create policy stock_items_update on stock_items for update to authenticated
  using (garage_id = private.current_garage() and private.is_manager())
  with check (garage_id = private.current_garage() and private.is_manager());

create policy stock_movements_select on stock_movements for select to authenticated
  using (garage_id = private.current_garage());

create policy stock_movements_insert on stock_movements for insert to authenticated
  with check (
    garage_id = private.current_garage()
    and (staff_id is null or staff_id = auth.uid())
  );

-- =============================================================================
-- bookings — managers and front-of-house can read; writes go through public
-- route handlers with the service-role key, so no insert policy is needed for
-- authenticated users.
-- =============================================================================

create policy bookings_select on bookings for select to authenticated
  using (garage_id = private.current_garage());

create policy bookings_update on bookings for update to authenticated
  using (garage_id = private.current_garage() and private.is_manager())
  with check (garage_id = private.current_garage() and private.is_manager());

-- =============================================================================
-- audit_log — read-only to managers; writes only via SECURITY DEFINER.
-- =============================================================================

create policy audit_log_select on audit_log for select to authenticated
  using (garage_id = private.current_garage() and private.is_manager());

-- =============================================================================
-- garage_id is never writable as a column update by authenticated users
-- =============================================================================

revoke update (garage_id) on customers          from authenticated;
revoke update (garage_id) on vehicles           from authenticated;
revoke update (garage_id) on jobs               from authenticated;
revoke update (garage_id) on job_assignments    from authenticated;
revoke update (garage_id) on work_logs          from authenticated;
revoke update (garage_id) on job_parts          from authenticated;
revoke update (garage_id) on approval_requests  from authenticated;
revoke update (garage_id) on warranties         from authenticated;
revoke update (garage_id) on stock_items        from authenticated;
revoke update (garage_id) on stock_movements    from authenticated;
revoke update (garage_id) on bookings           from authenticated;
revoke update (garage_id) on audit_log          from authenticated;
revoke update (garage_id) on bays               from authenticated;
revoke update (garage_id) on mot_history_cache  from authenticated;
revoke update (garage_id) on staff              from authenticated;

-- `staff` is locked down further: authenticated can ONLY update
-- (full_name, phone) of their own row. Re-apply 002_helpers' narrow
-- grant after the broad grant above would have clobbered it.
revoke insert, update, delete on staff from authenticated;
grant update (full_name, phone) on staff to authenticated;

-- `audit_log` is append-only: even managers cannot UPDATE or DELETE
-- existing rows. Writes happen via SECURITY DEFINER helpers that bypass
-- RLS entirely. `SELECT` is covered by the audit_log_select policy.
revoke insert, update, delete on audit_log from authenticated;

-- =============================================================================
-- RLS safety-net loop (re-run, in case 001's loop missed any newly-created table)
-- =============================================================================

do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security;', r.tablename);
    execute format('alter table public.%I force row level security;', r.tablename);
  end loop;
end $$;

commit;
