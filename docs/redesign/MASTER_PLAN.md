# MASTER_PLAN.md — Unified feature completion & testing plan

> **Context:** Full audit on 2026-04-12 compared every page, action file, and CRUD operation against `dudley-requirements-v1.md` and the UI plan (`AUDIT_PROMPT.md`). This is the single source of truth for all remaining work. Bugs B1 (kiosk JWT typo) and B2 (sidebar active state) have been fixed separately — see `BUGFIX_PLAN.md` for reference.

> **Last updated:** 2026-04-13 (Part D completed)

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
| P34 | Staff management page in Settings | §4.3 | DONE | DONE | HIGH | **DONE** |
| P35 | Cards vs list views — consistent usage rules | Hossein | — | DONE | MEDIUM | **DONE** |

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

## Kickstart prompt (Part D — current)

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
