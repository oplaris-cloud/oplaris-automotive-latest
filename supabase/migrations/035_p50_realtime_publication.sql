-- 035_p50_realtime_publication.sql
-- P50 — Universal realtime across the Dudley app.
--
-- Two database-side changes:
--   1. REPLICA IDENTITY FULL on every coverage-matrix table so UPDATE
--      payloads carry both old + new rows (lets the client distinguish
--      transitions e.g. converted_to_job_id flipping non-null).
--   2. Curate the `supabase_realtime` publication: add ONLY coverage
--      tables; everything else (audit_log, mot_history_cache, garages,
--      stock_locations, all private.*) stays out.
--
-- Security audit pre-conditions (verified before applying — see
-- MASTER_PLAN.md > P50 > Security plan):
--   * Every coverage-matrix table has rowsecurity=true with no
--     `USING (true)` or `USING (auth.uid() IS NOT NULL)` SELECT policy.
--   * Every UPDATE policy on those tables has a non-null WITH CHECK.
--   * `staff` carries no password column (auth lives in `auth.users`).
--   * Customer PII is gated by the existing SELECT policies — RLS
--     filters realtime payloads at the row level, so cross-tenant
--     subscribers receive zero frames (rule #1).
--
-- Tables explicitly EXCLUDED from the publication and why:
--   * audit_log         — security incident trail; subscribers must
--                         never see other staff's PII access patterns.
--   * mot_history_cache — derived from the DVSA API on demand; no
--                         multi-user UI need.
--   * garages           — single-row tenant config; static.
--   * stock_locations   — managed dropdown; low-frequency.
--   * private.*         — never published (rule #5: secrets server-only).
--   * approval_tokens   — already in the private schema; not publishable.
--   * rate_limits       — already in the private schema; not publishable.

begin;

-- =============================================================================
-- 1. REPLICA IDENTITY FULL on every coverage-matrix table.
-- =============================================================================

alter table public.bookings           replica identity full;
alter table public.jobs               replica identity full;
alter table public.work_logs          replica identity full;
alter table public.job_assignments    replica identity full;
alter table public.job_charges        replica identity full;
alter table public.job_parts          replica identity full;
alter table public.job_passbacks      replica identity full;
alter table public.approval_requests  replica identity full;
alter table public.invoices           replica identity full;
alter table public.customers          replica identity full;
alter table public.vehicles           replica identity full;
alter table public.stock_items        replica identity full;
alter table public.stock_movements    replica identity full;
alter table public.warranties         replica identity full;
alter table public.staff              replica identity full;
alter table public.bays               replica identity full;

-- =============================================================================
-- 2. Curate the supabase_realtime publication.
--    Add each coverage-matrix table; the publication was empty before this
--    migration so there is nothing to drop. ADD TABLE is idempotent if we
--    use a DO block to swallow duplicate-object errors on re-run.
-- =============================================================================

do $$
declare
  t text;
  coverage text[] := array[
    'public.bookings','public.jobs','public.work_logs','public.job_assignments',
    'public.job_charges','public.job_parts','public.job_passbacks',
    'public.approval_requests','public.invoices','public.customers',
    'public.vehicles','public.stock_items','public.stock_movements',
    'public.warranties','public.staff','public.bays'
  ];
begin
  foreach t in array coverage loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = split_part(t, '.', 1)
         and tablename  = split_part(t, '.', 2)
    ) then
      execute format('alter publication supabase_realtime add table %s', t);
    end if;
  end loop;
end $$;

-- =============================================================================
-- 3. Inline verification — run after apply.
--    These SELECTs are intentionally left as comments so a re-run doesn't
--    fail; copy them into a psql session to check.
-- =============================================================================

-- Coverage members:
--   select schemaname, tablename from pg_publication_tables
--    where pubname='supabase_realtime' order by 1,2;
--
-- S1 — banned tables MUST NOT appear:
--   select count(*) from pg_publication_tables
--    where pubname='supabase_realtime'
--      and tablename in ('audit_log','mot_history_cache','garages',
--                        'stock_locations','approval_tokens','rate_limits');
--   -- expected: 0
--
-- S2 — every coverage table has RLS enabled with no `USING (true)` /
--      `USING (auth.uid() IS NOT NULL)` SELECT policy:
--   see MASTER_PLAN P50 security plan §1 — query reproduced in
--   tests/rls/realtime_publication.test.ts.
--
-- S3 — every UPDATE policy on those tables has WITH CHECK non-null:
--   see same test file.

commit;
