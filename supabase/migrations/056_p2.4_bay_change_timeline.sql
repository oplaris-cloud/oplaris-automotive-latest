-- 056_p2.4_bay_change_timeline.sql
-- P2.4 — bay chooser + audit trail.
--
-- Two changes layered on top of the existing audit_log + job_timeline_events
-- surface:
--
-- 1. New SELECT policy on `audit_log` letting any staff member (manager,
--    mechanic, mot_tester) read rows that are *strictly bay assignment /
--    change events*. Catch-all SELECT stays manager-only — bay rows
--    don't carry customer PII so a tech reading the timeline doesn't
--    leak the kind of trail Rule #11 protects.
--
-- 2. View `public.job_timeline_events` extended with a `bay_change` kind
--    sourced from those audit_log rows. The view stays
--    `security_invoker = on`, so the new policy is what controls
--    visibility in the unified feed.
--
-- The actual writes (bay_assigned + bay_changed rows) happen from the
-- server actions `createJobFromCheckIn` and `/api/bay-board/move`.
-- audit_log already accepts free-form `action text`, so no DDL on the
-- table itself.

begin;

-- ---------------------------------------------------------------------------
-- 1. Staff-readable bay-change SELECT policy on audit_log
-- ---------------------------------------------------------------------------

drop policy if exists audit_log_select_bay_changes on public.audit_log;
create policy audit_log_select_bay_changes on public.audit_log
  for select
  to authenticated
  using (
    garage_id = private.current_garage()
    and target_table = 'jobs'
    and action in ('bay_assigned', 'bay_changed')
  );

comment on policy audit_log_select_bay_changes on public.audit_log is
  'P2.4 - bay-change rows are readable by any staff member in the same
   garage (the garage_id check is the tenant gate; we deliberately do
   NOT call is_staff_or_manager() because that helper excludes mechanics
   — see migration 025). Bay events are non-PII workshop coordination
   data, so widening past the manager-only catch-all is safe. PII
   reads (action like pii_read) stay manager-only via the existing
   audit_log_select policy.';

-- ---------------------------------------------------------------------------
-- 2. Extend job_timeline_events with bay_change rows
-- ---------------------------------------------------------------------------

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
      'started_at',         wl.started_at,
      'ended_at',           wl.ended_at,
      'duration_seconds',   wl.duration_seconds,
      'paused_seconds_total', wl.paused_seconds_total,
      'paused_ms_total',    wl.paused_seconds_total * 1000,
      'pause_count',        wl.pause_count,
      'task_type',          wl.task_type,
      'description',        wl.description
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

  -- Bay assignment / change (P2.4).
  -- audit_log row payload (meta) carries from_bay_id / to_bay_id /
  -- from_bay_name / to_bay_name. The fetcher (server-side) decides
  -- what to surface on the customer-facing timeline (currently:
  -- nothing — bay is staff-internal context). audit_log.id is bigint
  -- so we cast every event_id to text for the UNION's column-type
  -- compatibility — fetch.ts already types it as `string`, so this
  -- is a wire-compatible change.
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
  'P54 + P2.4 - Unified chronological feed of pass-backs + work sessions
   + status transitions + bay changes for a job. security_invoker = on;
   per-base-table RLS controls visibility (audit_log_select_bay_changes
   gates the bay_change kind for non-manager staff).';

commit;
