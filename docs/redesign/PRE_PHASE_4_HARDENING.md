# PRE_PHASE_4_HARDENING.md

Living queue of hygiene items to close before Phase 4 (deploy) cutover.
Nothing in here is a showstopper for ongoing feature work — but nothing in
here ships to production without being addressed.

## RLS — write-side gaps (same class as migration 049 on work_logs / 050 on job_parts)

| Table | Policy | Gap | Fix shape |
|---|---|---|---|
| `job_charges` | insert | Missing `EXISTS jobs j WHERE j.id = job_charges.job_id AND j.garage_id = job_charges.garage_id` | Mirror 050 INSERT shape |
| `invoices` | insert | Same | Mirror 050 INSERT shape |
| `approval_requests` | insert | Same | Mirror 050 INSERT shape |
| `job_assignments` | insert | Manager-only today but still no job_id→garage check | Mirror 050 INSERT shape, keep manager-only gate |

Migration target: `052_p51_phase4_hardening_sweep.sql` (single migration, grouped for reviewability).
Tests: one `tests/rls/{table}.test.ts` per table, matching the `job_parts.test.ts` structure. Target +8–10 RLS tests.

## RLS test conventions

When asserting **cross-tenant UPDATE rejection**, assert `rowCount === 0` rather than expecting
error code `42501`. Postgres RLS evaluates USING before WITH CHECK — if USING filters the row
out (because `garage_id` doesn't match the session's garage), `UPDATE … WHERE …` silently
returns no rows. It does NOT throw 42501. Shape:

```ts
const { data, error } = await clientB
  .from("job_charges")
  .update({ amount_pence: 999 })
  .eq("id", aGarageChargeId)
  .select();
expect(error).toBeNull();
expect(data).toHaveLength(0);  // or: expect(response.count).toBe(0);
```

For cross-tenant INSERT rejection, WITH CHECK DOES fire — expect 42501.
For non-assignee INSERT on a same-tenant job, WITH CHECK fires — expect 42501.
Applied in: `tests/rls/job_charges.test.ts`, `tests/rls/invoices.test.ts`, `tests/rls/job_parts.test.ts`.

## RLS — predicate-style normalisation

`job_charges_insert`, `job_charges_update`, `invoices_insert`, `invoices_update` use the staff-subquery form
`garage_id = (SELECT staff.garage_id FROM staff WHERE staff.id = auth.uid())` rather than
`private.current_garage()`. Functionally equivalent but inconsistent with every other policy in the repo.
Normalise in the hardening sweep (migration 052 or 053) — diff-only, no behaviour change, but makes auditing
easier.

## Naming — `private.is_staff_or_manager()`

Helper is misnamed: it returns TRUE for manager + mot_tester, FALSE for mechanic. Rename to something
accurate (`private.is_manager_or_mot_tester()`? `private.has_non_mechanic_staff_role()`?) during the
hardening sweep. Currently referenced by `work_logs` (migration 049) and `job_parts` (migration 050) INSERT
policies. Rename → find/replace all callers → re-run full RLS suite.

## Migration hygiene

- Consolidate letter-suffix migration files (pre-existing `033b_p51_gdpr_export.sql` + any 026-era fallout)
  into pure-numeric prefixes. Supabase CLI's migration regex silently skips letter suffixes — this has
  already cost one debugging session.
- Add a CI guard: reject any migration file whose prefix doesn't match `^[0-9]{3,}_[a-z0-9_]+\.sql$`.

## Typecheck cache discipline (process)

Every checkpoint typecheck is run from cold cache: `rm -rf .next tsconfig.tsbuildinfo && pnpm typecheck`.
Any regression caught post-checkpoint rolls into the next commit + gets flagged in the AGENT_LOG entry.

## Known minors from main (not hardening but worth logging)

- 4 pre-existing lint errors: `customers:77`, `PartRow:48 ×2`, `TechJobClient:93` (react-hooks/set-state-in-effect).
- `TechAssignmentModal.tsx:69` — same bug class as Step 1's self-start redirect fix, not yet applied there.

## Deferred from Phase 3

- `job_approvals` was named in a strategist prompt but doesn't exist; real table is `approval_requests`.
  No fix — just archaeological note.

## Phase 4 staging gate — a11y verification

Before production cutover, run `pnpm dlx @axe-core/cli` against:
- Every tech-surface page (`/app/tech`, `/app/tech/job/[id]`)
- Every dialog/sheet in the staff app (PassbackDialog, ChangeHandlerDialog, AddPartSheet, RequestApprovalSheet, etc.)
- The kiosk flow (`/kiosk`, `/kiosk/booking/*`)
- The customer status page (`/status` at all three states: request-code, enter-code, live-status)

Target: 0 violations. If anything trips, log here for follow-up rather than blocking deploy.

Static a11y guarantees already land per-commit — this is belt-and-braces before real users.
