-- 006_create_job_rpc.sql — Server-callable RPC for job creation
--
-- `private.next_job_number()` is locked to authenticated users.
-- This thin SECURITY DEFINER wrapper is callable by authenticated and
-- enforces garage_id from the JWT (never client-supplied).

begin;

create or replace function public.create_job(
  p_customer_id uuid,
  p_vehicle_id uuid,
  p_description text default null,
  p_source job_source default 'manager',
  p_bay_id uuid default null,
  p_estimated_ready_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_garage_id uuid := private.current_garage();
  v_staff_id uuid;
  v_job_number text;
  v_job_id uuid;
begin
  if v_garage_id is null then
    raise exception 'no garage_id in JWT claims';
  end if;

  -- Only managers can create jobs
  if private.current_role() <> 'manager' then
    raise exception 'insufficient_privilege'
      using errcode = '42501';
  end if;

  -- Resolve the caller's staff id from the JWT sub claim
  v_staff_id := (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid;

  -- Generate the next job number atomically
  v_job_number := private.next_job_number(v_garage_id);

  insert into jobs (
    garage_id, job_number, customer_id, vehicle_id, bay_id,
    status, source, description, estimated_ready_at, created_by
  ) values (
    v_garage_id, v_job_number, p_customer_id, p_vehicle_id, p_bay_id,
    'draft', p_source, p_description, p_estimated_ready_at, v_staff_id
  ) returning id into v_job_id;

  return v_job_id;
end;
$$;

-- Authenticated staff can call this; the function enforces garage_id internally.
grant execute on function public.create_job(uuid, uuid, text, job_source, uuid, timestamptz)
  to authenticated;

commit;
