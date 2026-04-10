# BACKEND_AUDIT_PROMPT.md — Phased build & audit plan

> Day-by-day execution plan for the backend. Each phase ends with a security audit gate. **No phase is "done" until its gate passes.** Update the tracker as you go. One phase in `CURRENT` at a time.

**Calendar:** Start day = sign-off day (target Fri 10 Apr 2026). M1 deadline = day 7. M2 deadline = day 14.

## Phase tracker

| # | Phase | State | Owner | Day |
|---|---|---|---|---|
| 0 | Repo + infra scaffold | CURRENT | Claude | 1 |
| 1 | Schema + RLS foundation | PENDING | Claude | 1–2 |
| 2 | Auth + roles + JWT claims | PENDING | Claude | 2 |
| 3 | Customers, vehicles, import dry-run | PENDING | Claude | 2–3 |
| 4 | Jobs, bays, assignments | PENDING | Claude | 3 |
| 5 | Work logs (start/pause/complete) | PENDING | Claude | 3–4 |
| 6 | Parts module + storage uploads | PENDING | Claude | 4 |
| 7 | Customer approval flow (Twilio + signed tokens) | PENDING | Claude | 4–5 |
| 8 | PDF job sheet | PENDING | Claude | 5 |
| 9 | Customer status page (hostile-internet hardened) | PENDING | Claude | 5–6 |
| 10 | Tablet kiosk endpoints | PENDING | Claude | 6 |
| 11 | M1 deploy, real Fluent Forms import, backups verified | PENDING | Claude+Hossein | 7 |
| 12 | Warranty tracking | PENDING | Claude | 8 |
| 13 | Stock management (after day-7 scope call) | PENDING | Claude | 8–9 |
| 14 | DVSA MOT history + cache | PENDING | Claude | 10 |
| 15 | Reporting dashboard queries | PENDING | Claude | 11 |
| 16 | GDPR export, audit log surfacing, soft-delete UI | PENDING | Claude | 12 |
| 17 | Final security audit + load test | PENDING | Claude | 13 |
| 18 | M2 deploy, handover, runbook | PENDING | Claude+Hossein | 14 |

---

## Phase 0 — Repo + infra scaffold (day 1)

**Build:**
- `pnpm create next-app@latest` — TypeScript, App Router, Tailwind, src/ dir, ESLint
- Add: `@supabase/ssr`, `@supabase/supabase-js`, `zod`, `react-hook-form`, `@hookform/resolvers`, `shadcn/ui`, `@react-pdf/renderer`, `twilio`, `file-type`
- Folder layout: `src/app/(app)`, `src/app/(public)/status`, `src/app/(public)/kiosk`, `src/app/api/*`, `src/lib/{db,auth,sms,pdf,security}`, `supabase/migrations`
- Dokploy project with two envs: `staging`, `production`. Self-hosted Supabase already running per Hossein.
- `.env.example` with **only** non-secret keys; secrets injected via Dokploy env panel
- `.gitignore` includes `.env*`, `.next`, `node_modules`, `*.pem`
- GitHub Actions: lint, typecheck, vitest, playwright (PR only)

**Audit gate:**
- [ ] No secret in any committed file (`gitleaks` clean)
- [ ] No `NEXT_PUBLIC_*` variable holds anything secret
- [ ] Build passes on staging Dokploy
- [ ] CSP, HSTS, X-Frame-Options, Referrer-Policy headers set in `next.config.ts`
- [ ] Source maps disabled in production build

---

## Phase 1 — Schema + RLS foundation (day 1–2)

**Build:**
- Migration `001_init.sql` — every table from BACKEND_SPEC §1, in order
- Migration `002_rls.sql` — every policy from §2, ending with the `enable rls` loop
- Migration `003_helpers.sql` — `private.current_garage`, `private.current_role`, `private.next_job_number`
- Migration `004_seed.sql` — Dudley garage row, 5 bays, 3 manager seed staff (placeholder accounts, real ones created in Phase 2)
- Vitest RLS suite: forge JWTs for each role × each tenant × each table × each verb. ~200 tests. Every "should be denied" must be denied.

**Audit gate:**
- [ ] `select * from pg_tables where schemaname='public' and rowsecurity=false` returns zero rows
- [ ] No policy contains `using (true)` or `using (auth.uid() is not null)`
- [ ] Every INSERT/UPDATE policy has WITH CHECK
- [ ] Cross-tenant test: forge a JWT for garage A and try to read garage B → 0 rows on every table
- [ ] `staff_roles` is in `private` schema and not in `pg_publication_tables` for the API role
- [ ] `garage_id` column on every domain table is NOT in the `authenticated` role's grant list for UPDATE

---

## Phase 2 — Auth + roles + JWT claims (day 2)

**Build:**
- Supabase Auth Hook (Edge Function) `on_token_issued` that reads `private.staff_roles` and writes `app_metadata.garage_id` + `app_metadata.role`
- Email + password login (Supabase Auth, Argon2id)
- Pwned Passwords k-anonymity check on signup/password change
- Middleware `src/middleware.ts`: redirect unauthenticated → `/login`, redirect role-mismatched → `/403`
- Server helper `requireRole(['manager'])` for Server Actions

**Audit gate:**
- [ ] JWT custom claims correct on every login (test all 3 roles)
- [ ] Password change rejects top-1000 leaked passwords
- [ ] No way to set `garage_id` from the client (try via PostgREST PATCH on `staff` → must 401)
- [ ] Session cookies: `httpOnly`, `secure`, `sameSite=lax`, `__Host-` prefix where possible
- [ ] Logout clears all cookies and revokes refresh token

---

## Phase 3 — Customers, vehicles, import dry-run (day 2–3)

**Build:**
- Server Actions: `createCustomer`, `updateCustomer`, `softDeleteCustomer`, `createVehicle`, `updateVehicle`
- Phone normalisation: `libphonenumber-js`, default region GB, store E.164
- Reg normalisation: uppercase, strip whitespace
- Dedup on phone (deferred unique constraint + UI conflict resolution)
- Import script `scripts/import-fluent-forms.ts`: takes a CSV path, dry-run mode by default, produces `import-report.json` with conflicts, blanks, dupes
- Run dry-run against the 20-row sample (day 8 deliverable from Hossein)

**Audit gate:**
- [ ] zod validates every input on every Server Action
- [ ] Cross-tenant insert attempt → blocked by RLS WITH CHECK
- [ ] Import script does not bypass RLS (uses anon key + a manager-scoped session, not service_role)
- [ ] Phone hash never stored alongside raw phone in any log

---

## Phase 4 — Jobs, bays, assignments (day 3)

**Build:**
- Server Actions: `createJob`, `assignBay`, `assignTech`, `unassignTech`, `updateJobStatus`
- Job number generator (`private.next_job_number`)
- Bay board query (single SQL, returns nested JSON) — target < 50 ms
- Realtime channel for bay board (Supabase Realtime on `jobs` table, filtered by garage)

**Audit gate:**
- [ ] Mechanic JWT cannot read jobs they're not assigned to (RLS overlay test)
- [ ] Status transitions validated server-side (state machine; can't go from `completed` → `in_repair`)
- [ ] Realtime channel filters by `garage_id` so cross-tenant leaks impossible
- [ ] Bay board query uses indexes (EXPLAIN ANALYZE in PR)

---

## Phase 5 — Work logs (day 3–4)

**Build:**
- `startWork`, `pauseWork`, `completeWork` Server Actions
- `one_running_log_per_staff` unique partial index enforced
- Auto-update `jobs.updated_at` and emit Realtime event

**Audit gate:**
- [ ] Mechanic A cannot start work on Mechanic B's job (RLS + assignment check)
- [ ] Time tampering: client-supplied timestamps ignored, server uses `now()`
- [ ] Concurrent start attempts: only one wins (unique index)

---

## Phase 6 — Parts module + storage (day 4)

**Build:**
- Storage bucket `parts-invoices` (private)
- Server Action `addJobPart` with file upload via Server Action (not direct-to-supabase from client)
- Server-side: size check (≤10 MB), MIME check, magic-byte check via `file-type`, store under `{garage_id}/{job_id}/{uuid}.{ext}`
- Signed URL generation (5-minute expiry) for downloads

**Audit gate:**
- [ ] Upload a `.exe` renamed `.pdf` → rejected by magic-byte check
- [ ] Upload to another garage's path → rejected by storage RLS
- [ ] Mechanic on Job A cannot signed-URL a file from Job B
- [ ] Signed URLs expire and cannot be replayed after expiry

---

## Phase 7 — Customer approval flow (day 4–5)

**Build:**
- `requestApproval` Server Action: generates HMAC-signed token, stores `sha256(token)`, sends Twilio SMS
- `/api/approvals/[token]` GET: looks up by `sha256(token)`, constant-time, renders mobile-friendly page
- POST: marks approved/declined, single-use update with WHERE clause guard
- Twilio status callback `/api/twilio/status` with signature verification

**Audit gate:**
- [ ] Token replay: hitting POST twice → second call returns 410 Gone
- [ ] Expired token: returns same 410, not a different error (no oracle)
- [ ] Wrong HMAC: same 410
- [ ] Twilio webhook with bad signature: 401, no DB write
- [ ] No PII in approval URL beyond opaque token

---

## Phase 8 — PDF job sheet (day 5)

**Build:**
- `@react-pdf/renderer` template: header (garage branding), customer + vehicle, line items (labour from work_logs, parts from job_parts), VAT line, total
- Stamp "PRO-FORMA — NOT A VAT INVOICE" clearly
- Stream from Server Action, optionally save to storage with content-hash key for caching

**Audit gate:**
- [ ] Cross-tenant: cannot generate a PDF for another garage's job
- [ ] PDF does not embed any internal IDs that leak structure
- [ ] Numbers match the source data exactly (snapshot test)

---

## Phase 9 — Customer status page (day 5–6)

**Build:**
- `/status` page (no auth)
- `/api/status/request-code`: normalise reg + phone, look up vehicle, generate 6-digit code, store `sha256(code)` in `private.status_codes` (with `phone_hash`, `reg_hash`), send Twilio SMS — **always** return `{ ok: true, message: "If a match exists, a code has been sent." }` regardless of hit/miss, with consistent timing (use `setTimeout` padding to 250 ms ± jitter)
- Rate limit: 3/phone/hr, 10/IP/hr — counters in `private.rate_limits`
- `/api/status/verify-code`: validates code (constant time), issues a signed cookie scoped to that vehicle for 30 minutes
- `/api/status/state`: reads cookie, returns minimal status JSON (no PII beyond what the customer already knows about their own car)

**Audit gate:**
- [ ] Enumeration test: 100 requests with valid reg + wrong phone vs 100 with valid both → response shape, status code, and timing distribution indistinguishable (statistical test)
- [ ] Rate limit test: 4th request from same phone → 429
- [ ] Code reuse: second use of same code → 410
- [ ] Cookie scope: cookie for vehicle A cannot read state of vehicle B
- [ ] No way to enumerate `garage_id` from this endpoint

---

## Phase 10 — Tablet kiosk (day 6)

**Build:**
- `/kiosk` route, locked to a per-device signed cookie (issued once by manager pairing the tablet)
- Big-button UI for MOT / Electrical / Maintenance
- POST to `/api/kiosk/booking` → row in `bookings`, surfaces in manager dashboard
- Auto-clear form after 60s of inactivity; lock screen after 5 min idle

**Audit gate:**
- [ ] Without kiosk cookie → 401
- [ ] Cross-garage cookie → 401
- [ ] No XSS from booking notes (CSP + escaping verified)
- [ ] No PII visible on screen after submit (auto-clear)

---

## Phase 11 — M1 deploy (day 7)

**Tasks:**
1. Final M1 RLS test suite green
2. Backup script: `pg_dump | age --encrypt --recipient ... | rclone copy` to off-site
3. **Restore test:** restore the dump to a scratch DB on Dokploy, count rows, smoke test reads
4. Real Fluent Forms import: with Hossein on the call, run against production
5. Pair tablet kiosk
6. Smoke test all four UIs
7. Hand Hossein the M1 walkthrough

**Audit gate:**
- [ ] Backup → off-site → restore → row count match: PASS
- [ ] Twilio production credentials swapped in
- [ ] DVSA credentials installed (received day 10? — if not, raise it day 5)
- [ ] All Phase 0–10 gates green
- [ ] Hossein signs M1

---

## Phase 12 — Warranty tracking (day 8)

**Build:**
- `warranties` CRUD via manager Server Actions
- Job creation hook: query active warranties for `vehicle_id` and surface in UI
- Materialised view `active_warranties` refreshed nightly + on-write

**Audit gate:**
- [ ] Cross-tenant warranty access blocked
- [ ] Voiding a warranty requires manager role and writes audit_log

---

## Phase 13 — Stock management (day 8–9)

**Day 7 deliverable:** Hossein answers 5 scope questions. This phase's exact build depends on the answers. Default scope:
- `stock_items` CRUD
- Auto-decrement on `addJobPart` if linked to a stock item
- Reorder warning on dashboard

**Audit gate:**
- [ ] Stock movements are append-only (no UPDATE/DELETE policy on `stock_movements`)
- [ ] Negative quantity prevented at the constraint level

---

## Phase 14 — DVSA MOT history (day 10)

**Build:**
- `/api/dvsa/refresh` calls DVSA API server-side, caches in `mot_history_cache` for 24h
- Manager UI: "Refresh MOT history" button on vehicle page

**Audit gate:**
- [ ] DVSA key never leaves server
- [ ] Cache respected, not bypassed (DVSA rate limits are tight)
- [ ] Errors from DVSA logged but don't crash the page

---

## Phase 15 — Reporting (day 11)

**Build:**
- Read-only Postgres views for: today's jobs, this week's revenue, hours per tech, parts spend per job, repeat customers, common repair types
- Manager-only UI page with Tremor or shadcn charts

**Audit gate:**
- [ ] All views filter by `garage_id` via RLS-respecting functions or per-garage views
- [ ] No view exposes another garage's numbers
- [ ] Heavy queries use indexes (EXPLAIN in PR)

---

## Phase 16 — GDPR (day 12)

**Build:**
- `private.customer_data_export(uuid)` SECURITY DEFINER returning JSON of every row across every table for that customer
- Manager UI: "Export this customer's data" → downloads JSON
- Soft-delete UI with 30-day recovery
- Audit log viewer (manager only, read-only, paginated)

**Audit gate:**
- [ ] Export function only callable by managers, only for own garage
- [ ] Audit log is append-only (no UPDATE/DELETE policy)
- [ ] Soft-delete cascades correctly to vehicles, jobs (but jobs are kept 30d)

---

## Phase 17 — Final security audit + load test (day 13)

**Tasks:**
- Run full vibe-security audit pass over the codebase (use `Oplaris-Skills/vibe-security/SKILL.md`)
- Run full ux-audit pass (use `Oplaris-Skills/ux-audit/SKILL.md`)
- Load test status page: 200 concurrent, p95 < 300 ms
- Pen-test the four critical flows manually (try every misuse you can think of)
- Penetration checklist: enumeration, IDOR, broken auth, broken access control, SSRF (none expected — no outbound URLs from user input), XSS, CSRF

**Audit gate:**
- [ ] Zero Critical, zero High findings
- [ ] All Medium findings either fixed or explicitly accepted with note
- [ ] Load test green

---

## Phase 18 — M2 deploy + handover (day 14)

**Tasks:**
- Production deploy via Dokploy
- Final backup verification
- Walk Hossein through everything live
- Hand over: admin guide PDF, walkthrough video, runbook (rotate Twilio token, rotate DVSA key, rotate service_role, restore from backup, add a new staff member)
- Hossein signs M2, second 50% invoice issued

---

## Daily ritual

At the start of every working day:
1. Read `CLAUDE.md` and `BACKEND_SPEC.md`
2. Read the consult-first reference for whatever phase you're in (e.g. `vibe-security/references/database-security.md` for Phase 1, `rate-limiting.md` for Phase 9)
3. Update this tracker — move one phase to CURRENT
4. Send Hossein the daily check-in (one line: yesterday/today/blockers)
5. End the day by either passing the phase's audit gate or writing what's blocking it
