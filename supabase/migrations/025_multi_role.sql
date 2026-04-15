-- 025_multi_role.sql — Support multiple roles per staff member
--
-- Changes:
--   1. Add `roles text[]` column to staff table
--   2. Backfill from existing `role` column
--   3. Drop old `role` column
--   4. Allow multiple rows in private.staff_roles (composite PK)
--   5. Update auth hook to aggregate roles into array
--   6. Update sync triggers for array-based roles
--   7. Add new RLS helpers: current_roles(), has_role()
--   8. Rewrite is_manager() and is_staff_or_manager() to use has_role()

begin;

-- =============================================================================
-- 1. Add roles array column to staff
-- =============================================================================

alter table staff add column if not exists roles text[];

-- 2. Backfill from existing single role column
update staff set roles = ARRAY[role] where role is not null and roles is null;

-- 3. Drop old single-role column
alter table staff drop column if exists role;

-- =============================================================================
-- 4. Allow multiple roles in private.staff_roles
-- =============================================================================

-- Drop the old PK (staff_id only) and add composite PK
alter table private.staff_roles drop constraint if exists staff_roles_pkey;
alter table private.staff_roles add primary key (staff_id, role);

-- =============================================================================
-- 5. New RLS helpers: current_roles() and has_role()
-- =============================================================================

create or replace function private.current_roles() returns text[]
language sql stable as $$
  select coalesce(
    (
      select array_agg(r)
      from jsonb_array_elements_text(
        current_setting('request.jwt.claims', true)::jsonb
          -> 'app_metadata' -> 'roles'
      ) as r
    ),
    -- Backward compat: if old single 'role' claim exists, wrap in array
    ARRAY[
      nullif(
        coalesce(
          current_setting('request.jwt.claims', true)::jsonb
            -> 'app_metadata' ->> 'role',
          ''
        ),
        ''
      )
    ]
  )
$$;

create or replace function private.has_role(p_role text) returns boolean
language sql stable as $$
  select p_role = ANY(private.current_roles())
$$;

-- Keep current_role() for backward compat (returns first role)
create or replace function private.current_role() returns text
language sql stable as $$
  select (private.current_roles())[1]
$$;

-- Rewrite is_manager() and is_staff_or_manager() to use has_role()
create or replace function private.is_manager() returns boolean
language sql stable as $$
  select private.has_role('manager')
$$;

create or replace function private.is_staff_or_manager() returns boolean
language sql stable as $$
  select private.has_role('manager') or private.has_role('mot_tester')
$$;

-- Grant execute on new functions
grant execute on function private.current_roles() to authenticated, anon;
grant execute on function private.has_role(text)  to authenticated, anon;

-- =============================================================================
-- 6. Update auth hook to return roles array
-- =============================================================================

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
begin
  -- Look up staff row
  select s.garage_id, s.is_active
    into v_garage, v_active
    from public.staff s
   where s.id = v_user_id;

  -- Aggregate all roles
  select array_agg(sr.role::text)
    into v_roles
    from private.staff_roles sr
   where sr.staff_id = v_user_id;

  if v_active is false then
    v_roles := null;
    v_garage := null;
  end if;

  -- Set both garage_id and roles array in app_metadata
  v_app_md := v_app_md
    || jsonb_build_object(
         'garage_id', to_jsonb(v_garage),
         'roles',     to_jsonb(v_roles),
         'role',      to_jsonb(v_roles[1])  -- backward compat
       );

  v_claims := jsonb_set(v_claims, '{app_metadata}', v_app_md, true);
  return jsonb_build_object('claims', v_claims);
end;
$$;

-- =============================================================================
-- 7. Update sync triggers for multi-role
-- =============================================================================

create or replace function private.sync_staff_claims()
returns trigger
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_roles text[];
begin
  -- Aggregate all roles from private.staff_roles
  select array_agg(sr.role::text) into v_roles
    from private.staff_roles sr
   where sr.staff_id = NEW.id;

  -- Merge garage_id + roles into raw_app_meta_data
  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
       || jsonb_build_object(
            'garage_id', NEW.garage_id::text,
            'roles', to_jsonb(coalesce(v_roles, ARRAY['mechanic'])),
            'role', coalesce(v_roles[1], 'mechanic')
          )
   where id = NEW.id;

  return NEW;
end;
$$;

create or replace function private.sync_role_claims()
returns trigger
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_garage_id uuid;
  v_roles text[];
begin
  -- Look up garage from staff table
  select s.garage_id into v_garage_id
    from public.staff s
   where s.id = NEW.staff_id;

  -- Aggregate ALL roles for this staff member
  select array_agg(sr.role::text) into v_roles
    from private.staff_roles sr
   where sr.staff_id = NEW.staff_id;

  -- Merge into raw_app_meta_data
  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
       || jsonb_build_object(
            'garage_id', v_garage_id::text,
            'roles', to_jsonb(coalesce(v_roles, ARRAY[NEW.role::text])),
            'role', coalesce(v_roles[1], NEW.role::text)
          )
   where id = NEW.staff_id;

  return NEW;
end;
$$;

commit;
