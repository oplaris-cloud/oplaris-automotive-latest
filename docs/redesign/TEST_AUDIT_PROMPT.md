# TEST_AUDIT_PROMPT.md — Pre-Deployment Test & Troubleshooting Plan

> **Audience: AI coding assistants (Claude Code).** This is a directive reference — follow these phases in order when testing and troubleshooting the app before deployment. Humans can read this but it's optimised for machine consumption.

**Project:** Oplaris Automotive (Dudley Auto Service)
**Stack:** Next.js 15 App Router · TypeScript strict · self-hosted Supabase (Postgres 15) · Dokploy · Twilio · DVSA MOT API
**Backend spec:** `docs/redesign/BACKEND_SPEC.md`
**Design system:** `docs/redesign/DESIGN_SYSTEM.md`
**Environment:** Local development (pre-deploy). Supabase running via `npx supabase start`.

---

## How to work

For each phase below, follow this exact process:

1. **RUN**: Execute the automated checks or manual test steps listed. Capture every error, warning, and unexpected behaviour.

2. **TRIAGE**: Group findings by severity:
   - 🔴 **Blocker**: Cannot deploy. Security holes, data loss, crashes, broken core workflows.
   - 🟡 **Major**: Degraded experience. Wrong data shown, missing validation, broken secondary features.
   - 🔵 **Minor**: Cosmetic, copy, or code quality issues that don't block go-live.

3. **FIX**: Fix blockers immediately. Fix majors before moving to the next phase. Log minors for post-deploy.

4. **VERIFY**: Re-run the failing check after every fix. Confirm it passes before marking the phase done.

5. **UPDATE TRACKER**: Mark the phase DONE only when ALL blocker and major items are resolved.

## Rules

- Never skip a phase. If a phase has zero findings, mark it DONE and move on — that's a good sign.
- Every fix must be committed individually with a descriptive message. No "fix stuff" commits.
- If a fix in one phase breaks a check in a previous phase, stop and resolve the regression before continuing.
- If blocked on external credentials (Twilio, DVSA), document the skip with `SKIPPED: [reason]` and continue. These must be re-tested in staging.
- Read `CLAUDE.md` and `BACKEND_SPEC.md` before starting. Every fix must comply with the architecture rules.
- Before touching auth, RLS, Twilio, file upload, or the status page → consult `Oplaris-Skills/vibe-security/references/<area>.md`.
- Before touching any UI → consult `Oplaris-Skills/ux-audit/references/<area>.md`.

---

## Phase Tracker

| # | Phase | State | Blocker/Major count | Day |
|---|---|---|---|---|
| T0 | Build & static analysis | CURRENT | — | Pre-deploy |
| T1 | Unit tests | PENDING | — | Pre-deploy |
| T2 | RLS & database integrity | PENDING | — | Pre-deploy |
| T3 | Auth & role enforcement | PENDING | — | Pre-deploy |
| T4 | Core workflow: job lifecycle | PENDING | — | Pre-deploy |
| T5 | Core workflow: customer approval SMS | PENDING | — | Pre-deploy |
| T6 | Core workflow: customer status page | PENDING | — | Pre-deploy |
| T7 | Core workflow: tablet kiosk | PENDING | — | Pre-deploy |
| T8 | Parts, uploads, PDF | PENDING | — | Pre-deploy |
| T9 | M2 features: warranty, stock, DVSA, reports, GDPR | PENDING | — | Pre-deploy |
| T10 | Security hardening | PENDING | — | Pre-deploy |
| T11 | Cross-browser & mobile | PENDING | — | Pre-deploy |
| T12 | E2E Playwright (automated) | PENDING | — | Pre-deploy |
| T13 | Staging deploy dry-run | PENDING | — | Deploy day |

---

## Phase T0 — Build & static analysis

**Goal:** Confirm the app compiles, lints, typechecks, and has no leaked secrets. This catches 80% of problems in 2 minutes.

**Steps (run all sequentially):**

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm audit:secrets
```

**Audit gate:**
- [ ] `pnpm typecheck` exits 0 with no errors
- [ ] `pnpm lint` exits 0 with no errors (warnings acceptable if known)
- [ ] `pnpm build` exits 0 — this catches RSC/SSR/import errors that dev mode hides
- [ ] `pnpm audit:secrets` confirms no `NEXT_PUBLIC_*` holds a secret
- [ ] `grep -r "NEXT_PUBLIC_" .env.local` — only safe keys (SUPABASE_URL, SUPABASE_ANON_KEY, HCAPTCHA_SITE_KEY, APP_URL, STATUS_URL)
- [ ] No source maps in production build (`ls .next/static/chunks/*.map 2>/dev/null` returns empty)

**Troubleshooting:**
- TypeScript errors: fix the type, never `// @ts-ignore` or `as any` unless there's a documented library bug
- Build fails on import: likely a `server-only` module imported in a `"use client"` component. Check the import chain.
- Secret in NEXT_PUBLIC_: move to server-only env immediately, update every file that reads it

---

## Phase T1 — Unit tests

**Goal:** Confirm isolated business logic works correctly.

**Steps:**

```bash
pnpm test:unit
```

**Files tested:**
- `tests/unit/approval-tokens.test.ts` — HMAC token generation, verification, expiry, tamper detection
- `tests/unit/file-validation.test.ts` — MIME check, size check, magic-byte check
- `tests/unit/job-status.test.ts` — Status transition state machine (valid + invalid transitions)
- `tests/unit/pwned-passwords.test.ts` — k-anonymity check against Pwned Passwords API
- `tests/unit/sanity.test.ts` — Basic sanity checks

**Audit gate:**
- [ ] All unit tests pass (0 failures)
- [ ] No skipped tests unless documented with reason
- [ ] Coverage: approval-tokens, file-validation, and job-status files each have > 80% branch coverage

**Troubleshooting:**
- `approval-tokens` failing: check that `APPROVAL_HMAC_SECRET` is set in `.env.local` or the test setup mocks it
- `pwned-passwords` failing: may be a network issue (test calls the real API). Check connectivity. If offline, mark as `SKIPPED: offline` and re-test later.
- `file-validation` failing: check that the `file-type` package version matches what the validation code expects

---

## Phase T2 — RLS & database integrity

**Goal:** Confirm multi-tenant isolation, mechanic isolation, and private schema lockdown against a real Postgres.

**Pre-requisite:** Local Supabase running.

```bash
npx supabase start        # if not already running
npx supabase db reset     # apply all migrations from scratch
pnpm db:seed-dev          # seed Dudley garage + 3 dev users
pnpm test:rls
```

**Files tested:**
- `tests/rls/tenant_isolation.test.ts` — garage A can't read garage B
- `tests/rls/mechanic_isolation.test.ts` — mechanic sees only assigned jobs
- `tests/rls/private_schema.test.ts` — `private.staff_roles` not exposed via PostgREST
- `tests/rls/jobs.test.ts` — job CRUD respects RLS
- `tests/rls/work_logs.test.ts` — work log policies
- `tests/rls/auth_hook.test.ts` — JWT custom claims set correctly

**Audit gate:**
- [ ] All 6 RLS test files pass (0 failures)
- [ ] `supabase db reset` completes with no migration errors
- [ ] `pnpm db:seed-dev` completes with 3 users created
- [ ] Manual check: `select tablename from pg_tables where schemaname='public' and rowsecurity=false;` returns 0 rows
- [ ] Manual check: `select * from private.staff_roles;` via the anon key → permission denied
- [ ] Manual check: update `staff.garage_id` via PostgREST PATCH as authenticated → must fail

**Troubleshooting:**
- Migration fails: read the error carefully. Usually a missing table dependency (ordering) or a duplicate policy name. Fix the migration and `db reset` again.
- RLS test fails with "permission denied": the test JWT may not have the right `app_metadata` claims. Check `tests/rls/fixtures.ts` for the forged JWT structure.
- Seed fails with "user already exists": the seed script should be idempotent. If not, reset the DB first.

---

## Phase T3 — Auth & role enforcement

**Goal:** Confirm login, logout, role-based routing, and session security.

**Pre-requisite:** App running locally (`pnpm dev`), seeded DB.

**Manual test steps:**

1. **Login as manager** (`manager@dudley.local` / `Oplaris-Dev-Password-1!`):
   - [ ] Redirects to `/app` (dashboard)
   - [ ] Sidebar shows all nav items (customers, jobs, bay board, bookings, reports, stock, warranties, settings)
   - [ ] Can access `/app/customers`, `/app/jobs`, `/app/settings`

2. **Login as mechanic** (`mechanic@dudley.local`):
   - [ ] Redirects to `/app/tech` (technician view)
   - [ ] Does NOT see full sidebar (no customers, settings, reports)
   - [ ] Navigating to `/app/customers` manually → redirects to `/403`
   - [ ] Navigating to `/app/settings` manually → redirects to `/403`

3. **Login as MOT tester** (`tester@dudley.local`):
   - [ ] Has appropriate access (similar to mechanic but may see more)
   - [ ] Cannot access manager-only routes

4. **Logout:**
   - [ ] Session cookie cleared
   - [ ] Navigating to `/app` → redirects to `/login`
   - [ ] Back button doesn't restore the session

5. **Session cookies:**
   - [ ] `httpOnly` = true (DevTools → Application → Cookies)
   - [ ] `sameSite` = lax
   - [ ] `secure` = true when on HTTPS (will be false on localhost HTTP — OK)

6. **Password check:**
   - [ ] Try changing password to "password" → rejected (pwned password)
   - [ ] Try changing password to "Ab12345" (< 8 chars) → rejected

**Audit gate:**
- [ ] All 6 manual steps above pass
- [ ] No role can access routes above their permission level
- [ ] JWT claims contain correct `garage_id` and `role` (check via DevTools → Application → Cookies → decode the JWT at jwt.io)

**Troubleshooting:**
- Login redirects to wrong page: check `src/middleware.ts` role routing logic
- 403 not showing: check that the middleware checks `app_metadata.role`, not a client-side field
- JWT missing claims: check the Supabase Auth Hook (migration `005_auth_hook.sql`), confirm the Edge Function is deployed locally

---

## Phase T4 — Core workflow: job lifecycle

**Goal:** Walk through the complete job lifecycle end-to-end as a manager + mechanic in two browser windows.

**Pre-requisite:** Logged in as manager (window 1) and mechanic (window 2). At least one customer + vehicle in the system.

**Manual test steps:**

1. **Manager creates a customer:**
   - [ ] Create customer with phone `+447700900123`, name "Test Customer"
   - [ ] Phone normalises to E.164 format
   - [ ] Duplicate phone → shows conflict, not a crash

2. **Manager creates a vehicle:**
   - [ ] Reg `AB12 CDE` normalises to `AB12CDE` (uppercase, no spaces)
   - [ ] Vehicle appears on customer detail page

3. **Manager creates a job:**
   - [ ] Job number auto-generated (format `DUD-2026-XXXXX`)
   - [ ] Job appears in jobs list and bay board
   - [ ] Status = `draft`

4. **Manager assigns bay + tech:**
   - [ ] Drag to a bay on the bay board OR use the assign dropdown
   - [ ] Assign the mechanic from window 2
   - [ ] **Window 2 (mechanic)**: job appears in "My jobs today" within 2 seconds (Realtime)

5. **Mechanic starts work (window 2):**
   - [ ] Tap "Start work" → task type picker appears
   - [ ] Select task type → timer starts
   - [ ] Job status updates to `in_repair` (manager window sees it move on bay board)

6. **Mechanic pauses and resumes:**
   - [ ] Pause → timer stops, work_log entry gets `ended_at`
   - [ ] Resume → new work_log entry, timer restarts

7. **Mechanic completes work:**
   - [ ] Tap "Complete" → work_log closes
   - [ ] Manager sees updated status

8. **Manager marks ready for collection:**
   - [ ] Status → `ready_for_collection`
   - [ ] SMS prompt appears (skip actual send if no Twilio creds locally)

9. **Manager marks completed:**
   - [ ] Status → `completed`
   - [ ] `completed_at` timestamp set
   - [ ] Optional warranty creation prompt appears

10. **Status transition enforcement:**
    - [ ] Try to go from `completed` back to `in_repair` → blocked
    - [ ] Try to go from `draft` directly to `completed` → blocked

**Audit gate:**
- [ ] Full lifecycle completes without errors
- [ ] Realtime updates visible across windows within 2s
- [ ] Status transitions enforced server-side (not just UI-disabled)
- [ ] Job number is server-generated (check network tab: no `job_number` in the POST body)

**Troubleshooting:**
- Realtime not working: check Supabase Realtime is enabled on the `jobs` table, check `src/lib/realtime/bay-board-channel.ts`
- Status transition allowed when it shouldn't be: check the state machine in `src/lib/validation/job-schemas.ts` and the Server Action
- Bay board drag fails on mobile: check the 200ms hold delay and touch event handling

---

## Phase T5 — Core workflow: customer approval SMS

**Goal:** Test the full approval flow — request, token generation, approval page, single-use enforcement.

**Manual test steps:**

1. **Mechanic requests approval:**
   - [ ] On an active job, tap "Request customer approval"
   - [ ] Enter description ("Brake discs need replacing") and amount (£180)
   - [ ] Submit → toast confirms "SMS sent" (SMS will fail without Twilio creds — check the approval_request row in DB instead)
   - [ ] Job status changes to `awaiting_customer_approval`

2. **Inspect the approval token:**
   - [ ] Query `approval_requests` table → `token_hash` is populated, `status = 'pending'`, `expires_at` is ~24h from now
   - [ ] The actual token URL is in the Twilio send log or can be reconstructed for testing

3. **Open the approval page:**
   - [ ] Navigate to `/api/approvals/[token]` (GET)
   - [ ] Shows: garage branding, description, amount (£180), Approve/Decline buttons
   - [ ] No internal IDs or PII beyond what the customer already knows

4. **Approve:**
   - [ ] Click Approve → thank-you page
   - [ ] DB: `approval_requests.status = 'approved'`, `responded_at` is set, `responded_ip` logged
   - [ ] Mechanic window: notification appears (Realtime)

5. **Single-use enforcement:**
   - [ ] Hit the same approval URL again (GET or POST) → 410 Gone
   - [ ] Hit with a tampered token → 410 Gone (same response, no oracle)

6. **Expiry enforcement:**
   - [ ] Manually set `expires_at` to the past in the DB
   - [ ] Hit the URL → 410 Gone

7. **Decline flow:**
   - [ ] Create another approval request
   - [ ] Click Decline → confirm page shows "talk to garage" CTA
   - [ ] DB: `status = 'declined'`

**Audit gate:**
- [ ] Token is HMAC-signed and stored as sha256 hash (never raw)
- [ ] Single-use enforced (second hit = 410)
- [ ] Expired token = 410 (same response as invalid)
- [ ] Tampered token = 410 (same response as expired)
- [ ] No PII in the approval URL beyond the opaque token
- [ ] `responded_ip` and `responded_user_agent` logged

**Troubleshooting:**
- Token verification fails: check `APPROVAL_HMAC_SECRET` in `.env.local`, check `src/lib/security/approval-tokens.ts`
- Approval page shows 500: check the Route Handler at `src/app/api/approvals/[token]/route.ts`
- Realtime notification not reaching mechanic: check the Supabase Realtime channel subscription

---

## Phase T6 — Core workflow: customer status page

**Goal:** Test the hostile-internet hardened status page — anti-enumeration, rate limiting, code verification.

**Pre-requisite:** At least one completed or in-progress job with a customer that has a phone number.

**Manual test steps:**

1. **Happy path:**
   - [ ] Go to `/status`
   - [ ] Enter valid reg + valid phone → "If a match exists, a code has been sent"
   - [ ] Check `private.status_codes` table → code_hash exists, expires_at ~10 min out
   - [ ] Enter the code (extract from DB: you'll need to create a test helper or use a known code)
   - [ ] Status page shows: reg, make/model, current status badge, ETA if available
   - [ ] No PII beyond what the customer already knows

2. **Anti-enumeration:**
   - [ ] Enter valid reg + WRONG phone → same response: "If a match exists, a code has been sent"
   - [ ] Enter INVALID reg + any phone → same response
   - [ ] Response timing: both responses within the same ~250ms window (constant-time padding)
   - [ ] No difference in HTTP status code, response body shape, or headers

3. **Rate limiting:**
   - [ ] Send code request 3 times for the same phone → all succeed
   - [ ] 4th request for the same phone → 429 Too Many Requests
   - [ ] Send code request 10 times from the same IP (different phones) → all succeed
   - [ ] 11th from same IP → 429
   - [ ] Rate limit error message is generic: "Too many attempts. Try again in an hour."

4. **Code enforcement:**
   - [ ] Enter wrong code → rejected, no detail about why
   - [ ] Enter correct code a second time → rejected (single-use)
   - [ ] Wait 10+ minutes (or manually expire) → rejected

5. **Cookie scoping:**
   - [ ] After verifying code for vehicle A, the session cookie is scoped to vehicle A
   - [ ] Cannot use that cookie to see vehicle B's status

**Audit gate:**
- [ ] Anti-enumeration: response shape identical for hit vs miss (compare with `diff`)
- [ ] Rate limits enforced at correct thresholds (3/phone/hr, 10/IP/hr)
- [ ] Codes are single-use and expire after 10 minutes
- [ ] Cookie scoped to single vehicle
- [ ] `private.status_codes` not accessible via anon key
- [ ] `private.rate_limits` not accessible via anon key
- [ ] No `garage_id` enumerable from this endpoint

**Troubleshooting:**
- Timing oracle: if responses differ by > 50ms between hit/miss, add `setTimeout` padding in the handler
- Rate limit not triggering: check `private.rate_limits` table is being populated, check `src/lib/security/rate-limit.ts`
- Code verification failing: check that the code is hashed with sha256 before comparison

---

## Phase T7 — Core workflow: tablet kiosk

**Goal:** Test the walk-in booking flow on a tablet-sized viewport.

**Pre-requisite:** Kiosk cookie issued (via manager pairing or test helper).

**Manual test steps:**

1. **Open `/kiosk` at 768×1024 viewport:**
   - [ ] Welcome screen shows 3 big tiles: MOT, Electrical, Maintenance
   - [ ] Each tile is ≥ 120px tall, easily tappable

2. **Book an MOT:**
   - [ ] Tap MOT → details form: name, phone, reg, description (optional)
   - [ ] Phone field shows numeric keyboard on mobile
   - [ ] Reg auto-uppercases
   - [ ] Preferred time: today / tomorrow / this week / "call me"
   - [ ] Confirm screen shows summary → tap Submit
   - [ ] Done screen: "Thanks [name], we'll text you on [phone]"
   - [ ] 5-second countdown → auto-return to Welcome

3. **Booking appears in manager inbox:**
   - [ ] Login as manager → `/app/bookings`
   - [ ] New booking row with service=MOT, customer details, "Promote to job" button
   - [ ] Promote to job → pre-fills the New Job wizard

4. **Idle behaviour:**
   - [ ] Leave kiosk idle for 60 seconds → auto-returns to Welcome
   - [ ] Leave idle for 5 minutes → screen lock overlay appears

5. **Security:**
   - [ ] Remove the kiosk cookie → `/kiosk` returns 401
   - [ ] No previous customer's data visible after submit

6. **Rate limiting:**
   - [ ] Submit 20 bookings rapidly → all succeed
   - [ ] 21st → rejected (20/kiosk/hour limit)

**Audit gate:**
- [ ] Full booking flow completes in < 10 seconds
- [ ] No PII visible after submit (auto-clear)
- [ ] Kiosk cookie required
- [ ] Booking lands in manager inbox correctly
- [ ] Promote-to-job pre-fills customer data

**Troubleshooting:**
- Kiosk cookie not set: check the pairing endpoint at `/api/kiosk/pair`
- Auto-return not triggering: check the idle timer component
- Booking not appearing in inbox: check that the POST to `/api/kiosk/booking` creates a row in `bookings` with correct `garage_id`

---

## Phase T8 — Parts, uploads, PDF

**Goal:** Test the parts module, file upload security, and PDF generation.

**Manual test steps:**

1. **Add a part to a job:**
   - [ ] Open a job as a mechanic
   - [ ] Add part: supplier=ECP, description="Brake disc", price=£45, qty=2, payment=Card
   - [ ] Total auto-calculates to £90
   - [ ] Part appears in the parts table

2. **Test each supplier option:**
   - [ ] ECP, GSF, AtoZ, eBay, Other (reveals custom text field) — all work

3. **File upload — valid files:**
   - [ ] Upload a real PDF (< 10 MB) → success, file appears as link
   - [ ] Upload a real JPG (< 10 MB) → success
   - [ ] Upload a real PNG (< 10 MB) → success

4. **File upload — invalid files:**
   - [ ] Upload a `.exe` renamed to `.pdf` → rejected ("Invalid file type")
   - [ ] Upload a 12 MB PDF → rejected ("File too large — maximum 10 MB")
   - [ ] Upload a `.html` file → rejected

5. **File isolation:**
   - [ ] As mechanic on Job A, try to access a file URL from Job B → 403 or signed URL expired

6. **PDF job sheet:**
   - [ ] As manager, open a job with parts + work logs
   - [ ] Click "Generate PDF"
   - [ ] PDF opens: header (Dudley branding), customer + vehicle, line items (labour + parts), total
   - [ ] "PRO-FORMA — NOT A VAT INVOICE" stamp visible
   - [ ] Numbers match the screen exactly

**Audit gate:**
- [ ] Magic-byte check rejects disguised files
- [ ] Size check enforced server-side (not just client)
- [ ] Storage path = `{garage_id}/{job_id}/{uuid}.{ext}`
- [ ] Signed URLs expire (test after 5+ minutes)
- [ ] PDF numbers match source data
- [ ] No internal UUIDs visible in the PDF

**Troubleshooting:**
- Upload succeeds for bad files: check `src/lib/security/file-validation.ts` magic-byte check, ensure `file-type` package is imported and used
- PDF totals wrong: check the aggregation query in the PDF Server Action
- Signed URL doesn't expire: check the expiry parameter in the Supabase storage `createSignedUrl` call

---

## Phase T9 — M2 features: warranty, stock, DVSA, reports, GDPR

**Goal:** Verify each M2 feature works end-to-end.

### Warranty

- [ ] Complete a job → warranty creation prompt appears
- [ ] Create warranty: description, start date, expiry date, mileage limit
- [ ] Warranty shows on vehicle detail page with "Active warranty" banner
- [ ] Create a new job for the same vehicle → active warranty warning surfaces
- [ ] Void a warranty → requires manager role, writes audit_log

### Stock

- [ ] Add stock items with SKU, description, quantity, reorder point
- [ ] Add a part to a job linked to a stock item → quantity decrements
- [ ] Quantity reaches reorder point → low-stock warning on dashboard
- [ ] Stock movements are append-only (cannot edit or delete a movement row)
- [ ] Negative quantity prevented at DB constraint level

### DVSA MOT history

- [ ] If DVSA credentials are available: click "Refresh MOT history" on a vehicle → data loads, cached 24h
- [ ] If no credentials: mark `SKIPPED: DVSA credentials not available locally` — test in staging
- [ ] DVSA API key never appears in browser network tab or client JS

### Reports

- [ ] Open `/app/reports` as manager
- [ ] Charts/tiles show data from the test jobs created above (not zero)
- [ ] Week/month toggle works
- [ ] CSV export downloads a valid file
- [ ] Non-manager cannot access reports

### GDPR

- [ ] Export customer data → JSON file downloads, contains rows from every related table (vehicles, jobs, parts, work_logs, approvals)
- [ ] Soft-delete customer → `deleted_at` set, customer disappears from lists, 30-day recovery banner shows
- [ ] Audit log viewer → paginated, shows "view_customer" entries from Phase T3 tests
- [ ] Audit log is read-only (no UPDATE/DELETE policy on `audit_log`)

**Audit gate:**
- [ ] All sub-sections above pass (or explicitly SKIPPED with reason)
- [ ] Warranty void writes audit_log
- [ ] Stock movements append-only confirmed
- [ ] GDPR export is complete (spot-check 3 tables)
- [ ] Audit log cannot be tampered with

---

## Phase T10 — Security hardening

**Goal:** Run the vibe-security checklist from BACKEND_SPEC.md §4.

**Steps:**

```bash
# Secret scan
npx gitleaks detect --source . --verbose

# Check for any USING (true) in migrations
grep -rn "USING (true)" supabase/migrations/
grep -rn "USING (auth.uid() IS NOT NULL)" supabase/migrations/

# Check for raw SQL interpolation
grep -rn "\\${" src/lib/ src/app/ --include="*.ts" --include="*.tsx" | grep -i "sql\|query\|select\|insert\|update\|delete"

# Verify .env.local is in .gitignore
grep ".env" .gitignore
```

**Manual checks:**
- [ ] Service role key not in any `NEXT_PUBLIC_*` variable
- [ ] Every table in `public` has RLS enabled (Phase T2 gate)
- [ ] No `USING (true)` anywhere
- [ ] Every INSERT/UPDATE policy has WITH CHECK
- [ ] `garage_id` not writable by `authenticated` role on any table
- [ ] `private.staff_roles` not in PostgREST schema
- [ ] Approval tokens stored as sha256, compared in constant time
- [ ] Status page returns identical shape for hit/miss (Phase T6 gate)
- [ ] Rate limit counters in `private` schema
- [ ] CSP header present (Phase T0 e2e test covers this)
- [ ] `X-Powered-By` absent
- [ ] HSTS set to 2 years
- [ ] `X-Frame-Options: DENY` on app routes
- [ ] No source maps in production build

**Audit gate:**
- [ ] `gitleaks` clean (zero findings)
- [ ] All BACKEND_SPEC §4 Critical items checked and passing
- [ ] All BACKEND_SPEC §4 High items checked and passing
- [ ] Zero SQL string interpolation in source code

---

## Phase T11 — Cross-browser & mobile

**Goal:** Confirm the 4 UIs render correctly on target devices.

**Test matrix:**

| UI | Browser | Viewport | Check |
|---|---|---|---|
| Manager dashboard | Chrome desktop | 1920×1080 | [ ] Layout correct, sidebar works |
| Manager dashboard | Chrome mobile | 390×844 | [ ] Sidebar collapses, touch targets OK |
| Tech mobile | Chrome Android | 360×640 (old Android) | [ ] Buttons ≥ 60px, readable in bright mode |
| Tech mobile | Safari iOS | 390×844 | [ ] No layout break, tap targets work |
| Tablet kiosk | Chrome | 768×1024 | [ ] Tiles huge, form usable |
| Customer status | Chrome mobile | 360×640 | [ ] Code input works, paste works |
| Customer status | Safari iOS | 390×844 | [ ] Same as above |

**Audit gate:**
- [ ] Every cell in the matrix checked
- [ ] No layout breaks
- [ ] No touch targets < 48×48 (< 60×60 for tech primary buttons)
- [ ] Text readable at arm's length on mobile screens

**Troubleshooting:**
- Safari-specific CSS issues: check for `-webkit-` prefix needs, especially on inputs
- Old Android: test with Chrome DevTools device emulation at 360×640 with 4x CPU slowdown

---

## Phase T12 — E2E Playwright (automated)

**Goal:** Run the existing Playwright suite and confirm the critical flow specs exist.

**Steps:**

```bash
pnpm build
pnpm test:e2e
```

**Audit gate:**
- [ ] `tests/e2e/security-headers.spec.ts` passes (both desktop + mobile-android projects)
- [ ] If the 4 critical flow specs exist (kiosk booking, tech start/complete, customer approval, customer status) → they all pass
- [ ] If the 4 critical flow specs do NOT exist yet → create them as part of this phase and make them pass

**Note:** The Phase 11 spec in BACKEND_AUDIT_PROMPT.md calls for Playwright specs for the 4 critical flows. If they haven't been written yet, this is the place to write them. Each spec should cover the happy path end-to-end.

---

## Phase T13 — Staging deploy dry-run

**Goal:** Deploy to Dokploy staging and re-run critical checks on real infrastructure.

**Steps:**

1. Push to staging branch
2. Dokploy deploys automatically
3. Run `supabase db reset` on staging DB (or apply pending migrations)
4. Seed staging with test data
5. Re-run Phase T3 (auth) + T4 (job lifecycle) + T5 (approval) + T6 (status page) against the staging URL
6. Verify HTTPS: cookies are `secure`, HSTS active, CSP enforced
7. Test Twilio SMS end-to-end with real credentials (if available)
8. Test DVSA API with real credentials (if available)
9. Backup test: `pg_dump` → encrypt → off-site → restore to scratch → row counts match

**Audit gate:**
- [ ] Staging deploy succeeds
- [ ] HTTPS headers correct
- [ ] All re-run phases pass on staging
- [ ] At least one real SMS sent and received (or SKIPPED with reason)
- [ ] Backup → restore → row count match
- [ ] Ready for production deploy

---

## Findings log

Use this section to log every finding during the test run. Append, never delete.

```
| Phase | Severity | Finding | Fix | Status |
|-------|----------|---------|-----|--------|
| — | — | (no findings yet) | — | — |
```

---

## Kickoff prompt

Paste this into Claude Code to start the test run:

```
You are running the pre-deployment test and troubleshooting plan for Oplaris Automotive.

Read these files in order before doing anything else:

1. `CLAUDE.md` (project root — architectural rules)
2. `docs/redesign/BACKEND_SPEC.md` (backend spec — source of truth)
3. `docs/redesign/DESIGN_SYSTEM.md` (UI spec — source of truth)
4. `docs/redesign/TEST_AUDIT_PROMPT.md` (this test plan — follow it phase by phase)

Start with Phase T0 (Build & static analysis). For each phase:
- Run the checks
- Triage findings (🔴 Blocker / 🟡 Major / 🔵 Minor)
- Fix blockers and majors before moving on
- Log every finding in the Findings Log section
- Update the Phase Tracker as you go

Do NOT skip phases. If blocked on external credentials, mark SKIPPED with reason and continue.

After all phases pass, update CLAUDE.md phase tracker to mark testing complete.

Go.
```
