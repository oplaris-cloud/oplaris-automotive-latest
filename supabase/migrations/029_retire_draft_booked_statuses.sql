-- 029_retire_draft_booked_statuses.sql
-- Retire `draft` and `booked` job statuses from the active flow.
-- Enum values stay in place (removing them is disruptive and breaks any
-- archived row that might still reference them). The state machine and
-- UI stop using them; `checked_in` is the single "not started yet"
-- value.

begin;

update public.jobs
   set status = 'checked_in'
 where status = 'draft'
   and deleted_at is null;

update public.jobs
   set status = 'checked_in'
 where status = 'booked'
   and deleted_at is null;

commit;

-- Jobs created via `create_job` now default to `checked_in` so the
-- promote/start flows don't need the separate draft→checked_in flip.
create or replace function public.create_job(
  p_customer_id uuid,
  p_vehicle_id uuid,
  p_description text default null,
  p_source public.job_source default 'manager',
  p_bay_id uuid default null,
  p_estimated_ready_at timestamptz default null
) returns uuid
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

  if private.current_role() <> 'manager' then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  v_staff_id := (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid;
  v_job_number := private.next_job_number(v_garage_id);

  insert into public.jobs (
    garage_id, job_number, customer_id, vehicle_id, bay_id,
    status, source, description, estimated_ready_at, created_by
  ) values (
    v_garage_id, v_job_number, p_customer_id, p_vehicle_id, p_bay_id,
    'checked_in', p_source, p_description, p_estimated_ready_at, v_staff_id
  ) returning id into v_job_id;

  return v_job_id;
end;
$$;
