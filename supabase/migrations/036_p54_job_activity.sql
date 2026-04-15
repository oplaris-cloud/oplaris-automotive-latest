-- 036_p54_job_activity.sql
-- P54 — Unified Job Activity timeline.
--
-- Adds a canonical status-history table + a SECURITY DEFINER helper for
-- atomic status updates + a UNION ALL view that stitches pass-backs,
-- work sessions, and status changes into one chronological feed.
--
-- Pass-back data lives in `job_passbacks` (P51). Work sessions live in
-- `work_logs` (P44 — note: our schema uses `staff_id` + `ended_at`, not
-- the `technician_id`/`completed_at`/`paused_ms_total` names used in
-- earlier design drafts. We expose `paused_ms_total` on the view as 0
-- so the consumer contract stays stable when pause tracking lands).
--
-- Status events are new. Every transition through `updateJobStatus`
-- writes one row. Existing jobs are backfilled with a single event at
-- `jobs.created_at` (best-effort — real history starts at P54 go-live;
-- the prod DB is wiped before Phase 5 anyway).

begin;

-- =============================================================================
-- 1. public.job_status_events — append-only status transition log.
-- =============================================================================

create table if not exists public.job_status_events (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references public.garages(id) on delete cascade,
  job_id    uuid not null references public.jobs(id)    on delete cascade,
  from_status public.job_status null,
  to_status   public.job_status not null,
  actor_staff_id uuid null references public.staff(id) on delete set null,
  reason text null,
  at timestamptz not null default now()
);

create index if not exists job_status_events_job_at_idx
  on public.job_status_events (job_id, at desc);
create index if not exists job_status_events_garage_at_idx
  on public.job_status_events (garage_id, at desc);

alter table public.job_status_events enable row level security;

-- SELECT: anyone who can see the job can see its history.
drop policy if exists job_status_events_select on public.job_status_events;
create policy job_status_events_select on public.job_status_events
  for select to authenticated
  using (
    garage_id = private.current_garage()
    and exists (
      select 1 from public.jobs j
       where j.id = public.job_status_events.job_id
         and j.deleted_at is null
         and j.garage_id = public.job_status_events.garage_id
    )
  );

-- INSERT/UPDATE/DELETE: only via the SECURITY DEFINER helper below.
revoke insert, update, delete on public.job_status_events from authenticated, anon;
grant  select                on public.job_status_events to authenticated;

-- =============================================================================
-- 2. public.set_job_status — atomic update + event insert.
-- =============================================================================

create or replace function public.set_job_status(
  p_job_id    uuid,
  p_new_status public.job_status,
  p_reason    text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_garage   uuid;
  v_from     public.job_status;
  v_event_id uuid;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  -- Any authenticated staff role may transition status; transition
  -- legality is validated in the server action (isValidTransition +
  -- role gating via requireManagerOrTester).
  if not (private.has_role('manager')
          or private.has_role('mot_tester')
          or private.has_role('mechanic')) then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  select garage_id, status into v_garage, v_from
    from public.jobs
   where id = p_job_id
     and deleted_at is null;

  if v_garage is null or v_garage <> private.current_garage() then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  -- Belt-and-braces: the P51 pass-back flow owns the transition to
  -- 'awaiting_mechanic'. A raw status flip here would bypass the
  -- job_passbacks event write, which P54's timeline depends on.
  if p_new_status = 'awaiting_mechanic'::public.job_status then
    raise exception 'use pass_job_to_mechanic' using errcode = 'P0001';
  end if;

  update public.jobs
     set status       = p_new_status,
         completed_at = case
           when p_new_status = 'completed'::public.job_status then now()
           else completed_at
         end,
         updated_at   = now()
   where id = p_job_id;

  insert into public.job_status_events
    (garage_id, job_id, from_status, to_status, actor_staff_id, reason)
  values
    (v_garage, p_job_id, v_from, p_new_status, v_uid,
     nullif(btrim(p_reason), ''))
  returning id into v_event_id;

  return v_event_id;
end $$;

revoke all on function public.set_job_status(uuid, public.job_status, text)
  from public, anon;
grant execute on function public.set_job_status(uuid, public.job_status, text)
  to authenticated;

comment on function public.set_job_status(uuid, public.job_status, text) is
  'P54 - Atomic jobs.status update + job_status_events insert. Caller must be authenticated staff in the job''s garage. Transition legality is the caller''s responsibility.';

-- =============================================================================
-- 3. Best-effort backfill: one event per existing job at created_at.
-- =============================================================================

insert into public.job_status_events
  (garage_id, job_id, from_status, to_status, actor_staff_id, reason, at)
select
  j.garage_id,
  j.id,
  null::public.job_status,
  j.status,
  null::uuid,
  'Backfilled at P54 go-live',
  j.created_at
from public.jobs j
left join public.job_status_events e on e.job_id = j.id
where e.id is null;

-- =============================================================================
-- 4. public.job_timeline_events — the unified read view.
-- =============================================================================
--
-- security_invoker = on is load-bearing: Postgres 15+ defaults views to
-- security_definer, which would bypass the viewer's RLS on the base
-- tables and leak across tenants. With security_invoker the view
-- re-checks RLS as the caller on every underlying SELECT.

drop view if exists public.job_timeline_events;

create view public.job_timeline_events
  with (security_invoker = on)
  as
  -- Pass-back handoff (MOT tester → mechanic, or vice versa).
  select
    jp.id            as event_id,
    jp.job_id        as job_id,
    jp.garage_id     as garage_id,
    ('passed_to_' || jp.to_role::text) as kind,
    jp.from_staff_id as actor_staff_id,
    jp.created_at    as at,
    jsonb_build_object(
      'items',       jp.items,
      'note',        jp.note,
      'from_role',   jp.from_role::text,
      'to_role',     jp.to_role::text,
      'to_staff_id', jp.to_staff_id,
      'passback_id', jp.id
    ) as payload
  from public.job_passbacks jp

  union all

  -- Pass-back return (technician finishes, role flips back).
  select
    jp.id          as event_id,
    jp.job_id,
    jp.garage_id,
    ('returned_from_' || jp.from_role::text) as kind,
    jp.to_staff_id as actor_staff_id,
    jp.returned_at as at,
    jsonb_build_object(
      'from_role',   jp.from_role::text,
      'to_role',     jp.to_role::text,
      'passback_id', jp.id
    ) as payload
  from public.job_passbacks jp
  where jp.returned_at is not null

  union all

  -- Completed work session (one row per closed work_logs row).
  select
    wl.id        as event_id,
    wl.job_id,
    wl.garage_id,
    'work_session' as kind,
    wl.staff_id  as actor_staff_id,
    wl.started_at as at,
    jsonb_build_object(
      'started_at',       wl.started_at,
      'ended_at',         wl.ended_at,
      'duration_seconds', wl.duration_seconds,
      'paused_ms_total',  0,
      'task_type',        wl.task_type,
      'description',      wl.description
    ) as payload
  from public.work_logs wl
  where wl.ended_at is not null

  union all

  -- Running work session — pins to the top of the feed until closed.
  select
    wl.id         as event_id,
    wl.job_id,
    wl.garage_id,
    'work_running' as kind,
    wl.staff_id   as actor_staff_id,
    wl.started_at as at,
    jsonb_build_object(
      'started_at',  wl.started_at,
      'task_type',   wl.task_type,
      'description', wl.description
    ) as payload
  from public.work_logs wl
  where wl.ended_at is null

  union all

  -- Status transitions.
  select
    e.id             as event_id,
    e.job_id,
    e.garage_id,
    'status_changed' as kind,
    e.actor_staff_id,
    e.at,
    jsonb_build_object(
      'from_status', e.from_status::text,
      'to_status',   e.to_status::text,
      'reason',      e.reason
    ) as payload
  from public.job_status_events e;

grant select on public.job_timeline_events to authenticated;

comment on view public.job_timeline_events is
  'P54 - Unified chronological feed of pass-backs + work sessions + status transitions for a job. security_invoker = on; viewer RLS applies.';

-- =============================================================================
-- 5. Realtime: add job_status_events to the supabase_realtime publication.
-- =============================================================================

alter table public.job_status_events replica identity full;

do $$
begin
  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename  = 'job_status_events'
  ) then
    alter publication supabase_realtime add table public.job_status_events;
  end if;
end $$;

commit;
