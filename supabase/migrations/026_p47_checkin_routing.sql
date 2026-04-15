-- 026_p47_checkin_routing.sql
-- P47 — Role-aware check-in routing + MOT→mechanic passback.
--
-- Shape:
--   bookings: priority, passback_note, passback_items, passed_from_job_id,
--             deleted_at (soft-delete for P41).
--   jobs:     service (mot/electrical/maintenance), awaiting_passback.
--   RLS:      bookings SELECT is role-scoped; manager bypass. Manager
--             remains sole writer (bookings_update policy from 003 stays).
--
-- The awaiting_mechanic enum value is added in a separate migration
-- (026_p47_enum_awaiting_mechanic) so it's committed before use.

-- 1. bookings columns
alter table public.bookings
  add column if not exists priority smallint not null default 0,
  add column if not exists passback_note text,
  add column if not exists passback_items jsonb,
  add column if not exists passed_from_job_id uuid references public.jobs(id) on delete set null,
  add column if not exists deleted_at timestamptz;

-- 2. jobs columns
alter table public.jobs
  add column if not exists service public.booking_service,
  add column if not exists awaiting_passback boolean not null default false;

-- Backfill jobs.service from the originating booking where linkable
update public.jobs j
   set service = b.service
  from public.bookings b
 where b.job_id = j.id
   and j.service is null;

-- 3. Indexes
create index if not exists bookings_priority_idx
  on public.bookings (priority desc, created_at);

create index if not exists bookings_passed_from_job_id_idx
  on public.bookings (passed_from_job_id)
  where passed_from_job_id is not null;

create index if not exists jobs_service_idx
  on public.jobs (service)
  where service is not null;

-- 4. Role-scoped bookings SELECT policy
--    manager    → all check-ins (soft-deleted hidden)
--    mot_tester → only MOT check-ins (surfaced via Today / My Work)
--    mechanic   → electrical + maintenance + any passback (priority queue)
drop policy if exists bookings_select on public.bookings;
create policy bookings_select on public.bookings
  for select to authenticated
  using (
    garage_id = private.current_garage()
    and deleted_at is null
    and (
      private.is_manager()
      or (private.has_role('mot_tester') and service = 'mot')
      or (
        private.has_role('mechanic')
        and (service in ('electrical','maintenance') or passed_from_job_id is not null)
      )
    )
  );

-- 5. bookings_update policy already enforces is_manager() (from 003_rls).
--    Leave it alone; P47 writes (start-MOT, pass-back, soft-delete) go
--    through Server Actions that either run as manager or use SECURITY
--    DEFINER RPCs authored alongside the feature code.
