-- 065_super_admin.sql — Oplaris super_admin (platform support) role
--
-- Adds a privileged operator role that lives OUTSIDE garage_id scoping.
-- A super_admin can:
--   * Read every garage's data (read-side RLS overlay)
--   * Pick a garage to "enter" — once entered, the impersonation header
--     scopes their writes to that garage just as a manager's would
--   * View the cross-garage audit log
--
-- Defence-in-depth:
--   1. Membership lives in a private schema table — never reachable
--      via PostgREST. Manager-readable via SECURITY DEFINER helpers
--      only.
--   2. The JWT claim `app_metadata.is_super_admin` is set by the auth
--      hook, NOT by the user — a forged JWT can't add the flag because
--      Supabase signs it with a server-only secret.
--   3. Impersonation header `X-Oplaris-Impersonate` is honoured ONLY
--      when the JWT also carries `is_super_admin=true`. A manager
--      sending the header just gets their own garage_id back.
--   4. Every mutation a super_admin performs writes an `audit_log`
--      entry with action='super_admin_<op>' and full before/after
--      payload. Audit trigger is attached to every mutated table that
--      a super_admin can reach.
--   5. Write-side RLS policies are UNCHANGED — super_admin writes
--      flow through the same `garage_id = private.current_garage()`
--      check, which the impersonation header satisfies. They can't
--      INSERT a row into garage X while impersonating garage Y.

begin;

-- =============================================================================
-- 1. private.platform_admins membership table
-- =============================================================================

create table private.platform_admins (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id),
  revoked_at  timestamptz,
  notes       text
);

-- Private schema is never exposed via PostgREST (revoked in mig 002),
-- so no RLS policies needed — the table is simply unreachable from
-- the REST API. The only way in is via SECURITY DEFINER helpers below.

-- =============================================================================
-- 2. private.is_super_admin() — reads the JWT claim
-- =============================================================================

create or replace function private.is_super_admin() returns boolean
language sql stable as $$
  select coalesce(
    (
      current_setting('request.jwt.claims', true)::jsonb
        -> 'app_metadata' ->> 'is_super_admin'
    )::boolean,
    false
  )
$$;

grant execute on function private.is_super_admin() to authenticated, anon;

-- =============================================================================
-- 3. Update custom_access_token_hook — adds is_super_admin claim
-- =============================================================================
--
-- The hook is the only path that writes the claim. A user in
-- platform_admins with revoked_at IS NULL gets is_super_admin=true.
-- Anything else gets explicit false. Soft-revoke is a single UPDATE
-- on platform_admins; the next token refresh picks it up.

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = private, public
as $$
declare
  v_user_id uuid := (event ->> 'user_id')::uuid;
  v_claims  jsonb := coalesce(event -> 'claims', '{}'::jsonb);
  v_app_md  jsonb := coalesce(v_claims -> 'app_metadata', '{}'::jsonb);
  v_garage  uuid;
  v_roles   text[];
  v_active  boolean;
  v_is_sa   boolean;
begin
  -- Look up staff row (existing behaviour from mig 025)
  select s.garage_id, s.is_active
    into v_garage, v_active
    from public.staff s
   where s.id = v_user_id;

  -- Aggregate all roles
  select array_agg(sr.role::text)
    into v_roles
    from private.staff_roles sr
   where sr.staff_id = v_user_id;

  -- B6.1 — platform_admins membership lookup
  select exists (
    select 1
      from private.platform_admins
     where user_id = v_user_id
       and revoked_at is null
  ) into v_is_sa;

  if v_active is false then
    v_roles := null;
    v_garage := null;
  end if;

  v_app_md := v_app_md
    || jsonb_build_object(
         'garage_id',      to_jsonb(v_garage),
         'roles',          to_jsonb(v_roles),
         'role',           to_jsonb(v_roles[1]),  -- backward compat
         'is_super_admin', to_jsonb(coalesce(v_is_sa, false))
       );

  v_claims := jsonb_set(v_claims, '{app_metadata}', v_app_md, true);
  return jsonb_build_object('claims', v_claims);
end $$;

-- =============================================================================
-- 4. private.current_garage() — honours impersonation header
-- =============================================================================
--
-- For a super_admin: read `request.headers.x-oplaris-impersonate`
-- first; fall back to JWT app_metadata.garage_id (which will usually
-- be null for a super_admin who has no staff row).
--
-- For everyone else: unchanged — JWT claim only. A non-super-admin
-- sending the impersonation header gets their own garage_id back, so
-- the header alone can't escalate.
--
-- The reason this works without a custom Supabase plumbing layer is
-- that PostgREST already populates `request.headers` GUC on every
-- request. We never trust the header on its own — only when the JWT
-- already proved is_super_admin.

create or replace function private.current_garage() returns uuid
language sql stable as $$
  select case
    when private.is_super_admin() then
      coalesce(
        nullif(
          coalesce(
            current_setting('request.headers', true)::jsonb
              ->> 'x-oplaris-impersonate',
            ''
          ),
          ''
        )::uuid,
        nullif(
          coalesce(
            current_setting('request.jwt.claims', true)::jsonb
              -> 'app_metadata' ->> 'garage_id',
            ''
          ),
          ''
        )::uuid
      )
    else
      nullif(
        coalesce(
          current_setting('request.jwt.claims', true)::jsonb
            -> 'app_metadata' ->> 'garage_id',
          ''
        ),
        ''
      )::uuid
  end
$$;

-- =============================================================================
-- 5. public.super_admin_enter_garage(p_garage_id uuid)
-- =============================================================================
--
-- The Server Action calls this RPC, then sets the signed cookie that
-- carries the X-Oplaris-Impersonate header on subsequent requests.
-- The RPC validates membership + writes the audit_log entry; the
-- cookie itself is the Next.js layer's responsibility.

create or replace function public.super_admin_enter_garage(p_garage_id uuid)
returns void
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_actor uuid;
  v_exists boolean;
begin
  if not private.is_super_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select exists (select 1 from public.garages where id = p_garage_id)
    into v_exists;
  if not v_exists then
    raise exception 'garage not found' using errcode = 'P0002';
  end if;

  v_actor := nullif(
    coalesce(
      current_setting('request.jwt.claims', true)::jsonb ->> 'sub',
      ''
    ),
    ''
  )::uuid;

  insert into public.audit_log (
    garage_id, actor_staff_id, action, target_table, target_id, meta
  )
  values (
    p_garage_id,
    null,                    -- super_admin has no staff row
    'super_admin_enter',
    'garages',
    p_garage_id,
    jsonb_build_object(
      'super_admin_user_id',  v_actor::text,
      'impersonated_garage',  p_garage_id::text,
      'at',                   now()
    )
  );
end $$;

revoke all on function public.super_admin_enter_garage(uuid)
  from public, anon;
grant execute on function public.super_admin_enter_garage(uuid)
  to authenticated;

-- =============================================================================
-- 6. Generic super_admin audit trigger
-- =============================================================================
--
-- Fires AFTER INSERT/UPDATE/DELETE on every mutated table that's in
-- super_admin's reach. Writes one audit_log row per change with the
-- before/after payload + actor user_id + impersonated_garage so we
-- can reconstruct any super_admin session later.
--
-- AFTER (not BEFORE) so the mutation is committed before the audit
-- write — keeps the audit accurate when a CHECK constraint or trigger
-- aborts the underlying change.

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
begin
  if not private.is_super_admin() then
    -- Regular staff mutations are out of scope; existing per-table
    -- audit_log writes (e.g. P52 override_job_handler, B4 trader trigger)
    -- already cover the rows we care about for tenant-internal review.
    return coalesce(NEW, OLD);
  end if;

  v_actor := nullif(
    coalesce(
      current_setting('request.jwt.claims', true)::jsonb ->> 'sub',
      ''
    ),
    ''
  )::uuid;

  v_garage := private.current_garage();

  -- Try common id columns; all curated tables expose `id` uuid.
  if NEW is not null then
    v_target := (to_jsonb(NEW) ->> 'id')::uuid;
  elsif OLD is not null then
    v_target := (to_jsonb(OLD) ->> 'id')::uuid;
  end if;

  insert into public.audit_log (
    garage_id, actor_staff_id, action, target_table, target_id, meta
  )
  values (
    coalesce(
      v_garage,
      (to_jsonb(coalesce(NEW, OLD)) ->> 'garage_id')::uuid
    ),
    null,
    'super_admin_' || v_op,
    TG_TABLE_NAME,
    v_target,
    jsonb_build_object(
      'super_admin_user_id', v_actor::text,
      'impersonated_garage', v_garage::text,
      'before', case when OLD is not null then to_jsonb(OLD) else null end,
      'after',  case when NEW is not null then to_jsonb(NEW) else null end
    )
  );

  return coalesce(NEW, OLD);
end $$;

revoke all on function private.audit_super_admin_change()
  from public, authenticated, anon;

-- Apply trigger to the curated mutated table set. Keep this list in
-- sync with the RLS overlays below — every table a super_admin can
-- write to gets the trigger.
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
-- 7. RLS read-side overlays — OR private.is_super_admin()
-- =============================================================================
--
-- Every table a super_admin needs to READ across garages gets its
-- SELECT policy extended. Write policies (INSERT/UPDATE/DELETE) are
-- left untouched — super_admin writes go through current_garage()
-- impersonation, so they can only mutate the entered garage.
--
-- We replace the policy in place to keep `pg_dump` clean. The new
-- predicate is `(existing) OR private.is_super_admin()`.

-- garages: existing policy is `id = current_garage()`. Super admin
-- needs to LIST garages to pick one. The audit_log entry on
-- super_admin_enter is what proves a deliberate visit; the list
-- itself is metadata.
drop policy if exists garages_select on public.garages;
create policy garages_select on public.garages
  for select to authenticated
  using (
    id = private.current_garage()
    or private.is_super_admin()
  );

-- staff: existing policy scopes by garage. Super admin sees all.
drop policy if exists staff_select on public.staff;
create policy staff_select on public.staff
  for select to authenticated
  using (
    garage_id = private.current_garage()
    or private.is_super_admin()
  );

-- bays
drop policy if exists bays_select on public.bays;
create policy bays_select on public.bays
  for select to authenticated
  using (
    garage_id = private.current_garage()
    or private.is_super_admin()
  );

-- customers (existing has `deleted_at is null` clause — preserve it)
drop policy if exists customers_select on public.customers;
create policy customers_select on public.customers
  for select to authenticated
  using (
    (garage_id = private.current_garage() and deleted_at is null)
    or private.is_super_admin()
  );

-- vehicles
drop policy if exists vehicles_select on public.vehicles;
create policy vehicles_select on public.vehicles
  for select to authenticated
  using (
    (garage_id = private.current_garage() and deleted_at is null)
    or private.is_super_admin()
  );

-- jobs
drop policy if exists jobs_select on public.jobs;
create policy jobs_select on public.jobs
  for select to authenticated
  using (
    garage_id = private.current_garage()
    or private.is_super_admin()
  );

-- bookings
drop policy if exists bookings_select on public.bookings;
create policy bookings_select on public.bookings
  for select to authenticated
  using (
    garage_id = private.current_garage()
    or private.is_super_admin()
  );

-- invoices
drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices
  for select to authenticated
  using (
    garage_id = private.current_garage()
    or private.is_super_admin()
  );

-- job_charges
drop policy if exists job_charges_select on public.job_charges;
create policy job_charges_select on public.job_charges
  for select to authenticated
  using (
    garage_id = private.current_garage()
    or private.is_super_admin()
  );

-- job_parts
drop policy if exists job_parts_select on public.job_parts;
create policy job_parts_select on public.job_parts
  for select to authenticated
  using (
    garage_id = private.current_garage()
    or private.is_super_admin()
  );

-- work_logs
drop policy if exists work_logs_select on public.work_logs;
create policy work_logs_select on public.work_logs
  for select to authenticated
  using (
    garage_id = private.current_garage()
    or private.is_super_admin()
  );

-- audit_log: existing policy required is_manager(); super_admin gets
-- a parallel path so /admin/audit can render across garages without
-- needing manager role.
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (
    (garage_id = private.current_garage() and private.is_manager())
    or private.is_super_admin()
  );

-- =============================================================================
-- 8. Cross-garage helpers used by the /admin UI
-- =============================================================================

-- List all garages (super_admin only) — alias for the policy-backed
-- SELECT but keeps the UI code single-purpose.
create or replace function public.list_garages_for_super_admin()
returns table (
  id uuid,
  name text,
  slug text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = private, public
as $$
begin
  if not private.is_super_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query
    select g.id, g.name, g.slug, g.created_at
      from public.garages g
     order by g.name asc;
end $$;

revoke all on function public.list_garages_for_super_admin()
  from public, anon;
grant execute on function public.list_garages_for_super_admin()
  to authenticated;

commit;
