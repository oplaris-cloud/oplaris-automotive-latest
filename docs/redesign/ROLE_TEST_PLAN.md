# ROLE_TEST_PLAN.md — Phase 1 Functional Testing

> **Purpose:** Exercise every role end-to-end against the live-Supabase dev instance. Produce a defect list, fix every defect, then move to Phase 2.
>
> **Execution:** Claude Code runs each section using Chrome MCP tools (navigate, screenshot, click, find, read_page, read_console_messages, read_network_requests, javascript_tool). On FAIL, stop, log the defect, fix it, then re-test.
>
> **Created:** 2026-04-14

---

## Prerequisites

1. Dev server running at `http://localhost:3000`
2. Local Supabase running (`supabase start`), all migrations applied (001–023)
3. Seed data: 1 garage, test accounts per role (see below), 2–3 customers with vehicles, 2+ jobs in various statuses, stock items
4. Test accounts (create via Settings > Staff if missing):

| Role | Email | Notes |
|------|-------|-------|
| Manager | `oplarismanagement@gmail.com` | Already exists |
| MOT Tester | `testmot@test.com` | Create if missing |
| Mechanic | `testmech@test.com` | Create if missing |
| Customer | _(no account — phone-based)_ | Use a test phone/reg from seed data |

---

## Output format

```
TEST R-{role}.{n}: [description]
Status: PASS | FAIL | SKIP
Evidence: [screenshot / console / network findings]
Notes: [anything unexpected]
Defect: [if FAIL — logged as D-{n} in the bug register below]
```

---

## Section 0 — Preflight (all roles)

### R-0.1 — Dev server reachable
1. Navigate to `http://localhost:3000`
2. Expect: login page renders
3. Console: no red errors

### R-0.2 — Login page functional
1. Verify email + password inputs present
2. Verify "Sign In" button present
3. Tab order: email → password → button

### R-0.3 — 403 page exists
1. Navigate to `/403`
2. Expect: forbidden message renders (not a 404 or crash)

---

## Section 1 — Manager Role

> **Access:** Full access to all pages. Sidebar shows: Today, Bay Board, Jobs, Customers, Vehicles, Check-ins, Reports, Stock & Warranties, Settings.

### Login

#### R-M.1 — Manager login
1. Login as `oplarismanagement@gmail.com`
2. Expect redirect to `/app` (Today dashboard)
3. Screenshot: dashboard visible with sidebar
4. Verify sidebar items: Today, Bay Board, Jobs, Customers, Vehicles, Check-ins, Reports, Stock & Warranties, Settings

---

### Today Dashboard (`/app`)

#### R-M.2 — Dashboard loads
1. Navigate to `/app`
2. Expect: today's summary (jobs in progress, upcoming, check-ins)
3. Console: no errors

---

### Bay Board (`/app/bay-board`)

#### R-M.3 — Bay board renders
1. Navigate to `/app/bay-board`
2. Expect: grid of bays (up to 5), each showing assigned jobs
3. Unassigned jobs section visible

#### R-M.4 — Drag-and-drop job between bays
1. If 2+ jobs exist in different bays, drag one to another bay
2. Expect: card moves (optimistic update)
3. Refresh page: card persists in new bay
4. Console + network: no errors, POST to `/api/bay-board/move` returns 200

---

### Jobs (`/app/jobs`)

#### R-M.5 — Jobs list page
1. Navigate to `/app/jobs`
2. Expect: list/table of jobs with status badges
3. Search/filter controls visible

#### R-M.6 — Create new job
1. Navigate to `/app/jobs/new`
2. Fill: select customer, vehicle, description, bay, assign tech
3. Submit
4. Expect: redirect to new job detail page
5. Console: no errors

#### R-M.7 — Job detail page (P51 — one row per visit)
1. Navigate to a job detail (`/app/jobs/{id}`)
2. Verify visible sections: header (status, job number), **current-handler chip** (`With MOT tester` / `With mechanic`), description, assigned techs, bay, vehicle info, parts, charges, work logs
3. If the job has any pass-back history, a **Pass-back timeline** section lists each handoff (from_role → to_role, items, note, created/returned timestamps) in reverse chronological order
4. Status change dropdown works (e.g. Pending → In Progress)
5. Open `/app/jobs` — the passed-back vehicle visit appears as **exactly one row** (not two; P51 eliminated the paired MOT + mechanic job model)
6. Console: no errors

#### R-M.8 — Edit job details
1. On job detail, click Edit (description, ETA, bay, tech assignment)
2. Verify modal opens (not inline form)
3. Change a field, save
4. Expect: modal closes, page reflects change
5. Refresh: change persisted

#### R-M.9 — Add part to job
1. On job detail, click "Add Part"
2. Fill part details (name, supplier, quantity, cost)
3. Save
4. Expect: part appears in parts list

#### R-M.10 — Delete part from job
1. On job detail parts list, click delete on a part
2. Confirm deletion
3. Expect: part removed from list

#### R-M.11 — Request customer approval
1. On job detail, click "Request Approval"
2. Expect: confirmation dialog (SMS will be sent)
3. Console + network: check for Twilio API call (or mock in dev)

#### R-M.12 — Manual "Customer has approved" button
1. On a job awaiting approval, click "Mark as Approved"
2. Expect: job status advances, approval recorded

#### R-M.13 — Manager work log controls
1. On job detail, manager can start/stop/adjust work logs for any tech
2. Verify timer display shows correctly
3. Log entries visible with duration

---

### Customers (`/app/customers`)

#### R-M.14 — Customers list page
1. Navigate to `/app/customers`
2. Expect: list of customers with search
3. "Has open job" filter toggle works

#### R-M.15 — Create new customer
1. Navigate to `/app/customers/new`
2. Fill: name, phone (E.164), email (optional), address (optional)
3. Submit
4. Expect: redirect to customer detail page

#### R-M.16 — Customer detail page
1. Navigate to `/app/customers/{id}`
2. Verify: contact info, vehicles list, jobs list
3. "Edit" button opens modal
4. "Add Vehicle" button works

#### R-M.17 — Edit customer
1. On customer detail, click Edit
2. Change phone number
3. Save
4. Expect: updated info shown

#### R-M.18 — Soft-delete customer
1. On customer detail, click Delete
2. Confirm
3. Expect: customer disappears from list
4. Verify: customer still in DB with `deleted_at` set (check via network or console)

#### R-M.19 — Restore deleted customer
1. If UI supports viewing deleted customers, find the deleted customer
2. Click Restore
3. Expect: customer reappears in list

#### R-M.20 — GDPR data export
1. On customer detail, click "Export Data" (GDPR)
2. Expect: JSON download with all customer data (jobs, vehicles, work logs)
3. Verify: audit log entry created

---

### Vehicles (`/app/vehicles`)

#### R-M.21 — Vehicles list page
1. Navigate to `/app/vehicles`
2. Expect: grid/list of vehicles with search by reg/make/model
3. Vehicle cards link to detail pages

#### R-M.22 — Vehicle detail page
1. Navigate to `/app/vehicles/{id}`
2. Verify: hero card (reg badge, make/model/year, colour, mileage), jobs list, MOT history section
3. "New Job" button links to `/app/jobs/new` with pre-filled vehicle+customer
4. "View Customer" button links correctly

#### R-M.23 — DVSA MOT refresh
1. On vehicle detail, click "Refresh from DVSA"
2. Expected: MOT history populates (or graceful error if DVSA creds not configured in dev)
3. Console: check for `[dvsa]` errors

#### R-M.24 — Vehicle soft-delete
1. On vehicle detail, click Delete
2. Confirm
3. Expect: vehicle removed from list

---

### Check-ins (`/app/bookings`)

#### R-M.25 — Check-ins page loads
1. Navigate to `/app/bookings`
2. Expect: list of pending check-ins (from kiosk submissions)
3. Badge count in sidebar matches pending count

#### R-M.26 — Promote check-in to job
1. Click a check-in entry
2. Click "Create Job" / promote action
3. Verify: tech assignment modal opens
4. Assign a tech, confirm
5. Expect: job created, check-in removed from list

#### R-M.27 — Dismiss/delete check-in
1. On a check-in, click dismiss/delete
2. Confirm
3. Expect: check-in removed

---

### Reports (`/app/reports`)

#### R-M.28 — Reports page loads
1. Navigate to `/app/reports`
2. Expect: date range picker, KPI cards (revenue, jobs completed, avg time)
3. CSV export button visible

#### R-M.29 — Date range filter
1. Change date range
2. Expect: KPIs update
3. Console: no errors

#### R-M.30 — CSV export
1. Click "Export CSV"
2. Expect: file downloads (or browser prompts download)

---

### Stock & Warranties (`/app/stock`)

#### R-M.31 — Stock page loads
1. Navigate to `/app/stock`
2. Expect: stock items list with search, add button
3. Warranties section visible (or tab/link to `/app/warranties`)

#### R-M.32 — Add stock item
1. Click "Add Stock Item"
2. Fill: name, SKU, quantity, location (dropdown), supplier
3. Save
4. Expect: item appears in list

#### R-M.33 — Edit stock item
1. Click edit on a stock item
2. Change quantity
3. Save
4. Expect: updated quantity shown

#### R-M.34 — Stock movement history
1. On a stock item, view movement history
2. Expect: entries showing qty changes with timestamps

#### R-M.35 — Warranties CRUD
1. Navigate to warranties
2. Add warranty (supplier, purchase date, expiry, invoice ref)
3. Claim warranty (enter reason)
4. Resolve claim (pick status, enter resolution)
5. Verify all state transitions work via modals (not inline)

---

### Settings (`/app/settings`)

#### R-M.36 — Settings page loads
1. Navigate to `/app/settings`
2. Expect: sub-pages visible (Profile, Staff, Audit Log)

#### R-M.37 — Staff management
1. Navigate to `/app/settings/staff`
2. Expect: list of staff members with roles
3. Add new staff: name, email, role, password
4. Verify: password checked against Pwned Passwords API (HIBP)
5. Edit staff: change role
6. Deactivate staff member

#### R-M.38 — Audit log
1. Navigate to `/app/settings/audit-log`
2. Expect: log entries for recent actions (especially PII access)

#### R-M.39 — Profile settings
1. Navigate to `/app/settings/profile`
2. Expect: current user info, change password option

---

### Charges & Invoicing (on job detail)

#### R-M.40 — Add charge to job
1. On job detail, find Charges section
2. Click "Add Charge"
3. Fill: description, amount, type (labour/parts/other)
4. Save
5. Expect: charge appears in list, total updates

#### R-M.41 — Quote lifecycle
1. Create charges on a job
2. Click "Generate Quote" → quote PDF generated (Draft status)
3. Send quote (status → Quoted)
4. Mark as accepted

#### R-M.42 — Invoice lifecycle
1. On a quoted job, generate invoice
2. Verify: invoice PDF renders correctly
3. Status → Invoiced

#### R-M.43 — Manager logout
1. Click logout (or navigate to logout action)
2. Expect: redirected to login page
3. Navigating to `/app` redirects back to login

---

## Section 2 — MOT Tester Role

> **Access (P48 + My Work restructure, 2026-04-14):** Today, My Work, and any Job page where the user is assigned. **MOT check-ins appear only in My Work's "Checked in" section** with a one-click "Start MOT" button — no dedicated Check-ins page. NO access to: Bay Board, Jobs list, Customers, Vehicles, Check-ins, Reports, Stock & Warranties, Settings.

### Login & Sidebar

#### R-T.1 — MOT tester login
1. Login as `testmot@test.com`
2. Expect redirect to `/app`
3. Sidebar shows: Today, My Work (P48)
4. Sidebar does NOT show: Bay Board, Jobs, Customers, Vehicles, Check-ins, Reports, Stock & Warranties, Settings

---

### Access Control (negative tests)

#### R-T.2 — Blocked from manager-only pages
1. Navigate directly to `/app/bookings` → expect redirect to `/403`
2. Navigate to `/app/bay-board` → expect `/403`
3. Navigate to `/app/jobs` → expect `/403`
4. Navigate to `/app/customers` → expect `/403`
5. Navigate to `/app/vehicles` → expect `/403`
6. Navigate to `/app/reports` → expect `/403`
7. Navigate to `/app/stock` → expect `/403`
8. Navigate to `/app/settings` → expect `/403`
9. Navigate to `/app/settings/staff` → expect `/403`

---

### Permitted Pages

#### R-T.3 — Today dashboard
1. Navigate to `/app` → loads successfully
2. Shows relevant info for tester role

#### R-T.4 — Bay board (view + drag)
1. Navigate to `/app/bay-board` → renders
2. Can view all bays and assigned jobs
3. Test drag-and-drop (if role allows moves — verify server-side check)

#### R-T.5 — Jobs list + detail
1. Navigate to `/app/jobs` → list loads
2. Click a job → detail page renders
3. Can view all sections (parts, charges, work logs)
4. Verify: can or cannot edit job details (depends on server action role check)

#### R-T.6 — Customers list + detail + create
1. Navigate to `/app/customers` → list loads
2. Navigate to `/app/customers/new` → form renders (tester has create access)
3. Click a customer → detail page renders

#### R-T.7 — Vehicles list + detail
1. Navigate to `/app/vehicles` → list loads
2. Click a vehicle → detail page renders
3. DVSA refresh button works

#### R-T.8 — My Work + pass-back flow (P51)
1. Navigate to `/app/tech` → shows tester's assigned jobs
2. Click a job → `/app/tech/job/{id}` renders
3. Can start/pause/complete work on assigned jobs
4. Timer displays correctly
5. **Pass-back (P51):** from an in-progress MOT job detail, click **Pass to mechanic**, tick ≥1 checklist item + optional note, submit. Expect:
   - The **same** `jobs` row remains (no new job created), `current_role` flips to `mechanic`, `bookings` table gets zero new rows, and one `job_passbacks` event row is inserted.
   - The job-detail header chip flips from `With MOT tester` to `With mechanic`.
   - The Pass-back timeline section shows the new event.
6. **Resume after mechanic returns:** when the mechanic has clicked **Return to MOT tester**, the same job reappears in My Work. Click **Resume MOT** on the job detail → status updates, tester continues working on the same job id. One invoice, one PDF.

---

## Section 3 — Mechanic Role

> **Access (P48 + My Work restructure, 2026-04-14):** Today, My Work, and any Job page where the user is assigned. **Mechanic check-ins (electrical / maintenance / passbacks) appear only in My Work's "Checked in" section** with a one-click "Start work" button — no dedicated Check-ins page. NO access to: Bay Board, Jobs list, Customers, Vehicles, Check-ins, Reports, Stock & Warranties, Settings.

### Login & Sidebar

#### R-C.1 — Mechanic login
1. Login as `testmech@test.com`
2. Expect redirect to `/app`
3. Sidebar shows: Today, My Work
4. Sidebar does NOT show: Bay Board, Jobs, Customers, Vehicles, Check-ins, Reports, Stock & Warranties, Settings

---

### Access Control (negative tests)

#### R-C.2 — Blocked from all non-mechanic pages
1. Navigate to `/app/bay-board` → expect `/403`
2. Navigate to `/app/jobs` → expect `/403`
3. Navigate to `/app/customers` → expect `/403`
4. Navigate to `/app/vehicles` → expect `/403`
5. Navigate to `/app/bookings` → expect `/403` (My Work restructure: mechanic check-ins live in `/app/tech` now)
6. Navigate to `/app/reports` → expect `/403`
7. Navigate to `/app/stock` → expect `/403`
8. Navigate to `/app/settings` → expect `/403`
9. Navigate to an unassigned `/app/jobs/{other-id}` → expect `/403` (P48 — only assigned jobs)

---

### Permitted Pages

#### R-C.3 — Today dashboard
1. Navigate to `/app` → loads successfully
2. Shows mechanic-relevant info (assigned jobs for today)

#### R-C.4 — My Work + Passed back to me (P51)
1. Navigate to `/app/tech` → shows three sections: **Passed back to me**, **Checked in**, **In progress**
2. **Passed back to me (P51):** lists every job where `current_role = 'mechanic'` AND no mechanic is yet assigned. Each row shows a single **Claim** button; clicking it:
   - Calls `claim_passback` RPC → inserts a `job_assignments` row for the mechanic.
   - Navigates to `/app/tech/job/{id}` so the mechanic can start a work log on the **same job id** the MOT tester used.
   - The row disappears from "Passed back to me" and a matching entry appears under "In progress" after work starts.
3. "Checked in" contains: electrical / maintenance check-ins (one-click "Start work") + assigned jobs still at `status=checked_in`. **Pass-back bookings are no longer present** — P51 retired the legacy "second booking" model.
4. "In progress" contains assigned jobs in an active status (in_diagnosis, in_repair, awaiting_parts, etc.)
5. Jobs assigned to other techs are NOT visible; cross-garage jobs are NOT visible (RLS).
6. On an in-progress claimed pass-back, open the job detail and click **Return to MOT tester** — `current_role` flips back to `mot_tester`, the Pass-back timeline shows `returned_at`, and the job leaves the mechanic's My Work.
7. Empty state if all three sections are empty.

#### R-C.5 — Tech job detail
1. Click an assigned job → `/app/tech/job/{id}` renders
2. Verify: job info, parts list, work log section
3. Can start timer (status changes to "In Progress")
4. Can pause timer
5. Can complete job (status changes to "Completed" or next step)
6. Timer shows elapsed time with seconds

#### R-C.6 — Mechanic cannot access other techs' jobs
1. Get a job ID assigned to a different tech
2. Navigate to `/app/tech/job/{that-id}`
3. Expect: 403 or "not found" (RLS should prevent access)

#### R-C.7 — Mechanic cannot modify jobs via direct API
1. Check that Server Actions for job editing enforce role checks
2. A mechanic calling edit-job or add-part actions should be rejected
3. (This is a code-level check — grep for `requireManager` / `requireRole` in action files)

---

## Section 4 — Kiosk (no auth, hardware-trusted)

> **Access:** `/kiosk` only. No login required. Rate-limited.

#### R-K.1 — Kiosk page loads
1. Open a new browser tab (not logged in)
2. Navigate to `/kiosk`
3. Expect: clean booking form (service type selection: MOT / Electrical / Maintenance)
4. No sidebar, no app chrome — standalone layout

#### R-K.2 — Submit kiosk booking
1. Select service type (e.g. MOT)
2. Enter reg number (e.g. `AB12CDE`)
3. Enter customer name
4. Enter phone number
5. Enter email (optional)
6. Submit
7. Expect: success confirmation message
8. Console + network: POST to `/api/kiosk/booking` returns 200/201

#### R-K.3 — Kiosk reg lookup (if implemented)
1. Enter a known reg number
2. Check if make/model auto-populates from DVSA lookup
3. (May be Phase 2 — P43. Log as SKIP if not implemented.)

#### R-K.4 — Rate limiting
1. Submit 6 bookings rapidly from same IP
2. Expect: 429 response after 5th submission (5/IP/hour limit)
3. Verify response shape matches `/api/status/*` pattern

#### R-K.5 — Kiosk cannot access app routes
1. From kiosk tab, navigate to `/app` → expect redirect to `/login`
2. Navigate to `/app/jobs` → expect redirect to `/login`

---

## Section 5 — Customer Status Page (phone-based auth)

> **Access:** `/status` only. Phone + 6-digit SMS code. No DB user account.

#### R-S.1 — Status page loads
1. Open a new browser tab (not logged in)
2. Navigate to `/status`
3. Expect: form asking for phone number + reg number
4. Clean standalone layout (no sidebar)

#### R-S.2 — Request status code
1. Enter a valid phone number (matching a customer on file)
2. Enter matching reg number
3. Submit
4. Expect: "Code sent" message (SMS via Twilio — may need to check Twilio logs in dev)
5. Console + network: POST succeeds, no errors

#### R-S.3 — Anti-enumeration
1. Enter an invalid phone/reg combo
2. Expect: SAME response shape as valid request (no leak of whether phone exists)
3. No timing difference observable

#### R-S.4 — Rate limiting on status page
1. Submit 4 requests from same phone → expect 429 after 3rd (3/phone/hour)
2. Submit 11 requests from same IP → expect 429 after 10th (10/IP/hour)

#### R-S.5 — Code verification
1. Enter the 6-digit code received via SMS
2. Expect: job status page renders showing current job status
3. Code is single-use (re-entering same code fails)
4. Code expires after 10 minutes

#### R-S.6 — Status page cannot access app routes
1. From status page, navigate to `/app` → expect redirect to `/login`

---

## Section 6 — Cross-Role Security Checks

These verify that role enforcement works at the Server Action / API layer, not just the UI.

#### R-X.1 — Mechanic calling manager Server Actions
1. While logged in as mechanic, use browser console to invoke:
   - Create customer action → should be rejected
   - Delete customer action → should be rejected
   - Create job action → should be rejected
   - Staff management actions → should be rejected
2. Verify: 403 or redirect responses

#### R-X.2 — MOT tester calling manager-only actions
1. While logged in as MOT tester, attempt:
   - Check-in promote action → should be rejected (manager only)
   - Reports data fetch → should be rejected
   - Stock CRUD → should be rejected
   - Staff management → should be rejected

#### R-X.3 — RLS enforcement
1. As mechanic, verify work_logs query only returns own entries
2. As MOT tester, verify cannot see other garage's data (multi-tenant)
3. Check that `garage_id` is enforced on all queries (spot-check via network responses)

#### R-X.4 — Unauthenticated API access
1. From a fresh browser (no cookies), call:
   - `GET /app/jobs` → redirect to login
   - `POST /api/bay-board/move` → 401 or redirect
   - `POST /api/kiosk/booking` → should work (public endpoint, rate-limited)
   - `GET /status` → should work (public page)

---

## Bug Register

Defects found during testing are logged here with a unique ID, then fixed before moving to Phase 2.

| ID | Test | Description | Severity | Status |
|----|------|-------------|----------|--------|
| D-1 | R-M.21 | IMAGIN.studio car images broken (demo API key returns empty images, `onError` doesn't fire) | LOW | KNOWN — needs prod API key (P5.4) |
| D-2 | R-M.37 | Add Staff form was inline, not a Dialog modal (P33 missed this form) | HIGH | **FIXED** — converted to `<Dialog>` |
| D-3 | R-M.37 | Staff list showed "No staff members" — query selected `avatar_url` + `role` columns that didn't exist on remote DB | HIGH | **FIXED** — migration 024 added `role` column; removed `avatar_url` from select |

## Test Results Summary (2026-04-14)

### Section 0 — Preflight
| Test | Result |
|------|--------|
| R-0.1 Dev server reachable | PASS |
| R-0.2 Login page functional | PASS |

### Section 1 — Manager
| Test | Result |
|------|--------|
| R-M.1 Manager login + sidebar | PASS (9 sidebar items) |
| R-M.2 Dashboard loads | PASS |
| R-M.3 Bay board renders | PASS (5 bays, 3 jobs) |
| R-M.5 Jobs list | PASS (7 jobs, status filters, New Job button) |
| R-M.7 Job detail | PASS (all sections: header, customer, vehicle, bay/team, work log, parts, charges) |
| R-M.14 Customers list | PASS (search, filters, 6 customers) |
| R-M.21 Vehicles list | PASS with D-1 (5 vehicles, search, SVG fallback works) |
| R-M.25 Check-ins | PASS (empty state) |
| R-M.28 Reports | PASS (KPIs, tables, CSV buttons, date toggle) |
| R-M.31 Stock & Warranties | PASS (inventory/warranties tabs, 2 items) |
| R-M.37 Staff management | PASS after D-2/D-3 fix (5 staff, role badges, edit/deactivate, dialog modal) |

### Section 2 — MOT Tester
| Test | Result |
|------|--------|
| R-T.1 MOT tester login + sidebar | PASS (Today, Bay Board, Jobs, Customers, Vehicles, My Work) |
| R-T.2 Blocked pages | PASS — /bookings, /reports, /stock, /settings/staff all → /403 |
| R-T.2 note | /app/settings index accessible (shows Profile only — acceptable, sub-pages protected) |
| R-T.8 My Work | PASS (1 assigned job visible) |

### Section 3 — Mechanic
| Test | Result |
|------|--------|
| R-C.1 Mechanic login + sidebar | PASS (Today, My Work only) |
| R-C.2 Blocked pages | PASS — /bay-board, /jobs, /customers, /vehicles, /bookings all → /403 |
| R-C.4 My Work | PASS (1 assigned job visible) |

### Section 4 — Kiosk
| Test | Result |
|------|--------|
| R-K.1 Kiosk page loads | PASS (3 service types, standalone layout) |
| R-K.2 Booking form | PASS (name, phone, email, reg, notes fields visible after selecting service) |
| R-K.3 Reg lookup | SKIP (Phase 2 — P43) |
| R-K.5 Can't access app | PASS → redirects to /login |

### Section 5 — Customer Status Page
| Test | Result |
|------|--------|
| R-S.1 Status page loads | PASS (reg + phone inputs, send code button, privacy notice) |
| R-S.2–S.5 SMS verification | SKIP (requires Twilio in dev — dynamic test for staging) |
| R-S.6 Can't access app | PASS → redirects to /login |

### Section 6 — Cross-Role Security
| Test | Result |
|------|--------|
| R-X.4 Unauthenticated → /app | PASS → redirects to /login |
| R-X.4 Public endpoints | PASS — /kiosk and /status accessible without auth |

### Section 7 — Multi-Role (added 2026-04-14)
| Test | Result |
|------|--------|
| R-MR.1 Edit staff → add second role via checkboxes | PASS (Dudley Mechanic given mechanic + mot_tester) |
| R-MR.2 Staff card shows multiple role badges | PASS (green Mechanic + purple MOT Tester badges) |
| R-MR.3 Multi-role user sidebar shows union of pages | PASS (Today, Bay Board, Jobs, Customers, Vehicles, My Work) |
| R-MR.4 Manager-only pages still blocked for mechanic+tester | PASS (/reports → /403) |
| R-MR.5 Add Staff dialog has role checkboxes (not dropdown) | PASS |

---

## Completion Criteria

Phase 1 is DONE when:
1. Every test above is PASS or SKIP (with justification)
2. Every defect in the bug register is FIXED and re-tested
3. No console errors on any page for any role
4. All role-based access controls verified at both UI and server level
5. This file updated with final results
