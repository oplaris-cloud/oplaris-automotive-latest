# P54 Kickoff Prompt — Unified Job Activity timeline

> Paste this into Claude Code at the start of the P54 session. Assumes CLAUDE.md auto-loads and P50 + P52 + P53 are already shipped. Run order: P50 ✅ → P52 ✅ → P53 → **P54** → P46 → P38 → P51.10.

---

## Context

The job detail page currently shows three disconnected narratives — a "Pass-back timeline" section (P51), a "Work Log" section (P44), and job status changes with **no history table at all** (status transitions vanish once applied). P54 merges them into one canonical `Job Activity` feed. This also subsumes P47.8 (audit-log entries for pass-backs) and P51.6 (customer status-page timeline), both previously open.

Full spec in `docs/redesign/MASTER_PLAN.md > P54`. Decisions already made by Hossein (don't re-ask):

1. Section name: **Job Activity**.
2. Pauses: **rollup** — one row per `work_session`, pause detail on hover.
3. Customer-facing names: **first name only**.
4. `job_status_events` backfill: **best-effort** — one event per existing job at `created_at`.
5. Customer status transitions: **curated subset** with friendly labels (see spec).

**Read first, in this order:**
1. `CLAUDE.md > Phase 2` — P54 slots after P53 in the priority line.
2. `docs/redesign/MASTER_PLAN.md > P54` — full spec, migration SQL, view definition, UI contract, acceptance criteria P54.1–P54.15.
3. `docs/redesign/MASTER_PLAN.md > P51` — pass-back data model (you'll query `job_passbacks`).
4. `Oplaris-Skills/vibe-security/references/database-security.md` — apply to the new table, RLS, and view.
5. `Oplaris-Skills/ux-audit/references/interactive-components.md` — timeline/list patterns.

---

## What to build (in order — do not skip steps)

### Step 1 — Migration `036_p54_job_activity.sql`

1. **Create `public.job_status_events`** per the spec (id, garage_id, job_id, from_status, to_status, actor_staff_id, reason, at). Indexes on `(job_id, at desc)` and `(garage_id, at desc)`.
2. **RLS.** `alter table ... enable row level security`, policy `job_status_events_select` mirroring `jobs_select`:
   ```sql
   create policy job_status_events_select on public.job_status_events
     for select to authenticated
     using (
       garage_id = private.current_garage()
       and exists (
         select 1 from public.jobs j
         where j.id = job_id and j.deleted_at is null
       )
     );
   revoke insert, update, delete on public.job_status_events from authenticated;
   ```
3. **SECURITY DEFINER helper** `private.set_job_status(p_job_id uuid, p_new_status public.job_status, p_reason text default null)`:
   - Role check (matches whoever can legitimately change job status — mgr, tester, mechanic depending on current transition).
   - Garage check.
   - Insert `job_status_events` row AND update `jobs.status` in one transaction.
   - Returns the event id.
   Grant EXECUTE to `authenticated`.
4. **Backfill.** For every existing job, insert one event row with `from_status = null, to_status = jobs.status, actor_staff_id = null, at = jobs.created_at, reason = 'Backfilled at P54 go-live'`.
5. **Create view `public.job_timeline_events`** per the spec (UNION ALL over `job_passbacks`, `work_logs`, `job_status_events`). **Critical:** declare `with (security_invoker = on)` so the viewer's RLS applies — default in Postgres 15+ is `security_definer` which would leak across tenants. Grant SELECT on the view to `authenticated`.
6. **Realtime.** Add `job_status_events` to the `supabase_realtime` publication. `alter table public.job_status_events replica identity full;`. Append the table name to the `ALLOWED_TABLES` whitelist in `src/lib/realtime/` (P50 pattern).
7. Do NOT add `work_logs` paused/resumed to the view — rollup handles pauses inside the single `work_session` event.

Verification SQL after apply:

```sql
-- New table + policy exist
select rowsecurity from pg_tables where tablename = 'job_status_events';
select polname from pg_policy where polrelid = 'public.job_status_events'::regclass;

-- View exists with security_invoker
select reloptions from pg_class where relname = 'job_timeline_events';
-- Expect: {security_invoker=on}

-- Backfill: every job has at least one event
select count(*) from public.jobs j
 left join public.job_status_events e on e.job_id = j.id
 where e.id is null;
-- Expect: 0

-- Cross-tenant RLS: as a user in garage A, select from the view for a job in garage B
-- Expect: 0 rows
```

### Step 2 — Regenerate TypeScript types

`mcp__supabase__generate_typescript_types` → `src/lib/supabase/types.ts`. Verify `job_status_events` + `job_timeline_events` appear.

### Step 3 — Wire `updateJobStatus` to the helper

File: `src/app/(app)/app/jobs/actions.ts`

Replace the current direct `update` on `jobs.status` with a call to the `private.set_job_status` helper. Keep the existing server-side guard for `awaiting_mechanic` (from P52). Ensure the P52 guard still fires **before** the RPC call.

### Step 4 — Server-side fetch helpers

New file: `src/lib/timeline/fetch.ts`

```ts
export async function getJobTimelineEvents(
  jobId: string,
  opts: { audience: 'staff' | 'customer'; limit?: number }
): Promise<TimelineEvent[]>
```

- Queries `public.job_timeline_events` directly. RLS applies.
- For `customer` audience: filters kinds to the curated subset (see spec table), applies the friendly label map from `src/lib/timeline/customer-labels.ts`, redacts last names.
- For `staff`: all events, first-name-only display, full detail.
- Sorts `at DESC`. Default limit 100.

### Step 5 — `JobActivity` component

New file: `src/app/(app)/app/jobs/[id]/JobActivity.tsx`.

- RSC. Takes `{ jobId, audience }`.
- Renders section heading `Job Activity` + `Log Work` button (right-aligned, existing `LogWorkDialog`).
- Below: a vertical feed of event rows per the spec table. Each row: icon gutter + primary line + metadata footer.
- Running work session (`work_running`) pins to the top with a pulsing green indicator.
- Pauses: single `work_session` row, `Tooltip` on hover shows `Paused N times, total XYZ min`.
- Empty state: `No activity logged yet.` muted icon.
- Realtime: client shim subscribes via `useRealtimeRouterRefresh` to `job_passbacks`, `work_logs`, `job_status_events` filtered by `job_id`. 3 subscriptions, shared debounce.

Replace the two existing sections on `src/app/(app)/app/jobs/[id]/page.tsx`:
- Remove the `Pass-back timeline` JSX.
- Remove the `Work Log` section JSX.
- Remove the `CurrentlyWorkingPanel` import + render (logic absorbed into `JobActivity`'s running-session pinning).
- Insert `<JobActivity jobId={job.id} audience="staff" />` in their place.

Delete `src/app/(app)/app/jobs/[id]/CurrentlyWorkingPanel.tsx` once nothing imports it.

### Step 6 — Customer status page

File: `src/app/status/[token]/page.tsx` (or wherever the customer-facing job view lives — `grep -rn "status.*page.tsx" src/app/status`).

- Insert `<JobActivity jobId={job.id} audience="customer" />`.
- The server fetcher enforces the curated subset + friendly labels + first-name-only.
- Realtime on this page uses 4 s polling (anon JWT, per P50) — no subscriptions.

### Step 7 — Customer-label map

File: `src/lib/timeline/customer-labels.ts`

```ts
export const CUSTOMER_KIND_LABELS: Record<string, (payload: any) => string> = {
  passed_to_mechanic: () => 'Passed to mechanic for repair work',
  returned_from_mechanic: () => 'Mechanic finished — back with MOT tester',
  work_running: (p) => `${p.first_name} is working on your car now`,
  work_session: (p) => `${p.first_name} worked for ${formatDuration(p.duration_seconds)}`,
  status_changed: (p) => CUSTOMER_STATUS_LABELS[p.to_status] ?? null,
};

export const CUSTOMER_STATUS_LABELS: Partial<Record<JobStatus, string>> = {
  in_diagnosis: 'Diagnosis in progress',
  in_repair: 'Repair in progress',
  awaiting_parts: 'Waiting on parts',
  awaiting_customer_approval: 'Waiting for your approval',
  ready_for_collection: 'Ready for collection',
  completed: 'Completed',
};
```

Any kind not in the map → filtered out on the customer view. Simple lookup, easy to extend.

### Step 8 — Tests

- `tests/rls/job_timeline_view.test.ts`:
  - Staff in garage A sees events for own-garage jobs only; garage-B events return zero rows.
  - Manager sees everything within their garage.
  - `job_status_events` direct insert by `authenticated` is blocked.
  - `private.set_job_status` helper writes both `jobs` and `job_status_events` atomically; failed insert rolls back both.

- `tests/unit/timeline-fetch.test.ts`:
  - Customer audience filters out `returned_from_mot_tester` and internal status transitions not in the label map.
  - First-name extraction from full names works (`"Jake Smith" → "Jake"`).
  - Rollup: a `work_logs` row with 2 pauses surfaces as one `work_session` with `paused_ms_total > 0`.

- `tests/e2e/job-activity.spec.ts` (Playwright):
  - Staff view: mechanic starts work → `work_running` appears at top within 2 s. Mechanic stops → row transitions to `work_session` with duration.
  - Customer view: same job, customer's `/status/[token]` page shows the friendly-labeled subset. No staff last names, no enum values.
  - Override event written by P53's RPC renders correctly on both views.

### Step 9 — Design critique gate

Run `design:design-critique` on: staff view screenshot, customer view screenshot, mobile view, empty state. Fix any P1/P2 issues. Paste output into PR description.

### Step 10 — Close out

- Mark P54.1–P54.15 as DONE in `MASTER_PLAN.md`.
- Mark P47.8 as SUBSUMED (strike from tracker, add note pointing to P54).
- Mark P51.6 as SUBSUMED (same).
- Update `CLAUDE.md > Phase 2` — strike P54, P47.8, P51.6 from the remaining list, add a DONE summary line for P54.
- **Do not update `VISUAL_IMPLEMENTATION_PLAN.md`** — V5 activity-feed note is logged for Phase 3.

---

## Do-not-do list

- ❌ Don't create a `job_events` catch-all table. Canonical sources stay where they are (`job_passbacks`, `work_logs`, new `job_status_events`). The view unions them.
- ❌ Don't skip `with (security_invoker = on)` on the view. Default `security_definer` on Postgres 15+ would bypass the viewer's RLS and leak across tenants.
- ❌ Don't break any existing `updateJobStatus` callers. The server-side P52 guard (`awaiting_mechanic`) must still fire.
- ❌ Don't emit separate `work_paused` / `work_resumed` events. Rollup only.
- ❌ Don't show staff last names on the customer view. First names only.
- ❌ Don't leak raw enum values (`in_diagnosis`, `awaiting_parts`) to the customer. Use the label map.
- ❌ Don't subscribe to realtime from the customer page. Anon JWT can't subscribe — stick with 4 s polling.
- ❌ Don't leave `CurrentlyWorkingPanel.tsx` as dead code. Delete it once its logic is absorbed.

## Done when

P54.1–P54.15 all green, P47.8 and P51.6 struck through as subsumed, tests pass, design-critique clean, `grep -rn CurrentlyWorkingPanel src/` returns zero, and the staff view + customer view of `DUD-2026-00009` both render a proper timeline end-to-end.

Report back with: migration file path, view definition, files changed, test results, design-critique output, before/after screenshots of the job detail page (staff) AND the customer status page.
