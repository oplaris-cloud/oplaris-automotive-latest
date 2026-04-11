-- 004_seed.sql — Dudley Auto Service tenant + 5 bays
-- Idempotent: safe to re-run. Real staff users land in Phase 2 via Auth Hook.

begin;

insert into garages (id, name, slug, timezone, status_subdomain)
values (
  '00000000-0000-0000-0000-0000000d0d1e',
  'Dudley Auto Service',
  'dudley',
  'Europe/London',
  'dudley'
)
on conflict (id) do nothing;

insert into bays (garage_id, name, position, capability) values
  ('00000000-0000-0000-0000-0000000d0d1e', 'Bay 1 MOT',         1, array['mot']),
  ('00000000-0000-0000-0000-0000000d0d1e', 'Bay 2 Ramp',        2, array['ramp']),
  ('00000000-0000-0000-0000-0000000d0d1e', 'Bay 3 Ramp + Tyres',3, array['ramp','tyres']),
  ('00000000-0000-0000-0000-0000000d0d1e', 'Bay 4 Electrical',  4, array['electrical']),
  ('00000000-0000-0000-0000-0000000d0d1e', 'Bay 5 General',     5, array['ramp'])
on conflict (garage_id, name) do nothing;

-- Seed the job-number sequence so the very first job is DUD-2026-00001
insert into private.job_number_seq (garage_id, prefix, year, next_value)
values ('00000000-0000-0000-0000-0000000d0d1e', 'DUD', extract(year from now())::int, 1)
on conflict (garage_id) do nothing;

commit;
