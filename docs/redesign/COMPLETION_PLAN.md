# COMPLETION_PLAN.md — Feature completion audit & execution plan

> **⚠️ STATUS (2026-04-14): SUPERSEDED.** This document is kept as an audit trail only. All its items are rolled into `MASTER_PLAN.md` which is the single source of truth. Read that one.

> **Context:** Full CRUD audit on 2026-04-12 compared every page and action file against `dudley-requirements-v1.md`. Several features have backend actions but no UI, and some CRUD operations are entirely missing. This plan closes every gap.

> **Depends on:** BUGFIX_PLAN.md (B1 + B2) should be fixed first. FEATURE_GAP_PLAN.md (G1–G5) should be tested first.

---

## Completion tracker

| # | Feature | Req ref | Backend | UI | Priority |
|---|---------|---------|---------|-----|----------|
| C1 | Sidebar active state (B2 fix) | UX | N/A | BROKEN | CRITICAL |
| C2 | Kiosk booking (B1 fix) | §4.12 | DONE | BROKEN | CRITICAL |
| C3 | Tech job detail page (start/pause/complete work) | §4.7 | DONE | MISSING | CRITICAL |
| C4 | Request approval button on job page | §4.8 | DONE | MISSING | CRITICAL |
| C5 | Promote booking to job | §4.12, U10 | MISSING | MISSING | HIGH |
| C6 | Edit customer form | §4.2 | DONE | MISSING | HIGH |
| C7 | Edit job (description, ETA, bay, techs from detail page) | §4.4 | PARTIAL | MISSING | HIGH |
| C8 | Edit/delete parts on a job | §4.9 | MISSING | MISSING | MEDIUM |
| C9 | Void warranty button | §4.15 | DONE | MISSING | MEDIUM |
| C10 | Job status change from detail page | §4.4 | DONE | MISSING | HIGH |
| C11 | Customers "has open job" filter | §4.2, U2 | MISSING | MISSING | LOW |
| C12 | Vehicle soft-delete | GDPR | MISSING | MISSING | LOW |

---

## Phase C1 — Sidebar active state fix

**Root cause:** `x-next-pathname` header never set; `pathname` always falls back to `/app`.

**Fix:**

1. Create `src/components/app/sidebar-nav.tsx`:

```tsx
"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import type { StaffRole } from "@/lib/auth/session";

export function SidebarNav({ role }: { role: StaffRole }) {
  const pathname = usePathname();
  return <Sidebar role={role} currentPath={pathname} />;
}
```

2. In `src/app/(app)/layout.tsx`:
   - Replace `import { Sidebar }` with `import { SidebarNav }`
   - Replace `<Sidebar role={session.role} currentPath={pathname} />` with `<SidebarNav role={session.role} />`
   - Remove the `const headersList = await headers()` and `const pathname = ...` lines
   - Remove the `import { headers } from "next/headers"` import

3. **Test:** Navigate to Jobs → sidebar highlights Jobs. Navigate to Vehicles → sidebar highlights Vehicles.

---

## Phase C2 — Kiosk booking fix

**See BUGFIX_PLAN.md B1 for full diagnosis steps.**

**Quick summary:** The most likely cause is the tablet was never paired. Fix:

1. Log in as manager on the test browser
2. Go to `/app/settings` → click "Pair This Tablet"
3. Navigate to `/kiosk` → try submitting again
4. If it still fails, check DevTools Network tab for the actual HTTP status and error body

---

## Phase C3 — Tech job detail page (CRITICAL)

**Requirement §4.7:** "Technicians log work from their phones — Start Work, Pause, Complete. Time is tracked automatically."

**What exists:**
- `src/app/(app)/app/tech/page.tsx` — lists assigned jobs as cards (read-only)
- `src/app/(app)/app/jobs/work-logs/actions.ts` — `startWork()`, `pauseWork()`, `completeWork()` all implemented
- No `/app/tech/job/[id]` page exists

**What to build:** `src/app/(app)/app/tech/job/[id]/page.tsx`

**UI spec (from DESIGN_SYSTEM.md §4.3 + AUDIT_PROMPT U4):**
- Job number + status badge at top
- Vehicle reg plate + make/model
- Customer name + phone (tap to call)
- **Primary action button** — context-dependent:
  - If no active work log → "Start Work" (big green button)
  - If work in progress → "Pause" (amber) + "Complete Job" (green)
- **Task type picker** — dropdown or chips: Diagnosis, Engine, Brakes, Electrical, Suspension, Tyres, MOT Test, Testing, Other
- **Description field** — optional text for what you're doing
- **Timer** — shows elapsed time since `started_at`, updates every second (client-side, server is source of truth for start time)
- **Work log history** — list of previous logs for this job (read-only)
- **Request Approval button** (links to C4 below)

**Actions to wire:**
- Start → calls `startWork({ jobId, taskType, description })`
- Pause → calls `pauseWork({ workLogId })`
- Complete → calls `completeWork({ workLogId })` then optionally update job status

**Touch targets:** Min 48×48px. Primary button should be full-width, 64px tall. 300ms press-and-hold on destructive actions.

---

## Phase C4 — Request approval button

**Requirement §4.8:** "One-tap customer approval for extra work — they tap a button on their phone."

**What exists:**
- `src/app/(app)/app/jobs/approvals/actions.ts` — `requestApproval()` fully implemented (validates state, generates HMAC token, sends SMS)
- No UI button anywhere to trigger it

**What to build:**

1. **On the tech job detail page (C3):** Add a "Request Customer Approval" button
   - Opens a dialog/bottom sheet with: description text field + amount (£) keypad
   - On submit → calls `requestApproval({ jobId, description, amountPence })`
   - Shows success toast "SMS sent to customer"

2. **On the manager job detail page** (`/app/jobs/[id]`): Add the same button in the approval section
   - Only visible if job status is `in_diagnosis` or `in_repair`

---

## Phase C5 — Promote booking to job

**Requirement §4.12:** "Booking lands straight in your system as a draft job card."
**AUDIT_PROMPT U10:** "Promote to job button: opens the New Job wizard pre-filled with booking data."

**What exists:**
- `src/app/(app)/app/bookings/page.tsx` — lists unpromoted bookings (read-only)
- No action to promote

**What to build:**

1. **Server action** `promoteBookingToJob()` in `src/app/(app)/app/jobs/actions.ts`:
   - Takes `bookingId`
   - Finds or creates customer by phone (dedup by phone)
   - Finds or creates vehicle by registration
   - Creates job (via `create_job` RPC) linked to customer + vehicle
   - Updates booking: sets `job_id` to the new job
   - Returns the new job ID

2. **UI on bookings page:** Add a "Create Job" button per booking row
   - Could either call `promoteBookingToJob()` directly (one-click), or
   - Link to `/app/jobs/new?bookingId=...` and pre-fill the form from booking data

3. **Duplicate detection:** If a customer with that phone already exists, link to existing customer instead of creating a new one

---

## Phase C6 — Edit customer form

**What exists:**
- `updateCustomer()` in `src/app/(app)/app/customers/actions.ts` — full update support
- No edit UI

**What to build:**

1. On `/app/customers/[id]` — add an "Edit" button next to the customer name
2. Opens an inline form or dialog pre-filled with current values (name, phone, email, address, postcode, notes)
3. On save → calls `updateCustomer({ id, ...fields })`
4. Revalidates the page

---

## Phase C7 — Edit job from detail page

**What to build on `/app/jobs/[id]`:**

1. **Edit description/ETA:** Inline edit (click pencil icon → text field appears → save)
   - Needs a new server action `updateJobDetails({ jobId, description?, estimatedReadyAt? })`

2. **Change bay:** Dropdown selector on the "Bay & Team" card
   - Already has `assignBay()` action — just needs UI

3. **Assign/remove techs:** Add/remove buttons on the "Bay & Team" card
   - Already has `assignTech()` and `unassignTech()` — just needs UI with a staff picker

4. **Add parts:** Button that opens the parts form (add part with file upload)
   - `addJobPart()` action already exists — needs a form component

---

## Phase C8 — Edit/delete parts

**What to build:**

1. **Server actions** in `jobs/parts/actions.ts`:
   - `updateJobPart({ partId, ...fields })` — update description, quantity, price, etc.
   - `deleteJobPart({ partId })` — hard delete (parts aren't customer PII, no soft-delete needed)

2. **UI on job detail page:** Edit/delete icons per part row
   - Edit opens inline form or dialog
   - Delete shows confirmation dialog

---

## Phase C9 — Void warranty button

**What exists:** `voidWarranty()` action in `warranties/actions.ts` — fully implemented with audit log.

**What to build:** On `/app/warranties` page or on the job/vehicle detail — add a "Void" button per active warranty that:
- Opens a dialog asking for a reason
- Calls `voidWarranty({ warrantyId, reason })`
- Refreshes the list

---

## Phase C10 — Job status change from detail page

**What exists:** `updateJobStatus()` in `actions.ts` — state machine enforced.

**What to build on `/app/jobs/[id]`:** A status dropdown or button group showing valid next states.
- If `draft` → can move to `in_diagnosis`
- If `in_diagnosis` → can move to `in_repair`, `awaiting_customer_approval`, `awaiting_parts`
- If `in_repair` → can move to `completed`, `awaiting_customer_approval`, `awaiting_parts`
- etc.
- Show only valid transitions as buttons
- Confirm destructive transitions (cancel, complete)

---

## Phase C11 — Customer "has open job" filter

**What to build:** On `/app/customers` page, add a toggle/chip "Has open job" that filters customers who have at least one job with status not in (completed, cancelled).

Requires a subquery or join in the Supabase query.

---

## Phase C12 — Vehicle soft-delete

**What to build:**
1. `softDeleteVehicle()` action — sets `deleted_at`
2. Button on vehicle detail page (with confirmation)
3. Ensure all vehicle queries filter `deleted_at IS NULL` (most already do)

---

## Execution order

```
C1 (sidebar fix, 5 min)
→ C2 (kiosk fix, 10 min)
→ C3 (tech job detail, 2-3 hours — LARGEST item)
→ C4 (approval button, 30 min — builds on C3)
→ C10 (job status change, 30 min)
→ C7 (edit job details, 1 hour)
→ C5 (promote booking, 1 hour)
→ C6 (edit customer, 30 min)
→ C8 (edit/delete parts, 45 min)
→ C9 (void warranty, 15 min)
→ C11 (customer filter, 15 min)
→ C12 (vehicle delete, 15 min)
```

**Total estimate:** ~7-8 hours of focused work.

**Critical path:** C1 → C2 → C3 → C4 → C10. These are the features that make the app actually usable day-to-day. The rest are polish.

---

## Kickstart prompt

```
You are completing the Oplaris Automotive project. A full audit found that many features have backend actions but no UI.

## Before you start

1. Read `CLAUDE.md` (project root) — architecture rules
2. Read `docs/redesign/COMPLETION_PLAN.md` — this is your execution plan
3. Read `docs/redesign/DESIGN_SYSTEM.md` — UI specs for each screen
4. Read `dudley-requirements-v1.md` — what was promised to the client

## What to do

Execute COMPLETION_PLAN.md phases C1 through C12 in order.

**C1** (sidebar fix): Create `src/components/app/sidebar-nav.tsx` as a "use client" wrapper using `usePathname()`. Update `src/app/(app)/layout.tsx` to use it. Remove the header-based pathname reading.

**C2** (kiosk fix): Check if `kiosk_device` cookie exists. If not, pair the tablet by POSTing to `/api/kiosk/pair` as a logged-in manager. Then re-test kiosk booking.

**C3** (tech job detail — BIGGEST item): Build `src/app/(app)/app/tech/job/[id]/page.tsx`. This is the screen technicians use all day. It needs: job info, vehicle reg, customer (tap-to-call), Start/Pause/Complete buttons wired to work-log actions, task type picker, elapsed timer, and work history. Follow DESIGN_SYSTEM.md §4.3 for the mobile-first layout. Touch targets min 48px.

**C4** (approval request): Add a "Request Customer Approval" button to both the tech job detail (C3) and the manager job detail page. Opens a dialog with description + amount. Calls `requestApproval()` from `jobs/approvals/actions.ts`.

**C5–C12**: Follow the plan. Each phase describes what backend exists, what UI is missing, and what to build.

## Rules
- Before touching any UI, read the relevant section of DESIGN_SYSTEM.md
- Every form must use react-hook-form + zod validation (shared client+server)
- No business logic in client components
- Test each phase before moving to the next
- Update the completion tracker in COMPLETION_PLAN.md as you finish each phase
```
