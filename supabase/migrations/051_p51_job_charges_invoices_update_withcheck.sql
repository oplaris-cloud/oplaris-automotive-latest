-- 051_p51_job_charges_invoices_update_withcheck.sql
--
-- CLAUDE.md Rule #3 literal fix: `job_charges_update` and
-- `invoices_update` previously had `WITH CHECK` as NULL. Postgres
-- treats a NULL WITH CHECK as permissive — any row shape that passes
-- USING can be written. That's a direct Rule #3 violation ("Every
-- INSERT/UPDATE policy has WITH CHECK") and means a session that can
-- SEE a row (via USING) can mutate any column — including
-- `garage_id`, `total_pence`, `quote_status`, `paid_at` — to any value
-- without policy resistance. Closes the gap by mirroring each table's
-- existing INSERT-WITH-CHECK predicate and adding the `job_id`→garage
-- consistency check from migrations 049 / 050.
--
-- Deliberate scope choices (for the future reader — do NOT "clean
-- these up" by accident):
--
--   * **Preserve the staff-subquery predicate form**
--     `(select staff.garage_id from public.staff where staff.id =
--      auth.uid())` rather than normalising to
--     `private.current_garage()`. Functionally equivalent on the
--     shipped schema (both resolve via the same staff row) but
--     inconsistent with every other policy in the repo. The
--     normalisation is tracked in `docs/redesign/PRE_PHASE_4_HARDENING.md`
--     under "predicate-style normalisation" — scheduled for the
--     pre-Phase-4 hardening sweep, NOT this migration. This migration
--     is a rule-compliance fix, not a refactor. A future diff-reader
--     should be able to take the INSERT predicate + the one new
--     EXISTS clause and reconstruct this migration from muscle
--     memory. Don't reshape mid-flight.
--
--   * **Don't touch USING clauses.** USING decides which existing
--     rows the session can see for UPDATE. The bug is in WITH CHECK
--     (post-UPDATE shape validation), not USING. Keeping USING as-is
--     means this migration is additive: no previously-visible row
--     becomes invisible, no previously-allowed UPDATE shape that
--     respected tenancy suddenly 42501s. Only cross-tenant / dangling-
--     job-id mutations start failing.
--
--   * **Don't touch DELETE.** `job_charges_delete` exists with a
--     USING-only policy; DELETE has no WITH CHECK to add (the row is
--     already gone). Out of scope.
--
-- Application-layer impact:
--   * `src/app/(app)/app/jobs/charges/actions.ts > updateCharge` and
--     the invoice-lifecycle state-flip actions (`markAsInvoiced`,
--     `markAsPaid`, `revertToQuoted`, `revertToInvoiced` —
--     migrations 045 + 046) all run via the RLS-enforced user session
--     and always write `garage_id = session.garageId` on existing
--     rows inside the same garage. They already satisfy the new
--     predicate. No application code change needed.
--   * The invoice-row self-heal helpers that call
--     `getOrCreateInvoice` use the same session path — same result.
--
-- Caught by: the domain-table write-side audit in AGENT_LOG
-- `[AGENT] 2026-04-21 01:35` during migration 050's spot-check.

begin;

alter policy job_charges_update on public.job_charges
  with check (
    garage_id = (select staff.garage_id from public.staff where staff.id = auth.uid())
    and exists (
      select 1 from public.jobs j
       where j.id = job_charges.job_id
         and j.garage_id = job_charges.garage_id
    )
  );

alter policy invoices_update on public.invoices
  with check (
    garage_id = (select staff.garage_id from public.staff where staff.id = auth.uid())
    and exists (
      select 1 from public.jobs j
       where j.id = invoices.job_id
         and j.garage_id = invoices.garage_id
    )
  );

commit;
