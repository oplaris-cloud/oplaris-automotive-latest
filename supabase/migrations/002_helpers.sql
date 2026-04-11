-- 002_helpers.sql — JWT helpers, job-number generator, GDPR helpers
-- All in `private` schema. Called by RLS policies and SECURITY DEFINER functions.

begin;

-- =============================================================================
-- JWT readers (RLS uses these instead of touching auth.jwt() directly)
-- =============================================================================

create or replace function private.current_garage() returns uuid
language sql stable as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claims', true)::jsonb
        -> 'app_metadata' ->> 'garage_id',
      ''
    ),
    ''
  )::uuid
$$;

create or replace function private.current_role() returns text
language sql stable as $$
  select coalesce(
    current_setting('request.jwt.claims', true)::jsonb
      -> 'app_metadata' ->> 'role',
    ''
  )
$$;

create or replace function private.is_manager() returns boolean
language sql stable as $$
  select private.current_role() = 'manager'
$$;

create or replace function private.is_staff_or_manager() returns boolean
language sql stable as $$
  select private.current_role() in ('manager', 'mot_tester')
$$;

-- =============================================================================
-- Job-number generator (atomic, server-side, never client-supplied)
-- =============================================================================

create or replace function private.next_job_number(p_garage_id uuid)
returns text
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_prefix text;
  v_year int := extract(year from now())::int;
  v_next int;
begin
  insert into private.job_number_seq as s (garage_id, prefix, year, next_value)
  values (
    p_garage_id,
    upper(substring((select slug from public.garages where id = p_garage_id), 1, 3)),
    v_year,
    1
  )
  on conflict (garage_id) do update
    set year = excluded.year,
        next_value = case when s.year = excluded.year then s.next_value else 1 end
  returning prefix, next_value into v_prefix, v_next;

  update private.job_number_seq
     set next_value = next_value + 1
   where garage_id = p_garage_id
  returning next_value - 1 into v_next;

  return format('%s-%s-%s', v_prefix, v_year, lpad(v_next::text, 5, '0'));
end $$;

revoke all on function private.next_job_number(uuid) from public, authenticated, anon;

-- =============================================================================
-- Soft-delete + GDPR
-- =============================================================================

create or replace function private.purge_customer(p_customer_id uuid)
returns void
language plpgsql
security definer
set search_path = private, public
as $$
begin
  delete from public.customers where id = p_customer_id;
end $$;

revoke all on function private.purge_customer(uuid) from public, authenticated, anon;

create or replace function private.customer_data_export(p_customer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = private, public
as $$
declare result jsonb;
begin
  select jsonb_build_object(
    'customer', to_jsonb(c),
    'vehicles', coalesce(jsonb_agg(distinct to_jsonb(v)) filter (where v.id is not null), '[]'::jsonb),
    'jobs',     coalesce(jsonb_agg(distinct to_jsonb(j)) filter (where j.id is not null), '[]'::jsonb)
  )
  into result
  from public.customers c
  left join public.vehicles v on v.customer_id = c.id
  left join public.jobs j on j.customer_id = c.id
  where c.id = p_customer_id
  group by c.id;

  return result;
end $$;

revoke all on function private.customer_data_export(uuid) from public, authenticated, anon;

-- =============================================================================
-- Lock down sensitive columns on `staff`
-- =============================================================================

revoke insert, update, delete on staff from authenticated, anon;
grant select on staff to authenticated;
grant update (full_name, phone) on staff to authenticated;

-- private schema must NEVER be exposed via PostgREST
revoke all on schema private from public, authenticated, anon;
revoke all on all tables in schema private from public, authenticated, anon;
revoke all on all functions in schema private from public, authenticated, anon;

-- ...BUT the JWT readers are called by every RLS policy as the
-- `authenticated` role, so they need EXECUTE + USAGE on the schema.
-- These functions are STABLE, take no user input, and only read GUCs —
-- safe to expose. The mutating helpers (next_job_number, purge_customer,
-- customer_data_export) stay locked.
grant usage on schema private to authenticated, anon;
grant execute on function private.current_garage()      to authenticated, anon;
grant execute on function private.current_role()        to authenticated, anon;
grant execute on function private.is_manager()          to authenticated, anon;
grant execute on function private.is_staff_or_manager() to authenticated, anon;

commit;
