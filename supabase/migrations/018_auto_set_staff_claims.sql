-- 018_auto_set_staff_claims.sql — Auto-set app_metadata when staff is created/updated
--
-- Problem: The Auth Hook (005) injects garage_id + role into JWTs at token
-- issuance, but it requires the hook to be registered in the Supabase dashboard.
-- If the hook isn't registered, or if you're on cloud Supabase where custom
-- hooks need explicit enablement, users get empty claims and RLS blocks everything.
--
-- Fix: This trigger writes garage_id + role directly into auth.users.raw_app_meta_data
-- whenever a staff row is inserted or updated. This is the definitive source —
-- GoTrue includes raw_app_meta_data in every JWT automatically, no hook needed.

begin;

-- Trigger function: sync staff + staff_roles → auth.users.raw_app_meta_data
create or replace function private.sync_staff_claims()
returns trigger
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_role text;
begin
  -- Look up role from private.staff_roles
  select sr.role::text into v_role
    from private.staff_roles sr
   where sr.staff_id = NEW.id;

  -- Merge garage_id + role into raw_app_meta_data
  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
       || jsonb_build_object(
            'garage_id', NEW.garage_id::text,
            'role', coalesce(v_role, 'mechanic')
          )
   where id = NEW.id;

  return NEW;
end;
$$;

-- Fire after INSERT or UPDATE on staff
drop trigger if exists trg_sync_staff_claims on staff;
create trigger trg_sync_staff_claims
  after insert or update on staff
  for each row
  execute function private.sync_staff_claims();

-- Also sync when a role is inserted/changed
create or replace function private.sync_role_claims()
returns trigger
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_garage_id uuid;
begin
  -- Look up garage from staff table
  select s.garage_id into v_garage_id
    from public.staff s
   where s.id = NEW.staff_id;

  -- Merge into raw_app_meta_data
  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
       || jsonb_build_object(
            'garage_id', v_garage_id::text,
            'role', NEW.role::text
          )
   where id = NEW.staff_id;

  return NEW;
end;
$$;

drop trigger if exists trg_sync_role_claims on private.staff_roles;
create trigger trg_sync_role_claims
  after insert or update on private.staff_roles
  for each row
  execute function private.sync_role_claims();

commit;
