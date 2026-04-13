# MASTER_PLAN.md — Unified feature completion & testing plan

> **Context:** Full audit on 2026-04-12 compared every page, action file, and CRUD operation against `dudley-requirements-v1.md` and the UI plan (`AUDIT_PROMPT.md`). This is the single source of truth for all remaining work. Bugs B1 (kiosk JWT typo) and B2 (sidebar active state) have been fixed separately — see `BUGFIX_PLAN.md` for reference.

> **Last updated:** 2026-04-12

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

## Execution order

```
PART A — Test existing code (can be done in parallel):
  P1 (DnD bay board) ─┐
  P4 (vehicles page) ──┤── Test in any order
  P5 (car images) ─────┘
  P2 (vehicle detail) ──── after P4 (need list page to navigate)
  P3 (MOT history) ─────── after P2 (lives on vehicle detail page)

PART B — Build new features (sequential):
  P6  (tech job detail)     ~2-3 hours  ← CRITICAL, largest item
  P7  (approval button)     ~30 min     ← builds on P6
  P8  (job status change)   ~30 min
  P10 (promote booking)     ~1 hour
  P9  (edit job detail)     ~1 hour
  P11 (edit customer)       ~30 min
  P12 (edit/delete parts)   ~45 min
  P13 (void warranty)       ~15 min
  P14 (customer filter)     ~15 min
  P15 (vehicle delete)      ~15 min
```

**Total estimate:** ~2 hours testing (Part A) + ~7-8 hours building (Part B) = ~10 hours

**Critical path:** P6 → P7 → P8. These make the app actually usable for technicians and managers day-to-day.

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

## Kickstart prompt

```
You are completing the Oplaris Automotive project (Dudley Auto Service workshop management app). A full audit found features with backend actions but no UI, and some entirely missing features.

## Before you start

1. Read `CLAUDE.md` (project root) — architecture rules that override everything
2. Read `docs/redesign/MASTER_PLAN.md` — your execution plan (this document)
3. Read `docs/redesign/DESIGN_SYSTEM.md` — UI specs for each screen type
4. Read `dudley-requirements-v1.md` — what was promised to the client

## Execution

### Part A — Test existing code (P1–P5)

Code for DnD bay board, vehicle pages, MOT history, car images, and vehicle search was already written. Test each phase's checklist. Fix anything that fails. Mark items as done in MASTER_PLAN.md.

### Part B — Build missing features (P6–P15)

Execute in order. The plan describes what backend exists, what UI is missing, and exactly what to build.

**P6 is the largest item (~2-3 hours):** Build `src/app/(app)/app/tech/job/[id]/page.tsx` — the screen technicians use all day. Needs: job info, vehicle reg, customer tap-to-call, Start/Pause/Complete buttons wired to `work-logs/actions.ts`, task type picker, elapsed timer (client-side interval), work history. Follow DESIGN_SYSTEM.md §4.3 for the mobile-first layout. Touch targets min 48px. Primary buttons full-width, 64px tall.

**P7 (~30 min):** Add "Request Customer Approval" button to tech job detail (P6) and manager job detail page. Opens dialog with description + amount. Calls `requestApproval()` from `jobs/approvals/actions.ts`.

**P8 (~30 min):** Add status transition buttons to `/app/jobs/[id]`. Only show valid next states. Confirm destructive transitions.

**P9 (~1 hour):** Add inline edit for job description/ETA, bay picker, tech assignment, and "Add Part" form to `/app/jobs/[id]`. Backend actions already exist for bay/tech — just need UI.

**P10 (~1 hour):** Build `promoteBookingToJob()` server action + "Create Job" button on bookings page. Dedup customer by phone, find-or-create vehicle by reg.

**P11–P15:** Each is 15-30 min. Follow the plan.

## Rules

- Read DESIGN_SYSTEM.md before touching any UI
- Every form: react-hook-form + zod (shared client+server schemas)
- No business logic in client components
- Multi-tenant: every query includes garage_id (from session, never from client)
- Test each phase before moving to the next
- Update the master tracker in MASTER_PLAN.md as you complete each phase
- Mark completed items with [x] in the checklists
```
