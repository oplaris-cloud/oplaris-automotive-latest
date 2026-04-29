-- 060_p3_3_completion_checks.sql
-- P3.3 — Submitted-check rows + SECURITY DEFINER RPC + view extension.
--
-- Records every tech's checklist submission. INSERT is mediated via
-- public.submit_completion_check so the (garage, role, items) match the
-- live config row, the staff is actually assigned to the job, and an
-- audit_log entry lands in the same transaction.
--
-- Adds the new rows to:
--   * public.job_timeline_events — extended view returns
--     ('completion_check', submitted_at) rows so the JobActivity surface
--     picks them up with no client changes.
--   * supabase_realtime publication + REPLICA IDENTITY FULL — manager
--     pages refresh on submission via the existing
--     useRealtimeRouterRefresh hook.

begin;

-- =============================================================================
-- 1. public.job_completion_checks — append-only submission log.
-- =============================================================================

create table if not exists public.job_completion_checks (
  id            uuid primary key default gen_random_uuid(),
  garage_id     uuid not null references public.garages(id) on delete cascade,
  job_id        uuid not null references public.jobs(id)    on delete cascade,
  staff_id      uuid not null references public.staff(id)   on delete restrict,
  role          text not null check (role in ('mechanic', 'mot_tester')),
  answers       jsonb not null,
  submitted_at  timestamptz not null default now()
);

create index if not exists job_completion_checks_job_idx
  on public.job_completion_checks (job_id, submitted_at desc);
create index if not exists job_completion_checks_staff_idx
  on public.job_completion_checks (staff_id, submitted_at desc);
create index if not exists job_completion_checks_garage_idx
  on public.job_completion_checks (garage_id, submitted_at desc);

-- =============================================================================
-- 2. RLS — read for same-garage staff; writes mediated by the RPC.
-- =============================================================================

alter table public.job_completion_checks enable row level security;

-- Any same-garage authenticated staff can SELECT (manager dashboards +
-- staff detail page + the JobActivity timeline all need this).
drop policy if exists job_completion_checks_select on public.job_completion_checks;
create policy job_completion_checks_select on public.job_completion_checks
  for select to authenticated
  using (garage_id = private.current_garage());

-- INSERT/UPDATE/DELETE locked at the table level. The RPC below is
-- SECURITY DEFINER and writes through the table owner, bypassing RLS.
revoke insert, update, delete on public.job_completion_checks
  from authenticated, anon;
grant  select on public.job_completion_checks to authenticated;

-- =============================================================================
-- 3. public.submit_completion_check — atomic insert + audit_log entry.
-- =============================================================================

create or replace function public.submit_completion_check(
  p_job_id   uuid,
  p_answers  jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_garage    uuid;
  v_role      text;
  v_items     jsonb;
  v_enabled   boolean;
  v_check_id  uuid;
  v_count     int;
  v_idx       int;
  v_q         text;
  v_a         text;
begin
  -- 1. Auth.
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  -- 2. Tenant + assignment check. The staff must hold an active row
  --    on this job; managers may submit on behalf of a tech via direct
  --    UPDATE, but the RPC path is for the assigned tech only.
  select j.garage_id into v_garage
    from public.jobs j
    join public.job_assignments ja
      on ja.job_id = j.id
     and ja.staff_id = v_uid
   where j.id = p_job_id
     and j.deleted_at is null;

  if v_garage is null or v_garage <> private.current_garage() then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  -- 3. Resolve which role the submitter is acting as. If they hold
  --    'mechanic' we prefer that (most jobs are mechanic-led); if not,
  --    fall back to 'mot_tester'. Manager-only users never see the
  --    dialog (no checklist row matches).
  if private.has_role('mechanic') then
    v_role := 'mechanic';
  elsif private.has_role('mot_tester') then
    v_role := 'mot_tester';
  else
    raise exception 'role does not require a completion check'
      using errcode = 'P0001';
  end if;

  -- 4. Pull the live checklist for that (garage, role). Reject if it's
  --    disabled or empty — the dialog should never have rendered, so
  --    this is a stale-client signal.
  select items, enabled
    into v_items, v_enabled
    from public.job_completion_checklists
   where garage_id = v_garage
     and role = v_role;

  if v_items is null then
    raise exception 'no checklist configured' using errcode = 'P0001';
  end if;
  if v_enabled is not true then
    raise exception 'checklist is not enabled' using errcode = 'P0001';
  end if;
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'checklist is empty' using errcode = 'P0001';
  end if;

  -- 5. Validate `p_answers`: array, same length as items, each entry
  --    {question, answer}, each question matches the live items at the
  --    same index, each answer ∈ {yes,no,n/a}.
  if jsonb_typeof(p_answers) <> 'array' then
    raise exception 'answers must be a jsonb array' using errcode = 'P0001';
  end if;

  v_count := jsonb_array_length(v_items);
  if jsonb_array_length(p_answers) <> v_count then
    raise exception 'answers do not match checklist length'
      using errcode = 'P0001';
  end if;

  for v_idx in 0 .. v_count - 1 loop
    v_q := p_answers -> v_idx ->> 'question';
    v_a := p_answers -> v_idx ->> 'answer';
    if v_q is null or v_a is null then
      raise exception 'answer entry missing fields'
        using errcode = 'P0001';
    end if;
    if v_q <> (v_items ->> v_idx) then
      raise exception 'answer question does not match checklist'
        using errcode = 'P0001';
    end if;
    if v_a not in ('yes', 'no', 'n/a') then
      raise exception 'answer must be yes / no / n/a'
        using errcode = 'P0001';
    end if;
  end loop;

  -- 6. Insert the submission.
  insert into public.job_completion_checks
    (garage_id, job_id, staff_id, role, answers)
  values
    (v_garage, p_job_id, v_uid, v_role, p_answers)
  returning id into v_check_id;

  -- 7. Audit trail entry — feeds the manager-only /app/settings/audit-log
  --    page and any future tech-accountability surface.
  insert into public.audit_log
    (garage_id, actor_staff_id, action, target_table, target_id, meta)
  values (
    v_garage, v_uid, 'completion_check_submitted',
    'job_completion_checks', v_check_id,
    jsonb_build_object(
      'job_id',  p_job_id,
      'role',    v_role,
      'answers', p_answers
    )
  );

  return v_check_id;
end $$;

revoke all on function public.submit_completion_check(uuid, jsonb)
  from public, anon;
grant execute on function public.submit_completion_check(uuid, jsonb)
  to authenticated;

comment on function public.submit_completion_check(uuid, jsonb) is
  'P3.3 — Atomic INSERT into job_completion_checks with assignment + checklist + answer-shape validation, plus an audit_log entry. Caller must be authenticated, hold a tech role, and be assigned to the target job in the same garage.';

-- =============================================================================
-- 4. Realtime: add job_completion_checks to the publication + REPLICA FULL.
-- =============================================================================

alter table public.job_completion_checks replica identity full;

do $$
begin
  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename  = 'job_completion_checks'
  ) then
    alter publication supabase_realtime add table public.job_completion_checks;
  end if;
end $$;

-- =============================================================================
-- 5. Extend public.job_timeline_events to include completion_check rows.
--    Recreate the view as a UNION ALL over the existing branches plus a
--    new completion_check branch.
-- =============================================================================

drop view if exists public.job_timeline_events;

create view public.job_timeline_events
  with (security_invoker = on)
  as
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
      'paused_ms_total',      coalesce(wl.paused_seconds_total, 0) * 1000,
      'pause_count',          wl.pause_count,
      'task_type',            wl.task_type,
      'description',          wl.description
    ) as payload
  from public.work_logs wl
  where wl.ended_at is not null

  union all

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
  from public.job_status_events e

  union all

  -- P3.3 — completion checklist submissions.
  select
    cc.id               as event_id,
    cc.job_id,
    cc.garage_id,
    'completion_check'  as kind,
    cc.staff_id         as actor_staff_id,
    cc.submitted_at     as at,
    jsonb_build_object(
      'role',    cc.role,
      'answers', cc.answers
    ) as payload
  from public.job_completion_checks cc;

grant select on public.job_timeline_events to authenticated;

comment on view public.job_timeline_events is
  'P54 + P3.3 - Unified chronological feed: pass-backs, work sessions, status transitions, completion checklist submissions. security_invoker = on; viewer RLS applies.';

commit;
