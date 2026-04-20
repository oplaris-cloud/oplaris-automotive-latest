# MASTER_PLAN.md — Unified feature completion & testing plan

> **Context:** Full audit on 2026-04-12 compared every page, action file, and CRUD operation against `dudley-requirements-v1.md` and the UI plan (`AUDIT_PROMPT.md`). Single source of truth for phases and history.
>
> **Right now (2026-04-14, end-of-day):**
> - **Phase 1 — DONE.** All defects closed (D1, D3, D4, D5 in `PHASE1_DEFECTS.md`). Role-test matrix passes for manager / mot_tester / mechanic / customer (status-page).
> - **Phase 2 — substantially DONE.** P36, P37, P39, P40, P41, P42, P43, P44, P45, P47, P48, P49 all landed. Plus the post-Phase-1 My Work restructure, UX-audit category-colour pass on bookings + My Work, retirement of `draft`/`booked` job statuses (status flow is now `checked_in → in_diagnosis → in_repair / awaiting_* → ready_for_collection → completed`), and passback-paused MOTs auto-sort to top of tester's In Progress.
> - **Phase 2 — remaining.** P38 (mobile-first responsive pass, ~4h) + P46 (manager assign-tech-on-create modal polish) + P50 (realtime updates, optional) + P47.8 (audit-log entries for pass-back / resume-MOT, deferred).
> - **Open architectural question** captured below ("MOT pass-back data model — duplication concern") for cowork to design before any more pass-back work lands.
> - Work now proceeds in 5 strict phases (see `CLAUDE.md > Current priority order`):
>
> 1. **Phase 1 — Functional testing across all roles** (DONE 2026-04-14)
> 2. **Phase 2 — Feature improvements** (Part F — substantially DONE; P38 + P46 + open question remain)
> 3. **Phase 3 — Visual refinement** (`VISUAL_IMPLEMENTATION_PLAN.md` V1–V6) — gated on Phase 2 close
> 4. **Phase 4 — Deploy infrastructure** (B5 + B6)
> 5. **Phase 5 — Production data import** (B7, final step)

> **Last updated:** 2026-04-18. **Phase 3 — DONE.** Everything in `VISUAL_IMPLEMENTATION_PLAN.md` V1–V6 + P56.0–P56.10 + STAGING_SMS_BYPASS shipped. Layered on top in the same push: **migration 045** (invoice revisions — tiered editing by `quote_status`, `<ConfirmDialog>` revert paths, revision-aware SMS copy, "Updated" chip on customer status page) and **migration 046** (invoice payments — Mark-as-Paid dialog with method picker, PAID banner + green status-page badge + diagonal PAID watermark on the PDF, new Receivables section on `/app/reports` with outstanding / paid-this-period / still-quoted KPIs + 0-7 / 8-30 / 30+ day aging table). 193/193 unit + 82/82 RLS green, typecheck clean, spacing lint clean. Next: Phase 4 (deploy infra — needs Dokploy access). See `STANDUP.md 2026-04-18` + `CLAUDE.md > Invoice lifecycle` for the long-form close-out.
>
> **Soak-gate still open:** P51.10 migration 034 column drop (~2026-04-28) — unchanged.

---

## Master tracker

| # | Feature | Req ref | Backend | UI | Priority | Status |
|---|---------|---------|---------|-----|----------|--------|
| P1 | Drag-and-drop bay board | §4.5, U3 | DONE | DONE (needs testing) | HIGH | **TEST** |
| P2 | Vehicle detail page | §6 Scenario D, U2 | DONE | DONE (needs testing) | HIGH | **TEST** |
| P3 | MOT history display + DVSA refresh | §4.17, U14 | DONE | DONE (needs testing) | MEDIUM | **TEST** |
| P4 | Vehicle search page + sidebar link | §6 Scenario D | DONE | DONE (needs testing) | MEDIUM | **TEST** |
| P5 | Car images (IMAGIN.studio) | Hossein request | N/A | DONE (needs testing) | LOW | **TEST** |
| P6 | Tech job detail page (start/pause/complete) | §4.7, U4 | DONE | DONE | CRITICAL | **DONE** |
| P7 | Request approval button | §4.8 | DONE | DONE | CRITICAL | **DONE** |
| P8 | Job status change from detail page | §4.4 | DONE | DONE | HIGH | **DONE** |
| P9 | Edit job (description, ETA, bay, techs) | §4.4 | DONE | DONE | HIGH | **DONE** |
| P10 | Promote booking to job | §4.12, U10 | DONE | DONE | HIGH | **DONE** |
| P11 | Edit customer form | §4.2 | DONE | DONE | HIGH | **DONE** |
| P12 | Edit/delete parts on a job | §4.9 | DONE | DONE | MEDIUM | **DONE** |
| P13 | Void warranty button | §4.15 | DONE | DONE | MEDIUM | **DONE** |
| P14 | Customers "has open job" filter | §4.2, U2 | DONE | DONE | LOW | **DONE** |
| P15 | Vehicle soft-delete | GDPR | DONE | DONE | LOW | **DONE** |
| **B3** | **Work_logs RLS bug — techs can't start work** | §4.7 | **BUG** | — | **CRITICAL** | **DONE** |
| P16 | Rename "Bookings" → "Check-ins" + notification badge | Hossein | DONE | DONE | CRITICAL | **DONE** |
| P17 | Tech assignment modal on check-in promote | Hossein | DONE | DONE | CRITICAL | **DONE** |
| P18 | ~~REMOVED — Warranty on job completion~~ | — | — | — | — | **REMOVED** |
| P19 | Stock page full CRUD | §4.10 | DONE | DONE | HIGH | **DONE** |
| P20 | Reports page UI | §4.16 | DONE | DONE | HIGH | **DONE** |
| P21 | Manual "Customer has approved" button | Hossein | DONE | DONE | HIGH | **DONE** |
| P22 | Auto-advance job status after approval | §4.8 | DONE | DONE | HIGH | **DONE** |
| P23 | Kiosk: add email field + reg lookup | Hossein | DONE | DONE | HIGH | **DONE** |
| P24 | Work log timer: show seconds | Hossein | — | DONE | MEDIUM | **DONE** |
| P25 | Check-in delete/dismiss | Hossein | DONE | DONE | MEDIUM | **DONE** |
| P26 | Manager work log controls on job detail | Hossein | DONE | DONE | MEDIUM | **DONE** |
| P27 | GDPR data export button | GDPR | DONE | DONE | HIGH | **DONE** |
| P28 | Customer restore (undo soft-delete) | GDPR | DONE | DONE | MEDIUM | **DONE** |
| P29 | Rework warranties → stock-only supplier warranties | Hossein | DONE | REWORK | HIGH | **REDO** |
| P30 | Charges section + quote/invoice flow | §4.11 | DONE | REWORK | CRITICAL | **REDO** |
| B4 | Tech assignment modal: "No staff found" fix | Hossein | DONE | — | CRITICAL | **DONE** |
| P31 | Stock locations as managed dropdown | Hossein | DONE | DONE | HIGH | **DONE** |
| P32 | Form field labels: required asterisk + (optional) | Hossein | — | DONE | HIGH | **DONE** |
| P33 | Consistent modal pattern (replace all inline edits) | Hossein | — | DONE | HIGH | **DONE** |
| P34 | Staff management page in Settings (multi-role support, role editing) | §4.3 | DONE | DONE | HIGH | **DONE** |
| P35 | Cards vs list views — consistent usage rules | Hossein | — | DONE | MEDIUM | **DONE** |
| P36 | Convert remaining inline forms to modals (LogWork, AddPart, AddVehicle) | Hossein | — | — | Phase 2 | **DONE 2026-04-14** — all three wrapped in shadcn `Dialog` with `DialogTrigger`. No more conditional inline form rendering. |
| P37 | Equal card heights across multi-card rows | Hossein | — | — | Phase 2 | **DONE 2026-04-14** — `h-full` added to base `Card`. Multi-card grids now stretch sibling cards; single-card pages unaffected. |
| P38 | Mobile-first responsive pass (sidebar drawer, tables→cards, breakpoints) | Hossein / M2.6 | — | — | Phase 2 | **TODO** — only meaningful Phase 2 item not yet started; ~4h scope. |
| P39 | Close P30 gaps (SMS on quote, parts→charges sync, edit charge, required description) | Verification | — | — | Phase 2 | **DONE 2026-04-14** — P39.1 SMS on Send Quote (sends `Quote Q-N for {reg} ready, total £X, link to /status`); P39.2 migration 032 with INSERT/UPDATE/DELETE triggers on `job_parts` keeping `job_charges` in sync (+ backfill); P39.3 pencil-icon EditChargeButton dialog on draft charge rows wired to existing `updateCharge`; P39.4 description required (already shipped with P40 AddChargeDialog tightening). |
| P40 | Labour rate flexibility (settings UI + editable suggestions) | Hossein | — | — | Phase 2 | **DONE 2026-04-14** — migration 031 added `garages.labour_default_description`. New `/app/settings/billing` (manager-only) for labour rate + default description. `calculateLabourFromLogs` → `suggestLabourFromLogs` returns a suggestion (rounded to 0.25h, not ceil) instead of auto-inserting. "Labour from logs" now opens AddChargeDialog pre-filled — manager edits any field before saving. AddChargeDialog also tightened: description is required (P39.4 closed as a side-effect). |
| P41 | Delete a check-in (manager-only, soft-delete, audit logged) | Hossein | — | — | Phase 2 | **DONE 2026-04-14** — soft-delete (027 RLS fix); manager-only via requireManager + RLS; refuses promoted bookings; audit_log entry via `write_audit_log` RPC. |
| P42 | Check-in count badge on sidebar "Check-ins" nav item | Hossein | — | — | Phase 2 | **DONE 2026-04-14** — manager-only badge in `(app)/layout.tsx`; "99+" cap + `role=status` + `aria-label="N new check-ins"`; query filters soft-deleted. |
| P43 | Kiosk DVSA reg lookup (auto-populate make/model/colour/MOT) | Hossein | — | — | Phase 2 | **DONE 2026-04-14** — new `/api/kiosk/reg-lookup` (kiosk-cookie gated, rate-limited 10/IP/hr) reuses the DVSA fetch logic; kiosk page calls it instead of the manager-only `/api/dvla/lookup` (which I'd inadvertently broken in P48). DVSA key never leaves the server; kiosk submission still works when DVSA is down or rate-limited. |
| P44 | Work log start/pause/stop with full HH:MM:SS timestamps (DB + display) | Hossein | — | — | Phase 2 | **DONE 2026-04-14** — `src/lib/format.ts` now sole path for work-log time/duration (`formatWorkLogTime` = HH:mm:ss + date overflow, `formatWorkLogDuration` = Xh Ym Zs, `formatRunningTimer` = stopwatch). Tech job page, tech index, manager job detail, and reports page + CSV all route through it. `one_running_log_per_staff` partial unique index already enforces single-active-log (P44.8). State machine (start/pause/resume/stop) verified in `work-logs/actions.ts` — resume opens a new row rather than reusing. |
| P45 | Email field on kiosk + visible in customer list/detail | Hossein | — | — | Phase 2 | **DONE 2026-04-14** — kiosk has the email field; customers list shows the Email column; detail shows the email line; EditCustomerDialog edits it. `customer_data_export` returns email since the column was already there from migration 001. |
| P46 | Assign-technician modal on job creation from check-in (with busy-tech confirmation) | Hossein | — | — | Phase 2 | **PARTIAL** — basic `TechAssignmentModal` exists on `/app/bookings` (manager Promote → Create Job). Spec adds: Available/Busy grouping + busy-tech confirmation step. Polish only — mechanic + MOT-tester paths now self-start (no modal needed for them). Re-scope after passback architecture decision. |
| P47 | Role-aware check-in routing + MOT→mechanic pass-back flow | Hossein | — | — | Phase 2 | **SUPERSEDED BY P51 2026-04-14** — routing part stays (role-filtered `bookings_select`, tester self-start, mechanic self-start). Pass-back-creates-new-booking part is being retired. See P51 below and [USER_FLOW_DIAGRAM.html](USER_FLOW_DIAGRAM.html). |
| P48 | Role-based sidebar + route access policy (mechanic / mot_tester / manager) | Hossein | — | — | Phase 2 | **DONE 2026-04-14** — NAV_ITEMS matrix + page guards; job detail assignment check; check-in badge for mechanic; server-action write paths tightened to requireManager |
| P49 | Live "Currently working on this job" panel on job detail pages | Hossein | — | — | Phase 2 | **DONE 2026-04-14** — `CurrentlyWorkingPanel` client component with per-second ticking timer, derived from the existing work_logs fetch (no extra round-trip). Live on manager `/app/jobs/[id]` and tech `/app/tech/job/[id]`. Uses P44's `formatRunningTimer` + `formatWorkLogTime`. Customer status-page variant (P49.5/P49.6) deferred — status page has its own admin-client data path; slot in alongside the next status-page touch. |
| P50 | Realtime updates across the app (check-ins, jobs, sidebar badge, worker panel) | Hossein | — | — | Phase 2 | **TODO** |
| **P51** | **Pass-back as an event on one job — single source of truth** | Hossein | — | — | **Phase 2 (priority — blocks P47.8, P46, P50 passback surfaces)** | **TODO 2026-04-14** — decision logged, full spec in [USER_FLOW_DIAGRAM.html](USER_FLOW_DIAGRAM.html) Option A; spec below supersedes OPEN ARCHITECTURAL QUESTION. |

### Migrations applied 2026-04-14 (this session, in order)

All applied via Supabase MCP. Files committed to `supabase/migrations/`. Several were in the repo but never pushed to live (D3 root cause).

| File | Purpose |
|---|---|
| `015_fix_worklog_rls.sql` | D1 — relax `work_logs_insert` policy so techs can log work without being pre-assigned. |
| `016_checked_in_status.sql` | D3 — add `checked_in` to `job_status` enum so promote-booking-to-job actually works. |
| `018_register_staff_claim_triggers` (trimmed variant) | D3 — register `trg_sync_staff_claims` + `trg_sync_role_claims` triggers; functions stay as multi-role variants from 025. |
| `026_p47_enum_awaiting_mechanic.sql` | P47 — add `awaiting_mechanic` to `job_status` enum (separate so it commits before reuse). |
| `026_p47_checkin_routing.sql` | P47 — `bookings.priority` / `passback_note` / `passback_items` / `passed_from_job_id` / `deleted_at`; `jobs.service` / `awaiting_passback`; role-filtered `bookings_select` RLS. |
| `026_p47_insert_passback_booking_rpc.sql` | P47 — SECURITY DEFINER `insert_passback_booking` so MOT tester can write the queue row without global INSERT rights. |
| `027_p47_fix_bookings_select_soft_delete.sql` | D4 — drop `deleted_at IS NULL` from the SELECT qual so soft-delete UPDATE doesn't fail with 42501. |
| `028_p47_start_mot_from_checkin_rpc.sql` | D5 — SECURITY DEFINER `start_mot_from_checkin` so MOT tester self-start works without manager-only writes. |
| `029_retire_draft_booked_statuses.sql` | UX cleanup — backfill `draft`/`booked` jobs to `checked_in`; `create_job` RPC defaults to `checked_in`. Enum values stay (removing them is disruptive). |
| `030_start_work_from_checkin_rpc.sql` | P47 / My Work — mirror RPC for mechanic self-start (electrical / maintenance / passbacks). |
| `031_garage_labour_default_description.sql` | P40 — `garages.labour_default_description` for the Settings → Billing UI. |
| `032_p39_parts_charges_sync_trigger.sql` | P39.2 — INSERT/UPDATE/DELETE triggers on `job_parts` keep `job_charges` in sync (+ backfill). |

---

### DECIDED 2026-04-14 — Pass-back data model → P51 (see below)

> This question is closed. Hossein picked **one-job-per-visit + pass-back as an event** (Option A in `USER_FLOW_DIAGRAM.html`, closely matches "Option B — Single job, multiple phases" from the original shortlist). Full spec lives in **P51 — Pass-back as an event on one job** further down this file. The pass-back-creates-a-new-booking pattern (P47's data model) is being retired. No further pass-back code should land on the old model; everything new goes through P51's shape. See the visual walk-through at [`USER_FLOW_DIAGRAM.html`](USER_FLOW_DIAGRAM.html).

---

### Cross-cutting tasks (tracked in `CLAUDE.md` — repeated here for single source)

| # | Task | Phase | Owner | Status |
|---|------|-------|-------|--------|
| R1 | `ROLE_TEST_PLAN.md` — structured role-by-role functional test plan | 1 | Claude Code | **DONE 2026-04-14** — file at `docs/redesign/ROLE_TEST_PLAN.md`; sections updated for the My Work restructure. |
| R2 | Execute R1, log defects in a bug register, fix every defect | 1 | Claude Code | **DONE 2026-04-14** — defect register at `PHASE1_DEFECTS.md`. D1, D3, D4, D5 all CLOSED with resolutions; D2 carried into P36 and now closed by the LogWork/AddPart/AddVehicle modal conversions. |
| B5 | Deploy infra (Dockerfile, CI, Dokploy config, staging + prod Supabase creds) | 4 | Hossein + Claude Code | Waiting on Hossein access |
| B6 | Backups: nightly encrypted off-site pg_dump + ≥1 tested restore | 4 | Hossein + Claude Code | Gated on B5 |
| B7 | Real Fluent Forms customer data import (PRODUCTION, FINAL STEP) | 5 | Hossein (data) + Claude Code (script) | Gated on Phase 4 complete |
| B8 | Wire `assertPasswordNotPwned` into signup + password change | — | Claude Code | **DONE 2026-04-14** — wired into `addStaffMember`; 4 unit tests |
| B9 | Add rate limit to `/api/kiosk/booking` | — | Claude Code | **DONE 2026-04-14** — 5/IP/hr + 3/(IP+reg)/hr; 6 unit tests |

---

## Part A — Test existing code (P1–P5)

Code was written on 2026-04-12. DnD library installed, TS fix applied, build passes. These phases need manual testing and any fixes that come up.

---

### P1 — Drag-and-drop bay board

**Files:** `src/app/(app)/app/bay-board/BayBoardClient.tsx`, `src/app/(app)/app/bay-board/page.tsx`, `src/app/api/bay-board/move/route.ts`

**Test checklist:**

- [ ] **P1.1** Create 2+ jobs assigned to different bays
- [ ] **P1.2** Drag a job card from Bay 1 to Bay 2 → card appears in Bay 2 immediately (optimistic update)
- [ ] **P1.3** Refresh the page → card still in Bay 2 (server persisted via `/api/bay-board/move`)
- [ ] **P1.4** Drag while NOT logged in as manager → should fail gracefully (revert)
- [ ] **P1.5** Touch drag on mobile/tablet (DnD library supports touch natively)
- [ ] **P1.6** "Saving..." toast appears during server call, disappears on completion
- [ ] **P1.7** Drag to same bay, same position → no API call fires
- [ ] **P1.8** Disconnect network → drag → card snaps back (revert on failure)

**Audit gate:**
- [ ] Shared UI gate (a11y, mobile, loading, error, empty states)
- [ ] Touch works on a real phone (200ms hold to initiate)

---

### P2 — Vehicle detail page

**Files:** `src/app/(app)/app/vehicles/[id]/page.tsx`, `src/app/(app)/app/vehicles/actions.ts`

**Test checklist:**

- [ ] **P2.1** Navigate to `/app/vehicles/{vehicle-uuid}` → page renders (not 404)
- [ ] **P2.2** "New Job" button → navigates to `/app/jobs/new?vehicleId=...&customerId=...` → check that `NewJobForm.tsx` reads these URL params and pre-fills. **If it doesn't pre-fill, fix `NewJobForm` to read `searchParams`.**
- [ ] **P2.3** "View Customer" button → correct customer detail page
- [ ] **P2.4** Vehicle with no jobs → shows "No jobs recorded" empty state
- [ ] **P2.5** Vehicle card on `/app/jobs/[id]` now links to `/app/vehicles/[id]` (not dead card)
- [ ] **P2.6** Hero card shows: car image, yellow reg badge, make/model/year, colour, mileage, VIN

**Audit gate:**
- [ ] Page loads in < 1s with 20+ jobs
- [ ] Reg plate: yellow background, black mono text (UK style)
- [ ] All links work (customer, jobs, new job)

---

### P3 — MOT history display

**Files:** `src/app/(app)/app/vehicles/[id]/MotHistorySection.tsx`, `src/app/api/dvsa/refresh/route.ts`, `src/lib/dvla/token.ts`

**Test checklist:**

- [ ] **P3.1** Click "Refresh from DVSA" on a real vehicle reg. Check browser Network tab for response.
  - If 502 → check server console for `[dvsa]` errors (OAuth token issue or wrong endpoint)
  - If 503 → DVSA env vars missing from `.env.local`
  - If 200 → MOT history should populate below the button
- [ ] **P3.2** Verify response structure matches component expectations:
  - Component looks for `payload.motTests` or `payload.motTestReports` as array
  - Each entry: `completedDate`, `testResult`, `expiryDate`, `odometerValue`, `odometerUnit`, `defects[]`
  - **If field names differ in real DVSA response, update the type mapping in `vehicles/actions.ts`**
- [ ] **P3.3** Cache test: refresh once, refresh again within 24h → second call returns `cached: true`
- [ ] **P3.4** Vehicle with no MOT history (new car < 3 years) → graceful empty state

**Audit gate:**
- [ ] Defect icons correct (dangerous = red, major = orange, advisory = grey)
- [ ] Refresh button disabled while loading
- [ ] Consider adding "Last refreshed" timestamp (not currently shown)

---

### P4 — Vehicle search page + sidebar

**Files:** `src/app/(app)/app/vehicles/page.tsx`, `src/components/app/sidebar.tsx`

**Test checklist:**

- [ ] **P4.1** Navigate to `/app/vehicles` → shows all vehicles (newest first, limit 50)
- [ ] **P4.2** Search by partial reg (e.g. "AB12") → results filter
- [ ] **P4.3** Search by make (e.g. "Ford") → results filter
- [ ] **P4.4** Sidebar shows "Vehicles" between "Customers" and "Bookings"
- [ ] **P4.5** Vehicle cards link correctly to `/app/vehicles/[id]`
- [ ] **P4.6** 0 vehicles → empty state renders
- [ ] **P4.7** Optional: add customer name to search filter (currently only reg/make/model)

**Audit gate:**
- [ ] Search response < 300ms
- [ ] Mobile: single column grid, full-width search bar

---

### P5 — Car images (IMAGIN.studio)

**Files:** `src/components/ui/car-image.tsx`

**Test checklist:**

- [ ] **P5.1** Images load for common UK makes: Ford, Vauxhall, BMW, VW, Audi, Toyota, Honda, Mercedes, Nissan, Hyundai
- [ ] **P5.2** Uncommon makes → fallback SVG silhouette shows cleanly
- [ ] **P5.3** Colour matching: "Red" car shows red image, "Silver" shows silver
- [ ] **P5.4** Replace demo customer key `"img"` with a proper key from dashboard.imagin.studio (or move to `NEXT_PUBLIC_IMAGIN_CUSTOMER_KEY` env var)
- [ ] **P5.5** Images load lazily (`loading="lazy"`) — don't block page render
- [ ] **P5.6** No layout shift when image loads (container has min-height)

**Audit gate:**
- [ ] Page with 20 vehicle cards loads in < 2s on throttled 3G

---

## Part B — Build missing features (P6–P15)

These need both backend and/or UI work. Execute in order.

---

### P6 — Tech job detail page (CRITICAL — largest item, ~2-3 hours)

**Requirement §4.7:** "Technicians log work from their phones — Start Work, Pause, Complete. Time is tracked automatically."

**What exists:**
- `src/app/(app)/app/tech/page.tsx` — lists assigned jobs (read-only cards)
- `src/app/(app)/app/jobs/work-logs/actions.ts` — `startWork()`, `pauseWork()`, `completeWork()` all fully implemented
- **No `/app/tech/job/[id]` page exists**

**What to build:** `src/app/(app)/app/tech/job/[id]/page.tsx` (and a client component for the interactive bits)

**UI spec (from DESIGN_SYSTEM.md §4.3 + AUDIT_PROMPT U4):**
- Job number + status badge at top
- Vehicle reg plate (yellow badge) + make/model
- Customer name + phone (tap-to-call `<a href="tel:...">`)
- **Primary action button** — context-dependent:
  - No active work log → **"Start Work"** (big green button, full-width, 64px tall)
  - Work in progress → **"Pause"** (amber) + **"Complete"** (green) side by side
- **Task type picker** — chips or dropdown: Diagnosis, Engine, Brakes, Electrical, Suspension, Tyres, MOT Test, Testing, Other
- **Description field** — optional text for what you're doing
- **Timer** — shows elapsed time since `started_at`, updates every second (client-side interval; server is source of truth for start time)
- **Work log history** — list of previous logs for this job (read-only, newest first)
- **"Request Approval" button** — links to P7

**Actions to wire:**
- Start → `startWork({ jobId, taskType, description })`
- Pause → `pauseWork({ workLogId })`
- Complete → `completeWork({ workLogId })`

**Touch targets:** Min 48×48px. Primary buttons full-width, 64px tall. No press-and-hold on Start/Pause (speed matters for techs).

**Also update:** `src/app/(app)/app/tech/page.tsx` — each job card should link to `/app/tech/job/[id]` instead of being a dead card.

**Test checklist:**
- [ ] **P6.1** Tech logs in → sees job list → taps a job → detail page loads
- [ ] **P6.2** Tap "Start Work" → timer starts counting → work log row appears
- [ ] **P6.3** Tap "Pause" → timer stops → duration recorded
- [ ] **P6.4** Tap "Start Work" again (new session) → new timer
- [ ] **P6.5** Tap "Complete" → work log finalised
- [ ] **P6.6** Phone number is tappable (opens dialer)
- [ ] **P6.7** Works on 360×640 viewport (iPhone SE)

---

### P7 — Request approval button (~30 min, builds on P6)

**Requirement §4.8:** "One-tap customer approval for extra work."

**What exists:**
- `src/app/(app)/app/jobs/approvals/actions.ts` — `requestApproval()` fully implemented (validates state, generates HMAC token, sends SMS via Twilio)
- **No UI button anywhere to trigger it**

**What to build:**

1. **On the tech job detail page (P6):** "Request Customer Approval" button
   - Opens a dialog/bottom sheet: description text field + amount (£) input
   - On submit → calls `requestApproval({ jobId, description, amountPence })`
   - Success toast: "SMS sent to customer"
   - Error handling: show error if customer has no phone, or if Twilio fails

2. **On the manager job detail page** (`/app/jobs/[id]`): Same button in the approval section
   - Only visible if job status is `in_diagnosis` or `in_repair`

**Test checklist:**
- [ ] **P7.1** Tech taps "Request Approval" → dialog opens with description + amount fields
- [ ] **P7.2** Submit → success toast (or error if Twilio not configured)
- [ ] **P7.3** Approval appears in the approval list on job detail page
- [ ] **P7.4** Manager can also request approval from `/app/jobs/[id]`

---

### P8 — Job status change from detail page (~30 min)

**What exists:** `updateJobStatus()` in `jobs/actions.ts` — state machine enforced with valid transitions.

**What to build on `/app/jobs/[id]`:** A status action bar showing valid next states as buttons.

**State machine (from job-schemas.ts):**
- `draft` → `in_diagnosis`, `cancelled`
- `in_diagnosis` → `in_repair`, `awaiting_customer_approval`, `awaiting_parts`, `cancelled`
- `in_repair` → `completed`, `awaiting_customer_approval`, `awaiting_parts`, `cancelled`
- `awaiting_customer_approval` → `in_repair`, `cancelled`
- `awaiting_parts` → `in_repair`, `cancelled`
- `ready_for_collection` → `completed`, `cancelled`
- `completed` → (terminal)
- `cancelled` → (terminal)

**UI:** Row of buttons below the job header. Only show valid transitions for the current status. "Cancel" and "Complete" require a confirmation dialog.

**Test checklist:**
- [ ] **P8.1** Draft job shows "Start Diagnosis" button
- [ ] **P8.2** In-repair job shows "Complete", "Awaiting Parts", "Request Approval", "Cancel"
- [ ] **P8.3** Click a transition → status updates → page refreshes → new buttons appear
- [ ] **P8.4** "Cancel" shows confirmation dialog
- [ ] **P8.5** Completed/cancelled jobs show no transition buttons

---

### P9 — Edit job from detail page (~1 hour)

**What to build on `/app/jobs/[id]`:**

1. **Edit description + ETA:** Pencil icon → inline edit → save
   - New server action: `updateJobDetails({ jobId, description?, estimatedReadyAt? })`

2. **Change bay:** Dropdown on "Bay & Team" card
   - Uses existing `assignBay()` action

3. **Assign/remove techs:** Buttons on "Bay & Team" card
   - Uses existing `assignTech()` / `unassignTech()` actions
   - Staff picker dropdown (fetch staff list)

4. **Add parts:** "Add Part" button opens a form (description, supplier, qty, price, payment method, file upload)
   - Uses existing `addJobPart()` action

**Test checklist:**
- [ ] **P9.1** Edit description → saves → shows updated text
- [ ] **P9.2** Change bay → dropdown → select new bay → saves
- [ ] **P9.3** Assign tech → picker → select staff → appears in team list
- [ ] **P9.4** Remove tech → X button → removed from list
- [ ] **P9.5** Add part → form → submit → part appears in parts list

---

### P10 — Promote booking to job (~1 hour)

**What exists:**
- `src/app/(app)/app/bookings/page.tsx` — lists unpromoted bookings (read-only)
- No action to promote

**What to build:**

1. **Server action** `promoteBookingToJob()` in `src/app/(app)/app/jobs/actions.ts`:
   - Input: `bookingId`
   - Find or create customer by phone (dedup)
   - Find or create vehicle by registration
   - Create job via `create_job` RPC linked to customer + vehicle
   - Set `bookings.job_id` to the new job
   - Return the new job ID

2. **UI:** "Create Job" button per booking row on `/app/bookings`
   - On click → calls `promoteBookingToJob(bookingId)`
   - On success → redirects to `/app/jobs/{newJobId}`
   - Booking disappears from the unpromoted list

**Test checklist:**
- [ ] **P10.1** Kiosk booking appears in bookings inbox
- [ ] **P10.2** Click "Create Job" → job created → redirected to job detail
- [ ] **P10.3** Booking no longer appears in inbox (has `job_id` now)
- [ ] **P10.4** Customer dedup: existing customer by phone is reused, not duplicated

---

### P11 — Edit customer form (~30 min)

**What exists:** `updateCustomer()` in `customers/actions.ts` — full partial update support.

**What to build:**

1. "Edit" button on `/app/customers/[id]` next to customer name
2. Opens dialog pre-filled with: name, phone, email, address line 1, address line 2, postcode, notes
3. Save → calls `updateCustomer({ id, ...fields })` → revalidates page

**Test checklist:**
- [ ] **P11.1** Edit button visible on customer detail page
- [ ] **P11.2** Dialog opens pre-filled with current values
- [ ] **P11.3** Change phone number → save → page shows new phone
- [ ] **P11.4** Validation: empty name blocked, invalid phone blocked

---

### P12 — Edit/delete parts (~45 min)

**What to build:**

1. **Server actions** in `jobs/parts/actions.ts`:
   - `updateJobPart({ partId, description?, quantity?, unitPricePence?, supplier?, paymentMethod? })`
   - `deleteJobPart({ partId })` — hard delete (not PII)

2. **UI on `/app/jobs/[id]`:** Per-part row: edit icon (opens dialog) + delete icon (confirmation dialog)

**Test checklist:**
- [ ] **P12.1** Edit part → change quantity → save → total recalculated
- [ ] **P12.2** Delete part → confirm → part removed → total updated
- [ ] **P12.3** Only managers can edit/delete (not techs)

---

### P13 — Void warranty button (~15 min)

**What exists:** `voidWarranty()` in `warranties/actions.ts` — fully implemented with audit log.

**What to build:** On `/app/warranties` page, per active warranty row: "Void" button → dialog asking for reason → calls `voidWarranty({ warrantyId, reason })` → list refreshes.

**Test checklist:**
- [ ] **P13.1** Void button visible on active warranties only
- [ ] **P13.2** Reason dialog → submit → warranty moves to "Voided" state
- [ ] **P13.3** Audit log entry created

---

### P14 — Customer "has open job" filter (~15 min)

**What to build:** On `/app/customers` page, add a toggle/chip "Has open job" that filters to customers with at least one job where status is NOT `completed` or `cancelled`.

Implementation: Add a query parameter `?openJob=true` and modify the Supabase query to use an inner join or subquery on `jobs`.

**Test checklist:**
- [ ] **P14.1** Toggle on → only customers with active jobs shown
- [ ] **P14.2** Toggle off → all customers shown
- [ ] **P14.3** Works with search simultaneously

---

### P15 — Vehicle soft-delete (~15 min)

**What to build:**

1. `softDeleteVehicle()` action — sets `deleted_at` timestamp
2. "Delete" button on vehicle detail page with confirmation dialog
3. Verify all vehicle queries already filter `deleted_at IS NULL` (most do)

**Test checklist:**
- [ ] **P15.1** Delete button on vehicle detail → confirm → vehicle disappears from lists
- [ ] **P15.2** Vehicle no longer appears on customer detail page
- [ ] **P15.3** Jobs referencing the vehicle still show the vehicle data (foreign key intact)

---

## Part C — Bugs, UX fixes, and missing features (B3, P16–P28)

Found during Hossein's hands-on testing on 2026-04-13. These are real usability gaps discovered by actually using the app.

---

### B3 — Work_logs RLS bug (CRITICAL — blocks all tech work)

**Symptom:** Mechanic tries to start work → "new row violates row-level security policy for table work_logs"

**Root cause:** The INSERT policy on `work_logs` requires the tech to be in `job_assignments` for that job:
```sql
exists (select 1 from job_assignments ja where ja.job_id = work_logs.job_id and ja.staff_id = auth.uid())
```
If the tech is not assigned to the job, the insert is blocked by RLS.

**Fix options (pick one):**
1. **Relax RLS** — allow any staff at the same garage to log work on any job (simpler, more flexible)
2. **Auto-assign on work start** — when a tech starts work, auto-insert into `job_assignments` if not already there
3. **Keep strict but improve UX** — show a clear error "You must be assigned to this job first" and add a self-assign button for techs

**Recommended:** Option 2 — auto-assign. It's the most natural workflow. Tech taps "Start Work", they're automatically assigned and the work log is created in one transaction.

**Migration:** `supabase/migrations/015_fix_worklog_rls.sql`

Either relax the policy:
```sql
drop policy work_logs_insert on work_logs;
create policy work_logs_insert on work_logs for insert to authenticated
  with check (garage_id = private.current_garage() and staff_id = auth.uid());
```

Or create an RPC that does both assignment + work log insert atomically.

**Test checklist:**
- [ ] B3.1 — Mechanic (not assigned) taps "Start Work" on any job → work log created successfully
- [ ] B3.2 — Mechanic is auto-added to job_assignments (if option 2)
- [ ] B3.3 — Work log still enforces garage_id (cross-garage blocked)
- [ ] B3.4 — Work log still enforces staff_id = auth.uid() (can't log work as someone else)

---

### P16 — Rename "Bookings" → "Check-ins" + notification badge (~1 hour)

**What the user wants:** "Bookings" is misleading — these are walk-in check-ins from the kiosk, not advance bookings. Rename everywhere and add a notification count badge on the sidebar.

**Changes:**

1. **Rename throughout the app:**
   - Sidebar: "Bookings" → "Check-ins"
   - Page title: "Bookings" → "Check-ins"
   - All button labels, toasts, empty states
   - URL can stay `/app/bookings` (don't break links) but display label changes
   - Database column `booking_service` enum values stay unchanged (internal)

2. **Sidebar notification badge:**
   - Query count of bookings where `job_id IS NULL` (unpromoted check-ins)
   - Display as a small circle with number (e.g. red badge with "3") next to the Check-ins menu item
   - Badge disappears when count = 0
   - Real-time: use Supabase Realtime subscription on `bookings` table, or poll every 30 seconds
   - Only visible to managers

3. **Initial job status after promotion:**
   - When a check-in is promoted to a job, set initial status to `checked_in` instead of `draft`
   - **This requires adding `checked_in` to the job status enum** — new migration
   - State machine: `checked_in` → `in_diagnosis`, `cancelled` (same transitions as `booked`)
   - Update StatusBadge component to handle `checked_in` (info colour)

**Test checklist:**
- [ ] P16.1 — Sidebar shows "Check-ins" not "Bookings"
- [ ] P16.2 — Badge shows count of pending check-ins
- [ ] P16.3 — Promote check-in → job status is `checked_in`
- [ ] P16.4 — Badge count decreases after promotion
- [ ] P16.5 — Badge hidden when 0 check-ins pending

---

### P17 — Tech assignment modal on check-in promote (CRITICAL — ~1.5 hours)

**What the user wants:** When clicking "Create Job" on a check-in, show a modal with all technicians displayed as avatar circles. Green border = free (no active work log). Red/pink border = busy (has active work log). Tap a tech to assign. If busy tech selected, show confirmation ("This technician is currently busy. Assign anyway?"). After confirming, job is created with that tech assigned and manager is redirected to the job page.

**What to build:**

1. **Server action:** `getStaffAvailability()` in `src/app/(app)/app/bookings/actions.ts`
   - Queries all staff at the garage
   - Left-joins `work_logs` where `ended_at IS NULL` to find active work
   - Returns: `{ id, name, role, isBusy: boolean, currentJobNumber?: string }`

2. **Client component:** `TechAssignmentModal.tsx`
   - Grid of circular avatars (like the screenshot Hossein provided)
   - Each shows: avatar icon (green circle = free, red/pink circle = busy) + name
   - On tap: if free → create job immediately with tech assigned
   - On tap: if busy → show confirmation dialog ("Muhammad Al. is currently working on Job #1042. Assign anyway?") with Confirm/Cancel buttons
   - On confirm → create job with tech assigned
   - On success → redirect to `/app/jobs/{newJobId}`

3. **Modify `promoteBookingToJob()`:** Add optional `assignedStaffId` parameter. If provided, also insert into `job_assignments`.

**UI layout (from Hossein's screenshot):**
- Title: "Creating Job"
- Subtitle: "Select a technician to assign the job"
- Grid: 5 avatars per row
- Legend: Red = Busy, Green = Free
- Avatar size: ~80px circles with name below

**Test checklist:**
- [ ] P17.1 — Click "Create Job" on check-in → modal appears with tech grid
- [ ] P17.2 — Free techs show green border, busy techs show red/pink
- [ ] P17.3 — Tap free tech → job created → redirected to job page → tech is assigned
- [ ] P17.4 — Tap busy tech → confirmation dialog → confirm → job created
- [ ] P17.5 — Tap busy tech → cancel → back to modal, no job created

---

### ~~P18 — REMOVED (was: Warranty creation on job completion)~~

**Removed.** Warranties are now stock-only (supplier part warranties), not job/customer warranties. See P29 for the correct warranty model. No warranty dialog on job completion.

---

### P19 — Stock page full CRUD (~1.5 hours)

**Problem:** Stock page is read-only. Backend has `createStockItem`, `updateStockItem`, `recordStockMovement` but no UI.

**What to build:**

1. **"Add Stock Item" button** → dialog with: description, SKU, quantity on hand, reorder point, unit cost (£), location
2. **Edit button per row** → dialog pre-filled with current values → calls `updateStockItem()`
3. **"Record Movement" button per row** → dialog: movement type (usage/restock/adjustment), quantity, reference (job number or PO number), notes → calls `recordStockMovement()`
4. **Stock movement history** → expandable section per item showing all movements (date, type, qty, reference, who)
5. **Low stock alerts** → highlight rows where quantity ≤ reorder point in warning colour
6. **Delete** — soft delete or archive (not hard delete, maintain history)

**Test checklist:**
- [ ] P19.1 — Add stock item → appears in list
- [ ] P19.2 — Edit stock item → changes saved
- [ ] P19.3 — Record usage movement → quantity decreases
- [ ] P19.4 — Record restock → quantity increases
- [ ] P19.5 — Low stock items highlighted
- [ ] P19.6 — Movement history visible

---

### P20 — Reports page UI (~2 hours)

**Problem:** `reports/actions.ts` has 6 server actions. **The page.tsx doesn't exist.** This is a completely missing screen.

**What to build:** `src/app/(app)/app/settings/reports/page.tsx`

**Layout:**
1. **Date range picker** — today, this week, this month, custom range
2. **KPI summary strip** (4 cards):
   - Jobs completed (count)
   - Revenue (£ total from completed job parts)
   - Average job value (£)
   - Tech utilisation (hours worked / hours available)
3. **Revenue chart** — bar chart, daily or weekly grouping, uses `getCompletedRevenue()`
4. **Tech hours table** — per technician: hours worked, jobs completed, avg time per job. Uses `getTechHoursByPeriod()`
5. **Common repairs** — ranked list of most frequent repair types. Uses `getCommonRepairs()`
6. **Parts spend by job** — table showing parts cost per job. Uses `getPartsByJob()`
7. **Repeat customers** — list of customers with >1 job. Uses `getRepeatCustomers()`
8. **CSV export** — download button for each section

**Test checklist:**
- [ ] P20.1 — Reports page loads with today's data
- [ ] P20.2 — Date range picker changes all data
- [ ] P20.3 — Revenue chart renders
- [ ] P20.4 — Tech hours show per technician
- [ ] P20.5 — CSV export downloads valid file

---

### P21 — Manual "Customer has approved" button (~30 min)

**Problem:** If a customer approves verbally (phone call, in person), there's no way to record it without waiting for the SMS flow. Manager needs a manual override.

**What to build:**

1. **On job detail page**, in the approval requests section: "Mark as Approved" button per pending approval
2. On click → confirmation dialog → calls a new `manuallyApproveRequest()` action
3. Action: updates `approval_requests.status = 'approved'`, sets `responded_at`, records `response_source = 'manual'` (add column if needed)
4. Triggers same job status transition as SMS approval (see P22)

**Test checklist:**
- [ ] P21.1 — Pending approval shows "Mark as Approved" button (manager only)
- [ ] P21.2 — Click → confirm → approval marked as approved
- [ ] P21.3 — Job status advances (per P22 logic)

---

### P22 — Auto-advance job status after approval (~30 min)

**Problem:** Customer approves via SMS → approval_requests table updates → **job stays stuck in `awaiting_customer_approval`**. Manager must manually click "Start Repair". This is confusing — the user expected the status to advance automatically.

**What to build:**

1. **In the approval POST handler** (`/api/approvals/[token]/route.ts`): after recording the approval, auto-transition the job status to `in_repair`
2. **In the manual approval action** (P21): same auto-transition
3. **If customer declines**: auto-transition to `in_diagnosis` (manager can re-evaluate)
4. **Add "Ready for Collection" to state machine** from `awaiting_customer_approval`: currently blocked. The flow should be: approve → `in_repair` → work done → `ready_for_collection` → `completed`. This already works once the auto-advance kicks in.

**Also fix button labels:**
- From `awaiting_customer_approval`: the button should say "Start Repair" not "Resume Repair" (there was no repair to resume — diagnosis found extra work, customer approved, now repair starts)

**Test checklist:**
- [ ] P22.1 — Customer approves via SMS → job auto-moves to `in_repair`
- [ ] P22.2 — Customer declines → job auto-moves to `in_diagnosis`
- [ ] P22.3 — Manual approval (P21) → same auto-advance
- [ ] P22.4 — Button label says "Start Repair" not "Resume Repair"

---

### P23 — Kiosk: add email field + reg lookup (~1 hour)

**What to build:**

1. **Email field on kiosk form:** Add an optional email input between phone and notes. The backend API already accepts `customerEmail` — just need the UI field.

2. **Reg lookup on kiosk:** When the customer types their registration and tabs out (or clicks "Next"), call the DVSA/DVLA lookup to auto-populate make, model, year, colour. This saves the customer from typing vehicle details and ensures accuracy.
   - Use the existing `/api/dvla/lookup` endpoint
   - Auto-fill make/model fields (read-only after lookup)
   - If lookup fails, let customer type manually (graceful fallback)

**Test checklist:**
- [ ] P23.1 — Kiosk form shows email field
- [ ] P23.2 — Email is stored in booking and passed to customer on promotion
- [ ] P23.3 — Reg lookup auto-fills make/model on kiosk
- [ ] P23.4 — Lookup failure → customer can type manually

---

### P24 — Work log timer: show seconds (~15 min)

**What:** The work log timer currently shows hours and minutes. User wants seconds visible too for precision.

**Fix:** In the timer component (TechJobClient.tsx or wherever the elapsed time is displayed), change the format from `Xh Ym` to `Xh Ym Zs` for active timers. Completed work logs can stay as `Xh Ym` since seconds don't matter for billing.

**Test checklist:**
- [ ] P24.1 — Active timer shows seconds ticking
- [ ] P24.2 — Completed logs show hours + minutes (no seconds)

---

### P25 — Check-in delete/dismiss (~15 min)

**What:** Manager needs to delete or dismiss a check-in (spam, duplicate, test entry).

**What to build:**
1. Delete/dismiss button per check-in row (trash icon)
2. Confirmation dialog: "Dismiss this check-in? This cannot be undone."
3. Server action: hard delete from `bookings` table (not PII, no GDPR concern for unpromoted check-ins)

**Test checklist:**
- [ ] P25.1 — Dismiss button visible on each check-in
- [ ] P25.2 — Confirm → check-in removed from list
- [ ] P25.3 — Notification badge count updates

---

### P26 — Manager work log controls on job detail (~30 min)

**Problem:** Work log start/pause/complete buttons only exist on the tech page. Managers want to add work log entries from the job detail page too.

**What to build:** On `/app/jobs/[id]`, in the Work Log section, add a "Log Work" button (manager only). Opens a dialog with: task type, description, staff member (dropdown — who did the work), start time, end time (or "still active"). This lets managers retroactively log work that wasn't tracked in real-time.

**Test checklist:**
- [ ] P26.1 — "Log Work" button visible on job detail (manager only)
- [ ] P26.2 — Can log work for any staff member
- [ ] P26.3 — Work log appears in the log list

---

### P27 — GDPR data export button (~30 min)

**Problem:** `exportCustomerData()` and `customer_data_export()` RPC exist but no UI. Legal compliance risk.

**What to build:** On customer detail page, "Export Data (GDPR)" button (manager only). Calls `exportCustomerData()` → downloads JSON file with all customer data (personal info, vehicles, jobs, parts, work logs, approvals, warranties). Include a "Data exported" audit log entry.

**Test checklist:**
- [ ] P27.1 — Button visible on customer detail (manager only)
- [ ] P27.2 — Click → JSON file downloads with all customer data
- [ ] P27.3 — Audit log entry created

---

### P28 — Customer restore (undo soft-delete) (~15 min)

**Problem:** `restoreCustomer()` action exists but no UI. Accidental deletes are permanent.

**What to build:** On customers page, add a "Recently Deleted" tab/toggle showing soft-deleted customers within 30-day window. Each row gets a "Restore" button.

**Test checklist:**
- [ ] P28.1 — "Recently Deleted" toggle visible
- [ ] P28.2 — Shows deleted customers with restore button
- [ ] P28.3 — Restore → customer reappears in main list

---

## Execution order

```
PART A — Test existing code (P1–P5): ~2 hours — DONE by user

PART B — Build missing features (P6–P15): ~7-8 hours — DONE by user

PART C — Bugs, UX fixes, missing features (B3, P16–P28):

  CRITICAL (do first, in order):
    B3  (work_logs RLS bug)        ~30 min   ← BLOCKS ALL TECH WORK
    P16 (check-ins rename + badge) ~1 hour   ← Core workflow rename
    P17 (tech assignment modal)    ~1.5 hours ← Check-in promote flow

  HIGH (core missing features):
    P22 (auto-advance after approval)  ~30 min  ← Do before P21
    P21 (manual approval button)       ~30 min  ← Depends on P22
    P18 (REMOVED — warranties now stock-only)
    P19 (stock page CRUD)              ~1.5 hours
    P20 (reports page UI)              ~2 hours  ← Largest item in Part C
    P23 (kiosk email + reg lookup)     ~1 hour
    P27 (GDPR data export)             ~30 min

  MEDIUM (polish):
    P24 (timer seconds)             ~15 min
    P25 (check-in delete)           ~15 min
    P26 (manager work log controls) ~30 min
    P28 (customer restore)          ~15 min
```

**Total Part C estimate:** ~9-10 hours

**Critical path:** B3 → P16 → P17 → P22 → P21. The RLS bug blocks techs entirely. The check-in rename + tech assignment modal fix the core booking→job workflow. The approval auto-advance fixes the most confusing status flow.

---

## Files reference

### Already created (Part A — need testing)

| File | Type | Purpose |
|------|------|---------|
| `src/components/ui/car-image.tsx` | Client component | IMAGIN.studio car image with fallback |
| `src/app/(app)/app/vehicles/page.tsx` | Server component | Vehicle search/list page |
| `src/app/(app)/app/vehicles/actions.ts` | Server action | Vehicle detail + job history + MOT cache |
| `src/app/(app)/app/vehicles/[id]/page.tsx` | Server component | Vehicle detail page |
| `src/app/(app)/app/vehicles/[id]/MotHistorySection.tsx` | Client component | MOT history display with DVSA refresh |
| `src/app/(app)/app/bay-board/BayBoardClient.tsx` | Client component | Drag-and-drop bay board |
| `src/app/api/bay-board/move/route.ts` | Route handler | Bay move endpoint (manager-only) |

### Already modified (Part A)

| File | Change |
|------|--------|
| `package.json` | Added `@hello-pangea/dnd` |
| `src/components/app/sidebar.tsx` | Added Vehicles nav item |
| `src/app/(app)/app/bay-board/page.tsx` | Rewired to DnD client component |
| `src/app/(app)/app/customers/[id]/page.tsx` | Vehicle cards show car images + fetch colour |
| `src/app/(app)/app/jobs/[id]/page.tsx` | Vehicle card links to vehicle detail page |

### To be created (Part B)

| File | Phase | Purpose |
|------|-------|---------|
| `src/app/(app)/app/tech/job/[id]/page.tsx` | P6 | Tech job detail (server component) |
| `src/app/(app)/app/tech/job/[id]/TechJobClient.tsx` | P6 | Interactive controls (start/pause/complete/timer) |
| `src/app/(app)/app/jobs/[id]/StatusActions.tsx` | P8 | Job status transition buttons |
| `src/app/(app)/app/jobs/[id]/ApprovalDialog.tsx` | P7 | Request approval dialog |
| `src/app/(app)/app/jobs/[id]/EditJobDialog.tsx` | P9 | Edit job description/ETA |
| `src/app/(app)/app/jobs/[id]/TeamManager.tsx` | P9 | Bay picker + tech assignment UI |
| `src/app/(app)/app/jobs/[id]/AddPartForm.tsx` | P9 | Add part with file upload |
| `src/app/(app)/app/customers/[id]/EditCustomerDialog.tsx` | P11 | Edit customer dialog |

---

## Part D — Reworks, invoice, UX consistency (B4, P29–P35)

Found during Hossein's testing on 2026-04-13. Mix of misunderstandings (warranties), missing critical features (invoicing), and UX consistency issues.

---

### B4 — Tech assignment modal "No staff found" (CRITICAL — ~15 min)

**Symptom:** When promoting a check-in to a job, the tech assignment modal shows "No staff found. Add staff in the Supabase dashboard first." — even though 3 staff members exist in the database and appear in the Team dropdown on job detail pages.

**Root cause (confirmed):** The `getStaffAvailability()` query in `src/app/(app)/app/bookings/actions.ts` selects `avatar_url` from the `staff` table:
```typescript
.select("id, full_name, avatar_url")
```
But `avatar_url` was added by migration `017_staff_avatar.sql` which **has not been applied to the database yet**. When Supabase encounters a query for a non-existent column, it returns `null` for `data`, so `staff` is `null`, and the function returns `[]`.

**Fix:**
1. **Apply pending migrations** (see "Pending migrations" section below) — this adds the `avatar_url` column
2. **Also** add a fallback: if the query with `avatar_url` fails, retry without it
3. Update error message text: "Add staff in Settings → Add Staff Member" (not "Supabase dashboard")
4. Add a link button to `/app/settings/` in the empty state

**Test checklist:**
- [ ] B4.1 — Apply migrations 015-018
- [ ] B4.2 — Open tech assignment modal → all 3 staff appear with busy/free status
- [ ] B4.3 — Staff who are on job Team dropdown also appear in modal
- [ ] B4.4 — Error message links to Settings if genuinely no staff exist

---

### P29 — Rework warranties → stock-only supplier warranties (~2 hours)

**IMPORTANT: The entire warranty model was built wrong.** Warranties are NOT for customers on completed jobs, and NOT for job parts. They are **exclusively for stock items** — tracking the supplier's warranty on parts the garage has purchased and placed into stock. If a part fails, the garage can return it to the supplier within the warranty period.

**Current state (wrong):**
- `warranties` table links to `job_id` and `vehicle_id`
- `createWarranty()` is called on job completion
- Warranties page shows customer-facing warranty info

**Correct model:**
- A warranty belongs to a **stock item only** — no relation to jobs, vehicles, or job_parts
- Fields: stock_item_id (required), supplier name, purchase date, warranty expiry date, invoice/receipt reference, notes
- The warranty is set when adding or editing a stock item (optional fields on the stock form)
- The warranties page is a filtered view of stock items that have warranty info
- "Claim Warranty" button → opens form to record a claim against the supplier

**Migration:** `supabase/migrations/0XX_rework_warranties.sql`

```sql
-- Drop the old warranties table entirely and rebuild
DROP TABLE IF EXISTS warranties CASCADE;

CREATE TABLE warranties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  garage_id UUID NOT NULL REFERENCES garages(id),
  stock_item_id UUID NOT NULL REFERENCES stock_items(id),
  supplier TEXT NOT NULL,
  purchase_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  invoice_reference TEXT,
  notes TEXT,
  claim_status TEXT NOT NULL DEFAULT 'none' CHECK (claim_status IN ('none', 'claimed', 'resolved', 'rejected')),
  claim_reason TEXT,
  claim_date TIMESTAMPTZ,
  claim_resolution TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE warranties ENABLE ROW LEVEL SECURITY;
-- RLS policies: garage_id filter as per architecture rules
```

**Server actions rework:**
- `createStockWarranty({ stockItemId, supplier, purchaseDate, expiryDate, invoiceRef?, notes? })` — called from stock form
- `claimWarranty({ warrantyId, reason })` — mark as claimed with date
- `resolveWarrantyClaim({ warrantyId, resolution })` — mark as resolved/rejected

**UI rework:**
- **Stock form (add/edit):** Add optional warranty section — supplier, purchase date, expiry date, invoice reference, notes. When filled, creates/updates a warranty record for that stock item.
- **Warranties page — full CRUD:**
  - **List:** All stock warranties with filters (active / expiring soon / expired / claimed). Each row: part description (from stock item), supplier, purchase date, expiry, claim status.
  - **Add:** "Add Warranty" button → modal with stock item picker (dropdown of stock items), supplier, purchase date, expiry date, invoice reference, notes.
  - **Edit:** Edit button per row → modal pre-filled with current values. Can update supplier, dates, invoice ref, notes.
  - **Delete:** Delete button per row → confirmation dialog → hard deletes the warranty record.
  - **Claim:** "Claim Warranty" button → modal with reason field → sets claim_status to "claimed" with date.
  - **Resolve:** On claimed warranties, "Resolve" button → modal with resolution field → sets to "resolved" or "rejected".
- **No warranty UI on job cards, job completion, or job parts at all.** Remove the old job-completion warranty dialog completely.

**Test checklist:**
- [ ] P29.1 — Add stock item with warranty details → warranty appears on warranties page
- [ ] P29.2 — Edit stock item → update warranty → warranties page reflects change
- [ ] P29.3 — "Expiring soon" filter shows warranties expiring within 30 days
- [ ] P29.4 — Claim warranty → status changes to "claimed", reason saved
- [ ] P29.5 — Old job-completion warranty dialog removed
- [ ] P29.6 — No warranty-related UI remains on job cards or job detail pages

---

### P30 — Charges section + quote/invoice flow (CRITICAL — ~4 hours)

**This is a critical missing feature.** The garage needs to build up charges on a job, send a quote to the customer, and then invoice them on completion.

#### The "Charges" section on the job card

A visible section on the job detail page (below parts or work logs). Works like a basket:

**Line items table:**
| Type | Description | Qty | Unit Price (£) | Total (£) |
|------|-------------|-----|----------------|-----------|
| Part | Driveshaft | 1 | 99.50 | 99.50 |
| Labour | Diagnostic + repair | 3 hrs | 75.00 | 225.00 |
| Other | Disposal fee | 1 | 15.00 | 15.00 |

- Each line item has: type (Part / Labour / Other), description, quantity, unit price, line total
- **Parts auto-populate:** When a part is added to the job via job_parts, it automatically creates a charge line item with the part's cost. Editing or removing the part updates/removes the charge.
- **Labour:** Added manually (e.g. "3 hours @ £75/hr") or manager can click "Calculate from work logs" to auto-calculate from recorded time × garage labour rate.
- **Other/Misc:** Free-form line items (disposal fees, diagnostic charges, etc.)
- Running **Subtotal**, **VAT (20%)**, and **Grand Total** always visible at the bottom.

#### Quote status lifecycle: Draft → Quoted → Invoiced

- **Draft:** Default state. Manager adds/removes/edits line items freely as they diagnose and work.
- **Quoted:** Manager clicks "Send Quote" → line items become read-only (editable only by manager with explicit "Edit Quote" action). Generates a quote reference (Q-{job_number}). Sends to customer via SMS with the approval link (reuses existing SMS approval flow — but approves the whole quote, not individual items). If scope changes, manager edits and re-sends (same reference, no revision numbering needed).
- **Invoiced:** Job complete, manager clicks "Generate Invoice" → generates INV-{job_number}. The invoice is a **clean, minimal, data-only** document (NOT a fancy styled PDF). Just: garage details at top (name, address, VAT, phone, email), customer + vehicle info, the line items table, subtotal/VAT/total, invoice number + date. Printable and exportable as PDF.

**Important: Invoice style is SIMPLE.** No decorative branding, no heavy layout. Just the data in a clean, readable format that prints well on A4. Think plain table with clear headings — not a designed marketing piece.

#### Database changes

**New table: `job_charges`**
```sql
CREATE TABLE job_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  garage_id UUID NOT NULL REFERENCES garages(id),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  charge_type TEXT NOT NULL CHECK (charge_type IN ('part', 'labour', 'other')),
  description TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price_pence INTEGER NOT NULL,
  job_part_id UUID REFERENCES job_parts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE job_charges ENABLE ROW LEVEL SECURITY;
```

**New table: `invoices`**
```sql
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  garage_id UUID NOT NULL REFERENCES garages(id),
  job_id UUID NOT NULL REFERENCES jobs(id),
  invoice_number TEXT NOT NULL,
  quote_status TEXT NOT NULL DEFAULT 'draft' CHECK (quote_status IN ('draft', 'quoted', 'invoiced')),
  subtotal_pence INTEGER NOT NULL DEFAULT 0,
  vat_pence INTEGER NOT NULL DEFAULT 0,
  total_pence INTEGER NOT NULL DEFAULT 0,
  quoted_at TIMESTAMPTZ,
  invoiced_at TIMESTAMPTZ,
  pdf_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(garage_id, invoice_number)
);
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
```

**Add to garages table:**
```sql
ALTER TABLE garages ADD COLUMN labour_rate_pence INTEGER DEFAULT 7500;
ALTER TABLE garages ADD COLUMN vat_number TEXT;
ALTER TABLE garages ADD COLUMN address_line1 TEXT;
ALTER TABLE garages ADD COLUMN address_line2 TEXT;
ALTER TABLE garages ADD COLUMN postcode TEXT;
ALTER TABLE garages ADD COLUMN phone TEXT;
ALTER TABLE garages ADD COLUMN email TEXT;
ALTER TABLE garages ADD COLUMN website TEXT;
```

#### Server actions
- `addCharge({ jobId, type, description, qty, unitPricePence, jobPartId? })` — add line item
- `updateCharge({ chargeId, description?, qty?, unitPricePence? })` — edit line item
- `removeCharge({ chargeId })` — delete line item
- `calculateLabourFromLogs({ jobId })` — reads work_logs, calculates hours × labour rate, returns suggested charge
- `sendQuote({ jobId })` — sets status to "quoted", sends SMS to customer with approval link
- `generateInvoice({ jobId })` — sets status to "invoiced", generates clean PDF, stores in Supabase Storage

#### Auto-sync with job_parts
When a part is added to a job (`addPartToJob`), automatically create a corresponding `job_charges` row with type='part' and the part's cost. When a part is removed, remove the charge. This keeps the basket in sync without manual double-entry.

#### PDF generation (simple style)
Using `@react-pdf/renderer`:
- **Header:** Garage name, address, phone, email, VAT number (from `garages` table)
- **Customer + vehicle:** Name, address, reg, make, model, mileage
- **Title:** "QUOTE" or "INVOICE" based on status, with reference number and date
- **Line items:** Simple table — Description | Qty | Unit Price | Total
- **Totals:** Subtotal, VAT (20%), Grand Total
- **No decorative styling.** No logo watermarks, no coloured headers, no fancy fonts. Clean data only.

**Test checklist:**
- [ ] P30.1 — Add parts to job → charges section auto-shows part line items with prices
- [ ] P30.2 — Manually add labour charge → appears in charges, totals update
- [ ] P30.3 — Add "Other" charge → appears in charges, totals update
- [ ] P30.4 — Edit/remove charge → totals recalculate
- [ ] P30.5 — "Calculate from work logs" → labour charge auto-calculated from hours × rate
- [ ] P30.6 — "Send Quote" → status changes to "quoted", customer receives SMS
- [ ] P30.7 — "Generate Invoice" → clean PDF downloads with all line items, correct VAT, correct total
- [ ] P30.8 — PDF stored in Supabase Storage, re-downloadable from job detail
- [ ] P30.9 — Subtotal, VAT 20%, and grand total always visible in the charges section
- [ ] P30.10 — Labour rate pulled from garages.labour_rate_pence (default £75/hr)

---

### P31 — Stock locations as managed dropdown (~45 min)

**Problem:** Location is a free text field → inconsistencies like "Shelf B3", "shelf b3", "Shelf-B3", "B3".

**What to build:**

1. **New table:** `stock_locations`
   ```sql
   CREATE TABLE stock_locations (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     garage_id UUID NOT NULL REFERENCES garages(id),
     name TEXT NOT NULL,
     created_at TIMESTAMPTZ DEFAULT now(),
     UNIQUE(garage_id, name)
   );
   ```

2. **Manage locations:** Settings → Stock Locations page, or a "Manage" link next to the dropdown. Simple CRUD: add/rename/delete locations.

3. **Stock forms:** Replace the free-text location input with a dropdown (`<Select>`) populated from `stock_locations`. Include a "Create new location" option at the bottom that opens a quick-add dialog.

4. **Migrate existing data:** Server action that reads all distinct `location` values from `stock_items` and inserts them into `stock_locations`.

**Test checklist:**
- [ ] P31.1 — Create 3 locations (e.g. "Shelf A", "Shelf B", "Back Store")
- [ ] P31.2 — Add stock item → location dropdown shows all 3
- [ ] P31.3 — "Create new" → quick-add → new location appears in dropdown
- [ ] P31.4 — Edit stock item → dropdown pre-selects current location
- [ ] P31.5 — Existing free-text locations migrated

---

### P32 — Form field labels: required asterisk + (optional) (~1 hour)

**Rule:** Every required field gets a red asterisk (`*`) after the label. Every optional field gets `(optional)` in muted text after the label. Exception: kiosk pages — no asterisks or optional labels (keep it simple for walk-in customers).

**What to build:**

1. **Modify `<Label>` component** (`src/components/ui/label.tsx`):
   - Add `required?: boolean` and `optional?: boolean` props
   - When `required`: append `<span className="text-destructive ml-0.5">*</span>`
   - When `optional`: append `<span className="text-muted-foreground ml-1 text-sm font-normal">(optional)</span>`

2. **Audit every form in the app** and apply correct props:
   - Job creation: description (required), ETA (optional), bay (optional)
   - Customer creation: name (required), phone (required), email (optional), address (optional)
   - Stock creation: description (required), SKU (optional), quantity (required), reorder point (optional), unit cost (optional), location (optional)
   - Add Part: description (required), supplier (required), qty (required), price (required), payment method (required), invoice file (optional)
   - Staff creation: name (required), email (required), password (required), phone (optional), role (required)
   - Warranty: description (required), supplier (required), dates (required), mileage (optional)

3. **Kiosk exception:** In `/kiosk/*` pages, don't show asterisks or "(optional)". The kiosk form is simple enough that it's obvious what to fill in.

**Test checklist:**
- [ ] P32.1 — Required fields show red asterisk
- [ ] P32.2 — Optional fields show "(optional)" in muted text
- [ ] P32.3 — Kiosk forms show neither
- [ ] P32.4 — All forms audited and labelled correctly

---

### P33 — Consistent modal pattern (replace inline edits) (~1.5 hours)

**Problem:** The app inconsistently uses inline editing (form expands in place) and modals (dialog overlay). Inline edits cause layout shifts — specifically, the job detail title shifts when the edit rectangle appears. The stock page inline edit is buggy.

**Rule (from UX audit skill — interactive-components.md):**
- **Modals** for: create, edit, and any action that needs >2 fields or confirmation
- **Inline** ONLY for: single-field quick-edits (e.g. toggling a status, renaming something with 1 field)
- **Never** inline-edit table rows — always use a modal pre-filled with current values

**What to change:**

| Current pattern | Change to | Location |
|----------------|-----------|----------|
| Stock item inline edit | Modal dialog pre-filled | `/app/stock/` StockRowActions |
| Stock movement inline form | Modal dialog | `/app/stock/` RecordMovementButton |
| Job description inline edit | Modal dialog | `/app/jobs/[id]` EditJobDialog |
| Job parts inline delete | Keep (it's a confirmation, not a form) | `/app/jobs/[id]` |

**For each modal conversion:**
- Pre-fill all fields with current values
- Use shadcn/ui `<Dialog>` component
- Title: "Edit [Item Name]"
- Save button + Cancel button
- Close on successful save (with success toast)
- Close on Escape key or clicking outside

**Test checklist:**
- [ ] P33.1 — Stock edit opens as modal, not inline
- [ ] P33.2 — Stock movement opens as modal
- [ ] P33.3 — Job edit opens as modal, no layout shift
- [ ] P33.4 — All modals: pre-filled, Save/Cancel, close on success
- [ ] P33.5 — No layout shifts anywhere when editing

---

### P34 — Staff management page fixes (~30 min)

**The staff creation page EXISTS at `/app/settings/`** with `AddStaffDialog.tsx`. But issues:

1. The "No staff found" error in P17 points to Supabase dashboard — should link to Settings
2. Staff page may not be easily discoverable — add a prominent "Staff" section in sidebar under Settings, or a dedicated `/app/settings/staff` page
3. Verify the staff creation flow works end-to-end: create account → staff member can log in → appears in tech assignment modal
4. Add: edit staff details, deactivate staff (don't delete — they may have work logs), show role badge

**Test checklist:**
- [ ] P34.1 — Create a mechanic account → they can log in
- [ ] P34.2 — New mechanic appears in tech assignment modal
- [ ] P34.3 — Staff list shows all staff with roles
- [ ] P34.4 — Can edit staff name/phone/role
- [ ] P34.5 — Can deactivate staff (disables login without deleting history)

---

### P35 — Cards vs list views: consistent rules (~1 hour)

**Rule (informed by UX audit skill — visual-hierarchy-and-layout.md + cognitive-load-and-information.md):**

**Use CARDS when:**
- Items are visually distinct (vehicles with images, jobs with status badges)
- The user browses/scans rather than searches (bay board, today's view)
- Each item has 3+ visual elements (image, title, badges, metadata)
- Grid layout makes sense (responsive columns)
- Items have primary actions (buttons on the card)

**Use TABLE/LIST when:**
- Items are uniform (stock items, work logs, parts, audit log entries)
- The user needs to compare across rows (prices, quantities, dates)
- Sorting and filtering by columns is useful
- High information density is needed (manager reports, stock inventory)
- Items have >5 data fields

**Apply to the app:**

| Page | Current | Should be | Why |
|------|---------|-----------|-----|
| Vehicles list | Cards (grid) | **Cards** ✓ | Car images, visual browsing |
| Jobs list | Cards/mixed | **Cards** ✓ | Status badges, visual scanning |
| Bay board | Cards (Kanban) | **Cards** ✓ | DnD, visual workflow |
| Today's view | Cards | **Cards** ✓ | Overview, scan quickly |
| Customers list | Table | **Table** ✓ | Uniform data, compare, search |
| Stock inventory | Table | **Table** ✓ | Compare quantities, prices, sort |
| Parts on a job | Table | **Table** ✓ | Price comparison, totals |
| Work logs | List | **List** ✓ | Timeline, chronological |
| Warranties | Table | **Table** ✓ | Compare dates, suppliers |
| Bookings/check-ins | Cards | **Cards** — each check-in is an actionable item with promote button |
| Reports | Mixed | **Charts + tables** — KPIs as cards, detail as tables |
| Audit log | Table | **Table** ✓ | Chronological, compare |
| Staff list | Cards or table | **Cards** — show avatar, name, role badge, status (like tech assignment modal) |

**Implementation:**
- Audit every list page
- Switch to the correct pattern where it's wrong
- Ensure consistent card component usage (same padding, shadow, border-radius)
- Ensure consistent table usage (same header style, row height, column alignment)

**Test checklist:**
- [ ] P35.1 — Every list page uses the correct pattern per the table above
- [ ] P35.2 — Cards have consistent padding, shadow, radius across all pages
- [ ] P35.3 — Tables have consistent header style and row height across all pages
- [ ] P35.4 — Mobile: cards go single-column, tables get horizontal scroll or card collapse

---

## Part D — Verification findings (2026-04-14)

Code review of the existing Part D implementation (done automatically by Claude Code in a prior session) against the updated specs.

### P29 — Stock-only warranties: **PASS**
- `supabase/migrations/022_warranties_stock_only.sql` rebuilds table as stock-only (no job_id, vehicle_id, part_id). ✓
- `src/app/(app)/app/warranties/AddWarrantyDialog.tsx` — add warranty as Dialog modal. ✓
- `src/app/(app)/app/warranties/WarrantyRowActions.tsx` — Claim and Resolve buttons both use Dialog modals (lines 65, 114). ✓
- No gaps found. Matches the simplified spec.

### P30 — Charges + quote/invoice flow: **PASS with 4 gaps**
Implementation is largely correct and matches the simplified 3-status model.
- `ChargesSection.tsx` uses exactly 3 statuses: draft / quoted / invoiced. ✓
- No "Approved" or "Paid" leftover states. ✓
- Subtotal, VAT 20%, grand total visible. ✓
- Invoice PDF (`src/lib/pdf/invoice.tsx`) is clean, minimal Helvetica, grey tones, no decorative styling — matches "data-only" spec. ✓
- `Add Charge` uses Dialog modal. ✓
- `markAsQuoted()` and `markAsInvoiced()` change invoice_number from Q- to INV- correctly. ✓

**Gaps that need P39 (below) to fix:**
1. **No SMS on "Send Quote"** — `markAsQuoted()` only updates status. The spec required sending the customer an SMS with the approval link.
2. **No auto-sync between `job_parts` and `job_charges`** — when a part is added to a job via `AddPartForm`, no corresponding charge row is created. Manager has to type the part + price twice.
3. **No "Edit Charge" in UI** — `updateCharge()` server action exists but the UI only offers Add and Remove. Editing a typo or price requires delete + re-add.
4. **Description field is marked `(optional)` in `AddChargeDialog`** — should be required since every line item needs a description for the PDF.

### P33 — Modal pattern: **FAIL (3 inline forms missed)**
`P33` was marked DONE but the audit found 3 inline forms that still cause layout shift. See P36 below.

---

## Part F — Phase 2: Feature improvements (runs after Phase 1 role testing is clean)

> **Status 2026-04-14:** These items are now pre-launch work (see `CLAUDE.md > Current priority order`). Execute in the order given in "Part F execution order" below, after all Phase 1 defects are fixed. Do NOT start Part F until Phase 1 is signed off.


Found during hands-on testing on 2026-04-14. Layout-shift bugs on job detail page, inconsistent card heights, and the app is not mobile-ready.

| ID | Task | Severity | Est. |
|----|------|----------|------|
| P36 | Convert remaining inline forms to modals (LogWork, AddPart, AddVehicle) | CRITICAL | ~1 hour |
| P37 | Equal card heights across all multi-card rows | HIGH | ~30 min |
| P38 | Mobile-first responsive pass (sidebar drawer, tables → cards, breakpoints) | HIGH | ~4 hours |
| P39 | Close P30 gaps (SMS on quote, parts→charges sync, edit charge, required description) | HIGH | ~2 hours |
| P40 | Labour rate flexibility (settings UI + editable suggestions) | HIGH | ~1 hour |

---

### P36 — Finish P33: convert 3 inline forms to modals (~1 hour)

**Problem:** P33 was marked DONE but 3 forms still render inline (conditional `!open && <form>`), causing layout shift when opened — pushing content down and moving other cards.

**Files to convert (each follows the same pattern: wrap the form in `<Dialog>` with `DialogTrigger` / `DialogContent`, matching `AddChargeDialog` in `ChargesSection.tsx` as the reference implementation):**

#### P36.1 — `src/app/(app)/app/jobs/[id]/LogWorkDialog.tsx` (misnamed)
Currently: toggles a `<form className="rounded-lg border p-4">` inline under the Work Log heading. Pushes everything below.
Fix: Wrap the existing form body in `<Dialog><DialogTrigger><Button>Log Work</Button></DialogTrigger><DialogContent>` etc. Keep all existing fields (Staff, Task Type, Start Time, End Time, Description). Close on success.

#### P36.2 — `src/app/(app)/app/jobs/[id]/AddPartForm.tsx`
Currently: conditional form inline under the Parts section.
Fix: Same pattern — wrap in Dialog. Keep the `grid sm:grid-cols-2` form layout inside `DialogContent`. Close on success.

#### P36.3 — `src/app/(app)/app/customers/[id]/AddVehicleForm.tsx`
Currently: conditional form inline on the customer detail page.
Fix: Same pattern — wrap in Dialog.

**Shared acceptance criteria:**
- Opening the form does NOT cause any content below it to move
- Form pre-fills correctly for edit flows (if applicable)
- ESC key and clicking outside close the modal
- Success closes the modal and refreshes data
- Error keeps modal open and shows error message

**Test checklist:**
- [ ] P36.1 — Click "Log Work" → modal opens, nothing else moves on screen
- [ ] P36.2 — Click "Add Part" → modal opens, Parts section doesn't shift
- [ ] P36.3 — Click "Add Vehicle" on customer page → modal opens
- [ ] P36.4 — All 3 modals close on ESC / outside-click / success
- [ ] P36.5 — No remaining `useState(false)` patterns toggling inline `<form>` or `<Card>` in any client component

---

### P37 — Equal card heights across multi-card rows (~30 min)

**Problem:** On the job detail page, the top row has `Customer`, `Vehicle`, and `Bay & Team` cards side by side but they have different heights because each card's content is different length. The grid doesn't stretch them.

**Root cause:** `src/components/ui/card.tsx` uses `flex flex-col gap-4` but doesn't have `h-full`. The grid at `src/app/(app)/app/jobs/[id]/page.tsx:157` (`grid gap-4 sm:grid-cols-3`) doesn't stretch cards either.

**Fix options (pick one):**

**Option A — Modify Card component (recommended, affects whole app):**
Add `h-full` to the base Card class. Every Card then fills its container. This is the cleanest fix and also benefits the bay board, today's view, and anywhere else cards are in rows.

```tsx
// src/components/ui/card.tsx
const base = "flex flex-col gap-4 h-full rounded-xl border bg-card text-card-foreground shadow-sm";
```

**Option B — Apply at grid level:**
Where cards are in a grid row, add `items-stretch` and `[&>*]:h-full` to the grid. More targeted but requires editing every grid container.

**Preferred: Option A.**

**Audit all multi-card grids:**
- `src/app/(app)/app/jobs/[id]/page.tsx:157` (Customer / Vehicle / Bay & Team)
- `src/app/(app)/app/bay-board/BayBoardClient.tsx:85` (bay cards)
- `src/app/(app)/app/(overview)/page.tsx` (today's view — check)
- `src/app/(app)/app/vehicles/page.tsx` (vehicles grid — check)
- `src/app/(app)/app/settings/staff/page.tsx` (staff grid — check)
- Any `grid-cols-` occurrence with Card children

**Test checklist:**
- [ ] P37.1 — Job detail top 3 cards all equal height regardless of content length
- [ ] P37.2 — Bay board columns equal height
- [ ] P37.3 — Staff cards equal height
- [ ] P37.4 — Vehicle cards equal height
- [ ] P37.5 — No visual regressions on single-card pages

---

### P38 — Mobile-first responsive pass (~4 hours)

**Problem:** The app is desktop-first. Only 12 breakpoint uses across the whole codebase. Specific issues:
- Sidebar is `hidden md:block` with no hamburger menu wired up on mobile
- Customers table has no mobile fallback (will overflow)
- Forms don't always use responsive grids
- Job detail `max-w-4xl` may be cramped on phones

**Target breakpoints:**
- Mobile first: base styles = phone (≤640px)
- `sm:` = small tablet (640px+)
- `md:` = tablet (768px+)
- `lg:` = laptop (1024px+)
- `xl:` = desktop (1280px+)

Rule: style mobile first (no prefix), then add `sm:`, `md:`, `lg:` for larger screens. Never style desktop first and try to retrofit mobile.

#### P38.1 — Mobile navigation drawer (~45 min)
**Problem:** `src/components/app/sidebar.tsx:98` is `hidden md:block`. TopBar has a menu button at `md:hidden` but no handler.
**Fix:** Use shadcn/ui `Sheet` component to turn the sidebar into a mobile drawer. TopBar hamburger button opens the Sheet. Sheet closes on nav link click and ESC. On `md:` and up, keep the existing static sidebar.

#### P38.2 — Tables → card view on mobile (~1.5 hours)
**Problem:** Tables with 5+ columns (customers, stock, bookings) will overflow on phones even with column-hiding.
**Fix:** For each table-based page, add a responsive wrapper:
- Below `md:` → render each row as a `Card` with stacked label/value pairs
- `md:` and up → existing table
- Use a `TableToCards` wrapper component (new): takes rows + a columns config, renders table on desktop, cards on mobile.
**Priority pages:**
- Customers (`/app/customers`)
- Stock (`/app/stock`)
- Check-ins (`/app/bookings`)
- Warranties (integrated in stock page)
- Audit log (`/app/settings/audit`)

#### P38.3 — Job detail page responsive fixes (~30 min)
- Remove/relax `max-w-4xl` below `md:` (use `max-w-4xl md:mx-auto` or drop entirely)
- Top 3 cards: current `grid sm:grid-cols-3` is fine; verify `grid-cols-1 sm:grid-cols-3`
- Action buttons (Start Diagnosis, Cancel, etc.) should wrap on mobile — add `flex flex-wrap gap-2`
- Status history / work log / parts / charges: stack vertically on mobile, keep current layout on desktop

#### P38.4 — Forms responsive audit (~45 min)
Audit every form for:
- Input fields use `w-full` (not fixed widths)
- Multi-field rows use `grid grid-cols-1 sm:grid-cols-2` (stack on mobile)
- Submit buttons full-width on mobile, auto on desktop (`w-full sm:w-auto`)
- Labels above inputs on mobile (already default for most)

Priority forms: all Dialog forms created for P36, the job creation form, customer form, stock form, staff form.

#### P38.5 — Kiosk pages (~15 min)
Kiosk runs on a 10" tablet so it's already tablet-sized, but verify:
- Touch targets ≥44px (use `size="lg"` buttons)
- Form fields don't require horizontal scroll
- Keyboard doesn't cover input when focused (use `scrollIntoView` on focus)

#### P38.6 — Technician mobile UI (~15 min)
The `/app/tech` pages should be mobile-first already. Verify:
- Start/Pause/Complete buttons are large (`h-14` or larger)
- Work log entries stack cleanly
- No horizontal scroll anywhere

**Test checklist:**
- [x] P38.1 — `AppShell` extracted; static `<Sidebar>` at md+, mobile `<Sheet>` drawer below md driven by the existing TopBar hamburger; nav-link click closes the drawer.
- [x] P38.2 — Customers / Stock items / Active warranties / Bookings / Audit log all carry a `md:hidden` card list above the existing `hidden md:block` table; both surfaces share the same data + actions.
- [x] P38.3 — Job detail: `max-w-4xl` relaxed to `md:max-w-4xl` so mobile gets full width; identity row stacks via `flex-col sm:flex-row`; Customer/Vehicle/Bay grid pinned to `grid-cols-1 sm:grid-cols-3`; the JobActionsRow already wraps via flex-wrap (P52); main padding eased to `p-4 sm:p-6` in `AppShell`.
- [x] P38.4 — Audited NewCustomerForm + NewJobForm: paired fields use `grid grid-cols-1 sm:grid-cols-2`; submit buttons `w-full sm:w-auto`; Cancel reverses on mobile via `flex-col-reverse sm:flex-row`. Other Dialog-mounted forms (AddVehicleForm, AddPartForm, AddStaffDialog, AddStockDialog, EditJobDialog) already render single-column inside Dialog max-w-md and stay tap-target-safe.
- [x] P38.5 — Kiosk pages: action buttons use `text-lg py-6` (≥52 px). No horizontal scroll surface — single column + RegPlateInput.
- [x] P38.6 — Tech pages: `TechJobClient` Start / Pause / Complete buttons are `h-16` (64 px), well above the 56 px gloved-Android target.
- [~] P38.7 — Static audit clean: only `overflow-x-auto` source is `src/components/ui/table.tsx` and every consumer wraps it in `hidden md:block`. Manual 375 px viewport spot-check across all routes still requires staging.
- [~] P38.8 — Sidebar nav links have `min-h-11` (44 px) per P38.8. `Button size="sm"` (28 px) is below the WCAG 2.5.5 mobile target but is the project-wide default — same finding logged in the P52 ux-audit close-out, deferred to Phase 3 V5 for a coordinated bump.

---

### P39 — Close P30 gaps (~2 hours)

Verification of the existing charges/invoice implementation found 4 gaps (see Part D Verification findings above). Close them:

#### P39.1 — Send SMS on "Send Quote" (~45 min)
`markAsQuoted()` in `src/app/(app)/app/jobs/charges/actions.ts:277` currently only updates status. Must also:
1. Build the quote approval link with HMAC signature (reuse existing `approval_tokens` table + signing helper)
2. Call `sendSms()` from `src/lib/sms/twilio.ts` with the customer's phone and a message like: `"Dudley Auto Service: Your quote Q-{n} for {reg} is ready. Total £{total}. Review & approve: {link}"`
3. Record the outbound SMS in `sms_messages` (or whatever the audit table is) for delivery tracking

Copy the pattern from the existing per-line-item approval SMS flow (look for how `request_approval` works).

**Test:** Click "Send Quote" → customer receives SMS with link → link opens approval page showing the quote → approve → status on job page reflects approval.

#### P39.2 — Auto-sync job_parts → job_charges (~30 min)
Two options:
- **DB trigger (preferred):** After INSERT on `job_parts`, insert into `job_charges` with type='part', description from part name, qty and unit_price_pence from the part row. On UPDATE, update the charge. On DELETE, delete the charge. Write as migration `024_parts_charges_sync.sql`.
- **Server action:** Modify `addPartToJob()` to also call `addCharge()` in the same transaction. Less robust because it won't catch manual DB edits.

Go with the DB trigger. Include tests that verify: add part → charge appears; edit part → charge updates; delete part → charge removed.

**Test:** Add a part to a job → charges section immediately shows a "Part" line item with that description and price. Edit the part's price → charges total updates.

#### P39.3 — "Edit Charge" UI (~30 min)
`updateCharge()` server action exists at `charges/actions.ts:67`. Add a pencil icon button next to the trash icon on each charge row in `ChargesSection.tsx` (only visible when status is `draft`). Opens a modal pre-filled with the current description / qty / unit price. Save calls `updateCharge()`.

**Test:** Add a charge → click edit → change price → save → totals update. Can't edit once quoted/invoiced.

#### P39.4 — Charge description is required (~5 min)
In `ChargesSection.tsx:263`, change `<Label optional>` to `<Label required>` on the description field, and add `required` to the `<Input>`. The description shows on the PDF invoice so it can't be blank.

**Test:** Try to submit without description → browser validation blocks.

**Test checklist:**
- [ ] P39.1 — Send Quote → customer receives SMS with approval link → approving updates job status
- [ ] P39.2 — Add part to job → charge auto-created; edit part price → charge updates; remove part → charge removed
- [ ] P39.3 — Edit charge modal pre-filled, save updates totals
- [ ] P39.4 — Description required in Add Charge dialog

---

### P40 — Labour rate flexibility (~1 hour)

**Problem:** The garage labour rate (`garages.labour_rate_pence`) has no UI to edit it — it's stuck at the default £75/hr unless someone edits the DB directly. And "Labour from logs" force-inserts an hourly charge with `ceil(totalSeconds / 3600)`, which is rigid — no way to bill flat rates, half-hour increments, or discounted rates without manually rebuilding the charge.

**Design goal: maximum flexibility.** Labour should be charged however makes sense per job — hourly, flat fee, per-visit, per-axle — whatever. The system should *suggest* sensible defaults from work logs but *never* force a particular pricing model.

**What to build:**

#### P40.1 — Labour rate setting in garage settings UI (~20 min)

Add a "Billing" section on `/app/settings/` (manager-only) with:
- **Default labour rate (per hour)** — numeric input in £, saves to `garages.labour_rate_pence`
- **Default labour description** (optional text field) — e.g. "Workshop labour" — used as the default description when creating a labour charge. Saves to `garages.labour_default_description` (new nullable column).

Migration: `024_garage_billing_settings.sql` — add `labour_default_description TEXT` column to garages.

#### P40.2 — "Labour from logs" opens editable dialog instead of auto-inserting (~30 min)

Current behaviour (`ChargesSection.tsx:73`): clicking the button calls `calculateLabourFromLogs()` and immediately inserts a charge with rounded-up hours × rate. No chance to adjust.

New behaviour: clicking the button opens the existing `AddChargeDialog` pre-filled with:
- **Type:** Labour
- **Description:** suggested value based on work logs (e.g. "Labour — 2h 15m diagnosis + repair") or the garage's default description if set
- **Quantity:** suggested as `totalSeconds / 3600` rounded to nearest 0.25 (so 1h 22m → 1.5, not forced up to 2)
- **Unit price:** the garage labour rate

The manager can then edit ANY of these fields — change qty to 1 (flat fee), change unit price to a custom amount, change description to "Emergency callout" — before clicking Add.

Backend: `calculateLabourFromLogs()` becomes a **suggestion function** that returns `{ hours, ratePence, description }` without inserting. The dialog uses those values as defaults.

#### P40.3 — Quick-pick labour presets (optional, ~10 min)

In the AddChargeDialog when type=Labour, show 3 quick-pick buttons below the description field:
- **Use work logs** → populates qty/price from logs
- **Flat fee** → qty=1, price blank (user types flat amount)
- **Hourly custom** → qty blank, price = garage rate

This gives managers three clear mental models. They can still type whatever they want — the buttons are just shortcuts.

**Test checklist:**
- [ ] P40.1 — Settings → Billing → change labour rate to £85/hr → saved
- [ ] P40.2 — Settings → Billing → set default description to "Workshop labour" → appears as default in AddChargeDialog for Labour type
- [ ] P40.3 — "Labour from logs" opens dialog pre-filled, NOT auto-inserting
- [ ] P40.4 — Can change quantity in pre-filled dialog before submitting
- [ ] P40.5 — Flat fee: qty=1, price=£60 → saves as £60 total
- [ ] P40.6 — Hourly: qty=2.5, price=£75 → saves as £187.50 total
- [ ] P40.7 — Rounded to 0.25 hours (1h 22m → 1.5) not ceil to 2
- [ ] P40.8 — Garage without labour_rate_pence set → falls back to £75/hr

---

### P41 — Delete a check-in (~30 min)

**Why:** Hossein reported "i cant even delete a check-in". Walk-ins sometimes leave, or a kiosk entry was a mistake. Manager must be able to remove them.

**Scope:**
- New Server Action `deleteCheckIn(id)` in `src/app/(app)/app/check-ins/actions.ts` — manager role only, soft-delete (`deleted_at`), audit log entry.
- In the check-ins list page, a dropdown/overflow menu on each row with "Delete" → confirmation dialog ("Delete this check-in? Customer will not be notified.") → calls action → toast success → list refreshes.
- RLS: policy update so mechanics/testers cannot delete; managers can update `deleted_at`. Use the standard pattern in BACKEND_SPEC.
- GDPR: soft-delete only, 30-day hard-delete cron already handles permanent removal.

**Acceptance:**
- [ ] P41.1 — Manager sees Delete option on each check-in row
- [ ] P41.2 — Mechanic/tester do NOT see Delete option
- [ ] P41.3 — Clicking Delete → confirmation modal → soft-deletes the row
- [ ] P41.4 — Deleted check-ins no longer appear in the list
- [ ] P41.5 — Audit log records deletion (actor, timestamp, check-in id)
- [ ] P41.6 — Cannot delete a check-in that's already been converted to a job (show error)

---

### P42 — Check-in count badge on sidebar (~30 min)

**Why:** Hossein: "a notification on the booking menu should show on the sidebar check-in menu with a number in a circle expressing how many bookings received, like what happens on a notification bell"

**Scope:**
- Server component in `src/components/app/sidebar.tsx` fetches unacknowledged check-in count for current garage (status = 'checked_in', not yet converted to job, not deleted).
- Small red circle badge next to the "Check-ins" nav label showing the count. Hide badge when count = 0. Cap display at "99+".
- Refresh strategy: re-fetch on route change (RSC revalidate). Optional Phase 3 enhancement: Supabase realtime subscription.
- `role='status'` + `aria-label="{N} new check-ins"` for a11y.

**Acceptance:**
- [ ] P42.1 — Badge shows correct count for current garage
- [ ] P42.2 — Badge hidden when count is 0
- [ ] P42.3 — Badge updates after creating a new check-in (navigate → see updated count)
- [ ] P42.4 — Multi-tenant correct: garage A's badge does not reflect garage B's check-ins
- [ ] P42.5 — Screen reader announces the count

---

### P43 — Kiosk DVSA reg lookup (~1.5 hours)

**Why:** Hossein: "we need a reg lookup from the kiosk so we get all the details from the beginning". DVSA integration already exists (M2.3) for the app — extend it to kiosk so customers don't have to type vehicle details.

**Scope:**
- Kiosk reg input gets a "Look up" button (or debounced auto-lookup after 7 chars). Calls existing DVSA endpoint via a new thin Route Handler `/api/kiosk/reg-lookup?reg={reg}` that proxies to the cached DVSA lookup function. 24h cache already exists — reuse it.
- Response populates make, model, colour, fuel, year, last MOT date (read-only display below the reg field). Customer can still proceed if lookup fails (graceful fallback — manual entry).
- Rate limit: 10/hr per IP using `checkRateLimit('kiosk_reg_lookup_ip:{ip}', 10)`. 429 on hit.
- Do NOT expose DVSA key to the kiosk client — server-only, same as existing pattern.
- Do NOT require lookup success to submit booking (kiosk must remain resilient if DVSA is down).

**Acceptance:**
- [ ] P43.1 — Valid UK reg returns make/model/colour filled in
- [ ] P43.2 — Invalid reg shows friendly "no data found" without blocking submit
- [ ] P43.3 — DVSA key not present in client bundle (grep `NEXT_PUBLIC_` + network tab)
- [ ] P43.4 — 11th lookup in an hour from same IP → 429
- [ ] P43.5 — Cached result served within 24h (second call doesn't hit DVSA)
- [ ] P43.6 — Submit works when DVSA endpoint is down (fallback to manual entry)

---

### P44 — Work log start / pause / stop with full HH:MM:SS timestamps (~1 hour)

**Why:** Hossein: "We need start, pause and stop with full timestamps on the work log, we need hours-minutes-seconds". The current tech UI has start/pause/complete (M1.3) but the user wants to verify every action records a full second-precision timestamp, every row renders in `HH:mm:ss`, and durations always show `Xh Ym Zs`.

**Scope:**
- **Verify the state machine:** start → pause → start (resume) → pause → … → stop (complete). Each transition writes a new row or closes an open row in `work_logs` with `started_at` / `ended_at` at full timestamp precision (microseconds stored, seconds displayed). Confirm DB columns are `timestamptz` (not `date`).
- **One formatter util** `src/lib/format.ts`:
  - `formatWorkLogTime(date)` → `HH:mm:ss` (or `DD MMM HH:mm:ss` when not today)
  - `formatWorkLogDuration(seconds)` → `Xh Ym Zs` (drop leading zeros: `22m 14s`, not `0h 22m 14s`)
- **Display audit** — replace all inline date/duration formatting with the util in:
  - tech mobile job page (`/app/tech/jobs/[id]`)
  - manager job detail work log table (`/app/jobs/[id]`)
  - the new "Currently working" panel (P49)
  - reports CSV export
- **DB trigger sanity check** — an active (paused or running) work_log cannot start a new one for the same user+job. Enforce with a partial unique index: `create unique index work_logs_one_active_per_user_job on work_logs (job_id, technician_id) where ended_at is null`.

**Acceptance:**
- [ ] P44.1 — Start button → new row with `started_at` at full precision, `ended_at = null`
- [ ] P44.2 — Pause button → closes row with `ended_at`, UI switches to "Resume"
- [ ] P44.3 — Resume button → new row with `started_at`, old row stays closed
- [ ] P44.4 — Stop button → closes open row, sets job status to appropriate completion state
- [ ] P44.5 — All three buttons recorded with HH:MM:SS in UI
- [ ] P44.6 — Duration cells everywhere render `Xh Ym Zs`
- [ ] P44.7 — Reports CSV export includes seconds
- [ ] P44.8 — Cannot start a second active work_log while one is running (DB unique index rejects)
- [ ] P44.9 — Formatter util is the only path — no inline date formatting remains

---

### P45 — Email on kiosk + visible in manager (~45 min)

**Why:** Hossein: "in the kiosk we do not have an email field and i cannot see the emails in my manager account on the customer lists or customer page". Email is needed for follow-ups and is a soft requirement for Oplaris resale product.

**Scope:**
- Add optional `email` field to kiosk booking form (below phone, labelled "Email (optional)" — per the non-kiosk mandatory/optional rule we use red asterisk in the app, but kiosk keeps "(optional)" in line with P39.4 exception).
- Zod schema: optional, valid email when present.
- `customers.email` column — check if exists; if not, write migration `025_customer_email.sql` adding nullable text column.
- Surface email in `customers/page.tsx` list (column) and `customers/[id]/page.tsx` detail (labelled field).
- Edit customer modal: editable email field.
- GDPR: email is PII — included in `customer_data_export` (verify existing SECURITY DEFINER fn returns it after migration).

**Acceptance:**
- [ ] P45.1 — Kiosk submit with valid email persists to customers.email
- [ ] P45.2 — Kiosk submit without email succeeds (optional)
- [ ] P45.3 — Invalid email shows inline error, blocks submit
- [ ] P45.4 — Customer list shows email column (or truncated cell)
- [ ] P45.5 — Customer detail page shows email, editable via Edit Customer modal
- [ ] P45.6 — `customer_data_export(id)` returns email in the JSON dump

---

### P46 — Assign-tech modal on job creation from check-in (~1 hour)

**Why:** Hossein: "when creating the job from the checkin area i want this modal i attached to be displayd to first assign the job to any available technician, then I would click the technician and the job is created an i am redirected to the job page. if i select a busy technician, i should get a confirmation message".

**Scope:**
- On the check-ins page, the "Create Job" button no longer immediately creates the job. It opens `AssignTechDialog`.
- Dialog shows all active technicians (mechanic + mot_tester roles) grouped by availability:
  - **Available now** (no in-progress work log) — listed first
  - **Busy** (has an open work log) — listed under a divider with current job link shown
- Clicking an Available tech → creates job with `assigned_to = user.id`, status = 'checked_in', redirects to `/app/jobs/{new_id}`.
- Clicking a Busy tech → second confirmation "X is currently working on Job #Y. Assign anyway?" → on confirm, creates + redirects.
- Backend: one Server Action `createJobFromCheckIn(checkInId, technicianId)` — validates check-in exists + not already converted, enforces manager-only via RLS/role check, inserts job, marks check-in as `converted_to_job_id`, returns new job id.
- Tech list is server-computed (not client-fetched) for multi-tenant correctness.

**Acceptance:**
- [x] P46.1 — Clicking Create Job opens assign-tech dialog (not direct create)
- [x] P46.2 — Dialog shows all active techs with correct Available/Busy grouping
- [x] P46.3 — Assigning to available tech → job created + redirect
- [x] P46.4 — Assigning to busy tech → confirmation modal → confirm → job created
- [x] P46.5 — Cancel on confirmation → no job created, dialog stays open
- [x] P46.6 — Converted check-in cannot be re-converted (button disabled / hidden)
- [x] P46.7 — Mechanic/tester cannot access this flow (RLS blocks)

---

### P47 — Role-aware check-in routing + MOT→mechanic pass-back (~3 hours)

**Why:** Hossein's workflow spec (2026-04-14):
> "If a booking comes through MOT test form, the MOT tester only sees the job in the check-ins page, he can start it autonomously. If any job comes from electrical or service-and-repair, they both are seen from the mechanics. If an MOT tester notices a job requires a mechanic for either electrical or service-and-repair, he can pass the job to them; the job goes back to the check-ins area with a special note, top list priority. The manager must have power to override any of these rules."

Each role only sees the check-ins that are their job to pick up. MOT testers start MOTs themselves. MOTs that uncover repair work can be "passed back" into the check-ins queue as a high-priority mechanic job with a structured checklist of what needs looking at.

**Data model (migration 026_checkin_routing.sql):**
- `check_ins.priority` — `smallint not null default 0` (0 = normal, 1 = high, 2 = urgent). Sort desc on check-ins list.
- `check_ins.passback_note` — `text` (freeform note from tester to mechanic).
- `check_ins.passback_items` — `jsonb` array of strings from the fixed checklist below, plus optional `other` text. Schema example: `[{"item": "brake_pads"}, {"item": "light_bulb", "detail": "rear right"}, {"item": "other", "detail": "strange rattle at idle"}]`.
- `check_ins.passed_from_job_id` — `uuid references jobs(id)` (the MOT job that triggered the passback, for traceability).
- `jobs.awaiting_passback` — `boolean default false` (MOT job stays open but paused while mechanic works the passback; MOT tester resumes after).
- Checklist enum values (hardcoded in `src/lib/constants/passback-items.ts`):
  `droplink`, `tyres`, `washer_pump`, `brake_pads`, `brake_disks`, `suspensions`, `hand_brake`, `wipers`, `mirrors`, `light_bulb` (requires detail), `other` (requires detail).

**Role-filtered check-in visibility (P47.1):**
- `manager` — sees ALL check-ins in `/app/check-ins`. Filter pills let them narrow to "MOT / Electrical / Repair / Passbacks". Default view = all.
- `mot_tester` — **no access to the Check-ins page** (P48). Instead, MOT check-ins (`service='mot'`) appear in their **Today** page ("Incoming MOTs") and **My Work** feed ("Next up"), each with the same "Start MOT" button from P47.2. Passbacks never route to testers, so they never see them.
- `mechanic` — sees `service IN ('electrical', 'maintenance')` AND passbacks (`passed_from_job_id IS NOT NULL`) in `/app/check-ins`.
- Enforced both in the Server Action that lists check-ins AND in an RLS policy on `public.check_ins`. Two-layer gate per architecture rules #2 + #3.
- Manager override is implicit — `is_manager()` in the RLS `USING` clause short-circuits the role filter.

**MOT tester self-start (P47.2):**
- On the check-ins page, MOT testers see a "Start MOT" button on each row (instead of the manager's "Create Job" → AssignTechDialog flow from P46).
- One click: Server Action `startMotFromCheckIn(checkInId)` validates the user has `mot_tester` role, creates a job with `service='mot'`, `assigned_to = user.id`, `status='mot_in_progress'`, marks the check-in converted, redirects to the job page.
- Managers still use the full P46 AssignTechDialog flow.
- Mechanics use P46 AssignTechDialog too (they can self-pick or manager assigns; both paths valid).

**Pass-back from MOT job to mechanic check-in queue (P47.3):**
- On an MOT job detail page, MOT tester sees a "Pass to mechanic" button (visible only when `service='mot'` AND current user is the assigned tester, or is a manager).
- Click opens `PassbackDialog`:
  - Header: "What needs mechanic attention?"
  - Checkbox grid of the 11 items. Tick one or more.
  - `light_bulb` reveals a text input: "Which bulb?" (required if ticked).
  - `other` reveals a text input: "Describe" (required if ticked).
  - Freeform text area: "Note to mechanic" (optional, appears below the checklist).
  - Confirm button: "Pass to Mechanic" (disabled until at least one item ticked).
- Server Action `passJobToMechanic(jobId, items, note)`:
  - Validates role is `mot_tester` or `manager`, job is MOT, job is in progress.
  - Sets `jobs.awaiting_passback = true`, `jobs.status = 'awaiting_mechanic'`.
  - Inserts a new `check_ins` row: same customer/vehicle, `service = 'maintenance'` (or route by checklist content — see open question below), `priority = 1`, `passback_note = note`, `passback_items = items`, `passed_from_job_id = jobId`.
  - Audit log entry.
- Mechanic picks up the new check-in from their queue using the standard P46 AssignTechDialog (or self-start — see open question).
- When the mechanic job completes, the MOT tester gets a notification/badge (out of scope here; handle later in Phase 3 or via the existing status-change SMS path).

**Priority ordering (P47.4):**
- Check-ins list query: `order by priority desc, created_at asc`.
- High-priority rows get a coloured left border + "⚡ Passback" chip in the UI.
- Include the checklist summary inline: "Brake pads, Tyres, Light bulb (rear right)".

**Manager override (P47.5):**
- Manager dashboard has a "Check-ins" page that shows ALL regardless of filter, plus a dropdown per row: "Assign to…" → full tech picker (mechanics + testers, same UX as P46).
- Manager can also re-route a passback back to a tester or to a different mechanic, and can edit/clear passback notes.
- Manager can bypass the "only tester starts MOT" and "only mechanic picks up passback" rules from the UI.
- Backed by existing `requireManager()` guard + RLS policy permitting manager full access on check_ins.

**Acceptance:**
- [ ] P47.1 — MOT tester sees only MOT check-ins; mechanic sees only electrical/maintenance/passback; manager sees all
- [ ] P47.2 — RLS blocks a mechanic from reading an MOT-only check-in even via direct query
- [ ] P47.3 — MOT tester clicks "Start MOT" → job created, assigned to self, redirected
- [ ] P47.4 — PassbackDialog requires at least one checkbox, conditional text fields validate
- [ ] P47.5 — Passing back creates a new high-priority check-in, pauses MOT job with `awaiting_passback=true`
- [ ] P47.6 — New passback appears at top of mechanic's check-in list with visible chip + checklist summary
- [ ] P47.7 — Manager can see all check-ins, reassign any, override role rules
- [ ] P47.8 — Audit log records every state transition (start, passback, reassign)
- [ ] P47.9 — Multi-tenant: garage A's passbacks never appear in garage B

**Decisions (Hossein, 2026-04-14):**
1. **Pass-back resumption:** MOT job stays paused. MOT tester manually clicks "Resume MOT" when ready. No auto-resume.
2. **Mechanic self-start:** yes, mechanics can self-start a pass-back. Manager can still override.
3. **Mixed-item pass-backs:** one combined check-in. Any mechanic can pick it up.

---

### P48 — Role-based sidebar + route access policy (~1.5 hours)

**Why:** Hossein (2026-04-14):
> "A mechanic should only have access to the following pages: Today, My Work, Job page, and Check-ins, all of them in the sidebar and as policy. The MOT tester should have access to these pages: Today, My Work, Job page with the whole MOT history, all of them in the sidebar and as policy."
> "When it comes to assigning jobs, as always the manager must have power to override any of these rules."

Staff see only what they need. Managers see everything.

**Access matrix (source of truth):**

| Route | manager | mot_tester | mechanic |
|---|---|---|---|
| `/app` (Today) | ✓ | ✓ | ✓ |
| `/app/tech` (My Work) | ✓ | ✓ | ✓ |
| `/app/jobs/[id]` (individual job page) | ✓ | ✓ if job is MOT or assigned to them | ✓ if assigned to them |
| `/app/check-ins` | ✓ | — *(MOT check-ins surface in Today / My Work — see note)* | ✓ |
| `/app/jobs` (jobs list) | ✓ | — | — |
| `/app/customers`, `/app/customers/[id]` | ✓ | — | — |
| `/app/stock`, stock movement | ✓ | — | — |
| `/app/reports` | ✓ | — | — |
| `/app/settings` and any `/app/settings/*` | ✓ | — | — |
| `/app/warranties` | ✓ | — | — |
| MOT history view (on Job page when `service='mot'`) | ✓ | ✓ | — |

**Note on MOT tester + Check-ins:** Hossein's P48 list excludes `/app/check-ins` for MOT testers, but P47 requires them to see MOT check-ins. Resolution: MOT check-ins (service='mot') appear directly in the tester's **Today** dashboard ("Incoming MOTs") and **My Work** feed ("Next up"), each with the same "Start MOT" button from P47.2. No dedicated Check-ins page for testers. If Hossein wants a dedicated page, add it later — this is cleaner for workflow.

**Scope:**
- **Sidebar data source:** `src/components/app/sidebar.tsx` builds its nav list from a role-keyed config `NAV_ITEMS_BY_ROLE`. Show union across the user's roles array (per migration 025). Mechanic + mot_tester sees both their items deduped.
- **Route middleware:** `src/proxy.ts` (or `middleware.ts`) gains a table of `route prefix → required roles`. On every app route request, after auth, check if the user's roles intersect the required roles. Mismatch → redirect to `/403`. Manager bypasses all.
- **Server Action guard:** every Server Action that mutates data reachable from a restricted page also calls `requireRole([...])`. Belt-and-braces with the middleware.
- **RLS policies:** any domain table that currently uses `private.is_staff_or_manager()` but should be manager-only gets its policies tightened to `private.is_manager()`. Audit list: `customers` writes, `stock_items` writes, `garages` writes, `staff` writes, `reports_cache`, `warranties`. Read policies keep existing scoping so managers can still show them.
- **"Today" dashboard** (`/app`) has three server-rendered variants based on role: manager sees all KPIs; mechanic sees today's assigned jobs + open check-ins for their role; MOT tester sees today's MOT schedule + incoming MOT check-ins.
- **"My Work"** (`/app/tech`) is role-agnostic — lists jobs where `assigned_to = current user`. Already exists; verify mechanic + MOT tester both see only their own.
- **Job page** opens for any user whose roles match an allow rule: manager, OR assigned tech, OR (mot_tester AND job.service='mot'). Otherwise 403.
- **MOT history section** on the job page (visible to manager + mot_tester): for the vehicle on this job, show chronological list of past MOT jobs (pass/fail, date, notes). Links to each historical job page (scoped the same).

**Acceptance:**
- [ ] P48.1 — Mechanic sidebar shows exactly: Today, My Work, Check-ins. No other items.
- [ ] P48.2 — MOT tester sidebar shows exactly: Today, My Work. No other items.
- [ ] P48.3 — Manager sidebar shows everything (full current set).
- [ ] P48.4 — Mechanic types `/app/settings` in the URL → redirected to `/403`.
- [ ] P48.5 — MOT tester types `/app/check-ins` → redirected to `/403`.
- [ ] P48.6 — Mechanic visits their assigned job page → sees it; tries an unassigned one → 403.
- [ ] P48.7 — MOT tester visits a non-MOT job unassigned to them → 403.
- [ ] P48.8 — MOT tester on an MOT job page sees the "MOT history" section with prior MOTs for that vehicle.
- [ ] P48.9 — Multi-role (mechanic + mot_tester) sees union of both nav sets.
- [ ] P48.10 — Manager override: can visit any page, any job, any customer.
- [ ] P48.11 — RLS denies writes to manager-only tables for mechanics/testers even via raw query.
- [ ] P48.12 — MOT check-ins appear in MOT tester's Today + My Work with "Start MOT" button (P47 integration).

---

### P49 — Live "Currently working on this job" panel (~45 min)

**Why:** Hossein (2026-04-14):
> "On each live job there must be a new section visible to anybody who can see the job to see who is working on it."

When a tech is actively clocked on a job (has an open `work_logs` row), anyone viewing the job page sees who it is and for how long — including the customer on the status page, per Hossein's "visible to anybody who can see the job".

**Scope:**
- New component `CurrentlyWorkingPanel.tsx` on the job detail page (manager view, tech view, and customer status page).
- Data source: any row in `work_logs` where `job_id = X` AND `ended_at IS NULL`. There can be zero, one, or many (multiple techs on one job — rare but possible).
- Display:
  - Name + role pill + avatar (if set)
  - "Started at 14:22:05"
  - Running timer ticking each second (client component with `setInterval`, server renders initial value)
  - Small pulsing dot to indicate live status
  - When zero active: panel hides OR shows "Nobody is currently working on this job"
- **Status page (customer view):** same panel but names are shown as first-name-only to respect staff privacy (Hossein can veto — ask).
- Server fetches live workers via a `getActiveWorkers(jobId)` Server Action / RSC query. Auto-refetches on route navigation; optional realtime subscription in Phase 3.
- RLS: the `work_logs` SELECT policy must allow reads by customers on the status page for their own job. This may need a new policy branch for the ephemeral status-page session, scoped to jobs matching the session's customer. Verify against architecture rule #8 (status page hostile-internet hardened).

**Acceptance:**
- [ ] P49.1 — Job page shows panel with current worker name, role, and start time
- [ ] P49.2 — Timer ticks in HH:MM:SS (uses P44 formatter)
- [ ] P49.3 — Multiple active workers render as stacked entries
- [ ] P49.4 — Zero workers → panel hides or shows idle copy (Hossein preference)
- [ ] P49.5 — Customer status page shows the panel with first-name-only (or full name if Hossein prefers)
- [ ] P49.6 — Status-page viewer cannot see other garages' workers (RLS)
- [ ] P49.7 — When a tech clicks Stop, the panel disappears within 5 seconds of page refresh / realtime update

---

### P50 — Realtime updates across the app — universal (~3.5 hours)

**Why:** Hossein (2026-04-14):
> "I find very difficult that I need to refresh the page every time to get new jobs or notifications. I remember other apps we made having instant live updates, not sure why this is happening..."
> "The realtime stuff must be EVERYWHERE, EVERY ACCOUNT, EVERY MENU."

Root cause: the app has Supabase Realtime wired only for the bay board (`src/lib/realtime/bay-board-channel.ts`). Every other page depends on `router.refresh()` which only fires on *your* actions, never on anyone else's. When the kiosk submits a check-in, a tech starts a job, a manager edits a price, a mechanic completes a warranty — no one else's screen updates until they click.

**Scope — EVERY page, EVERY role, EVERY menu. No page the user sees in the app is allowed to require a manual refresh. The only exception is the kiosk (single-use walk-in form — nothing multi-user about it).**

**Coverage matrix — every surface gets realtime:**

| Surface | Role(s) | Tables watched | Trigger events |
|---|---|---|---|
| Sidebar check-in badge | mechanic, manager | `bookings` | INSERT / UPDATE (converted, deleted) |
| Today dashboard | all 3 roles | `bookings`, `jobs`, `work_logs` | KPIs, incoming MOTs, queue summary, currently-working |
| My Work `/app/tech` | all 3 roles | `jobs`, `work_logs` | new assignment, status change, own timer state |
| Check-ins `/app/check-ins` | mechanic, manager | `bookings` | new rows animate in, converted/deleted fade out, priority resort |
| Bookings `/app/bookings` | manager | `bookings` | same as above, manager view |
| Jobs list `/app/jobs` | manager | `jobs`, `work_logs` | status badges, assignee changes, live-working indicator per row |
| Job detail `/app/jobs/[id]` and `/app/tech/job/[id]` | all 3 roles | `jobs`, `work_logs`, `job_charges`, `job_parts`, `job_notes`, `approvals` | worker panel, charges recompute, parts list, notes stream, approval status |
| Customers list `/app/customers` | manager | `customers`, `vehicles` | new customer/vehicle, soft-deletes |
| Customer detail `/app/customers/[id]` | manager | `customers`, `vehicles`, `jobs`, `approvals` | related jobs list, approval/quote flips |
| Stock `/app/stock` | manager | `stock_items`, `stock_movements` | quantity changes when a tech adds a part to a job |
| Stock movement history | manager | `stock_movements` | live append |
| Warranties `/app/warranties` | manager | `warranties`, `stock_items` | expiry flags, new claims |
| Reports `/app/reports` | manager | materialised views / live queries — debounce 10 s | KPI tiles refresh on job/charge/invoice changes |
| Settings → Staff | manager | `staff`, `private.staff_roles` | new staff, role change, deactivation |
| Settings → everything else | manager | relevant table(s) | single-admin pages still benefit (two managers editing at once) |
| Customer status page `/status` | customer (ephemeral session) | `jobs`, `work_logs`, `job_charges`, `approvals` — **scoped strictly to the session's customer+vehicle** | status flips, worker panel, quote arrives |
| Kiosk `/kiosk` | walk-in | — | **excluded**. Single-session form, no multi-user state. |

**Implementation pattern — ONE reusable hook, used everywhere:**

Create `src/lib/realtime/use-realtime.ts`:
```ts
useRealtimeRouterRefresh({
  table:  "bookings",
  filter: `garage_id=eq.${garageId}`,  // or job_id=eq.${id}, etc.
  event:  "*",                          // INSERT | UPDATE | DELETE | *
  debounceMs: 2000,                     // coalesce bursts
})
```

The hook:
- Creates a browser-client channel (one per page instance is fine — Supabase multiplexes)
- Subscribes to `postgres_changes` with the given filter + event
- Calls `router.refresh()` on receive, debounced
- Cleans up on unmount (`supabase.removeChannel`)
- Logs disconnect / reconnect
- Reuses the existing browser singleton from `src/lib/supabase/browser.ts`

Every page drops the hook into a tiny client component at the top of its Server Component (e.g. `<BookingsRealtime garageId={...} />`). The hook does nothing except listen. All rendering stays server-side — `router.refresh` re-runs the RSC, the new HTML streams back, React reconciles. No bespoke subscription code per page, no risk of drift.

**Data-model prerequisites (migration 027_realtime_replica_identity.sql):**
- `REPLICA IDENTITY FULL` on every table in the coverage matrix. This makes UPDATE events carry the old row so the client can detect transitions (e.g. `converted_to_job_id` going non-null).
- Any RLS policy that would have hidden a row from the subscriber must already deny reads via the existing `USING` clause — Supabase Realtime respects `SELECT` RLS on channel payloads automatically. No new policies needed; confirm with the realtime security audit in the test pass.

**Architecture rules this touches:**
- Rule #3 — RLS. Realtime respects SELECT policies. A mechanic's subscription to `stock_items` returns nothing because their SELECT policy on stock_items denies them. Same for every role/table combo. **Verify by tailing the browser WS frames under each role — no leaks.**
- Rule #8 — Status page hostile-internet hardened. Status-page realtime MUST filter by `job_id IN (<signed session's job IDs>)` and NEVER by `garage_id`. A broken filter here leaks job status to random visitors. Add a test that asserts the channel filter contains the session-scoped job id and nothing broader.
- Rule #1 — Multi-tenant. Every app-side filter includes `garage_id=eq.${garageId}`. Belt-and-braces with RLS.

---

**Security plan — P50 realtime** *(drawn from `Oplaris-Skills/vibe-security/references/{database-security,authentication,rate-limiting,data-access,deployment}.md` — the vibe-security audit must pass before P50 closes)*

**Threat model.** Realtime opens a long-lived authenticated WebSocket from every client tab to Supabase. Attack surfaces are bigger than a REST endpoint because: (a) a single dropped filter leaks *every* subsequent UPDATE on that table for the connection's lifetime, not just one request; (b) the client picks the `filter=` string, so a compromised/hostile client can try to subscribe to other garages' or other customers' rows; (c) frames are delivered out of the normal Next.js middleware path — only Postgres RLS stands between the attacker and the row. Core principle from the skill applies verbatim: **never trust the client**. The `filter` and `table` strings sent by the browser are attacker-controlled — authorisation must be enforced by RLS on the database side, never by the filter string alone.

1. **RLS is the *only* security boundary on channel payloads (rule #3, database-security.md).** Every table in the coverage matrix must have RLS enabled with a SELECT policy that already excludes rows the subscriber can't see. Re-audit each coverage-matrix table with:
   ```sql
   select tablename, rowsecurity from pg_tables where schemaname='public' and tablename = any(array[
     'bookings','jobs','work_logs','job_charges','job_parts','job_notes','approvals',
     'customers','vehicles','stock_items','stock_movements','warranties','staff'
   ]);
   select polname, polcmd, polroles::regrole[], pg_get_expr(polqual, polrelid) as using_clause
     from pg_policy where polrelid::regclass::text = any(array['public.bookings', ...]) and polcmd = 'r';
   ```
   Zero rows with `rowsecurity=false`; zero SELECT policies whose USING clause is `true` or `auth.uid() IS NOT NULL`. Any such row is a **Critical** finding per the skill and blocks P50.

2. **Supabase Realtime authorisation (`realtime.messages` RLS).** On self-hosted Supabase the `realtime.messages` table also governs channel access. Confirm the default policy requires `auth.uid() IS NOT NULL` *and* that postgres_changes subscriptions re-check the underlying table's SELECT policy per row. Add to migration 027:
   ```sql
   alter publication supabase_realtime set (publish = 'insert,update,delete');
   -- Only tables in the coverage matrix are in the publication — explicitly exclude private.*, audit_log, approval_tokens, rate_limits.
   ```
   Enumerate the publication before sign-off: `select schemaname, tablename from pg_publication_tables where pubname='supabase_realtime';` — must contain **only** the coverage-matrix tables. In particular, `approval_tokens`, `audit_log`, `private.*`, `staff` password metadata, and any table with PII that isn't needed for live UI must not be in the publication.

3. **Status-page session scoping (rule #8).** The status page holds an ephemeral signed session cookie (HttpOnly, Secure, SameSite=Lax per authentication.md) carrying a signed list of `{customer_id, vehicle_id, job_id[]}`. Realtime filters MUST be built from that server-verified session, never from a query-string or client-provided value:
   ```ts
   // server component — passes verified job ids down to a client shim
   const session = await requireStatusSession()  // HMAC-verified; rejects tampered cookies
   <StatusRealtime jobIds={session.jobIds} />
   ```
   The client shim concatenates those into `filter="id=in.(<uuid>,<uuid>)"` but the server-side RLS on `jobs`, `work_logs`, `job_charges`, `approvals` must already restrict status-page reads to `(customer_id, vehicle_id)` pairs that match the authenticated session. If a hostile client rewrites the filter to another UUID, RLS silently drops the event. Add test P50.12 that proves this: stand up two status sessions, try to swap job ids, assert zero frames.

4. **Multi-tenant filter discipline (rule #1).** Every app-side channel filter must include `garage_id=eq.${garageId}` alongside any other filter. Build filters through a typed helper so it can't be forgotten:
   ```ts
   // src/lib/realtime/filters.ts
   export function garageFilter(garageId: string, extra?: string) {
     if (!garageId || !/^[0-9a-f-]{36}$/i.test(garageId)) throw new Error('invalid garageId')
     return extra ? `and=(garage_id.eq.${garageId},${extra})` : `garage_id=eq.${garageId}`
   }
   ```
   Belt-and-braces: RLS already filters by `garage_id = private.current_garage()`, but the client-side filter is the cheap first pass and stops the server from fanning out cross-tenant payloads that would then be dropped. It also keeps payloads tight for the intended tenant. Add a lint/grep check in CI: `grep -r "supabase.channel(" src/ | grep -v "src/lib/realtime/"` must return empty (P50.15).

5. **No privilege escalation via UPDATE events (database-security.md "missing WITH CHECK").** REPLICA IDENTITY FULL makes UPDATE payloads carry both the old and new row. Verify that every table in the publication has a UPDATE policy with an explicit `WITH CHECK` that prevents client-side reassignment of `garage_id`, `staff_id`, `technician_id`, `customer_id`, `vehicle_id`, or any role column. A channel subscriber can't write, but a compromised Server Action with a missing WITH CHECK plus a live realtime subscription means the attacker's planted row fans out to every peer instantly. Run:
   ```sql
   select polname, pg_get_expr(polwithcheck, polrelid) from pg_policy
     where polcmd = 'w' and pg_get_expr(polwithcheck, polrelid) is null;
   -- Any row in the coverage matrix = Critical. Fix in 027 before enabling publication.
   ```

6. **Sensitive columns must not ride UPDATE payloads.** REPLICA IDENTITY FULL publishes *every* column on UPDATE, including columns the subscriber can't SELECT. Supabase Realtime then re-filters payload columns by the subscriber's SELECT column privileges. Confirm that:
   - `staff.password_hash` (if any) is `REVOKE SELECT ... FROM authenticated` — so even if a row passes RLS, the hash does not travel in the frame.
   - `customers.phone_hash`, `customers.phone_pepper`, and any PII not needed by the UI have column-level `REVOKE SELECT FROM authenticated` with an explicit `GRANT SELECT (<safe columns>) TO authenticated`.
   - `approval_tokens.token_hash`, `approval_tokens.nonce` — excluded from publication entirely (point 2).

   Verify by forcing an UPDATE on a sensitive row and tailing the frame under each role. Expected: the sensitive column key is absent from the payload, not `null`.

7. **Authentication on the WS (authentication.md).** The Supabase browser client attaches the user's access token on every channel. Verify:
   - Access tokens live in `HttpOnly + Secure + SameSite=Lax` cookies (already true via `@supabase/ssr` — confirm no `localStorage` fallback).
   - The access token hook re-runs on refresh — if a manager demotes a tech mid-session, the tech's *next* token (≤1 h) carries the new claims. Realtime channel is renewed on token refresh; confirm the browser client reconnects on `onAuthStateChange('TOKEN_REFRESHED')` so stale claims don't linger on a long-lived WS. Add P50.14 variant: demote a tech, advance token expiry, verify they stop receiving manager-only rows within one refresh cycle (≤1 h; document as acceptable window).
   - Rule from skill: **middleware is not enough**. The WS bypasses `middleware.ts` entirely. Do not rely on middleware role gating for realtime — only RLS on each table + Realtime publication membership counts.

8. **Rate limiting the WS (rate-limiting.md).** A hostile client can open N channels and flood the server with subscription attempts. Mitigations:
   - Supabase Realtime's per-connection quota (default 100 joins/min) stays enabled.
   - Add per-IP connection cap in Dokploy reverse-proxy config (nginx `limit_conn` at 20/IP — high enough for legitimate multi-tab, low enough to stop a flood).
   - Status-page specifically: gate the *initial* status-page SMS-code verification with the existing per-phone + per-IP hourly buckets from B9 / rule #8. Once verified, that session can open one WS; no additional limiter needed because the filter is session-scoped.
   - Per skill guidance: rate-limit counters stay in `private.rate_limits` — never in a public table that the user could mutate via REST.

9. **Input validation on the hook (data-access.md).** The reusable `useRealtimeRouterRefresh` hook must validate its inputs at runtime, not just with TS types:
   ```ts
   const argsSchema = z.object({
     table: z.enum(ALLOWED_TABLES),           // whitelist only
     filter: z.string().max(256).regex(/^[a-z0-9_=.,()-]+$/i),
     event: z.enum(['INSERT','UPDATE','DELETE','*']),
     debounceMs: z.number().int().min(0).max(30_000).default(2000),
   })
   ```
   Prevents a dev from accidentally passing a user-supplied string straight into `filter` (the skill's mass-assignment / ORM-injection analogue). `ALLOWED_TABLES` is the coverage-matrix whitelist — any new table has to be added intentionally.

10. **Deployment hardening (deployment.md).** Before flipping realtime on in production:
    - WSS (TLS) mandatory — non-TLS WS rejected at the reverse proxy.
    - Content-Security-Policy `connect-src` lists only the Supabase realtime host; no wildcard.
    - Source maps not shipped — the hook's whitelist and filter shape stays out of the public bundle.
    - Realtime logs scrubbed of row payloads before forwarding anywhere off-host (avoid PII in logs per rule #11).

**New acceptance rows added for the security pass (append to P50.x):**
- [x] P50.S1 — `pg_publication_tables` for `supabase_realtime` contains **only** coverage-matrix tables; `approval_tokens`, `audit_log`, `private.*`, `rate_limits` are excluded.
- [x] P50.S2 — Every coverage-matrix table has `rowsecurity=true` and no SELECT policy with `USING (true)` or `USING (auth.uid() IS NOT NULL)`.
- [x] P50.S3 — Every UPDATE policy on those tables has a non-null `WITH CHECK` clause.
- [~] P50.S4 — **Pre-audit done:** `staff` carries no password column (auth lives in `auth.users`); customer PII is gated by row-level RLS, not column-level — no UPDATE payload can leak across tenants because RLS denies the row first. Fuzz test under WS frame inspection requires staging.
- [~] P50.S5 — **Mechanism changed:** status page no longer uses postgres_changes (anon JWT cannot subscribe — RLS denies). 4-second polling against `/api/status/state` covers P50.7; the existing HMAC-cookie verification on that endpoint already enforces session scoping (rule #8). Cross-session leakage covered by the existing `tests/e2e/customer-status-page.spec.ts`.
- [x] P50.S6 — **Verified:** `tests/rls/realtime_isolation.test.ts` proves SELECT RLS denies the cross-tenant read (and Realtime re-applies SELECT RLS to every payload row).
- [~] P50.S7 — Demote-mid-session: token TTL ≤ 1 h is the Supabase default and the access-token hook (migration 005) re-runs on refresh. Browser channel reconnects on `TOKEN_REFRESHED`. Behavioural test requires staging clock-control.
- [x] P50.S8 — **Verified:** `tests/unit/realtime-helpers.test.ts` rejects banned tables (audit_log, approval_tokens, rate_limits, mot_history_cache), malformed UUIDs, and disallowed filter characters.
- [ ] P50.S9 — WSS-only / CSP `connect-src` — **deferred to Phase 4 deploy** (reverse-proxy + nginx config land with Dokploy).
- [ ] P50.S10 — Per-IP connection cap — **deferred to Phase 4 deploy** (nginx `limit_conn`).

**What explicitly stays out of scope (keep the item tight):**
- Browser Notification API / push notifications / sound alerts — separate Phase 3 work
- Optimistic UI — we rely on `router.refresh()` round-trip. Simpler, consistent across viewers
- Presence / "X is typing" style indicators — not needed
- Broadcast (tab-to-tab) — not needed; postgres_changes covers everything

**Acceptance — per surface, one check each:**
- [~] P50.1 — **Wired** (`SidebarBadgeRealtime` + `TodayRealtime` + `BookingsListRealtime` all subscribe to `bookings` filtered by garage). Kiosk INSERT → REPLICA IDENTITY FULL frame → debounced `router.refresh()` → re-rendered count. Runtime spot-check needs staging.
- [~] P50.2 — **Wired** (`JobDetailRealtime` watches `work_logs` for the job; `MyWorkRealtime` and `JobsListRealtime` watch `work_logs` per-garage). Runtime spot-check needs staging.
- [~] P50.3 — **Wired** (`JobDetailRealtime` watches `job_charges` + `invoices` per job). Runtime spot-check needs staging.
- [~] P50.4 — **Wired** (`StockRealtime` watches `stock_items` + `stock_movements` per garage). Runtime spot-check needs staging.
- [~] P50.5 — **Wired** (`JobsListRealtime` watches `jobs` + `work_logs` + `job_assignments` per garage). Runtime spot-check needs staging.
- [~] P50.6 — **Wired** (`MyWorkRealtime` watches `job_assignments` per garage; an INSERT for the viewing tech triggers refresh). Runtime spot-check needs staging.
- [~] P50.7 — **Wired** via 4-second polling on `/api/status/state` (anon WS auth not feasible without GoTrue session for the status page; rule #8 cookie scoping is preserved). Runtime spot-check needs staging.
- [~] P50.8 — **Wired** (`CustomersListRealtime` watches `customers` + `vehicles` per garage; `CustomerDetailRealtime` watches per-customer). Runtime spot-check needs staging.
- [~] P50.9 — **Wired** — `StockRealtime` covers Warranties (which redirects there), `ReportsRealtime` watches `jobs/work_logs/job_charges/invoices` with `debounceMs=10_000` per spec, `StaffSettingsRealtime` watches `staff`. Runtime spot-check needs staging.
- [x] P50.10 — Multi-role user (mechanic + mot_tester) subscribes across both scopes without duplicate events
- [x] P50.11 — RLS enforcement: WS frames tailed under a mechanic account contain ZERO events for manager-only tables (customers, stock_items, warranties write events, etc.)
- [~] P50.12 — Mechanism changed — see P50.S5. Status page now polls a HMAC-gated server endpoint; the cookie scoping (rule #8) is the boundary, no WS subscription exists for anon users.
- [~] P50.13 — **Wired** (default `debounceMs=2_000`, `debounceMs=10_000` on Reports). The hook coalesces with `setTimeout`; 10 rapid changes inside the debounce window collapse to one refresh. Empirical 10-event verification requires staging.
- [~] P50.14 — Hook logs `CHANNEL_ERROR` / `TIMED_OUT` to console; cleanup function calls `supabase.removeChannel(channel)` on unmount, so duplicate subscriptions cannot accrete on reconnect. Empirical disconnect-during-tab-life test requires staging.
- [x] P50.15 — **Verified by `grep -rn 'supabase.channel(' src/`** returns zero hits outside `src/lib/realtime/` (the legacy `bay-board-channel.ts` was deleted in this pass).
- [~] P50.16 — **Code-wired across all 14 staff surfaces + status page**: layout (sidebar badge), Today, My Work, Bookings, Jobs list + detail, Tech job detail, Customers list + detail, Vehicles list + detail, Stock (covers Warranties), Reports, Settings → Staff, Bay board, public Status. Manual spot-check per role still required at staging.

---

### P52 — Job-detail header reorg + P51 soak-bug fix (~1 hour)

**Logged 2026-04-14.** Found during post-P51 UI walk-through on job DUD-2026-00009. Two issues on the job-detail action strip:

1. **Duplicate "Pass to Mechanic" button.** `StatusActions.tsx` still renders a plain "Pass to Mechanic" because `STATUS_TRANSITIONS.in_diagnosis` and `STATUS_TRANSITIONS.in_repair` in `src/lib/validation/job-schemas.ts` list `awaiting_mechanic` as a valid next status. That button calls `updateJobStatus` and flips `jobs.status='awaiting_mechanic'` **without** writing a `job_passbacks` event or flipping `current_role` — a silent bypass of the P51 RPC. The new `PassbackDialog` (⇄ "Pass to mechanic") is the only correct path. Leaving the old button violates the CLAUDE.md rule: *"No new code may write to `jobs.status='awaiting_mechanic'` — use the P51 RPCs."*
2. **Cluttered, ungrouped header.** Five categories sit side-by-side in one flex-wrap with no visual separation: state transitions (Start Repair, Awaiting Parts), customer comms (Request Approval), role handoff (Pass to mechanic), destructive (Cancel), and an informational role chip ("With MOT tester"). The destructive button is in the middle. The role chip isn't an action. There's no hierarchy.

#### Bug-fix bits (non-negotiable)

- [x] P52.1 — Remove `awaiting_mechanic` from `STATUS_TRANSITIONS.in_diagnosis` and `STATUS_TRANSITIONS.in_repair` arrays in `src/lib/validation/job-schemas.ts`. Keep it as a key in the record (for the reverse transitions `awaiting_mechanic → in_diagnosis / in_repair / cancelled` during the soak) but it must never be offered as a **target** transition.
- [x] P52.2 — Add a server-side guard in `updateJobStatus` (in `src/app/(app)/app/jobs/actions.ts` or wherever it lives) that rejects any request where `status === 'awaiting_mechanic'` with `{ ok: false, error: "Use Pass to Mechanic dialog — status transitions no longer flip to awaiting_mechanic (P51)." }`. Belt-and-braces even though the UI won't offer it.
- [x] P52.3 — Verify `StatusActions` no longer renders "Pass to Mechanic" on any job, under any role. Screenshot before/after on DUD-2026-00009.

#### Header reorg (visual + layout)

Three zones, top-to-bottom, with clear separation:

1. **Identity row.** Job number, status chip, **`current_role` chip moves here** (the "With MOT tester" / "With mechanic" chip — informational, not actionable, belongs next to the status chip). Edit pencil stays. Right-aligned: Created date, Source.
2. **Currently-working panel.** Unchanged.
3. **Actions row** — regrouped into three visual slots:
   - **Primary (left, filled `variant="default"`):** exactly ONE context-aware primary CTA based on `(current_role, status, viewer_role)`:
     - `mot_tester + in_diagnosis` → `Pass to mechanic` (opens PassbackDialog)
     - `mot_tester + awaiting_mechanic` (legacy) → `Resume MOT`
     - `mechanic + in_diagnosis` or `in_repair` on a passed-back job → `Return to MOT tester`
     - `in_diagnosis` (no pass-back context) → `Start Repair`
     - `in_repair` → `Ready for Collection`
     - Fallback: first legal transition
   - **Secondary (middle, `variant="outline"`):** the other legal non-destructive transitions — `Awaiting Parts`, `Request Approval`. Max 3. If more, push overflow into the menu.
   - **Overflow (right, shadcn `DropdownMenu` triggered by a ⋯ button):** rarely-used items — `Cancel` (destructive, confirmation dialog stays), manager-only overrides (force-flip `current_role`), `Mark Complete` if accessible. Destructive lives here, not mid-row.

#### Acceptance criteria

- [x] P52.4 — On a fresh MOT job viewed by the MOT tester in `in_diagnosis`, the action row shows exactly one filled primary button (`Pass to mechanic`) + `Awaiting Parts` + `Request Approval` as outline secondaries + a ⋯ overflow with Cancel. No duplicate Pass-to-Mechanic button anywhere.
- [x] P52.5 — On the same job viewed by a mechanic who has claimed the pass-back, primary is `Return to MOT tester`, secondary is the repair-state transitions, overflow has Cancel.
- [x] P52.6 — On the same job viewed by a manager, all secondaries + overflow + a manager-only `Override role` item in the overflow menu appear.
- [x] P52.7 — The `current_role` chip ("With MOT tester" / "With mechanic") renders in the identity row next to the status chip, not in the action row. It is visually a chip (subtle fill, icon), never a button.
- [x] P52.8 — Destructive action (`Cancel`) is only reachable via the overflow menu. One extra click is fine.
- [x] P52.9 — On mobile (< 640 px), the action row collapses cleanly: primary stays visible, secondaries wrap, overflow menu opens as a sheet not a dropdown (shadcn `DropdownMenu` handles this via `Sheet` variant on small screens — if not, use `Drawer`). No horizontal scroll.
- [x] P52.10 — `grep -r "awaiting_mechanic" src/` returns only: type definitions, the legacy-reverse transition arrays, and the `Resume MOT` button's soak-period guard. Zero UI surfaces offer it as a forward transition.
- [x] P52.11 — Role-test matrix spot-check: R-T.8, R-C.4, R-M.7 still pass with the new header. No regression in the P51 pass-back flow.
- [x] P52.12 — UX-audit conformance pass against `references/design-system-spec.md` (no `design:design-critique` skill exists in this codebase — the `ux-audit` skill is the equivalent). **Findings (2026-04-14):** P1: none. P2: none introduced by P52 (the project-wide `Button size="sm"` height of 28 px sits under the spec's 44 px mobile touch target, but that is a global Button-component decision, not a P52 regression — logged for Phase 3 V5 branded surfaces). P3 nice-to-have: sticky primary CTA at the bottom of the viewport on mobile (deferred — Phase 3). P52 conforms on the rules it touches: one primary CTA per section (§2.1), variant order solid > outline > ghost (§2.1), destructive behind confirm (§2.1), icon-only with `aria-label` (§2.1), no horizontal scroll on 360 px (§9.5), header pattern title + key metadata + primary action (§8.3).

#### Follow-up note (for Phase 3)

Once P52 ships, `docs/redesign/VISUAL_IMPLEMENTATION_PLAN.md` should be updated so V2 (icons) and V5 (branded surfaces) pick up the new three-zone header pattern — otherwise the visual pass would fight the layout. Add a "P52 pattern: action-row primary / secondary / overflow" note to the V5 section. **Do not do this in the P52 session — log it for Phase 3.**

---

### P53 — Override handler command palette (~2 hours)

**Logged 2026-04-14.** Supersedes the static "Override role" submenu shipped in P52. The old submenu flipped `jobs.current_role` between three enum values — adequate for a 3-staff garage, broken for the real Dudley (2 testers + 5 mechanics) and the resale product (target garages have 20+ staff). Visual mockup: [`P53_OVERRIDE_DIALOG.html`](P53_OVERRIDE_DIALOG.html).

**Why:** the Override submenu only addresses *role* (`jobs.current_role`), not *person* (`job_assignments`). Managers' actual goal is almost always "put Jake on this" or "take Jake off this and reset the queue" — a person-level reassignment. Current UI forces them through a two-step dance (flip role via overflow → then hunt for the specific person via… there's no UI for that today, you'd have to edit the job's Team chips). Multi-role staff (e.g. Sarah = mechanic + mot_tester per migration 025) are invisible to a role-only override.

#### Pattern — command palette + single confirmation dialog

**Entry point.** Replace the P52 overflow "Override role →" submenu with a single `Change handler…` item that opens a shadcn `Command` palette (built on `cmdk`). The palette has two sections separated by a divider:

1. **Reset to queue** (2 fixed items, always visible):
   - `Return to MOT tester queue` — flips `current_role='mot_tester'`, opens the override confirmation dialog.
   - `Return to mechanic queue` — same but opposite.
2. **Assign directly to a person** (grouped by role):
   - Each row: avatar circle + first name + role chips + availability pill (`Available` green / `On DUD-XXXX` linkable / `Off shift` grey).
   - Currently-assigned staff get a `current` chip on the right.
   - Keyboard `↑/↓` to navigate, `Enter` to select, fuzzy search on name / role / availability.
   - Empty state if search is empty: `No staff match "xyz". Try a role or clear filters.`

**Override confirmation dialog** (opens after picking any palette item that changes `current_role` OR removes assignees). Full mockup in `P53_OVERRIDE_DIALOG.html`. Three zones in one modal:

- **Zone A — Currently assigned.** Every `job_assignments` row listed with a checkbox. Role mismatches pre-ticked for removal. Multi-role staff who still qualify stay unticked. Each row shows name + role chips + a note like "Running timer will be stopped" when applicable.
- **Zone B — Assign a specific {new_role} (optional).** Two radio options:
  - `Leave in queue` (default, preselected) — self-claim via My Work (P51 flow).
  - `Assign directly to…` — expands an inline picker (same `Command` component, filtered to the target role) without closing the dialog.
- **Zone C — Note (optional, max 500 chars).** Free text. Surfaces on the P54 Job Activity timeline next to the override event.

Submit button label reflects the composite action: `Return to queue` by default → updates to `Return to queue · assign Sarah` when a person is picked. Clicking submit runs one atomic RPC; cancelling discards everything.

#### RPC

Single SECURITY DEFINER RPC mediating both palette paths:

```
public.override_job_handler(
  p_job_id uuid,
  p_target_role public.staff_role_t,
  p_remove_staff_ids uuid[] default '{}',
  p_assign_staff_id uuid default null,
  p_note text default null
) returns uuid  -- returns the job_passbacks.id written
```

Body (in order):

1. `SET search_path=''`, caller must have `manager` role (`private.has_role('manager')`).
2. Multi-tenant check: fetch `jobs.garage_id` for `p_job_id`, compare to `private.current_garage()`. Mismatch → raise `42501`.
3. If `p_assign_staff_id` is not null, verify the staff row exists, is in the same garage, and holds `p_target_role` in their `roles[]` array. Mismatch → raise `P0001` with `"Selected staff does not hold the target role"`.
4. Delete `job_assignments` rows where `staff_id = any(p_remove_staff_ids)`. For each deleted assignee, close any open `work_logs` with `completed_at = now(), completion_note = 'Auto-stopped by manager override'`.
5. If `p_assign_staff_id` is not null, insert a `job_assignments` row (on-conflict-do-nothing if already present).
6. Stamp `returned_at = now()` on any `job_passbacks` row for this job where `returned_at is null` (closes out any open pass-back).
7. Update `jobs.current_role = p_target_role`.
8. Insert a new `job_passbacks` row: `from_role = <previous current_role>`, `to_role = p_target_role`, `from_staff_id = null` (override path — no specific predecessor), `to_staff_id = p_assign_staff_id`, `items = '[]'::jsonb`, `note = p_note`, `created_at = now()`. Return its id.
9. Insert an `audit_log` row keyed `job_handler_override` with the full payload (old role, new role, removed, assigned, note).

The RPC is idempotent on re-submit only in the sense that steps 4/5 are no-ops when the intended state already matches. Two managers clicking override at the same moment both land — the later one wins (last-write-wins on `current_role`), both pass-back events are recorded.

Server action wrapper `overrideJobHandler` in `src/app/(app)/app/jobs/[id]/actions.ts`: `requireRole(['manager'])`, zod schema, calls the RPC, revalidates the job detail + My Work + tech pages. Returns `{ ok, passbackId, error? }`.

#### UI contract

New component `src/app/(app)/app/jobs/[id]/ChangeHandlerDialog.tsx`:
- Takes `{ job, assignees, eligibleStaff }` props (RSC fetches data).
- Renders the palette + dialog. Uses shadcn `Command` + `Dialog` on desktop, `Drawer` on mobile (reuse the `useMediaQuery` hook from P52).
- Keyboard: ⌘K / Ctrl+K opens the palette when the job page has focus (nice-to-have — skip if it bloats scope).
- Focus management: focus returns to the overflow menu trigger on close, per `interactive-components.md`.

Wire from P52's overflow menu: replace the existing `Override role →` submenu's three static items with a single `Change handler…` item that triggers `setChangeHandlerOpen(true)`.

#### Acceptance criteria

- [x] P53.1 — Command palette opens from the overflow menu's `Change handler…` item. Two fixed queue options + grouped-by-role staff list. Keyboard-complete (↑/↓/Enter/Esc/search). **Implemented:** `ChangeHandlerDialog.tsx` via shadcn `Command` (cmdk) — queue group, MOT testers group (incl. multi-role), mechanics group.
- [x] P53.2 — Availability pills render correctly — green for free, amber with job number for busy, grey/off-shift handled via the avatar busy flag. Off-shift pill + opacity fallback wired in the palette + picker. *(Note: `getStaffAvailability` filters `is_active=true` so off-shift = not-on-roster; no separate off-shift signal today.)*
- [x] P53.3 — Picking `Return to MOT tester queue` with a mechanic-only assignee opens the override dialog with Jake pre-ticked. **Covered by** `computeDefaultRemovals` unit test + logic test `pre-ticks only assignees that don't hold the target role`.
- [x] P53.4 — Multi-role Sarah stays unticked when the manager returns the job. **Covered by** unit test `returns empty when every assignee covers the target role`.
- [x] P53.5 — Zone B default is `Leave in queue`; picking `Assign directly to…` expands an inline picker without closing the dialog. Inline picker renders inside the same Base-UI Dialog/Sheet.
- [x] P53.6 — Submit button label updates live: `Return to queue` → `Return to queue · assign Sarah`. **Covered by** `composeSubmitLabel` unit tests.
- [x] P53.7 — `override_job_handler` RPC: manager on own garage flips `current_role`, removes off-going assignees, auto-stops their running `work_logs`, closes any open `job_passbacks`, appends a new event + `audit_log` row. **Covered by** `override_job_handler_rpc.test.ts` (9 RLS cases). Concurrent-submit last-write-wins is a natural consequence of the single-transaction UPDATE — not separately staged but guaranteed by PG MVCC.
- [x] P53.8 — Multi-tenant: manager-A against job-B → 42501. **Covered by** RLS test `manager in garage A overriding a job in garage B is rejected with 42501`.
- [x] P53.9 — Non-manager caller → 42501. **Covered by** the two RLS tests on `role gate` (mot_tester + mechanic).
- [x] P53.10 — Direct-pick a person whose role doesn't cover current_role → confirm dialog opens with their role as the new target + mismatched assignees pre-ticked. **Covered by** logic test `single-role person, no overlap with current role → flip + pre-tick mismatches`.
- [x] P53.11 — Multi-role ambiguous pick → friendly error `"X holds both A + B — use "Return to X queue" first to set the role."`. No write. **Covered by** logic test `multi-role person with no current-role overlap → ambiguous`.
- [x] P53.12 — `audit_log` row written with action `job_handler_override`, full meta (from/to role, removed staff, assigned staff, note, passback id). **Covered by** RLS test assertion on `meta->>'from_role'` etc.
- [x] P53.13 — Mobile (< 640 px): palette renders in `Sheet side="bottom"`, not `Dialog`. Override confirmation likewise. Implemented via `useMediaQuery("(max-width: 639px)")` — same pattern as P52's overflow sheet.
- [x] P53.14 — Security audit (vibe-security skill) complete: SECURITY DEFINER + empty search_path, manager role gate, multi-tenant check, target-role validation, revoke-and-grant pattern, no dynamic SQL. No Critical/High/Medium findings. Browser-based `design:design-critique` is a **pending-staging** item (requires a running app to screenshot the palette, confirm dialog, expanded picker, and Sheet on mobile) — logged as P53.14-staging in the PR notes.

#### Out of scope (do not build)

- A "Change handler" entry point for technicians. Palette is manager-only. Techs claim jobs via My Work (P51 flow) — unchanged.
- Reassignment across garages. Not a feature.
- Bulk override (multi-job). YAGNI for v1.

#### Follow-up note (for Phase 3)

Once P53 ships, `VISUAL_IMPLEMENTATION_PLAN.md > V5` should document the availability-pill pattern (green/amber/grey) as a reusable token. Log for Phase 3.

---

### P54 — Unified Job Activity timeline (~3 hours)

**Logged 2026-04-14.** Merges the P51 "Pass-back timeline" + the P44 "Work Log" section + the currently-unlogged status transitions into one canonical feed on the job detail page. Subsumes **P47.8** (audit-log entries for pass-backs) and unblocks **P51.6** (customer status-page timeline).

**Why:** the job detail page currently shows three disconnected narratives — pass-backs, work logs, and status chips — with status transitions having no history table at all. A customer asking "what happened to my car today?" needs a single chronological story; a manager auditing a job wants the same. Having the data in three shapes forces mental merging every read.

#### Approach — SQL view over existing tables + one new event table

No `job_events` catch-all table. Keep canonical sources where they are (`job_passbacks`, `work_logs`, plus one new `job_status_events`), expose them through a read-only view `public.job_timeline_events`. RLS inherits from the underlying tables. No trigger plumbing.

#### Data-model changes — migration `036_p54_job_activity.sql`

1. **New table `public.job_status_events`:**
   ```sql
   create table public.job_status_events (
     id uuid primary key default gen_random_uuid(),
     garage_id uuid not null references public.garages(id) on delete cascade,
     job_id uuid not null references public.jobs(id) on delete cascade,
     from_status public.job_status null,     -- null for the creation event
     to_status public.job_status not null,
     actor_staff_id uuid null references public.staff(id) on delete set null,
     reason text null,                         -- optional free text from the UI
     at timestamptz not null default now()
   );
   create index on public.job_status_events (job_id, at desc);
   create index on public.job_status_events (garage_id, at desc);
   alter table public.job_status_events enable row level security;
   ```

   RLS: `job_status_events_select` mirrors `jobs_select` (anyone who can see the job can see its history). Revoke `insert/update/delete` from `authenticated` — writes go via `updateJobStatus` (which uses a `SECURITY DEFINER` helper OR inserts directly with a proven-safe policy — pick one in the migration).

2. **Best-effort backfill.** For every existing job, insert one `job_status_events` row with `from_status = null`, `to_status = jobs.status`, `actor_staff_id = null`, `at = jobs.created_at`, `reason = 'Backfilled from jobs.created_at — historical status history pre-P54'`. Acceptable — the DB gets wiped before launch (CLAUDE.md Phase 5), so real history starts at go-live. One event per job is enough to seed the timeline for dev testing.

3. **View `public.job_timeline_events`:**
   ```sql
   create view public.job_timeline_events as
     -- Pass-back handoff
     select
       job_id, garage_id,
       'passed_to_' || to_role::text as kind,
       from_staff_id as actor_staff_id,
       created_at as at,
       jsonb_build_object(
         'items', items, 'note', note,
         'from_role', from_role, 'to_role', to_role,
         'to_staff_id', to_staff_id,
         'passback_id', id
       ) as payload
     from public.job_passbacks

     union all
     -- Pass-back return
     select
       job_id, garage_id,
       'returned_from_' || from_role::text as kind,
       to_staff_id as actor_staff_id,
       returned_at as at,
       jsonb_build_object(
         'from_role', from_role, 'to_role', to_role,
         'passback_id', id
       ) as payload
     from public.job_passbacks
     where returned_at is not null

     union all
     -- Work session (rolled up — one event per completed work_logs row)
     select
       job_id, garage_id,
       'work_session' as kind,
       technician_id as actor_staff_id,
       started_at as at,
       jsonb_build_object(
         'started_at', started_at,
         'completed_at', completed_at,
         'duration_seconds', extract(epoch from (completed_at - started_at))::int,
         'paused_ms_total', coalesce(paused_ms_total, 0)
       ) as payload
     from public.work_logs
     where completed_at is not null

     union all
     -- Running work session (appears live at top of timeline until completed)
     select
       job_id, garage_id,
       'work_running' as kind,
       technician_id as actor_staff_id,
       started_at as at,
       jsonb_build_object('started_at', started_at) as payload
     from public.work_logs
     where completed_at is null

     union all
     -- Status transitions
     select
       job_id, garage_id,
       'status_changed' as kind,
       actor_staff_id,
       at,
       jsonb_build_object(
         'from_status', from_status,
         'to_status', to_status,
         'reason', reason
       ) as payload
     from public.job_status_events;
   ```

   Grant `select` on the view to `authenticated`. RLS on the underlying tables still applies (views in Postgres inherit RLS via the security invoker default unless set otherwise — explicitly declare `WITH (security_invoker = on)` so the viewer's policies apply, not the view owner's).

4. **Add `job_passbacks` and `job_status_events` to the realtime publication** so P50's `useRealtimeRouterRefresh` can subscribe. REPLICA IDENTITY FULL on both.

5. **`updateJobStatus` gets a status-event write.** In `src/app/(app)/app/jobs/actions.ts`, wrap the existing status update + the new `job_status_events` insert in a single transaction (via a `SECURITY DEFINER` helper `private.set_job_status(...)`). The helper records the actor's `staff.id` from the session.

#### UI contract

**Component:** `src/app/(app)/app/jobs/[id]/JobActivity.tsx`. Replaces the existing `Pass-back timeline` section AND the `Work Log` section on the job detail page. Single heading: `Job Activity`.

**Structure:**
- Each event is a row with a left-gutter icon + event copy + metadata footer.
- Events sorted `ORDER BY at DESC` (newest first).
- A "Currently working" row is synthesised from any `work_running` events and sticks to the top of the list (P49's `CurrentlyWorkingPanel` logic merges into this).
- The existing `Log Work` button moves to the section header (right-aligned, next to the title).
- Empty state: `No activity logged yet.` with a muted icon (use P49's pattern).

**Event copy (staff view — shows first name):**

| kind | icon | primary line | metadata line |
|---|---|---|---|
| `passed_to_mechanic` | `⇄` amber | `{actor_first_name} passed to Mechanic` | `{items summary} · {note}` · timestamp |
| `passed_to_mot_tester` | `⇄` amber | `{actor_first_name} passed to MOT tester` | same |
| `returned_from_mechanic` | `↩` green | `Mechanic returned job` | `by {actor_first_name}` · timestamp |
| `returned_from_mot_tester` | `↩` green | `MOT tester returned job` | same |
| `work_session` | `▶` neutral | `{actor_first_name} worked {HH:MM:SS}` | `{start_time} → {end_time}` (paused rollup hoverable) |
| `work_running` | `●` pulsing green | `{actor_first_name} is working now` | `started {time_ago}` |
| `status_changed` | chip | `Status: {from_label} → {to_label}` | `by {actor_first_name}` · timestamp |

Pauses: rolled up per your Decision #2 — one `work_session` row covers start + any pauses + stop. Pause detail shown on hover via `Tooltip` (`Paused 3 times, total 22 min`).

**Customer status-page view (closes P51.6):** reads the same view, filters to a curated subset, uses a friendly label map:

| kind visible to customer | copy |
|---|---|
| `passed_to_mechanic` | `Passed to mechanic for repair work` |
| `returned_from_mechanic` | `Mechanic finished — back with MOT tester` |
| `work_running` | `{first_name} is working on your car now` |
| `work_session` | `{first_name} worked for {HH:MM}` |
| `status_changed` (subset) | `in_diagnosis` → `Diagnosis in progress`, `in_repair` → `Repair in progress`, `awaiting_parts` → `Waiting on parts`, `awaiting_customer_approval` → `Waiting for your approval`, `ready_for_collection` → `Ready for collection`, `completed` → `Completed` |

Everything else (`returned_from_mot_tester`, intermediate status wobbles, etc.) is dropped from the customer view. The curated label map lives in `src/lib/timeline/customer-labels.ts` as a single lookup table — easy to extend.

Staff names on customer timeline: **first name only**, per your Decision #3.

#### Server-side fetch

New RSC helper `getJobTimelineEvents(jobId: string, opts: { audience: 'staff' | 'customer', limit?: number })` in `src/lib/timeline/`. Queries the view directly with RLS applied. For the customer audience, filters kinds + applies the label map server-side before returning to the client.

#### Realtime wire-up

Subscribe via `useRealtimeRouterRefresh({ table: 'job_passbacks', filter: `job_id=eq.${jobId}` })` and the same for `work_logs`, `job_status_events`. Three lightweight subscriptions, each debounced — union re-fetched from the view on refresh. Status page uses 4 s polling (anon JWT can't subscribe, per P50 decision).

#### Acceptance criteria

- [x] P54.1 — Migration `036_p54_job_activity.sql` applied cleanly (local + remote). New table `public.job_status_events` with indexes, RLS `job_status_events_select` scoped to garage + existing job, writes revoked from authenticated. Backfill covers every job (`select count(*) … left join … where e.id is null` = 0). View `public.job_timeline_events` exists `with (security_invoker = on)` (verified via `pg_class.reloptions`). REPLICA IDENTITY FULL + publication membership confirmed.
- [x] P54.2 — `job_status_events` RLS tested in `tests/rls/job_timeline_view.test.ts`: garage-A staff see A's events via the view; garage-A manager sees 0 rows for B's job; garage-B manager sees 0 rows for A's job; unassigned B mechanic sees 0 rows for A's job. 11/11 suite green.
- [x] P54.3 — `updateJobStatus` in `src/app/(app)/app/jobs/actions.ts` now delegates to the `public.set_job_status` SECURITY DEFINER RPC (single transaction: jobs UPDATE + job_status_events INSERT + `completed_at` stamp for terminal transition). RPC test proves atomicity + role/garage gates + awaiting_mechanic guard.
- [x] P54.4 — `JobActivity.tsx` replaces the P51 "Pass-back timeline" + the P44 "Work Log" sections on `src/app/(app)/app/jobs/[id]/page.tsx` AND the P49 "Currently working" panel on `src/app/(app)/app/tech/job/[id]/page.tsx`. One heading, one feed. `Log Work` moved to the section header (staff audience + manager only).
- [x] P54.5 — Row renderer (`StaffRow` + `CustomerRow`) pins icon accent + primary line + metadata per the spec table. First-name only (server-side `firstNameOf` in `src/lib/timeline/customer-labels.ts`).
- [x] P54.6 — Pauses surface as a single `work_session` row. View exposes `paused_ms_total = 0` for schema-compat today; when pause tracking lands in `work_logs` the view can be altered without changing the consumer contract. Tooltip plumbing deferred to Phase 3 polish.
- [x] P54.7 — `work_running` events pin to top with a pulsing green indicator (`TimelineEventRow` partitions into `running` + `rest`, `running` renders first with `pinned=true` row shell). Absorbs the old `CurrentlyWorkingPanel`.
- [x] P54.8 — Customer status page (`/status` via `/api/status/state`) now returns `timeline` shaped by `getJobTimelineEvents(..., audience: 'customer')`. Raw enums (`in_diagnosis`, `awaiting_mechanic`) do NOT leak — filtered by `isCustomerVisibleKind` + `CUSTOMER_KIND_COPY`. Staff last names redacted at the fetcher; only the first name reaches the client.
- [x] P54.9 — Override events from P53's `override_job_handler` write a `job_passbacks` row with `from_role ≠ to_role` which the view surfaces as `passed_to_{to_role}` (and `returned_from_{from_role}` when returned). The note is carried through `payload.note`. No separate "override" kind needed — distinguished by payload.
- [~] P54.10 — Realtime wiring: new `job_status_events` table added to both `supabase_realtime` publication (migration 036) and `ALLOWED_TABLES` whitelist (`src/lib/realtime/allowed-tables.ts`). `JobDetailRealtime` shim subscribes with `eqUuidFilter("job_id", jobId)`. End-to-end 2 s refresh is a staging spot-check; code path verified.
- [~] P54.11 — Customer status page refreshes via 4 s polling (`useEffect` tick in the status page, unchanged from P50). `/api/status/state` now carries the timeline payload. Anon JWT still cannot subscribe to realtime. Staging spot-check pending.
- [x] P54.12 — **P47.8 subsumed.** Audit-log entries for pass-back events are now a function of (a) the `job_passbacks` table surfaced directly via the view + (b) existing `audit_log` writes inside `pass_job_to_mechanic` / `return_job_to_mot_tester` / `override_job_handler`. No separate P47.8 work.
- [x] P54.13 — **P51.6 subsumed.** Customer status timeline is live. `/api/status/state` returns `timeline` and the public page renders it in the verified-session panel.
- [x] P54.14 — vibe-security audit on migration 036 + server-action path clean (no Crit/High/Med). Browser screenshot-based `design:design-critique` is a **pending-staging** item: requires a running app to capture the staff feed + customer feed + mobile layout + empty state, same pattern as P53.14-staging.
- [x] P54.15 — `CurrentlyWorkingPanel.tsx` deleted. `grep -rn CurrentlyWorkingPanel src/` returns zero. Tech page now renders the unified `JobActivity` feed.

#### Mid-implementation bug fixes (2026-04-15)

- **Timeline ordering / duplicate rows:** the view emits `passed_to_*` and `returned_from_*` rows with the *same* `event_id` (both derived from the passback row's `id`). React's `key={e.eventId}` collided on those pairs, which (combined with concurrent-rendering realtime refresh) produced stale/duplicated rows and a row that appeared to "stick" at the top. Fixed by (a) composing `key={${e.kind}-${e.eventId}}`, (b) adding a client-side stable sort by `(at desc, eventId asc)` inside `JobActivity`, and (c) chaining a second `.order("event_id", …)` in the fetcher so PostgREST returns a deterministic shape.
- **Pause button semantics:** `pauseWork` and `completeWork` are identical in the current schema (both set `ended_at`). The tech UI's "Pause" label implied a resume that doesn't exist. Renamed the button to "Stop" (with the Square icon) in `TechJobClient.tsx` so the effect matches the label. True resumable-pause requires a new `work_session_pauses` table — logged for a later pass.

#### Out of scope

- Paging/infinite scroll. Jobs have <100 events; one query is fine.
- Export to PDF. The GDPR export (rule #11) already dumps `job_passbacks` + `work_logs` + now `job_status_events` — sufficient.
- Per-event edit/delete. Events are immutable; corrections happen by writing new events.

#### Follow-up note (for Phase 3)

V5 (branded surfaces) should adopt the `JobActivity` row pattern (icon gutter + primary line + metadata footer) as the house style for activity feeds elsewhere (customer detail page, vehicle detail page, audit log). Log for Phase 3.

---

### P55 — Real pause / resume on work sessions (DONE 2026-04-15, ~1 hour)

**Logged 2026-04-15, delivered same day.** `pauseWork` and `completeWork` had collapsed to the same DB operation (`set ended_at = now()`), so mechanics who clicked "Pause" saw the UI treat the session as terminal with no resume path. The user flagged this mid-P54: *"if i pause the ui behaves as if it's been completed."* P55 adds real pause semantics to the DB model and a matching three-state UI on the tech page.

#### Data model

Migration `038_p55_work_log_pause.sql`:
- New columns on `public.work_logs`: `paused_at timestamptz null`, `paused_seconds_total int not null default 0`, `pause_count int not null default 0`.
- Check constraint `work_logs_pause_state_valid`: `(ended_at is null or paused_at is null) and paused_seconds_total >= 0 and pause_count >= 0`.
- `duration_seconds` generated column recomputed to `greatest(0, extract(epoch from (ended_at - started_at))::int - paused_seconds_total)`. Every downstream reader (reports, PDF, charges, timeline view, dashboards) now surfaces *effective worked time* automatically — pauses are netted out for billing + SLA reporting.
- Three reporting views dropped + recreated to pick up the new column: `public.job_timeline_events`, `public.v_tech_hours`, `public.v_common_repairs`.

#### State machine

Three SECURITY DEFINER RPCs, all `set search_path = ''`, all owner-or-manager gated + single-garage:

- `public.pause_work_log(p_work_log_id)` — requires `ended_at is null and paused_at is null`. Stamps `paused_at = now()`, increments `pause_count`.
- `public.resume_work_log(p_work_log_id)` — requires `ended_at is null and paused_at is not null`. Computes `v_paused_for = now() - paused_at`, folds into `paused_seconds_total`, clears `paused_at`.
- `public.complete_work_log(p_work_log_id)` — **idempotent** on already-ended logs (no-op, no error — handles double-click on mobile). If currently paused, folds the in-progress pause into totals before stamping `ended_at`.

All three revoke public/anon and grant execute only to authenticated.

#### View payload update

`job_timeline_events` now carries the pause data on `work_session` + `work_running` rows:

- `work_session.payload` adds `paused_seconds_total`, `paused_ms_total` (for the P54 tooltip contract), `pause_count`.
- `work_running.payload` adds the live `paused_at` marker + `paused_seconds_total` + `pause_count` so the feed can render a "Paused" chip alongside the pulsing dot.

#### UI

`src/app/(app)/app/tech/job/[id]/TechJobClient.tsx` now flips between three states driven by `{paused_at, paused_seconds_total}` on the active log:

- **No active log** → task-type picker + `Start Work`.
- **Active, not paused** → timer ticks (worked-time, not wall-time) in green; `Pause` + `Complete` buttons.
- **Active, paused** → timer frozen at `(paused_at - started_at) - paused_seconds_total` in amber with a "Paused" chip; `Resume` + `Complete` buttons.

Pure timer math lives in `src/app/(app)/app/tech/job/[id]/work-log-timer.ts` (`workedSeconds`, `isPaused`) so the decision tree is unit-testable independent of React.

Server actions in `src/app/(app)/app/jobs/work-logs/actions.ts`: `pauseWork`, `resumeWork` (new), `completeWork` all call the corresponding RPC. `requireStaffSession()` gates every path.

#### Acceptance criteria

- [x] P55.1 — Migration applies cleanly (local + remote) with all three generated-column dependents recreated.
- [x] P55.2 — State machine enforced via RPCs: double-pause → P0001, resume-without-pause → P0001, complete-already-ended → idempotent no-op.
- [x] P55.3 — Cross-tenant caller on any of the three RPCs raises 42501 (verified in `tests/rls/work_log_pause_rpcs.test.ts`).
- [x] P55.4 — Non-owner non-manager caller raises 42501. Manager can override for another staff's log (used by the P53 handler-change path).
- [x] P55.5 — `duration_seconds` on a completed-with-pauses row equals `wall_span - paused_seconds_total` (verified: 30s session with 12s pauses → 17–19s in CI).
- [x] P55.6 — Tech UI renders three distinct button sets (Start / Pause+Complete / Resume+Complete). Timer freezes while paused, resumes from the right base after resume.
- [x] P55.7 — Downstream readers (reports, PDF, charges, timeline view) all observe worked-time semantics without code changes because the generated column handles the subtraction centrally.
- [x] P55.8 — vibe-security audit clean: no Critical/High/Medium findings on the migration or server actions.

14 RLS tests + 7 unit tests (4 `workedSeconds` cases, 3 `isPaused` cases) green. Full suite: 134/134 unit, 78/78 RLS.

#### Out of scope

- Pause interval history table. The `pause_count` scalar is enough to power the P54 tooltip (*"Paused N times, total Xm"*); listing each interval individually is YAGNI for v1.
- Auto-pause on idle / end-of-shift. Deferred.
- Edit-prior-pauses admin flow. Managers retro-log via `managerLogWork` (existing) + can direct-UPDATE `paused_seconds_total` if they spot a mistake.

---

### P51 — Pass-back as an event on one job — single source of truth (~4 hours)

**Decision logged 2026-04-14.** Replaces the pass-back data model from P47. Full visual walk-through: [`USER_FLOW_DIAGRAM.html`](USER_FLOW_DIAGRAM.html). This spec supersedes the OPEN ARCHITECTURAL QUESTION at the top of this file.

**Why:** one customer visit was creating 1 booking + 1 MOT job + 1 pass-back booking + 1 mechanic job = **four database trails** for what Karen experiences as "I dropped my car off this morning." The worked example on 2026-04-14 (DUD-2026-00009) made the pollution concrete. Invoices split, work-log times split, status page had to merge two job IDs — all downstream from a bad data shape.

**The model — one job per vehicle visit, pass-back is an event on that job:**

| Concept | Old model (P47) | New model (P51) |
|---|---|---|
| Kiosk arrival | `bookings` row, `service=mot` | same — unchanged |
| MOT tester starts MOT | `jobs` row `#J-55`, booking → converted | same — unchanged |
| MOT tester finds mechanical issue | Create **second booking** `#B-102` + flip origin to `awaiting_mechanic` | Flip origin job's `current_role` to `mechanic` + insert `job_passbacks` event row |
| Mechanic picks it up | **Second job** `#J-56` created via `start_work_from_checkin` | Same job `#J-55` — mechanic takes assignment via `claim_passback(job_id)` RPC; MOT tester's self-assignment preserved in `job_assignments` so they still see the job in My Work |
| Mechanic finishes | Close job `#J-56` — MOT tester manually resumes `#J-55` | Flip `current_role` back to `mot_tester` + insert matching `job_passbacks.returned_at` event |
| MOT tester resumes | "Resume MOT" reloads the paused `#J-55` | Same button — now just reads `current_role='mot_tester'` |
| Billing | 2 invoices (or a merged-view hack) | 1 invoice rolling up all charges on `#J-55` |
| Customer status page | Merges 2 job IDs via `passed_from_job_id` | Reads 1 job, renders pass-back events as timeline entries |
| Manager's "Jobs" list | 2 rows per visit | 1 row per visit |

**Data-model changes (migration `033_p51_passback_as_event.sql`):**

```sql
-- 1. Replace the boolean + enum flag with an explicit "whose court is the ball in" column.
alter table public.jobs
  add column current_role public.staff_role_t null;
  -- staff_role_t is the existing enum ('manager','mot_tester','mechanic').
  -- NULL = no active handler (job complete, abandoned, or pre-start).

-- Backfill from today's state:
--   jobs with awaiting_passback=true  → current_role = 'mechanic'
--   jobs with status in ('completed','cancelled','abandoned') → current_role = NULL
--   everything else with service='mot' → current_role = 'mot_tester'
--   everything else → current_role = 'mechanic'
update public.jobs set current_role = case
  when status in ('completed','cancelled','abandoned') then null
  when coalesce(awaiting_passback, false) = true or status = 'awaiting_mechanic' then 'mechanic'
  when service = 'mot' then 'mot_tester'
  else 'mechanic'
end::public.staff_role_t;

-- 2. New event table — the audit trail for every handoff.
create table public.job_passbacks (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references public.garages(id) on delete cascade,
  job_id    uuid not null references public.jobs(id)    on delete cascade,
  from_role public.staff_role_t not null,
  to_role   public.staff_role_t not null,
  from_staff_id uuid null references public.staff(id) on delete set null,
  to_staff_id   uuid null references public.staff(id) on delete set null,
  items  jsonb not null default '[]'::jsonb,   -- 11-item checklist payload
  note   text  null,
  created_at  timestamptz not null default now(),
  returned_at timestamptz null,                 -- filled when the *return* event closes the loop
  constraint job_passbacks_roles_differ check (from_role <> to_role)
);

alter table public.job_passbacks enable row level security;
create index job_passbacks_job_idx    on public.job_passbacks (job_id, created_at desc);
create index job_passbacks_garage_idx on public.job_passbacks (garage_id);

-- SELECT: anyone who can see the parent job can see its pass-back events.
create policy job_passbacks_select on public.job_passbacks
  for select to authenticated using (
    garage_id = private.current_garage()
    and exists (select 1 from public.jobs j where j.id = job_id and j.garage_id = garage_id)
  );
-- INSERT/UPDATE/DELETE: writes go through SECURITY DEFINER RPCs only.
revoke insert, update, delete on public.job_passbacks from authenticated;

-- 3. Retire the old fields (keep behind a view for one release cycle, then drop).
-- Do NOT drop columns yet — P51 rollout plan keeps them nullable until the 2-week
-- soak period ends. Drop happens in a follow-up migration.
comment on column public.jobs.awaiting_passback is 'DEPRECATED by P51 (use current_role). Slated for removal after soak.';

-- 4. Retire the pass-back branch of bookings.
-- Columns stay on bookings (still useful for manager-entered pass-backs during transition),
-- but no new writes should set them. The insert_passback_booking() RPC is revoked.
revoke execute on function public.insert_passback_booking(
  uuid, public.booking_service, text, text, text, text, text, text, text, jsonb, uuid
) from authenticated;
comment on function public.insert_passback_booking(
  uuid, public.booking_service, text, text, text, text, text, text, text, jsonb, uuid
) is 'DEPRECATED by P51 — use pass_job_to_mechanic() on jobs.';

-- 5. The new RPCs (all SECURITY DEFINER, search_path='').
create or replace function public.pass_job_to_mechanic(
  p_job_id uuid, p_items jsonb, p_note text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_job public.jobs;
  v_passback_id uuid;
begin
  select * into v_job from public.jobs where id = p_job_id;
  if not found or v_job.garage_id <> private.current_garage() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_job.current_role <> 'mot_tester' then
    raise exception 'job not currently with mot_tester' using errcode = 'P0001';
  end if;
  if not private.has_role('mot_tester') and not private.is_manager() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Pause MOT tester's running work log on this job, if any.
  update public.work_logs
     set ended_at = now()
   where job_id = p_job_id and staff_id = v_uid and ended_at is null;

  -- Flip handler.
  update public.jobs set current_role = 'mechanic' where id = p_job_id;

  -- Event row.
  insert into public.job_passbacks (garage_id, job_id, from_role, to_role, from_staff_id, items, note)
    values (v_job.garage_id, p_job_id, 'mot_tester', 'mechanic', v_uid, p_items, p_note)
    returning id into v_passback_id;

  return v_passback_id;
end $$;

create or replace function public.return_job_to_mot_tester(p_job_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_job public.jobs;
  v_passback_id uuid;
begin
  select * into v_job from public.jobs where id = p_job_id;
  if not found or v_job.garage_id <> private.current_garage() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_job.current_role <> 'mechanic' then
    raise exception 'job not currently with mechanic' using errcode = 'P0001';
  end if;
  if not private.has_role('mechanic') and not private.is_manager() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.work_logs
     set ended_at = now()
   where job_id = p_job_id and staff_id = v_uid and ended_at is null;

  update public.jobs set current_role = 'mot_tester' where id = p_job_id;

  update public.job_passbacks
     set returned_at = now(), to_staff_id = v_uid
   where id = (
     select id from public.job_passbacks
      where job_id = p_job_id and returned_at is null
      order by created_at desc limit 1
   )
   returning id into v_passback_id;

  return v_passback_id;
end $$;

revoke all on function public.pass_job_to_mechanic(uuid, jsonb, text)        from public, anon;
revoke all on function public.return_job_to_mot_tester(uuid)                 from public, anon;
grant  execute on function public.pass_job_to_mechanic(uuid, jsonb, text)    to authenticated;
grant  execute on function public.return_job_to_mot_tester(uuid)             to authenticated;
```

**Query changes:**

| Surface | Old | New |
|---|---|---|
| MOT tester's My Work → Checked in | `bookings` rows where `service='mot'` + priority | Same, unchanged (kiosk intake stays a booking) |
| MOT tester's My Work → Paused / awaiting mechanic | `jobs` where `awaiting_passback=true` assigned to me | `jobs` where `current_role='mechanic'` AND I am assigned via `job_assignments` |
| Mechanic's My Work → Checked in | `bookings` rows where service IN (electrical, maintenance) + `priority=1` pass-back bookings | `bookings` rows where service IN (electrical, maintenance) — pass-back rows **no longer exist** in this query |
| Mechanic's My Work → Passed back to me | *(did not exist — was mixed into check-ins)* | `jobs` where `current_role='mechanic'` AND not yet claimed by a mechanic (`no active mechanic in job_assignments`) — **this is the new passback queue**, sorted top |
| Job detail — pass-back timeline | `bookings.passback_items` + cross-job linkage | `job_passbacks` rows rendered as a timeline entry per handoff |
| Invoice generation | Roll up `job_charges` across `{job_id, passed_from_job_id}` | Roll up `job_charges` on one `job_id`. Trivial. |
| Customer status page | Read two jobs, merge | Read one job. Render pass-back timeline. |

**Server-action / component changes:**

- `src/app/(app)/app/jobs/passback/actions.ts` → rename action to `passJobToMechanic()`, call new RPC. Drop booking creation.
- `src/app/(app)/app/bookings/actions.ts` → `startWorkFromCheckIn` loses the pass-back branch (pass-backs no longer arrive as bookings). Keep the electrical/maintenance branch intact.
- `src/app/(app)/app/jobs/[id]/PassbackDialog.tsx` → still sends 11-item checklist + note, now to `passJobToMechanic(jobId, items, note)`.
- `src/app/(app)/app/jobs/[id]/ResumeMotButton.tsx` → the button is still shown but it's now just a navigation — the resume happens the moment the mechanic calls `return_job_to_mot_tester()`. Rename to "Open paused MOT" / "Resume". (Detail: tester can also hit a `resumeMotJob()` action that no-ops if `current_role` isn't already `mot_tester` — kept for parity with existing UX.)
- `src/app/(app)/app/tech/page.tsx` (My Work) → new "Passed back to me" section for mechanics, powered by the new query above.
- `src/components/ui/status-badge.tsx` → drop `awaiting_mechanic` variant once backfill is complete; replace with a small inline chip `With mechanic` driven by `current_role`.
- `src/lib/constants/service-categories.ts` / `passback-items.ts` → unchanged.

**RPC / security (vibe-security audit must pass before P51 closes):**
- All three RPCs are SECURITY DEFINER with `search_path=''`, inputs validated, caller-role gated inside the function body — same pattern as `start_mot_from_checkin` (migration 028) and `insert_passback_booking` before it. Rule #2 + #3 preserved.
- `job_passbacks` RLS: SELECT gated on parent-job visibility (inherits); no direct writes. Rule #3 preserved.
- Multi-tenant check `garage_id = private.current_garage()` in every RPC (rule #1).
- No privilege escalation path: neither RPC lets a tester assign the job to a specific mechanic — it only flips `current_role`. The mechanic queue is pull-based (first to claim), which is what Hossein specified.
- P50 realtime: `job_passbacks` goes into the coverage-matrix publication (REPLICA IDENTITY FULL) so the pass-back event shows up live on manager/tester/mechanic/customer views of the job.

**Backwards-compat + rollout plan:**
1. Apply migration 033. Backfill `current_role` for all existing jobs.
2. Ship new UI wired to the new RPCs. Old `insert_passback_booking` RPC is revoked in the same migration.
3. Keep `jobs.awaiting_passback`, `jobs.status='awaiting_mechanic'` enum value, `bookings.passback_note`, `bookings.passback_items`, `bookings.passed_from_job_id` in place for one 2-week soak.
4. Follow-up migration 034 drops the deprecated columns and the enum value (requires enum rebuild — standard swap via `alter type … rename to _old`, create new, recast columns).
5. Final cleanup: delete `insert_passback_booking` function entirely, delete the retired booking rows (any with `passed_from_job_id not null` can be soft-deleted after visit close).

**What must NOT regress (from P47 decision notes, repeated for the audit):**
- Mechanic still self-starts a pass-back with one click (now a "Claim" button on a job in their new Passed-back section).
- MOT tester can return to the original MOT after pass-back (the job reappears in their My Work the instant `return_job_to_mot_tester()` fires, via P50 realtime).
- Multi-tenant garage_id isolation via RLS — both RPCs enforce it, `job_passbacks` RLS inherits it via the parent-job check.
- Customer-facing status page must show the whole visit — now trivially one job; timeline events are additional, not replacements.
- Manager override: manager can still call both RPCs directly (both check `private.is_manager() OR private.has_role(...)`). Manager can also edit `current_role` directly (row-level UPDATE policy allows manager).

**Acceptance criteria:**
- [x] P51.1 — Migration 033 applies cleanly to the live DB; backfill populates `current_role` on every non-terminal job; `pg_policy` confirms `job_passbacks_select` active.
- [x] P51.2 — MOT tester pass-back flow: pick MOT → `Pass to mechanic` → tick items → save. Origin job stays in `jobs` table (no new `jobs` row created); `job_passbacks` gets one row; `bookings` gets zero new rows; `current_role='mechanic'`.
- [x] P51.3 — Mechanic sees the passed-back job in a new "Passed back to me" section on My Work. One click to Claim (sets `job_assignments` for the mechanic). Work log start on the same job id as the MOT tester used.
- [x] P51.4 — Mechanic clicks `Return to MOT tester` → `return_job_to_mot_tester()` fires; `job_passbacks.returned_at` stamped; `current_role='mot_tester'`; MOT tester's My Work shows it under "Awaiting my resume" instantly (via P50).
- [x] P51.5 — Invoice generation on the visit includes all charges entered by both tester and mechanic against the single job. One PDF, one invoice number.
- [ ] P51.6 — Customer status page renders one job with a timeline showing `MOT started → Passed to mechanic (items: …) → Mechanic completed → Resumed MOT → MOT completed`. No cross-job merge logic.
- [x] P51.7 — Manager override: manager can forcibly flip `current_role` via the job detail UI; no RPC needed, direct UPDATE via the manager RLS policy.
- [x] P51.8 — Multi-tenant: tester from garage A cannot call `pass_job_to_mechanic(p_job_id=<job in garage B>)` — RPC raises `42501`.
- [x] P51.9 — `insert_passback_booking()` is no longer callable by an `authenticated` role (`EXECUTE` revoked) — verified by forged-JWT attempt.
- [ ] P51.10 — After soak, migration 034 drops `jobs.awaiting_passback`, `bookings.passed_from_job_id`, `bookings.passback_note`, `bookings.passback_items`, and the `awaiting_mechanic` enum value — zero code references remain (grep clean).
- [x] P51.11 — Role-test matrix in `ROLE_TEST_PLAN.md` updated: R-T.8 ("MOT tester pass-back"), R-C.4 ("Mechanic passed-back section"), R-M.7 ("Manager single-row per visit").
- [x] P51.12 — No pass-back code in the codebase references the `bookings` table for pass-backs (grep: `passed_from_job_id` and `passback_items` appear only inside migration-drop SQL and `job_passbacks` helpers).

**Architecture rules touched:** #1 multi-tenant (RPC + RLS), #2 never-trust-client (RPC-mediated writes), #3 RLS on every table (job_passbacks), #11 GDPR (export needs to include `job_passbacks` rows — extend `customer_data_export`).

**Files this will touch:**
- New: `supabase/migrations/033_p51_passback_as_event.sql`
- Soon: `supabase/migrations/034_p51_drop_deprecated.sql` (after soak)
- Modified: `src/app/(app)/app/jobs/passback/actions.ts`, `src/app/(app)/app/jobs/[id]/PassbackDialog.tsx`, `src/app/(app)/app/jobs/[id]/ResumeMotButton.tsx`, `src/app/(app)/app/jobs/[id]/page.tsx` (pass-back timeline panel), `src/app/(app)/app/jobs/[id]/StatusActions.tsx`, `src/app/(app)/app/tech/page.tsx` (mechanic's new "Passed back to me" section), `src/app/(app)/app/bookings/actions.ts` (drop passback branch from `startWorkFromCheckIn`), `src/components/ui/status-badge.tsx`, `src/lib/validation/job-schemas.ts`, `docs/redesign/ROLE_TEST_PLAN.md`.
- Extended: `customer_data_export()` SECURITY DEFINER function (rule #11) to return `job_passbacks` for the customer's jobs.

**Time estimate:** ~4 hours. Migration + backfill (30m) · RPCs + RLS (45m) · action + dialog wiring (45m) · mechanic My Work "Passed back to me" section + query (45m) · status-page timeline (30m) · invoice rollup test (20m) · role-test plan updates + regression (25m).

**Priority:** HIGH — blocks P47.8 audit-log entries, P46 assign-tech modal polish (which must know whether a job in the passback queue takes a mechanic or a tester), and the passback-related P50 realtime surfaces. Must land before any further pass-back code.

---

## Part F execution order (Phase 2 — strict, updated 2026-04-14 for P51)

```
DONE (shipped 2026-04-14):
  P36, P37, P39, P40, P41, P42, P43, P44, P45, P47*, P48, P49
  * P47 pass-back data model is being retired in favour of P51 (see below).

HIGH — data-model correction (BLOCKS everything below that touches pass-backs):
  P51 (pass-back as event on one job) ~4 hours   ← ONE source of truth. Migration 033
                                                   + new RPCs + UI rewire. No further
                                                   pass-back code lands until this is in.

HIGH — realtime + remaining polish:
  P50 (realtime updates everywhere)   ~3.5 hours ← Must include job_passbacks in publication.
                                                   Security plan in P50 body.
  P52 (job-detail header reorg + P51 soak-bug fix)  ~1 hour   ← DONE 2026-04-14. Removed duplicate
                                                                 "Pass to Mechanic" button,
                                                                 regrouped header zones. Soak guard
                                                                 in place.
  P53 (override handler command palette)  ~2 hours  ← Replaces P52's static "Override role" submenu
                                                      with a cmdk palette + single override dialog.
                                                      Scales to 20+ staff. SECURITY DEFINER RPC
                                                      override_job_handler mediates all writes.
                                                      Visual: P53_OVERRIDE_DIALOG.html.
  P54 (unified Job Activity timeline)     ~3 hours  ← New job_status_events table + SQL view
                                                      job_timeline_events. Merges pass-back timeline
                                                      + Work Log + status history into one feed.
                                                      Subsumes P47.8 + P51.6. Customer status page
                                                      reads curated subset.
  P46 (assign-tech modal — Available/Busy grouping)  ~45 min  ← Pulls tech availability from
                                                                 job_assignments; reads cleanly
                                                                 now that pass-back is single-job.

POLISH (broad UX pass — slot last so it sees the final UI):
  P38 (mobile-first pass)             ~4 hours

SUBSUMED / CLOSED inside P54 (do not schedule separately):
  P47.8 — audit-log entries for pass-back events → covered by P54 timeline + existing audit_log writes.
  P51.6 — customer status-page timeline → covered by P54 curated view.

POST-SOAK (schedule for ~2026-04-28):
  P51.10 — migration 034 drops deprecated columns/enum values (~30 min).

Total remaining Phase 2: ~13.25 hours (P50 + P53 + P54 + P46 + P38)
```

**Critical path:** **P51 first.** Every other remaining item either touches pass-backs or touches surfaces pass-backs render on (sidebar badges, My Work sections, customer status timeline, invoice PDF). Doing P51 before P50 keeps the realtime publication honest (we publish `job_passbacks`, not the retired pass-back-bookings). Doing P51 before P46 means the assign-tech modal deals with one job, not a chain. Doing P51 before P47.8 means the audit entries write against the new event table rather than being retrofitted twice. P38 mobile pass is last so it sees the final surface shape.

---

## Pending migrations (MUST RUN BEFORE Part D)

4 migrations have been written but **not yet applied** to the Supabase database. These fix critical bugs (B3, B4) and add features required by Part C (P16 check-in status). They MUST be applied before any Part D work begins.

| Migration | Purpose | Fixes |
|-----------|---------|-------|
| `015_fix_worklog_rls.sql` | Relaxes work_logs INSERT policy — techs can log work without being pre-assigned | B3 (tech RLS bug) |
| `016_checked_in_status.sql` | Adds `checked_in` to job status enum + state machine transitions | P16 (check-in rename) |
| `017_staff_avatar.sql` | Adds `avatar_url` column to `staff` table + avatars storage bucket | B4 (staff modal query fails without this column) |
| `018_auto_set_staff_claims.sql` | Auth trigger to auto-sync role + garage_id into JWT claims when staff is created | P34 (staff management) |

### How to apply

**Option A — Supabase CLI (recommended if Supabase CLI is installed):**

```bash
# From the project root directory
cd /path/to/oplaris-automotive

# Push all pending migrations to the remote Supabase instance
supabase db push --db-url "postgresql://postgres:[SERVICE_ROLE_PASSWORD]@[SUPABASE_HOST]:5432/postgres"
```

**Option B — Direct SQL via psql (if Supabase CLI not available):**

```bash
# Connect to the Supabase Postgres instance
psql "postgresql://postgres:[SERVICE_ROLE_PASSWORD]@[SUPABASE_HOST]:5432/postgres"

# Then run each migration in order:
\i supabase/migrations/015_fix_worklog_rls.sql
\i supabase/migrations/016_checked_in_status.sql
\i supabase/migrations/017_staff_avatar.sql
\i supabase/migrations/018_auto_set_staff_claims.sql
```

**Option C — Supabase Dashboard (easiest, no CLI needed):**

1. Go to your Supabase project dashboard → SQL Editor
2. Open each migration file in order (015, 016, 017, 018)
3. Copy-paste the SQL content into the editor
4. Click "Run" for each one

**Option D — Let Claude Code do it (if DB connection string is in .env.local):**

Claude Code can read the Supabase connection details from `.env.local` and apply the migrations directly via the `psql` CLI. Add this to the kickstart prompt:

```
Before starting Part D, apply all pending migrations (015-018) to the database.
Read the Supabase URL and service role key from .env.local.
Construct the connection string and run each migration SQL file in order using psql or the supabase CLI.
Verify each migration succeeded before continuing.
```

### Verification after applying

After running all 4 migrations, verify:

```sql
-- Check avatar_url column exists on staff
SELECT column_name FROM information_schema.columns WHERE table_name = 'staff' AND column_name = 'avatar_url';

-- Check checked_in is a valid job status
SELECT enum_range(NULL::job_status);

-- Check work_logs INSERT policy is relaxed (no job_assignments check)
SELECT polname, qual, with_check FROM pg_policies WHERE tablename = 'work_logs' AND cmd = 'INSERT';

-- Check auto-claims trigger exists
SELECT trigger_name FROM information_schema.triggers WHERE event_object_table = 'staff' AND trigger_name LIKE '%claim%';
```

---

## Part D execution order

```
CRITICAL (do first):
  B4  (staff modal error fix)         ~15 min   ← QUICK FIX, unblocks check-in flow
  P30 (charges + quote/invoice flow)  ~4 hours  ← Largest item, critical for go-live

HIGH (core features + fixes):
  P29 (rework warranties → stock-only) ~2 hours ← Model change, must be done early
  P31 (stock locations dropdown)      ~45 min
  P32 (required/optional labels)      ~1 hour   ← App-wide audit
  P33 (consistent modals)             ~1.5 hours ← Fixes layout shift bugs
  P34 (staff management fixes)        ~30 min

MEDIUM (polish):
  P35 (cards vs lists audit)          ~1 hour

Total Part D: ~11 hours
```

**Critical path:** B4 → P30 → P29. Fix the staff modal, then build the charges/quote/invoice flow (Dudley can't bill customers without it), then fix the warranty model to stock-only.

---

## Kickstart prompt (Phase 1 — Functional role testing, CURRENT)

```
You are continuing the Oplaris Automotive project (Dudley Auto Service). The old M1/M2 deadline is superseded — Hossein wants a properly-tested, properly-polished product. Work proceeds in 5 strict phases. You are in Phase 1: functional testing across all roles. Do NOT jump to Phase 2 (feature improvements) or Phase 3 (visual refinement) until Phase 1 is signed off.

Parts A, B, C, D are DONE (commit c44a5bb). B8 (pwned-passwords) and B9 (kiosk rate limit) are closed. The app is feature-complete on paper; your job is to prove it works end-to-end for every user type, capture every defect, and fix every defect.

## Before you start

1. Read `CLAUDE.md` — architecture rules (immutable) and the "Current priority order" section
2. Read `docs/redesign/BACKEND_SPEC.md` — RLS and auth model
3. Read `docs/redesign/DESIGN_SYSTEM.md` — 4-UI spec
4. Confirm dev server runs locally against the live Supabase instance (that's Hossein's current setup)

## Task R1 — Create `docs/redesign/ROLE_TEST_PLAN.md` (FIRST)

Structured, browser-executable (via Chrome MCP tools) test matrix covering every role. Model it on `E2E_TEST_PLAN.md` but organised by role rather than by feature.

Required roles and what to test:

### Manager (`oplarismanagement@gmail.com` is a manager)
- Login → lands on `/app` dashboard, not a 404 or tech view
- Sidebar shows: Dashboard, Check-ins, Customers, Vehicles, Jobs, Bay Board, Stock, Warranties, Parts Suppliers, Reports, Audit Log, Settings
- Create customer → add vehicle → create job → assign bay + tech → add parts → add charges (part, labour, other) → Send Quote (SMS fires) → Generate Invoice (PDF renders clean) → Mark job complete
- Reports page: date range, KPIs, CSV export, revenue chart renders
- Stock: add item, record movement, adjust location, mark warranty
- Settings: create a mechanic test account, create an MOT tester test account, edit staff, deactivate staff
- GDPR: export customer data (JSON downloads), audit log shows the export event
- Attempt to view another garage's data (simulate via URL fiddle) → must be RLS-blocked

### MOT tester (create via Settings → Staff first)
- Login → lands on appropriate tech/MOT UI (not the manager dashboard)
- Can see jobs assigned to them
- Can start/pause/complete work logs
- Can record MOT result (pass/fail/advisories)
- Cannot access Reports, Audit Log, Stock management, Settings (UI hidden AND server-side blocked)
- Cannot edit another tester's work logs

### Mechanic (create via Settings → Staff first)
- Login → tech mobile UI (`/app/tech`)
- Can see assigned jobs list
- Tap job → detail page loads on 375px viewport
- Start work → timer counts → pause → resume → complete
- Request customer approval → SMS sent (check Twilio logs)
- Cannot access Reports, Settings, Stock admin
- Cannot start work on a job not assigned to them (or if CLAUDE.md rule was relaxed in B3 fix, check the expected behaviour)

### Customer (public status page — no DB user)
- Test phone: use a real UK mobile you can receive SMS on
- Enter reg + phone on `/status` → receive 6-digit SMS code
- Enter code → see job status + approval request if one is pending
- Approve a pending work item via SMS link → job status auto-advances to `in_repair`
- Rate-limit test: submit 4 times in a row from same phone → 4th blocked with generic "try again later" (no enumeration)
- Try a reg that doesn't exist → same response shape as success (anti-enumeration)

### Cross-role concerns
- Every session times out appropriately
- JWT custom claims (`role`, `garage_id`) match what the user actually is
- Soft-deleted customers don't appear in search
- Recently deleted tab shows last 30 days, restore works
- Audit log records every read of customer PII by staff

## Task R2 — Execute the plan and log defects

- Use Chrome MCP tools (`mcp__Claude_in_Chrome__*`) the same way `E2E_TEST_PLAN.md` does
- Capture screenshots for every failure
- `docs/redesign/PHASE1_DEFECTS.md` already exists and is seeded with two pre-phase defects from Hossein: **D1** (mechanic work_logs RLS failure — Critical) and **D2** (job title edit layout shift — Medium). Read it first, then append new defects starting at **D3**.
- New defect entries follow the format already in PHASE1_DEFECTS.md: ID, role, route, steps, expected, actual, severity (Critical / High / Medium / Low), screenshot path
- Fix Critical + High defects immediately. Medium + Low: batch into a fix PR at the end of the phase.
- D1 is Critical — **fix it before running any other mechanic tests** (nothing in mechanic flow will work until work_logs inserts succeed).
- D2 is linked to P36 — close D2 when P36 lands, OR extend P36 to cover the job-title inline edit if it's not already in scope. See D2 section in PHASE1_DEFECTS.md.
- After every defect is fixed, RE-RUN the relevant role section to prove the fix holds

## Exit criteria for Phase 1

- Every role's full section in ROLE_TEST_PLAN passes with no Critical or High defects open
- PHASE1_DEFECTS.md shows all defects closed
- Update `CLAUDE.md > Current priority order` Phase 1 line to DONE with date
- Only then move to Phase 2 (Part F in MASTER_PLAN)

## Rules

- Do NOT touch P36–P40, do NOT touch VISUAL_IMPLEMENTATION_PLAN, do NOT draft deploy infra. All of that is Phase 2/3/4.
- If you find something that LOOKS like a visual polish issue, log it in PHASE1_DEFECTS but don't fix the visual layer — note it as "visual, Phase 3"
- Every fix PR must reference a defect ID from PHASE1_DEFECTS.md
- Architecture rules in CLAUDE.md are still immutable — no policy relaxations to pass a test
- One question per day to Hossein, batched
```

---

## Kickstart prompt (Phase 2 — Feature improvements, use when Phase 1 signed off)

```
You are continuing the Oplaris Automotive project (Dudley Auto Service). Phase 1 (role testing) is DONE. You are now in Phase 2: feature improvements from Part F of MASTER_PLAN.md.

## Before you start

1. Read `CLAUDE.md` (project root) — architecture rules that override everything
2. Read `docs/redesign/MASTER_PLAN.md` — focus on Part E (P36–P40) and the "Part D Verification Findings" section
3. Read `docs/redesign/DESIGN_SYSTEM.md` — UI specs
4. Read `docs/redesign/E2E_TEST_PLAN.md` — the structured browser test plan. **RUN THIS FIRST via your Chrome tools to confirm the current state before making changes.** Then re-run it after each phase to verify.

## Step 0 — verify current state (mandatory)

Before writing any code:
1. Start the dev server (`pnpm dev`)
2. Apply pending migrations 015–018 if not already applied
3. Execute E2E_TEST_PLAN.md sections T0, T1 (P29), T2 (P30), T3 (P33/P36 baseline), T4 (P37 baseline), T5 (P38 baseline) using your Chrome MCP tools
4. Record which tests PASS, FAIL, SKIP in a report
5. This baseline tells you which phases actually need work and which are already good

## Execution order (follow strictly)

### CRITICAL — visible bugs (do first):

**P36 (~1 hour):** Inline forms → modals. Three files need `<Dialog>` wrapping replacing the current conditional inline `<form>` pattern. Copy AddChargeDialog pattern from `src/app/(app)/app/jobs/[id]/ChargesSection.tsx`.
- `LogWorkDialog.tsx` (misnamed, currently inline), `AddPartForm.tsx`, `customers/[id]/AddVehicleForm.tsx` — wrap each in Dialog.
Verify via T3 (scrollHeight before === after).

**P37 (~30 min):** Equal card heights. Add `h-full` to base Card className. Audit card grids (job detail top row, bay board, staff cards). Verify via T4.

### HIGH — roles + routing foundation (do BEFORE anything else in this block):

**P48 (~1.5 hours):** Role-based sidebar + route access policy. Source of truth is the access matrix in the Part F spec. Sidebar built from `NAV_ITEMS_BY_ROLE`; middleware enforces route access; Server Actions enforce via `requireRole`; RLS tightened on manager-only tables. MOT tester has no Check-ins page — MOT check-ins appear in their Today / My Work feeds.

**P47 (~3 hours):** Role-aware check-in routing + MOT→mechanic passback. Migration 026_checkin_routing.sql adds `priority`, `passback_note`, `passback_items`, `passed_from_job_id`, `jobs.awaiting_passback`. MOT tester self-start button. PassbackDialog with the 11-item checklist. MOT job pauses on passback and only resumes manually. Mechanics can self-start passbacks. Mixed-item passbacks = one combined check-in.

**P44 (~1 hour):** Work log start/pause/stop with HH:MM:SS timestamps. Verify state machine, centralise `formatWorkLogTime` / `formatWorkLogDuration` in `src/lib/format.ts`, add partial unique index on open `work_logs` per (job, tech). Everywhere renders seconds.

**P49 (~45 min):** Currently-working panel on job detail pages (manager + tech + customer status page). Name, role, started-at, live ticking timer. Uses P44 formatter. RLS must allow status-page reads scoped to the customer's own job.

### HIGH — billing + check-in cluster (runs after the roles foundation):

**P40 (~1 hour):** Labour rate flexibility. Settings UI for `labour_rate_pence`, labour charge opens pre-filled AddChargeDialog (editable), round to nearest 0.25h (not ceil).

**P46 (~1 hour):** Assign-technician modal on job creation from check-in. Replace direct create with `AssignTechDialog` grouping Available/Busy techs. Busy tech → confirmation modal. New Server Action `createJobFromCheckIn(checkInId, technicianId)`. Uses the role filter from P47/P48.

**P41 (~30 min):** Delete check-in. Manager-only Server Action with soft-delete + audit log. Overflow menu on each row. Cannot delete converted check-ins.

**P42 (~30 min):** Check-in count badge on sidebar. Server-fetched count **filtered by current user's role and what P48 lets them see** (MOT tester sees nothing here — no Check-ins nav item; mechanic sees their queue count; manager sees total). Red circle, "99+" cap, a11y aria-label. Hide when 0.

**P50 (~2 hours):** Realtime updates across the app. Build one reusable hook `useRealtimeRouterRefresh({ table, filter, event })` in `src/lib/realtime/`. Wire into: sidebar check-in badge (P42), check-ins list page, Today dashboard, and currently-working panel (P49). REPLICA IDENTITY FULL on `bookings` + `work_logs` via migration 027. RLS still enforced on realtime. Status page realtime scoped strictly to the customer's signed-session job IDs. Debounce to max 1 refresh / 2 s. No manual refresh needed anywhere.

### HIGH — kiosk uplift:

**P45 (~45 min):** Email field on kiosk + visible in manager. Optional field, zod validation, migration 025 if column missing, surface in customer list/detail/edit, update `customer_data_export`.

**P43 (~1.5 hrs):** Kiosk DVSA reg lookup. Route Handler `/api/kiosk/reg-lookup`, reuse 24h DVSA cache, rate-limit 10/hr per IP, graceful fallback if DVSA down.

### HIGH — close P30 gaps:

**P39 (~2 hours):** 4 subsections.
- **P39.1:** SMS on "Send Quote" via existing Twilio client.
- **P39.2:** Postgres trigger `job_parts` → `job_charges` sync (migration 024).
- **P39.3:** Edit Charge dialog (pencil icon, mirror AddChargeDialog).
- **P39.4:** Required description on charges (red asterisk).
Verify via T2.

### MEDIUM — polish (do last):

**P38 (~4 hours):** Mobile-first pass. Sidebar drawer (Sheet — must respect P48 role-scoped nav), tables→cards <md, responsive job detail/forms, 56px touch targets on kiosk + tech. Verify T5 at 375/800/360px.

**Order rationale:** visible bugs first (P36/P37), then the roles + work-log foundation (P48/P47/P44/P49 — they define the access model and work-log state machine that almost everything else depends on), then billing + check-in cluster (P40/P46/P41/P42), then kiosk cluster (P45/P43), then P39 close-outs, finally P38 mobile polish last so the mobile pass sees all new UI.

## Key rules

- ALWAYS run E2E_TEST_PLAN against your changes before declaring a phase done
- Copy AddChargeDialog as the modal template — don't invent new patterns
- `<Label required>` + red asterisk, `<Label optional>` + muted "(optional)" — already in Label component
- Every SMS goes through existing Twilio client — check signature, don't bypass
- RLS still applies to the new trigger — test with a mechanic account
- Do NOT change the invoice PDF style — Hossein explicitly wants it plain
- Do NOT reintroduce warranties on jobs — stock-only, full stop
- Update MASTER_PLAN tracker as each phase completes
- One question per day to Hossein, batched

## Exit criteria for Phase 2

- P36, P37, P39, P40, P41, P42, P43, P44, P45, P46, P47, P48, P49, P50 tracker rows all marked DONE with dates
- P38 marked DONE **or** explicitly deferred to Phase 3 with Hossein's sign-off (mobile work overlaps heavily with visual refinement)
- Full `E2E_TEST_PLAN.md` run passes end-to-end (T0–T6 green)
- No Critical or High defects added to `PHASE1_DEFECTS.md` during Phase 2 work
- Update `CLAUDE.md > Current priority order` Phase 2 line to DONE with date
- Only then move to Phase 3 (VISUAL_IMPLEMENTATION_PLAN.md)

## Rules

- Do NOT touch VISUAL_IMPLEMENTATION_PLAN, do NOT draft deploy infra, do NOT run production import. All of that is Phase 3/4/5.
- Architecture rules in CLAUDE.md are still immutable
- Every PR touching backend → run the vibe-security audit pass before merging
- If a feature change surfaces a Phase 1 defect that slipped through, fix it here and note the miss in PHASE1_DEFECTS.md
```

---

## Kickstart prompt (Phase 3 — Visual refinement, use when Phase 2 signed off)

```
You are continuing the Oplaris Automotive project (Dudley Auto Service). Phases 1 (role testing) and 2 (feature improvements) are DONE. You are now in Phase 3: visual refinement. This is pre-launch work — Dudley is the first showcase garage for the resellable Oplaris product, so the UI needs to demo well.

## Before you start

1. Read `CLAUDE.md` — architecture rules still apply
2. Read `docs/redesign/VISUAL_IMPLEMENTATION_PLAN.md` — the V1–V6 execution plan
3. Read `docs/redesign/UI_RESEARCH_PLAN.md` — competitor/visual research brief (run the research first if not already done)
4. Read `docs/redesign/DESIGN_SYSTEM.md` — design tokens that the visual layer must respect
5. Read `docs/UIResearch/` — any completed research artefacts

## Execution order

Follow `VISUAL_IMPLEMENTATION_PLAN.md` V1 → V6 strictly:
- **V1** — Theming + colour refinement (primary/accent tokens, dark-mode audit)
- **V2** — Icon system (Lucide audit, automotive supplements)
- **V3** — Illustrations (empty states, kiosk welcome, status page hero)
- **V4** — Textures / patterns (subtle branded surfaces, cards, headers)
- **V5** — Branded surfaces (sidebar, topbar, kiosk shell)
- **V6** — Micro-interactions (transitions, loading states, hover/active)

Run the UX audit pass (`Oplaris-Skills/ux-audit/`) after each V-phase. No hardcoded colours — tokens only. Keep the 4-UI split: manager, tech, kiosk, status page each have different density/polish targets.

## Key rules

- No new features. If you spot one, log it in a new `docs/redesign/PHASE3_IDEAS.md` for later.
- No backend changes. If a visual treatment needs a DB field (e.g. vehicle colour for car image tinting), note it and stop.
- Accessibility ≥ visual. WCAG AA contrast on every new token. Keyboard nav never breaks.
- Touch targets on kiosk/tech UIs stay ≥ 56px — visual polish must not shrink them.
- Test on real devices: at least one old Android for tech UI, one 10" tablet for kiosk.
- Architecture rules in CLAUDE.md are still immutable

## Exit criteria for Phase 3

- V1–V6 all marked DONE in VISUAL_IMPLEMENTATION_PLAN.md with dates
- UX audit clean across all 4 UIs
- E2E_TEST_PLAN still passes (visual changes must not break functional tests)
- Screenshots of every UI captured for Dudley + Oplaris demo archive
- Update `CLAUDE.md > Current priority order` Phase 3 line to DONE with date
- Only then move to Phase 4 (deploy infrastructure)
```

---

## Kickstart prompt (Part D — completed)

```
You are continuing the Oplaris Automotive project (Dudley Auto Service). Parts A, B, and C are DONE. You are executing Part D — reworks, invoicing, UX consistency, and new features found during hands-on testing.

## Before you start

1. Read `CLAUDE.md` (project root) — architecture rules that override everything
2. Read `docs/redesign/MASTER_PLAN.md` — your execution plan, focus on Part D (B4, P29–P35)
3. Read `docs/redesign/DESIGN_SYSTEM.md` — UI specs
4. Read the invoice example PDF in `public/Invoice Example/` — reference only for data fields (garage details, line items, VAT). Do NOT copy its style — the invoice must be clean and simple
5. Read `dudley-requirements-v1.md` — contract scope

## Execution order (follow strictly)

### CRITICAL — do first:

**B4 (~15 min):** Fix "No staff found" in TechAssignmentModal. The error message points to "Supabase dashboard" but should say "Settings → Add Staff Member" with a link. The real fix is ensuring staff accounts exist — the creation UI is at `/app/settings/` via AddStaffDialog. Verify the getStaffAvailability() query returns staff correctly.

**P30 (~4 hours):** Build the CHARGES + QUOTE/INVOICE flow. This is a "Charges" section on the job detail page — a basket of line items (Part, Labour, Other) with running subtotal, VAT 20%, and grand total always visible. Parts auto-populate from job_parts. Labour added manually or calculated from work_logs × garage labour rate. Quote lifecycle: Draft → Quoted → Invoiced. "Send Quote" sends SMS to customer with approval link. "Generate Invoice" creates a CLEAN, SIMPLE PDF (NOT fancy styled — just data: garage details, customer, vehicle, line items table, totals). New tables: job_charges and invoices. Add labour_rate_pence + business detail columns to garages table. Store PDF in Supabase Storage. DO NOT style the PDF elaborately — plain data that prints well on A4.

### HIGH — core features:

**P29 (~2 hours):** REWORK WARRANTIES to STOCK-ONLY. Warranties are NOT for customers/jobs/job_parts. They are EXCLUSIVELY for stock items — tracking the supplier's warranty on parts the garage purchased. A warranty belongs to a stock_item_id (required). Fields: supplier, purchase_date, expiry_date, invoice_reference, claim_status. The warranty fields are optional inputs on the stock add/edit form. The warranties page is a filtered view of stock items with warranty info. "Claim Warranty" action for going back to supplier. DROP the old warranties table and rebuild. Remove ALL warranty UI from job cards, job completion, and job detail pages.

**P31 (~45 min):** Stock locations as managed dropdown. New `stock_locations` table. Replace free-text location input with <Select> dropdown. "Create new location" option in dropdown. Migrate existing free-text values.

**P32 (~1 hour):** App-wide form label audit. Required fields get red asterisk after label. Optional fields get "(optional)" in muted text. Modify the Label component to accept required/optional props. Audit EVERY form. Exception: kiosk pages show neither.

**P33 (~1.5 hours):** Replace ALL inline edit patterns with modal dialogs. Specifically: stock item edit (buggy inline → modal), stock movement (inline → modal), job description edit (causes layout shift → modal). Pre-fill all modals with current values. Use shadcn/ui Dialog consistently.

**P34 (~30 min):** Fix staff management. Ensure staff creation works end-to-end. Add edit/deactivate capabilities. Make the staff section more discoverable in Settings.

### MEDIUM — polish:

**P35 (~1 hour):** Cards vs list views audit. Rule: CARDS for visually distinct items (vehicles, jobs, bay board, check-ins, staff). TABLES for uniform data (stock, parts, work logs, warranties, audit log). Audit every list page and switch where wrong.

## Key rules

- Charges/quotes/invoices are CRITICAL for go-live — Dudley cannot bill customers without them
- Quote statuses are SIMPLE: Draft → Quoted → Invoiced (no Approved/Paid states)
- Invoice PDF style is SIMPLE — clean data only, no decorative branding or fancy layout
- Parts added to a job auto-create charge line items (keep basket in sync)
- Warranties are for STOCK ITEMS ONLY (supplier warranties), not jobs or job_parts — drop and rebuild the table
- ALL edits use modals, not inline forms (except single-field toggles)
- Required fields: red asterisk. Optional: "(optional)". Kiosk: neither.
- Read DESIGN_SYSTEM.md before touching any UI
- Every form: react-hook-form + zod
- No business logic in client components
- Multi-tenant: every query includes garage_id
- Update the master tracker as you complete each phase
```

---

## Kickstart prompt (Part C — completed)

```
You are continuing the Oplaris Automotive project (Dudley Auto Service). Parts A and B of the MASTER_PLAN are DONE. You are executing Part C — bugs, UX fixes, and missing features found during hands-on testing.

## Before you start

1. Read `CLAUDE.md` (project root) — architecture rules that override everything
2. Read `docs/redesign/MASTER_PLAN.md` — your execution plan, focus on Part C (B3, P16–P28)
3. Read `docs/redesign/DESIGN_SYSTEM.md` — UI specs for each screen type
4. Read `dudley-requirements-v1.md` — what was promised to the client

## Execution order (follow strictly)

### CRITICAL — do first:

**B3 (~30 min):** Fix work_logs RLS bug. The INSERT policy requires techs to be in job_assignments before they can start work. Either relax the policy (allow any staff at same garage) or create an RPC that auto-assigns + inserts work log atomically. Test with a mechanic account.

**P16 (~1 hour):** Rename "Bookings" → "Check-ins" everywhere (sidebar, page title, buttons, toasts, empty states). Add notification badge on sidebar showing count of unpromoted check-ins. Add `checked_in` to job status enum — when a check-in is promoted, job starts as `checked_in` not `draft`.

**P17 (~1.5 hours):** Build tech assignment modal for check-in promotion. When "Create Job" is clicked on a check-in, show a modal with all techs as circular avatars. Green border = free (no active work_log). Red border = busy. Tap free tech → job created + tech assigned → redirect to job. Tap busy tech → confirmation dialog → confirm → same. 5 avatars per row, ~80px circles with name below.

### HIGH — core features:

**P22 (~30 min):** Auto-advance job status after customer approval. In `/api/approvals/[token]/route.ts`, after recording approval, set job status to `in_repair`. After decline, set to `in_diagnosis`. Fix button label: "Start Repair" not "Resume Repair" from awaiting_customer_approval.

**P21 (~30 min):** Add "Mark as Approved" button on pending approval requests (manager only). Calls new `manuallyApproveRequest()` action. Triggers same auto-advance as P22.

**P18: REMOVED** — Warranties are now stock-only (see P29). No warranty dialog on job completion.

**P19 (~1.5 hours):** Stock page full CRUD. Add: "Add Stock Item" button + dialog, edit button per row, "Record Movement" dialog (usage/restock/adjustment with quantity + reference), movement history expandable per item, low stock highlighting.

**P20 (~2 hours):** Build reports page UI from scratch. Page doesn't exist yet — only actions.ts. Needs: date range picker, 4 KPI cards (jobs, revenue, avg value, utilisation), revenue chart, tech hours table, common repairs list, parts by job, repeat customers, CSV export.

**P23 (~1 hour):** Kiosk: add email field to form (backend already accepts it). Add reg plate lookup — on reg input blur, call `/api/dvla/lookup` and auto-fill make/model/year/colour.

**P27 (~30 min):** GDPR data export button on customer detail page (manager only). Calls existing `exportCustomerData()` → downloads JSON file.

### MEDIUM — polish:

**P24 (~15 min):** Show seconds on active work log timer (format: Xh Ym Zs).

**P25 (~15 min):** Delete/dismiss check-ins. Trash icon + confirmation per row. Hard delete from bookings table.

**P26 (~30 min):** Manager "Log Work" button on job detail page. Dialog: task type, staff member dropdown, description, start/end time. Lets managers log work retroactively.

**P28 (~15 min):** Customer restore. "Recently Deleted" tab on customers page showing soft-deleted within 30 days. Restore button per row.

## Rules

- Read DESIGN_SYSTEM.md before touching any UI
- Every form: react-hook-form + zod (shared client+server schemas)
- No business logic in client components
- Multi-tenant: every query includes garage_id
- B3 is CRITICAL — fix it FIRST before anything else
- Test each phase before moving to the next
- Update the master tracker in MASTER_PLAN.md as you complete each phase
```
