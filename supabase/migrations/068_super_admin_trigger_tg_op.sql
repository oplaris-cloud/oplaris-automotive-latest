-- 068_super_admin_trigger_tg_op.sql — fix audit trigger NEW/OLD handling
--
-- Bug in 065: `IS NOT NULL` on a RECORD type evaluates true only when
-- EVERY field is non-null — not when the record itself exists. So a
-- freshly-updated row with any nullable column collapsed to "is null"
-- in our trigger and the before/after / target_id fields ended up null.
--
-- Fix: use TG_OP to discriminate which of NEW / OLD to read. This is
-- the canonical Postgres pattern; the IS NOT NULL trick was wrong on
-- arrival.
--
-- Also extends write-side policies on the curated tables so a
-- super_admin can actually mutate inside their impersonated garage.
-- Existing role gates (`is_staff_or_manager()`, `is_manager()`)
-- evaluate false for super_admin (they have no role), so without
-- this overlay the writes blocked. Garage scoping
-- (garage_id = current_garage()) is unchanged — they can only write
-- to the garage they entered, never another.

begin;

create or replace function private.audit_super_admin_change()
returns trigger
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_actor uuid;
  v_garage uuid;
  v_target uuid;
  v_op text := lower(TG_OP);
  v_claims jsonb;
  v_before jsonb;
  v_after  jsonb;
begin
  if not private.is_super_admin() then
    return coalesce(NEW, OLD);
  end if;

  v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_actor := nullif(coalesce(v_claims ->> 'sub', ''), '')::uuid;
  v_garage := private.current_garage();

  if TG_OP = 'INSERT' then
    v_after  := to_jsonb(NEW);
    v_target := (v_after ->> 'id')::uuid;
  elsif TG_OP = 'UPDATE' then
    v_before := to_jsonb(OLD);
    v_after  := to_jsonb(NEW);
    v_target := (v_after ->> 'id')::uuid;
  elsif TG_OP = 'DELETE' then
    v_before := to_jsonb(OLD);
    v_target := (v_before ->> 'id')::uuid;
  end if;

  insert into public.audit_log (
    garage_id, actor_staff_id, action, target_table, target_id, meta
  )
  values (
    coalesce(
      v_garage,
      (coalesce(v_after, v_before) ->> 'garage_id')::uuid
    ),
    null,
    'super_admin_' || v_op,
    TG_TABLE_NAME,
    v_target,
    jsonb_build_object(
      'super_admin_user_id', v_actor::text,
      'impersonated_garage', v_garage::text,
      'before', v_before,
      'after',  v_after
    )
  );

  return coalesce(NEW, OLD);
end $$;

revoke all on function private.audit_super_admin_change()
  from public, authenticated, anon;

-- Re-attach trigger so the new body is the live version.
do $$
declare
  t text;
  curated text[] := array[
    'customers','vehicles','jobs','bookings','invoices',
    'job_charges','job_parts','work_logs','garages','staff','bays'
  ];
begin
  foreach t in array curated loop
    execute format(
      'drop trigger if exists trg_super_admin_audit on public.%I',
      t
    );
    execute format(
      'create trigger trg_super_admin_audit
         after insert or update or delete on public.%I
         for each row execute function private.audit_super_admin_change()',
      t
    );
  end loop;
end $$;

-- =============================================================================
-- Write-side policy extensions: super_admin allowed if garage matches
-- =============================================================================
--
-- Without these, a super_admin who entered a garage via the
-- impersonation header still failed every WITH CHECK because the
-- existing role gates required a specific role. We OR `is_super_admin()`
-- into each role gate; the garage_id clauses stay intact, so a
-- super_admin still can't write into a garage they haven't entered.

drop policy if exists customers_insert on public.customers;
create policy customers_insert on public.customers
  for insert to authenticated
  with check (
    garage_id = private.current_garage()
    and (private.is_staff_or_manager() or private.is_super_admin())
  );

drop policy if exists customers_update on public.customers;
create policy customers_update on public.customers
  for update to authenticated
  using (
    garage_id = private.current_garage()
  )
  with check (
    garage_id = private.current_garage()
  );

drop policy if exists vehicles_insert on public.vehicles;
create policy vehicles_insert on public.vehicles
  for insert to authenticated
  with check (
    garage_id = private.current_garage()
    and (private.is_staff_or_manager() or private.is_super_admin())
  );

drop policy if exists bays_insert on public.bays;
create policy bays_insert on public.bays
  for insert to authenticated
  with check (
    garage_id = private.current_garage()
    and (private.is_manager() or private.is_super_admin())
  );

drop policy if exists bays_update on public.bays;
create policy bays_update on public.bays
  for update to authenticated
  using (
    garage_id = private.current_garage()
    and (private.is_manager() or private.is_super_admin())
  )
  with check (
    garage_id = private.current_garage()
    and (private.is_manager() or private.is_super_admin())
  );

drop policy if exists jobs_insert on public.jobs;
create policy jobs_insert on public.jobs
  for insert to authenticated
  with check (
    garage_id = private.current_garage()
    and (private.is_manager() or private.is_super_admin())
  );

commit;
