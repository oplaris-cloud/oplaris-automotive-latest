-- 033_p51_passback_as_event.sql
-- P51 — Pass-back is an event on ONE job, not a new booking or new job.
--
-- Replaces the P47 "insert a second booking" pattern. From now on:
--   * MOT tester → Pass to mechanic flips jobs."current_role" from
--     'mot_tester' to 'mechanic' and appends a job_passbacks event row.
--   * Mechanic → Return to MOT tester flips "current_role" back and stamps
--     the same event's returned_at.
-- Only one bookings row, one jobs row, one invoice per vehicle visit.
--
-- NB: "current_role" is a SQL-reserved identifier (PG built-in function).
-- We keep the spec name and always double-quote it in raw SQL. PostgREST /
-- supabase-js quote column names for us, so the TS side is unaffected.
--
-- The deprecated columns and enum value are kept nullable for a 2-week
-- soak. Migration 034 (follow-up) will drop them.

begin;

-- =============================================================================
-- 1. Add jobs."current_role" — whose court is the ball in.
-- =============================================================================

alter table public.jobs
  add column if not exists "current_role" private.staff_role null;

comment on column public.jobs."current_role" is
  'P51 — active handler for this job (mot_tester | mechanic | manager). NULL when the job is completed/cancelled/unstarted.';

-- Backfill from today's state. Completed/cancelled jobs get NULL;
-- awaiting_mechanic / awaiting_passback jobs → 'mechanic';
-- remaining MOT jobs → 'mot_tester'; everything else → 'mechanic'.
update public.jobs set "current_role" = case
  when status in ('completed', 'cancelled') then null
  when coalesce(awaiting_passback, false) = true
    or status = 'awaiting_mechanic' then 'mechanic'::private.staff_role
  when service = 'mot' then 'mot_tester'::private.staff_role
  else 'mechanic'::private.staff_role
end
where "current_role" is null;

-- Deprecation markers on the old fields. Do NOT drop yet.
comment on column public.jobs.awaiting_passback is
  'DEPRECATED by P51 (migration 033). Use jobs."current_role". Slated for removal in migration 034 after soak.';

-- =============================================================================
-- 2. job_passbacks — audit trail, one row per handoff event.
-- =============================================================================

create table if not exists public.job_passbacks (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references public.garages(id) on delete cascade,
  job_id    uuid not null references public.jobs(id)    on delete cascade,
  from_role private.staff_role not null,
  to_role   private.staff_role not null,
  from_staff_id uuid null references public.staff(id) on delete set null,
  to_staff_id   uuid null references public.staff(id) on delete set null,
  items  jsonb not null default '[]'::jsonb,
  note   text  null,
  created_at  timestamptz not null default now(),
  returned_at timestamptz null,
  constraint job_passbacks_roles_differ check (from_role <> to_role)
);

alter table public.job_passbacks enable row level security;

create index if not exists job_passbacks_job_idx
  on public.job_passbacks (job_id, created_at desc);
create index if not exists job_passbacks_garage_idx
  on public.job_passbacks (garage_id);

-- SELECT: anyone who can see the parent job can see its pass-back events.
drop policy if exists job_passbacks_select on public.job_passbacks;
create policy job_passbacks_select on public.job_passbacks
  for select to authenticated
  using (
    garage_id = private.current_garage()
    and exists (
      select 1 from public.jobs j
       where j.id = public.job_passbacks.job_id
         and j.garage_id = public.job_passbacks.garage_id
    )
  );

-- INSERT / UPDATE / DELETE: only via SECURITY DEFINER RPCs below.
revoke insert, update, delete on public.job_passbacks from authenticated, anon;
grant  select                on public.job_passbacks to authenticated;

-- =============================================================================
-- 3. pass_job_to_mechanic(p_job_id, p_items, p_note)
--    Called by the MOT tester (or manager override).
-- =============================================================================

create or replace function public.pass_job_to_mechanic(
  p_job_id uuid,
  p_items  jsonb,
  p_note   text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_job public.jobs;
  v_passback_id uuid;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select * into v_job from public.jobs where id = p_job_id;
  if not found then
    raise exception 'job not found' using errcode = 'P0002';
  end if;

  if v_job.garage_id <> private.current_garage() then
    raise exception 'cross-tenant forbidden' using errcode = '42501';
  end if;

  if not (private.has_role('mot_tester') or private.is_manager()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_job."current_role" is distinct from 'mot_tester'::private.staff_role then
    raise exception 'job not currently with mot_tester' using errcode = 'P0001';
  end if;

  -- Close any running work-log the tester had on this job.
  update public.work_logs
     set ended_at = now()
   where job_id = p_job_id
     and staff_id = v_uid
     and ended_at is null;

  update public.jobs
     set "current_role" = 'mechanic'::private.staff_role,
         updated_at = now()
   where id = p_job_id;

  insert into public.job_passbacks
    (garage_id, job_id, from_role, to_role, from_staff_id, items, note)
  values
    (v_job.garage_id, p_job_id,
     'mot_tester'::private.staff_role,
     'mechanic'::private.staff_role,
     v_uid, coalesce(p_items, '[]'::jsonb), nullif(btrim(p_note), ''))
  returning id into v_passback_id;

  return v_passback_id;
end $$;

revoke all on function public.pass_job_to_mechanic(uuid, jsonb, text)
  from public, anon;
grant execute on function public.pass_job_to_mechanic(uuid, jsonb, text)
  to authenticated;

-- =============================================================================
-- 4. return_job_to_mot_tester(p_job_id)
--    Called by the mechanic (or manager override) when work is done.
-- =============================================================================

create or replace function public.return_job_to_mot_tester(
  p_job_id uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_job public.jobs;
  v_passback_id uuid;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select * into v_job from public.jobs where id = p_job_id;
  if not found then
    raise exception 'job not found' using errcode = 'P0002';
  end if;

  if v_job.garage_id <> private.current_garage() then
    raise exception 'cross-tenant forbidden' using errcode = '42501';
  end if;

  if not (private.has_role('mechanic') or private.is_manager()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_job."current_role" is distinct from 'mechanic'::private.staff_role then
    raise exception 'job not currently with mechanic' using errcode = 'P0001';
  end if;

  -- Stop any running mechanic work-log on this job.
  update public.work_logs
     set ended_at = now()
   where job_id = p_job_id
     and staff_id = v_uid
     and ended_at is null;

  update public.jobs
     set "current_role" = 'mot_tester'::private.staff_role,
         updated_at = now()
   where id = p_job_id;

  update public.job_passbacks
     set returned_at = now(),
         to_staff_id = v_uid
   where id = (
     select id from public.job_passbacks
      where job_id = p_job_id
        and returned_at is null
      order by created_at desc
      limit 1
   )
   returning id into v_passback_id;

  return v_passback_id;
end $$;

revoke all on function public.return_job_to_mot_tester(uuid)
  from public, anon;
grant execute on function public.return_job_to_mot_tester(uuid)
  to authenticated;

-- =============================================================================
-- 4b. claim_passback(p_job_id)
--     Mechanic takes the passed-back job into their queue. Inserts a row
--     into job_assignments (manager-only INSERT RLS) via SECURITY DEFINER.
-- =============================================================================

create or replace function public.claim_passback(
  p_job_id uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_job public.jobs;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select * into v_job from public.jobs where id = p_job_id;
  if not found then
    raise exception 'job not found' using errcode = 'P0002';
  end if;

  if v_job.garage_id <> private.current_garage() then
    raise exception 'cross-tenant forbidden' using errcode = '42501';
  end if;

  if not (private.has_role('mechanic') or private.is_manager()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_job."current_role" is distinct from 'mechanic'::private.staff_role then
    raise exception 'job not currently with mechanic' using errcode = 'P0001';
  end if;

  insert into public.job_assignments (job_id, staff_id, garage_id)
  values (p_job_id, v_uid, v_job.garage_id)
  on conflict (job_id, staff_id) do nothing;
end $$;

revoke all on function public.claim_passback(uuid) from public, anon;
grant execute on function public.claim_passback(uuid) to authenticated;

-- =============================================================================
-- 5. Retire the old pass-back-via-booking RPC.
-- =============================================================================

revoke execute on function public.insert_passback_booking(
  uuid, public.booking_service, text, text, text, text, text, text, text, jsonb, uuid
) from authenticated;

comment on function public.insert_passback_booking(
  uuid, public.booking_service, text, text, text, text, text, text, text, jsonb, uuid
) is 'DEPRECATED by P51 (migration 033). Use public.pass_job_to_mechanic() on the job. Scheduled for removal in migration 034.';

commit;
