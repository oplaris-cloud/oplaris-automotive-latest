-- 005_auth_hook.sql — Supabase Auth custom-access-token hook
--
-- GoTrue calls this function every time it mints a JWT (login, refresh,
-- password change). We read the staff's garage + role from the locked-down
-- `private.staff_roles` table and merge them into `app_metadata` on the
-- claims. RLS then reads them via `private.current_garage()` /
-- `private.current_role()`.
--
-- Why this matters: the user can never write to `staff_roles` or to the
-- JWT, so there is no client-side path to self-promote. Role + tenant
-- assignment is a database fact that flows through the auth hook on
-- every token issuance.

begin;

-- =============================================================================
-- The hook
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
  v_role    text;
  v_active  boolean;
begin
  -- Look up the staff row + role in a single join. Inactive staff still
  -- get a token (GoTrue already authenticated them) but with `role=null`
  -- so every RLS policy denies them.
  select s.garage_id, sr.role::text, s.is_active
    into v_garage, v_role, v_active
    from public.staff s
    left join private.staff_roles sr on sr.staff_id = s.id
   where s.id = v_user_id;

  if v_active is false then
    v_role := null;
    v_garage := null;
  end if;

  -- Always set both keys (jsonb_set refuses to create missing paths).
  v_app_md := v_app_md
    || jsonb_build_object(
         'garage_id', to_jsonb(v_garage),
         'role',      to_jsonb(v_role)
       );

  v_claims := jsonb_set(v_claims, '{app_metadata}', v_app_md, true);
  return jsonb_build_object('claims', v_claims);
end;
$$;

comment on function public.custom_access_token_hook(jsonb) is
  'Supabase Auth custom-access-token hook. Injects garage_id + role into '
  'app_metadata on every token issuance. Called by supabase_auth_admin only.';

-- =============================================================================
-- Grants — only supabase_auth_admin may call this, and only it may read
-- the tables the hook touches (via its own privileges, bypassing RLS).
-- =============================================================================

-- Hook function: GoTrue calls it, nobody else.
revoke execute on function public.custom_access_token_hook(jsonb)
  from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb)
  to supabase_auth_admin;

-- The hook is SECURITY DEFINER (owned by postgres), so it inherits
-- postgres' privileges when reading staff/staff_roles. We still grant
-- supabase_auth_admin direct read access so future migrations that make
-- the function SECURITY INVOKER would still work.
grant usage on schema private to supabase_auth_admin;
grant select on public.staff to supabase_auth_admin;
grant select on private.staff_roles to supabase_auth_admin;

-- The hook function is SECURITY DEFINER owned by postgres, so it inherits
-- postgres' superuser privileges for reading staff/staff_roles. No
-- separate RLS policy needed for supabase_auth_admin — the function
-- body runs as the owner, not the caller.

commit;
