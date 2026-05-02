-- 066_super_admin_harden_json.sql — defensive JSON casts for JWT GUCs
--
-- Migration 065 added a generic audit trigger and a richer
-- current_garage(). Both call `current_setting('request.jwt.claims',
-- true)::jsonb`. That cast errors when the GUC is the empty string ''
-- — which Postgres leaves behind after a `SET LOCAL` + ROLLBACK
-- (the GUC is not unset, just blanked). Production never hits this
-- because PostgREST always passes a fully-formed JWT, but the test
-- harness's withTx pattern does, and the audit trigger fires on
-- EVERY mutation regardless of role, so the breakage cascades.
--
-- Fix: wrap every `current_setting(...)::jsonb` cast in
-- `nullif(..., '')` so the empty-string state collapses to NULL,
-- which casts cleanly to `null::jsonb`. is_super_admin returns
-- false, current_garage returns NULL, the trigger short-circuits,
-- and existing tests pass.

begin;

create or replace function private.is_super_admin() returns boolean
language sql stable as $$
  select coalesce(
    (
      nullif(current_setting('request.jwt.claims', true), '')::jsonb
        -> 'app_metadata' ->> 'is_super_admin'
    )::boolean,
    false
  )
$$;

create or replace function private.current_garage() returns uuid
language sql stable as $$
  select case
    when private.is_super_admin() then
      coalesce(
        nullif(
          coalesce(
            nullif(current_setting('request.headers', true), '')::jsonb
              ->> 'x-oplaris-impersonate',
            ''
          ),
          ''
        )::uuid,
        nullif(
          coalesce(
            nullif(current_setting('request.jwt.claims', true), '')::jsonb
              -> 'app_metadata' ->> 'garage_id',
            ''
          ),
          ''
        )::uuid
      )
    else
      nullif(
        coalesce(
          nullif(current_setting('request.jwt.claims', true), '')::jsonb
            -> 'app_metadata' ->> 'garage_id',
          ''
        ),
        ''
      )::uuid
  end
$$;

-- Also harden current_role + current_roles in case the same
-- empty-string GUC shape ever bubbles up from another helper. These
-- two existed before 065 with a partially-defensive `coalesce(... ,'')`
-- but still fed an unsanitised GUC into ::jsonb / `-> 'app_metadata'`.
create or replace function private.current_role() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb
      -> 'app_metadata' ->> 'role',
    ''
  )
$$;

create or replace function private.current_roles() returns text[]
language sql stable as $$
  select coalesce(
    (
      select array_agg(r)
      from jsonb_array_elements_text(
        nullif(current_setting('request.jwt.claims', true), '')::jsonb
          -> 'app_metadata' -> 'roles'
      ) as r
    ),
    ARRAY[
      nullif(
        coalesce(
          nullif(current_setting('request.jwt.claims', true), '')::jsonb
            -> 'app_metadata' ->> 'role',
          ''
        ),
        ''
      )
    ]
  )
$$;

-- Audit trigger — same hardening. Also re-create from 065 to pick up
-- the safer helpers above.
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
begin
  if not private.is_super_admin() then
    return coalesce(NEW, OLD);
  end if;

  v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_actor := nullif(coalesce(v_claims ->> 'sub', ''), '')::uuid;
  v_garage := private.current_garage();

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

-- Re-attach the trigger to every curated table — picks up the new
-- function body cleanly.
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

commit;
