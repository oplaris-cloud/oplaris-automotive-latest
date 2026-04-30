-- 061_restore_bay_change_timeline.sql
-- Hotfix: migration 060 dropped + recreated public.job_timeline_events
-- to add the completion_check branch but accidentally lost the
-- bay_change UNION branch that migration 056 had introduced. Result:
-- since 060 landed (2026-04-29), customer + manager job-detail
-- timelines stopped surfacing bay-assignment / bay-change events even
-- though audit_log + audit_log_select_bay_changes RLS were intact.
--
-- This migration re-creates the view with EVERY branch present:
--   * passed_to_<role>       (job_passbacks insert)
--   * returned_from_<role>   (job_passbacks return)
--   * work_session           (closed work_logs)
--   * work_running           (open work_logs)
--   * status_changed         (job_status_events, P54)
--   * completion_check       (job_completion_checks, P3.3 / mig 060)
--   * bay_change             (audit_log bay_assigned / bay_changed,
--                             P2.4 / mig 056 — the branch this fix
--                             restores)
--
-- Implementation notes:
--   * Every event_id is cast to text so the UNION can mix uuid PKs
--     (passbacks, work_logs, status events, completion checks) with
--     the bigint-keyed audit_log row (`'al-' || al.id::text`). The
--     fetcher already types event_id as string (src/lib/timeline/
--     fetch.ts:31) so this is wire-compatible — the prior
--     completion_check branch in 060 returned a uuid event_id, but
--     PostgREST serializes it to a JSON string regardless.
--   * `with (security_invoker = on)` keeps RLS evaluation caller-side
--     so audit_log_select_bay_changes (mig 056) gates the bay_change
--     kind for non-manager staff, exactly as before.

begin;

drop view if exists public.job_timeline_events;

create view public.job_timeline_events
  with (security_invoker = on)
  as
  -- Pass-back handoff (MOT tester → mechanic, or vice versa).
  select
    jp.id::text      as event_id,
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
    jp.id::text    as event_id,
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
    wl.id::text  as event_id,
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
      'paused_ms_total',      coalesce(wl.paused_seconds_total, 0) * 1000,
      'pause_count',          wl.pause_count,
      'task_type',            wl.task_type,
      'description',          wl.description
    ) as payload
  from public.work_logs wl
  where wl.ended_at is not null

  union all

  -- Running work session — pins to the top of the feed until closed.
  select
    wl.id::text   as event_id,
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

  -- Status transitions (P54).
  select
    e.id::text       as event_id,
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
  from public.job_status_events e

  union all

  -- Completion checklist submissions (P3.3 / mig 060).
  select
    cc.id::text          as event_id,
    cc.job_id,
    cc.garage_id,
    'completion_check'   as kind,
    cc.staff_id          as actor_staff_id,
    cc.submitted_at      as at,
    jsonb_build_object(
      'role',    cc.role,
      'answers', cc.answers
    ) as payload
  from public.job_completion_checks cc

  union all

  -- Bay assignment / change (P2.4 / mig 056 — restored here after
  -- 060 accidentally dropped this branch when adding completion_check).
  select
    'al-' || al.id::text as event_id,
    al.target_id        as job_id,
    al.garage_id        as garage_id,
    'bay_change'        as kind,
    al.actor_staff_id,
    al.created_at       as at,
    coalesce(al.meta, '{}'::jsonb)
      || jsonb_build_object('action', al.action) as payload
  from public.audit_log al
  where al.target_table = 'jobs'
    and al.action in ('bay_assigned', 'bay_changed');

grant select on public.job_timeline_events to authenticated;

comment on view public.job_timeline_events is
  'P54 + P2.4 + P3.3 - Unified chronological feed of pass-backs +
   work sessions + status transitions + completion checklists + bay
   changes for a job. security_invoker = on; per-base-table RLS
   controls visibility (audit_log_select_bay_changes gates the
   bay_change kind for non-manager staff).';

commit;
