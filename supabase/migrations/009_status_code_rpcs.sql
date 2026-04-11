-- 009_status_code_rpcs.sql — RPCs for status page code storage + verification

begin;

-- Store a new status code (called by service_role via admin client)
create or replace function public.store_status_code(
  p_garage_id uuid,
  p_vehicle_id uuid,
  p_phone_hash text,
  p_reg_hash text,
  p_code_hash text,
  p_expires_at timestamptz,
  p_ip text default null
)
returns void
language plpgsql
security definer
set search_path = private
as $$
begin
  insert into private.status_codes (
    garage_id, vehicle_id, phone_hash, reg_hash,
    code_hash, expires_at, ip
  ) values (
    p_garage_id, p_vehicle_id, p_phone_hash, p_reg_hash,
    p_code_hash, p_expires_at, p_ip::inet
  );
end;
$$;

revoke execute on function public.store_status_code(uuid, uuid, text, text, text, timestamptz, text)
  from public, anon, authenticated;

-- Verify a status code. Returns the vehicle_id if valid, null if not.
-- Single-use: sets consumed_at on success.
create or replace function public.verify_status_code(
  p_phone_hash text,
  p_reg_hash text,
  p_code_hash text
)
returns uuid
language plpgsql
security definer
set search_path = private
as $$
declare
  v_vehicle_id uuid;
begin
  update private.status_codes
     set consumed_at = now()
   where phone_hash = p_phone_hash
     and reg_hash = p_reg_hash
     and code_hash = p_code_hash
     and expires_at > now()
     and consumed_at is null
  returning vehicle_id into v_vehicle_id;

  return v_vehicle_id;
end;
$$;

revoke execute on function public.verify_status_code(text, text, text)
  from public, anon, authenticated;

commit;
