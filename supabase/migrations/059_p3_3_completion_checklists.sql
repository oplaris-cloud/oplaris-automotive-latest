-- 059_p3_3_completion_checklists.sql
-- P3.3 — End-of-job checklist (manager-configurable, per role).
--
-- Creates the configuration table that the manager edits in
-- /app/settings/checklists. One row per (garage, role). When `enabled`
-- is true and `items` is non-empty, the tech UI shows a blocking
-- ChecklistDialog before completing a job.
--
-- Migration 060 lands the *submission* table (`job_completion_checks`)
-- and the SECURITY DEFINER RPC; this migration is just the config
-- surface so a settings page exists for the manager to populate the
-- list before any tech encounters the dialog.

begin;

-- =============================================================================
-- 1. public.job_completion_checklists — config rows.
-- =============================================================================

create table if not exists public.job_completion_checklists (
  id          uuid primary key default gen_random_uuid(),
  garage_id   uuid not null references public.garages(id) on delete cascade,
  role        text not null check (role in ('mechanic', 'mot_tester')),
  items       jsonb not null default '[]'::jsonb,
  enabled     boolean not null default false,
  updated_at  timestamptz not null default now()
);

create unique index if not exists job_completion_checklists_garage_role_idx
  on public.job_completion_checklists (garage_id, role);

-- Trigger to bump updated_at on UPDATE. Reuses the existing helper
-- defined in 001_init.sql.
drop trigger if exists touch_completion_checklists_updated_at
  on public.job_completion_checklists;
create trigger touch_completion_checklists_updated_at
  before update on public.job_completion_checklists
  for each row
  execute function private.touch_updated_at();

-- =============================================================================
-- 2. RLS — read for any same-garage staff, write for managers only.
-- =============================================================================
--
-- All staff need read access so the tech UI can fetch the checklist for
-- their role before showing the modal. Write access is gated to
-- managers via private.has_role('manager') + scoped to their garage.

alter table public.job_completion_checklists enable row level security;

drop policy if exists job_completion_checklists_select
  on public.job_completion_checklists;
create policy job_completion_checklists_select
  on public.job_completion_checklists
  for select
  to authenticated
  using (garage_id = private.current_garage());

drop policy if exists job_completion_checklists_insert_manager
  on public.job_completion_checklists;
create policy job_completion_checklists_insert_manager
  on public.job_completion_checklists
  for insert
  to authenticated
  with check (
    garage_id = private.current_garage()
    and private.has_role('manager')
  );

drop policy if exists job_completion_checklists_update_manager
  on public.job_completion_checklists;
create policy job_completion_checklists_update_manager
  on public.job_completion_checklists
  for update
  to authenticated
  using (
    garage_id = private.current_garage()
    and private.has_role('manager')
  )
  with check (
    garage_id = private.current_garage()
    and private.has_role('manager')
  );

drop policy if exists job_completion_checklists_delete_manager
  on public.job_completion_checklists;
create policy job_completion_checklists_delete_manager
  on public.job_completion_checklists
  for delete
  to authenticated
  using (
    garage_id = private.current_garage()
    and private.has_role('manager')
  );

-- garage_id stays revoked from authenticated so a manager can't move a
-- row across tenants (CLAUDE.md §3 — sensitive columns server-side only).
revoke update (garage_id) on public.job_completion_checklists from authenticated;

-- =============================================================================
-- 3. Seed: one disabled row per (garage, role) with the spec defaults.
--    Idempotent via the unique (garage_id, role) index — re-runs no-op.
-- =============================================================================

insert into public.job_completion_checklists (garage_id, role, items, enabled)
select
  g.id,
  r.role,
  jsonb_build_array(
    'Have you returned the wheel locking nut?',
    'Have you put your tools away?',
    'Have you left the vehicle clean?'
  ),
  false
from public.garages g
cross join (values ('mechanic'), ('mot_tester')) as r(role)
on conflict (garage_id, role) do nothing;

commit;
