-- 038_p55_work_log_pause.sql
-- P55 — Real pause / resume on work sessions.
--
-- Before: `pauseWork` and `completeWork` were identical — both just set
-- `ended_at`. Mechanic-facing "Pause" was a lie: the row was terminal
-- and there was no resume path. This migration introduces real pause
-- semantics:
--
--   paused_at            timestamptz — non-null iff the log is paused RIGHT NOW
--   paused_seconds_total int         — accumulated paused seconds over prior pauses
--   pause_count          int         — how many times pause has been hit
--
-- `duration_seconds` (generated column) is recomputed to subtract
-- `paused_seconds_total`, so every reader (reports, PDF, charges, the
-- P54 timeline view) automatically sees effective worked time — not
-- wall-clock time.
--
-- Three SECURITY DEFINER RPCs gate the state machine. Direct UPDATE
-- from the authenticated role is still allowed by RLS for backward
-- compatibility (manager retro-logging), but the mechanic UI routes
-- every transition through these RPCs so the invariants hold.

begin;

-- =============================================================================
-- 1. Columns
-- =============================================================================

alter table public.work_logs
  add column if not exists paused_at            timestamptz null,
  add column if not exists paused_seconds_total int         not null default 0,
  add column if not exists pause_count          int         not null default 0;

-- Sanity: cannot be paused after being ended, and totals cannot be negative.
alter table public.work_logs
  drop constraint if exists work_logs_pause_state_valid;
alter table public.work_logs
  add constraint work_logs_pause_state_valid
  check (
    (ended_at is null or paused_at is null)
    and paused_seconds_total >= 0
    and pause_count >= 0
  );

-- =============================================================================
-- 2. Recompute duration_seconds to net out paused time.
-- =============================================================================

-- Drop + re-add is the only way to change a generated column's
-- expression. Multiple views reference duration_seconds — we drop them
-- here (CASCADE on the column takes the view dependencies with it) and
-- recreate them after the column is reinstated. The re-created views
-- get the new formula's worked-time semantics for free.
drop view if exists public.job_timeline_events;
drop view if exists public.v_tech_hours;
drop view if exists public.v_common_repairs;

alter table public.work_logs drop column if exists duration_seconds;

alter table public.work_logs
  add column duration_seconds int generated always as (
    case
      when ended_at is null then null
      else greatest(
        0,
        extract(epoch from (ended_at - started_at))::int - paused_seconds_total
      )
    end
  ) stored;

-- =============================================================================
-- 3. pause_work_log — start a pause interval.
-- =============================================================================

create or replace function public.pause_work_log(p_work_log_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_log public.work_logs;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select * into v_log from public.work_logs where id = p_work_log_id;
  if not found then
    raise exception 'work log not found' using errcode = 'P0002';
  end if;

  if v_log.garage_id <> private.current_garage() then
    raise exception 'cross-tenant forbidden' using errcode = '42501';
  end if;

  -- Owner can pause their own log. Manager can pause anyone's for the
  -- override flows (e.g. P53 handler change).
  if v_log.staff_id <> v_uid and not private.has_role('manager') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_log.ended_at is not null then
    raise exception 'work log already ended' using errcode = 'P0001';
  end if;

  if v_log.paused_at is not null then
    raise exception 'work log already paused' using errcode = 'P0001';
  end if;

  update public.work_logs
     set paused_at   = now(),
         pause_count = pause_count + 1
   where id = p_work_log_id;
end $$;

revoke all     on function public.pause_work_log(uuid) from public, anon;
grant execute  on function public.pause_work_log(uuid) to authenticated;

comment on function public.pause_work_log(uuid) is
  'P55 - Pause an active work_logs row. Owner-or-manager gate, single-garage, rejects if already paused or ended.';

-- =============================================================================
-- 4. resume_work_log — end the current pause interval, fold into totals.
-- =============================================================================

create or replace function public.resume_work_log(p_work_log_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := auth.uid();
  v_log         public.work_logs;
  v_paused_for  int;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select * into v_log from public.work_logs where id = p_work_log_id;
  if not found then
    raise exception 'work log not found' using errcode = 'P0002';
  end if;

  if v_log.garage_id <> private.current_garage() then
    raise exception 'cross-tenant forbidden' using errcode = '42501';
  end if;

  if v_log.staff_id <> v_uid and not private.has_role('manager') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_log.ended_at is not null then
    raise exception 'work log already ended' using errcode = 'P0001';
  end if;

  if v_log.paused_at is null then
    raise exception 'work log not paused' using errcode = 'P0001';
  end if;

  v_paused_for := greatest(
    0,
    extract(epoch from (now() - v_log.paused_at))::int
  );

  update public.work_logs
     set paused_seconds_total = paused_seconds_total + v_paused_for,
         paused_at            = null
   where id = p_work_log_id;
end $$;

revoke all     on function public.resume_work_log(uuid) from public, anon;
grant execute  on function public.resume_work_log(uuid) to authenticated;

comment on function public.resume_work_log(uuid) is
  'P55 - Resume a paused work_logs row. Folds the in-progress pause duration into paused_seconds_total and clears paused_at.';

-- =============================================================================
-- 5. complete_work_log — terminal close-out. Folds in any live pause.
-- =============================================================================

create or replace function public.complete_work_log(p_work_log_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_log        public.work_logs;
  v_paused_for int;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select * into v_log from public.work_logs where id = p_work_log_id;
  if not found then
    raise exception 'work log not found' using errcode = 'P0002';
  end if;

  if v_log.garage_id <> private.current_garage() then
    raise exception 'cross-tenant forbidden' using errcode = '42501';
  end if;

  if v_log.staff_id <> v_uid and not private.has_role('manager') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Idempotent: completing an already-ended log is a no-op, not an
  -- error. Simplifies double-click handling on mobile.
  if v_log.ended_at is not null then
    return;
  end if;

  if v_log.paused_at is not null then
    v_paused_for := greatest(
      0,
      extract(epoch from (now() - v_log.paused_at))::int
    );
    update public.work_logs
       set paused_seconds_total = paused_seconds_total + v_paused_for,
           paused_at            = null,
           ended_at             = now()
     where id = p_work_log_id;
  else
    update public.work_logs
       set ended_at = now()
     where id = p_work_log_id;
  end if;
end $$;

revoke all     on function public.complete_work_log(uuid) from public, anon;
grant execute  on function public.complete_work_log(uuid) to authenticated;

comment on function public.complete_work_log(uuid) is
  'P55 - Close a work_logs row. Folds any in-progress pause into totals before setting ended_at. Idempotent for already-ended rows.';

-- =============================================================================
-- 6. Rebuild job_timeline_events so work_session / work_running payloads
--    expose the new pause totals (P54 tooltip surface).
-- =============================================================================

drop view if exists public.job_timeline_events;

create view public.job_timeline_events
  with (security_invoker = on)
  as
  -- Pass-back handoff
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

  -- Pass-back return
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

  -- Completed work session — carries the real pause totals now.
  select
    wl.id        as event_id,
    wl.job_id,
    wl.garage_id,
    'work_session' as kind,
    wl.staff_id  as actor_staff_id,
    wl.started_at as at,
    jsonb_build_object(
      'started_at',           wl.started_at,
      'ended_at',             wl.ended_at,
      'duration_seconds',     wl.duration_seconds,
      'paused_seconds_total', wl.paused_seconds_total,
      'paused_ms_total',      wl.paused_seconds_total * 1000,
      'pause_count',          wl.pause_count,
      'task_type',            wl.task_type,
      'description',          wl.description
    ) as payload
  from public.work_logs wl
  where wl.ended_at is not null

  union all

  -- Running (or paused) work session — pins to top of feed.
  select
    wl.id         as event_id,
    wl.job_id,
    wl.garage_id,
    'work_running' as kind,
    wl.staff_id   as actor_staff_id,
    wl.started_at as at,
    jsonb_build_object(
      'started_at',           wl.started_at,
      'paused_at',            wl.paused_at,
      'paused_seconds_total', wl.paused_seconds_total,
      'pause_count',          wl.pause_count,
      'task_type',            wl.task_type,
      'description',          wl.description
    ) as payload
  from public.work_logs wl
  where wl.ended_at is null

  union all

  -- Status transitions (unchanged from P54).
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
  'P54 + P55 - Unified feed view. work_session rows carry pause totals; work_running rows expose the live paused_at marker.';

-- =============================================================================
-- 7. Recreate the two reporting views that depended on duration_seconds.
--    Same shape; they now show effective worked time (pauses netted
--    out) automatically via the recomputed column.
-- =============================================================================

create view public.v_tech_hours as
  select wl.garage_id,
         s.id as staff_id,
         s.full_name,
         sum(wl.duration_seconds) filter (where wl.ended_at is not null)
           as total_seconds,
         count(*) filter (where wl.ended_at is null) as active_logs
    from public.work_logs wl
    join public.staff s on s.id = wl.staff_id
   where wl.started_at >= date_trunc('week', current_date::timestamptz)
   group by wl.garage_id, s.id, s.full_name;

grant select on public.v_tech_hours to authenticated;

create view public.v_common_repairs as
  select garage_id,
         task_type,
         count(*) as occurrence_count,
         sum(duration_seconds) filter (where ended_at is not null)
           as total_seconds
    from public.work_logs wl
   where started_at >= (current_date - interval '30 days')
   group by garage_id, task_type;

grant select on public.v_common_repairs to authenticated;

commit;
