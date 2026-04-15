# PHASE1_DEFECTS.md — Role-testing defect register

> Live bug log for Phase 1 (functional testing across manager / MOT tester / mechanic / customer roles). Every defect discovered in Phase 1 testing lives here until closed. Seeded 2026-04-14 with known pre-phase reports from Hossein (D1, D2).

## Severity rubric

- **Critical** — blocks core workflow, data loss risk, security gap. Fix before moving role on.
- **High** — role cannot complete a primary task, or a security rule is bent (not broken). Fix within Phase 1.
- **Medium** — annoyance, workaround exists, cosmetic-but-confusing. Batch fix at end of Phase 1.
- **Low** — polish, small layout issue, copy nit. Fix at end of Phase 1 or move to Phase 3 if visual-only.

Mark visual-only issues with `tag: visual, Phase 3` — they get logged here so nothing slips, but the fix lands in Phase 3.

---

## Defect register

| ID | Role | Route | Severity | Status | Summary |
|----|------|-------|----------|--------|---------|
| D1 | mechanic | `/app/tech/jobs/[id]` (work log add) | **Critical** | **CLOSED 2026-04-14** | `new row violates row-level security policy for table "work_logs"` — migration `015_fix_worklog_rls` was in the repo but had never been pushed to the live DB. Applied via MCP; `work_logs_insert` now `with_check (garage_id = private.current_garage() AND staff_id = auth.uid())`. Verified via RLS smoke test under a forged mechanic JWT. Also backfilled missing `private.staff_roles` row for `Hossein Adib Ansari` (data drift found during verification). |
| D2 | manager | `/app/jobs/[id]` (edit job title) | Medium | **OPEN** | Layout shift when the edit rectangle appears — title visibly jumps; can be cosmetic symptom of inline-edit pattern P36 addresses |
| D3 | manager | `/app/bookings` (promote → job) | **High** | **CLOSED 2026-04-14** | Migrations `016_checked_in_status` and `018_auto_set_staff_claims` were present in the repo but never applied to live DB. `promoteBookingToJob` set `status='checked_in'` on a job — the enum lacked that value, so the UPDATE silently no-op'd (or errored on stricter runs). And new staff creation didn't auto-populate `auth.users.raw_app_meta_data` with garage/roles because the claims-sync triggers were missing. Fixed during P47 migration pass: applied a minimal variant of 018 that only registers the triggers (multi-role function bodies from 025 stay authoritative), and applied 016 via MCP. Verified enum now includes `checked_in`; `trg_sync_staff_claims` exists on `public.staff`. |
| D4 | manager | `/app/bookings` (dismiss check-in) | **High** | **CLOSED 2026-04-14** | Clicking Delete returned 42501 even for manager. Root cause: 026_p47_checkin_routing added `deleted_at IS NULL` to the `bookings_select` qual. Postgres re-evaluates SELECT qual against the NEW row during an UPDATE (so callers can't "blind-write" rows they can't see back) — setting `deleted_at = now()` made the new row fail SELECT, bubbling up as 42501 on UPDATE. Fix (migration 027): dropped `deleted_at IS NULL` from the policy; soft-deleted rows are filtered in query callers (`.is("deleted_at", null)`), mirroring customers/vehicles. |
| D5 | mot_tester | `/app` (Start MOT button) | **High** | **CLOSED 2026-04-14** | "insufficient_privilege" on click. Root cause: `startMotFromCheckIn` fanned out across tables that only allow manager writes — `create_job` RPC has an inline `if current_role <> 'manager' then raise insufficient_privilege`, `job_assignments_insert` requires `is_manager()`, `bookings_update` requires `is_manager()`. Fix (migration 028): SECURITY DEFINER `start_mot_from_checkin(p_booking_id)` RPC that authorises `mot_tester` OR `manager` in the function body, then performs the find-or-create customer/vehicle + job insert (`status='in_diagnosis'`, `service='mot'`) + booking link + self-assignment in a single trusted transaction. Server Action now just calls the RPC. No table-level RLS relaxed. |

---

## D1 — mechanic cannot insert work_logs (RLS policy rejects)

**Reported by:** Hossein, 2026-04 (pre-Phase-1)
**Role:** mechanic
**Route / action:** Tech mobile UI → open a job → click "Start" or "Log Work" → error
**Expected:** Work log row inserts; timer starts; job progresses.
**Actual:** Server returns `new row violates row-level security policy for table "work_logs"`. No row inserted.

### Severity: Critical
Mechanics make up 5 of 7 non-manager staff. Without work log inserts, the tech UI is functionally dead. This blocks the entire Phase 1 mechanic role section.

### Diagnosis pointers

1. Check the RLS policies on `public.work_logs`:
   ```sql
   select polname, polcmd, polqual, polwithcheck from pg_policy
     where polrelid = 'public.work_logs'::regclass;
   ```
2. Expected INSERT `WITH CHECK`: `garage_id = current_garage()` AND `technician_id = auth.uid()` AND (job must be assignable to the mechanic — likely a join check on `jobs` where `jobs.assigned_to = auth.uid()` OR mechanic role + same garage).
3. Common root causes:
   - Policy checks `technician_id` but the Server Action inserts without setting it (defaults to NULL)
   - `garage_id` on insert doesn't match the mechanic's `private.user_roles.garage_id`
   - Policy requires job to be `assigned_to = auth.uid()` but tech opened an unassigned job
   - JWT custom claim for role not landing (check the Auth Hook is deployed)
4. Log the exact SQL the server action is running (`supabase.rpc(…)` or `from('work_logs').insert(…)`) to rule out (a).

### Fix approach

- Confirm the INSERT payload includes `garage_id` + `technician_id` + `job_id`.
- Confirm the policy's WITH CHECK condition matches the payload.
- If a JOIN to `jobs` is in the policy, ensure the subselect is performant (index on `jobs.id` + `jobs.garage_id`) — RLS on joins is a common footgun.
- Add a unit test: `tests/unit/work-logs-rls.test.ts` — mechanic inserts → succeeds; other-garage mechanic → fails; manager inserts on behalf → decide policy intent.
- Re-test with mechanic account via Chrome MCP per E2E_TEST_PLAN.md.

**Architecture rules this touches:** #1 (multi-tenant garage_id), #2 (server-side enforcement), #3 (RLS on every public table).

### Resolution (2026-04-14)

- Root cause: `supabase/migrations/015_fix_worklog_rls.sql` existed in the repo but had never been applied to the live Supabase instance. The live `work_logs_insert` policy still carried the original `EXISTS (SELECT 1 FROM job_assignments ...)` clause, rejecting any tech who wasn't pre-assigned.
- Fix: applied 015 via Supabase MCP `apply_migration`. New policy is `with_check ((garage_id = private.current_garage()) AND (staff_id = auth.uid()))`. Multi-tenant + identity guards preserved; assignment requirement dropped (matches CLAUDE.md: any same-garage staff can log work on any job).
- Data-integrity side fix: `private.staff_roles` was missing a row for `Hossein Adib Ansari` despite `public.staff.roles = ['mot_tester']` — the auth hook would have returned `roles=null`. Backfilled with a single `INSERT ... SELECT ... FROM public.staff` statement.
- Verification: forged a mechanic JWT (`sub=ef9a88c2…`, `roles=['mechanic']`) via `SET LOCAL request.jwt.claims`, ran `INSERT INTO work_logs (...)` inside a rolled-back transaction — row returned cleanly. No residual data. Also confirmed policy text via `pg_policies`.
- No code changes required; the server action was correct, only the remote policy was stale.

---

## D2 — job title edit causes layout shift

**Reported by:** Hossein, 2026-04 (pre-Phase-1)
**Role:** manager
**Route / action:** Manager dashboard → job detail page → click "Edit" near the job title → the title box and surrounding content visibly jump.
**Expected:** Title transitions to editable input in place, no surrounding layout movement.
**Actual:** When the edit rectangle appears, the layout of the title shifts (documented symptom of P36's inline-form pattern).

### Severity: Medium
Cosmetic but off-putting. User called it out explicitly; not a blocker to completing work.

### Relationship to P36

The core fix for this class of bug is P36 (convert remaining inline forms to modals). Once the job-title edit uses the standard Dialog pattern, there is no layout shift because the edit UI lives in a modal, not in the document flow.

### Decision

- If the job title edit is one of the three components already scoped in P36 (LogWorkDialog, AddPartForm, AddVehicleForm) → close D2 when P36 lands.
- If the job title edit is a **fourth** inline-edit component not yet in P36 scope → extend P36 to include it. Update P36 spec in MASTER_PLAN.md Part F to list the 4th component, then close D2 when P36 lands.

**Action for Phase 1 tester:** inspect `src/app/(app)/app/jobs/[id]/` for the component that renders the editable title. If it's inline (conditional render without Dialog), add it to P36. If it's already in a Dialog and still shifts, that's a CSS bug — fix in Phase 1 independently.

---

## How to log a new defect

1. Pick the next unused ID (D3, D4, …).
2. Add a row to the register table above with role, route, severity, OPEN.
3. Add a section below with:
   - Reported by / date
   - Role + route + action
   - Expected vs actual
   - Severity rationale
   - Diagnosis pointers (minimum: what to inspect, what queries to run)
   - Fix approach (minimum: files to touch, tests to add)
   - Architecture rules touched (if any of CLAUDE.md #1–#13 are relevant)
4. Commit message: `defect: D<N> <short summary>`
5. After fix: update severity row to **CLOSED** with date and commit SHA, and add a "Resolution" subsection to the defect body.

---

## Phase 1 exit criteria (reminder — lives in MASTER_PLAN)

- Every role's ROLE_TEST_PLAN section passes with **no Critical or High defects OPEN**
- All defects here show status CLOSED (or explicitly carried to Phase 2 / Phase 3 with a P-number)
- Update `CLAUDE.md > Current priority order` Phase 1 line to DONE with date
