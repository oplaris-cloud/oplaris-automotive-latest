# P51 Kickoff Prompt — Pass-back as an event on one job

> Paste this into Claude Code at the start of the P51 session. It's self-contained but assumes CLAUDE.md auto-loads. Do not modify P47's routing code (tester-self-start, mechanic-self-start, role-filtered `bookings_select` RLS) — that part stays. Only the pass-back-creates-a-new-booking data model is being retired.

---

## Context

One customer visit was producing 2 bookings + 2 jobs (worked example DUD-2026-00009, captured 2026-04-14). Hossein picked the "one-job, pass-back-as-event" model. Full spec already written — your job is to execute it, not redesign it.

**Read first, in this order:**
1. `docs/redesign/USER_FLOW_DIAGRAM.html` — 5-minute visual of the old model vs. the new one. Open it before you touch any code.
2. `docs/redesign/MASTER_PLAN.md > P51` — the full technical spec: migration SQL shape, RPC bodies, query changes per surface, acceptance criteria P51.1–P51.12.
3. `CLAUDE.md > Pass-back data model (P51 — Phase 2)` — the condensed rule that wins every conflict.
4. `Oplaris-Skills/vibe-security/references/database-security.md` + `authentication.md` — apply to every RPC you write.

**Do not read these unless you need to understand a migration's current state:**
- `supabase/migrations/026_p47_*` — the routing part stays, the pass-back-booking RPC is being revoked (not deleted).
- `src/app/(app)/app/jobs/passback/actions.ts` — you will rewrite this.

---

## What to build (in order — do not skip steps)

### Step 1 — Migration `033_p51_passback_as_event.sql`

Exact SQL is in `MASTER_PLAN.md > P51 > Data-model changes`. Copy it, verify locally, then apply via Supabase MCP (`apply_migration`). Specifically:

1. Add `jobs.current_role public.staff_role_t null`.
2. Backfill `current_role` for every existing job using the CASE expression in the spec. Run it in a transaction and `SELECT count(*) FILTER (WHERE current_role IS NULL), count(*)` to confirm only completed/cancelled/abandoned jobs end up NULL.
3. Create `public.job_passbacks` with RLS enabled, `job_passbacks_select` policy, `revoke insert/update/delete from authenticated`.
4. Create RPCs `public.pass_job_to_mechanic(p_job_id, p_items, p_note)` and `public.return_job_to_mot_tester(p_job_id)` — SECURITY DEFINER, `SET search_path=''`, caller-role gated, multi-tenant check inside the body.
5. Revoke `EXECUTE` on `public.insert_passback_booking(...)` from authenticated. Add `COMMENT ON FUNCTION ... IS 'DEPRECATED by P51'`.
6. Add `COMMENT ON COLUMN public.jobs.awaiting_passback IS 'DEPRECATED by P51'`.
7. **Do not drop columns or enum values yet.** Migration 034 handles that after the 2-week soak.

**Verification SQL after apply:**
```sql
-- 1. current_role populated
select current_role, count(*) from public.jobs group by 1;

-- 2. new table + policy
select rowsecurity from pg_tables where tablename = 'job_passbacks';
select polname, polcmd from pg_policy where polrelid = 'public.job_passbacks'::regclass;

-- 3. RPCs exist with correct search_path
select proname, prosecdef, proconfig from pg_proc
 where proname in ('pass_job_to_mechanic','return_job_to_mot_tester');

-- 4. deprecated RPC revoked
select has_function_privilege('authenticated', 'public.insert_passback_booking(uuid,public.booking_service,text,text,text,text,text,text,text,jsonb,uuid)', 'execute');
-- expect: false
```

### Step 2 — Regenerate TypeScript types

`mcp__supabase__generate_typescript_types` → drop into `src/lib/supabase/types.ts`. The new `job_passbacks` table + `jobs.current_role` column must be in the types before you touch UI.

### Step 3 — Rewire the server actions

File: `src/app/(app)/app/jobs/passback/actions.ts`

- Rename the primary export to `passJobToMechanic()`.
- Replace the `insert_passback_booking` call with `supabase.rpc('pass_job_to_mechanic', { p_job_id, p_items, p_note })`.
- Drop any code that creates a `bookings` row from this path.
- Zod-validate inputs: `jobId: z.string().uuid()`, `items: passbackItemsSchema`, `note: z.string().max(1000).optional()`.
- Return `{ passbackId }` on success; `{ error: … }` on failure. No silent swallows.

File: `src/app/(app)/app/jobs/[id]/ResumeMotButton.tsx` → add a new server action `returnJobToMotTester()` in the nearby actions.ts that calls the new RPC. When a mechanic is on a job and hits "Return to MOT tester", this fires.

File: `src/app/(app)/app/bookings/actions.ts` → in `startWorkFromCheckIn`, remove the branch that handles `bookings` rows with `passed_from_job_id not null`. Those rows will no longer exist for new work (though old rows during soak might — guard with a clear error `"This pass-back booking is from the old model — open the parent job directly."`).

### Step 4 — UI rewire

**`src/app/(app)/app/jobs/[id]/PassbackDialog.tsx`** — unchanged 11-item checklist + note, but submit handler now calls `passJobToMechanic(jobId, items, note)`. No other change.

**`src/app/(app)/app/jobs/[id]/ResumeMotButton.tsx`** — the mechanic's "Return to MOT tester" button. Renders when `currentRole === 'mechanic'` AND the viewer has the mechanic role on this assignment. Calls `returnJobToMotTester(jobId)`. The tester's "Resume MOT" button still works the same way — it just reads `current_role === 'mot_tester'` now instead of `awaiting_passback === false`.

**`src/app/(app)/app/tech/page.tsx`** — add a new section for mechanics: **"Passed back to me"**. Query:
```ts
// jobs with current_role='mechanic' and no active mechanic assignment yet
.from('jobs')
.select('id, job_number, service, vehicle_id, current_role, …')
.eq('current_role', 'mechanic')
.is('deleted_at', null)
// left join/exclude where a mechanic is already assigned via job_assignments
```
Order DESC by `updated_at`. Each row has a single "Claim" button that inserts into `job_assignments` for the current mechanic and navigates to `/app/tech/job/{id}`. Render above the existing "Checked in" section.

**`src/app/(app)/app/jobs/[id]/page.tsx`** — add a "Pass-back timeline" panel that reads `job_passbacks` rows for this job, newest first, rendering each as `{from_role} → {to_role} on {created_at}: {items summary} {note}`. Visible to anyone who can see the job (RLS handles it).

**`src/components/ui/status-badge.tsx`** — add a small chip `With mechanic` / `With MOT tester` driven by `current_role`. Keep the old `awaiting_mechanic` variant rendering something sensible during the soak period (treat it as `With mechanic`).

### Step 5 — Extend `customer_data_export`

Rule #11: GDPR export must include `job_passbacks` for the customer's jobs. Add to the SECURITY DEFINER function that builds the JSON dump. Unit test: export a customer who has had a pass-back → assert the timeline entries appear.

### Step 6 — Tests

Add these **before** calling it done:

- `tests/unit/passback-rpcs.test.ts`
  - Forged JWT as mot_tester → `pass_job_to_mechanic` on own-garage job succeeds; on other-garage job raises `42501`.
  - mot_tester on a job where `current_role='mechanic'` raises `P0001` ("not currently with mot_tester").
  - mechanic calling `return_job_to_mot_tester` on own job succeeds, flips `current_role`, stamps `returned_at`.
  - `insert_passback_booking` as authenticated → `permission denied for function` (EXECUTE revoked).

- `tests/unit/tech-my-work-query.test.ts`
  - A job with `current_role='mechanic'` and no mechanic in `job_assignments` appears in "Passed back to me".
  - Once claimed, it moves out of that section into "In progress".

- `tests/e2e/passback-flow.spec.ts` (Playwright) — run the full 2-role flow: tester starts MOT → passes to mechanic → mechanic claims + completes + returns → tester resumes + closes. Assert: one `jobs` row touched throughout, one `bookings` row, N+1 `job_passbacks` rows (one per handoff), one invoice.

### Step 7 — Role-test plan update

`docs/redesign/ROLE_TEST_PLAN.md`:
- R-T.8 → add the pass-back flow steps against the new model.
- R-C.4 → document the new "Passed back to me" section.
- R-M.7 → verify manager sees **one** row per visit on `/app/jobs`.

### Step 8 — Close out

- Mark P51 rows P51.1–P51.12 as DONE in `MASTER_PLAN.md`.
- Update `CLAUDE.md > Phase 2` line: P51 → DONE, move on to P50.
- **Do not write migration 034 yet.** That's a separate task after the 2-week soak (schedule it).

---

## Do-not-do list (common failure modes)

- ❌ Don't drop `bookings.passback_note`, `bookings.passback_items`, `bookings.passed_from_job_id`, `jobs.awaiting_passback`, or the `awaiting_mechanic` enum value. Migration 034 handles that later.
- ❌ Don't break the kiosk → booking → MOT tester start path. That's P47 routing, unchanged.
- ❌ Don't let `insert_passback_booking` stay callable by authenticated. Verify with `has_function_privilege`.
- ❌ Don't bypass the RPCs with direct UPDATEs from Server Actions for tester/mechanic flips. Only manager override uses direct UPDATE (rule #2).
- ❌ Don't forget `garage_id = private.current_garage()` in every RPC body.
- ❌ Don't skip the Zod schemas on the server actions (rule #2 + data-access.md).
- ❌ Don't ship without re-running the P47 role-test plan — the new model must not regress tester self-start, mechanic self-start, or role-filtered check-in visibility.

## Done when

All of P51.1 through P51.12 in `MASTER_PLAN.md > P51 > Acceptance criteria` are green, the new tests pass, and `grep -r 'insert_passback_booking' src/` returns zero hits outside the migration files.

Report back with: migration file path, RPC names, list of files changed, test results, and a screenshot of the mechanic's new "Passed back to me" section mid-flow.
