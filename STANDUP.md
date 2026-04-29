# Standup Log — Oplaris Automotive / Dudley Auto Service

---

## Wed 29 Apr 2026 — Daily Standup

**Yesterday (Tue 28 Apr):** Zero commits. Last work was the 24-commit overnight 27→28 Apr P1.x + P2.x staging-fix close-out (P1.2 MOT logo glyph, P2.3 followup migration 057 quote/invoice templates, P2.4 migration 056 bay chooser, P2.5 bay-board prop derivation, P2.6 rate-limit per-phone 6/hr, P2.7a/b approval routing, P2.8 cron MOT refresh + reminders, P2.9 migration 058 type-aware retry, TelLink click-to-call). Tuesday's stated "today" task — rewrite `bookings/actions.ts` + `bookings/page.tsx` off `passed_from_job_id` / `passback_note` / `passback_items` ahead of migration 034 — did not land. Confirmed: those files still read the deprecated columns; migration 034 still absent from `supabase/migrations/` (last is 058).

**Today:** Land the bookings rewrite (drop `passed_from_job_id` / `passback_note` / `passback_items` reads in both files), then write + apply migration 034 to drop the columns + the `awaiting_passback` flag + `status='awaiting_mechanic'` enum value. Soak window expired yesterday — this is now overdue by one day.

**Blockers:** Phase 4 deploy still gated on Hossein: Dokploy access, prod Supabase URL + service-role, real Twilio creds (SID still placeholder), domain + TLS. Outstanding 9 days.

**Decision from Hossein:** Phase 4 credentials drop-date — same ask, third week running.

**Calendar:** M1 (Thu 16 Apr) was 13 days ago, M2 (Thu 23 Apr) was 6 days ago. Superseded by 2026-04-14 quality-over-deadline call. Not flagged overdue under current policy.

---

## Tue 28 Apr 2026 — Daily Standup

**Yesterday (overnight 27→28 Apr):** Massive sprint close-out — ~24 commits between 01:01 and 04:14 cleared the remaining P1.x + P2.x staging-fix backlog. P1.2 followup (MOT logo glyph + avatar corner badge, `.svg→.png` Content-Type fix). P2.3 followup: per-garage quote + invoice SMS templates (migration 057). P2.4: bay chooser on Create-job + audit + timeline (migration 056). P2.5: bay-board derive bays from prop. P2.6: rate-limit per-phone 3→6/hr + normalised hash + getClientIp + 429 logs. P2.7a/b: `normaliseAppUrl` helper + ApprovalDialog routing fix. P2.8: cron MOT refresh + reminders activated. P2.9: type-aware retry policy + bulk Retry (migration 058). Click-to-call `TelLink` rollout + audit-pass cleanup + per-task Todoist comments.

**Today:** P51.10 migration 034 column drop is soak-due today. Before applying: rewrite `src/app/(app)/app/bookings/actions.ts` + `bookings/page.tsx` off `passed_from_job_id` / `passback_note` / `passback_items` (still reading the deprecated columns — drop will break them). Then apply migration 034.

**Blockers:** Phase 4 deploy still gated on Dokploy access + prod Supabase URL/service-role + real Twilio creds (SID still placeholder) + domain/TLS. All from Hossein.

**Decision from Hossein:** Phase 4 credentials drop-date — outstanding 8 days now.

**Calendar:** M1 (Thu 16 Apr) was 12 days ago, M2 (Thu 23 Apr) was 5 days ago. Superseded by 2026-04-14 quality-over-deadline call. Not flagged overdue under current policy.

---

## Mon 27 Apr 2026 — Daily Standup

**Yesterday (Sun 26 Apr):** Quiet — zero commits. Last activity was Sat 25 Apr's 21-commit STAGING_FIX_PLAN P0–P2 push: CSP/`pattern` rename/env hardening; P1.1 kiosk 3s countdown + reset; P1.2 MOT-tester chip icons; P1.3 edit-customer Dialog; P2.1 `<PhoneInput>` + canonical `normalisePhone`; P2.2 migration 054 SMS retry queue + `failed_final`; P2.3 migration 055 per-garage SMS templates + `/app/settings/sms` editor.

**Today:** P51.10 migration 034 column drop is soak-gated to ~2026-04-28 — tomorrow. Prep the migration + grep `awaiting_passback` / `status='awaiting_mechanic'` / `bookings.passback_*` for any new writers. Also clean working tree: only `.claude/settings.local.json` and 10 untracked Envato dumps under `public/`.

**Blockers:** Phase 4 deploy still gated on Dokploy access, prod Supabase URL + service-role, real Twilio creds (SID not `AC…`), domain + TLS — all from Hossein.

**Decision from Hossein:** Phase 4 credentials drop-date — same ask as last week, still open.

**Calendar:** M1 (Thu 16 Apr) was 11 days ago, M2 (Thu 23 Apr) was 4 days ago. Both superseded by 2026-04-14 quality-over-deadline call — not flagged overdue, but original M2 has now passed without prod deploy.

---

## Mon 20 Apr 2026 — Daily Standup

**Yesterday (Sun + Mon early):** Scoped + started SMS queue work. `docs/redesign/SMS_QUEUE_PLAN.md` agreed with Hossein 2026-04-20 — universal `sms_outbox` (all message types) + MOT reminder automation with DVSA pre-checks + manager Messages page. Migration `047_sms_outbox.sql` written (outbox table + indexes + CHECK constraints on type/status/dvsa_result). `src/lib/sms/queue.ts` wired as the new single path for every outgoing SMS (replaces direct `sendSms()` calls for audit + delivery tracking). New `/app/messages/` page (list + `ExpiredMotList`), `twilio/status` webhook extended to upgrade queued→sent→delivered, charges/approvals actions migrated to the queue, `status/request-code` rewired. New unit tests: sms-queue, twilio-status-webhook, charges-actions-revisions, status-dev-bypass.

**Today:** Finish migration 047 (`private.insert_sms_outbox` SDF + RLS + revoke), push to remote Supabase, wire the MOT-reminder cron (Edge Function) + DVSA pre-check, retry/cancel buttons on Messages page. Then commit the 146-file changeset (still zero commits since `f969ee5` Sat) — per-feature split recommended.

**Blockers:** Commit-strategy decision carried from Sat. Twilio creds still placeholders in `.env.local` (SID doesn't start with `AC`) — SMS logs-and-skips locally; needs real creds before staging. Phase 4 deploy blocked on Dokploy access + prod Supabase URL/service-role + domain/TLS from Hossein.

**Decision from Hossein:** Phase 4 deploy credentials — when can Dokploy + prod Supabase + Twilio live creds drop in? That's the long pole to go-live.

**Calendar:** M1 (Thu 16 Apr) was 4 days ago; M2 (Thu 23 Apr) is 3 days out. Both superseded by 2026-04-14 quality-over-deadline decision — NOT flagged overdue under current policy, but noting the original M2 is this week for visibility.

---

## Sat 18 Apr 2026 — Daily Standup

**Yesterday into today:** Phase 3 closed end-to-end, plus two net-new features on top.

**Phase 3 closed:**
- **P56.0–P56.10** — spacing scale codemod (100 off-grid tokens across 39 files), `<Section>` / `<Stack>` / `Card size` primitives, button size scale aligned to 44-px rule, `<FormCard>` + `<FormActions>` migrated across 14 staff forms, 7-primitive batch (`<PageContainer>`, `<PageTitle>`, `<RegPlate>`, `<PassbackBadge>`, `<ConfirmDialog>`, `<LoadingState>`, `<Combobox>` + `lib/toast.ts`), 22-page `<PageContainer>` width migration, tech surface polish, `alert()`/`confirm()` sweep to `toast`/`ConfirmDialog`, 52 hardcoded colours → semantic tokens, cmdk-backed `<Combobox>` on NewJobForm, global reduced-motion rule, visual regression scaffold (`tests/e2e/visual/spacing.spec.ts`), DESIGN_SYSTEM §2.1 documents the full primitive set.
- **V2** — Phosphor icon install + automotive icon barrel (Engine, CarBattery, GasPump) + 5 custom SVGs (BrakeDisc, OilDrop, Tyre, ObdPort, SparkPlug).
- **V3** — 8 list pages wired to themed Undraw-class illustrations via expanded `<EmptyState illustration>`; import script fixed (CSS `<style>` tags wrapped in JSX template literals — latent TSX parse error closed); illustration catalogue audited + scrubbed to 20 male-only / figure-free illustrations (Hossein cultural preference).
- **V4.1 / V4.2** — bespoke `<PatternBackground>` primitive consuming `public/pattern/pattern.svg` (hand-drawn car parts, same artist as V3 kit); swapped on login (4%), bay-board (3%), kiosk welcome (4%), kiosk done (3%), status page (3% full bg).
- **V5 / V5.7** — public-surface dynamic brand resolution: new `getPublicGarageBrand()` service-role helper + `(public)/layout.tsx` + `(auth)/layout.tsx` inject brand tokens on all three pre-auth surfaces. Kiosk + status split into server-component wrappers passing brand props to client. `GarageLogo` wired on kiosk hero + status header + sidebar + PDF. **PDF job-sheet branded header** — full-bleed brand-primary bar + accent stripe + brand-coloured section underlines + accent-coloured totals row. Sidebar gained quiet "Powered by Oplaris" resale credit.
- **V6** — page fade-in 200ms (`.page-fade-in` keyframe with `key={pathname}` re-trigger), bay-board drag elevation (scale-1.02 + shadow-xl + ring), dark-mode toggle already shipped, active-job pulse already shipped.

**Net-new on top of Phase 3:**
- **Migration 045 — invoice revisions.** `invoices.revision` + `updated_at` + trigger. Tiered editing by `quote_status`: `draft` free, `quoted` editable with revision bump + Updated chip, `invoiced` locked with manager override via **Revert to quoted**. New `resendQuote()` action fires SMS with rev-aware copy. Status page gets an "Updated" chip on revised tiles. Self-healing bug fix baked in: `markAsQuoted` / `markAsInvoiced` now call `getOrCreateInvoice` first (previous silent-no-op bug fixed).
- **Migration 046 — invoice payments.** `invoices.paid_at` + `payment_method` + CHECK constraint widened to `paid`. New **Mark as paid** dialog (radio picker: Cash / Card / Bank transfer / Other), PAID banner on the charges panel, `revertToInvoiced()` escape hatch. Status page gets a green PAID badge. Invoice PDF gets a diagonal green PAID watermark. Reports page grew a **Receivables** section: outstanding / paid-this-period / still-quoted KPIs + aging table (0-7 / 8-30 / 30+ days, with "chase hard" amber on the 30+ row).
- **Network-dev unblock.** `pnpm dev` rebound to `0.0.0.0`, `next.config.ts` `allowedDevOrigins` added (glob format, not CIDR), `.env.local` `NEXT_PUBLIC_APP_URL` now `http://192.168.4.82:3000`. iPad + phone can hit the dev server over LAN for testing.

**Stats:** 193/193 unit (was 186 before this session), typecheck clean, spacing lint clean. 11 migrations pushed to remote Supabase via MCP `apply_migration` in this session (039–041 shipped earlier in week, 042–044 mid-week, 045–046 today).

**Today's remaining:** Phase 4 (deploy infra) is the next major milestone. Commit strategy still open: massive uncommitted changeset grew further, now ~250 files dirty across the Phase 3 close-out + revisions + payments + docs.

**Blockers:** Same commit-strategy decision as Wed — one omnibus or split per-feature? Per-feature recommended for reviewability.

**Decision from Hossein:** SMS pending — `.env.local` Twilio creds look like placeholders (SID doesn't start with `AC`). Quote SMS / resend SMS currently log an error + skip gracefully. Real SMS works once real creds drop in.

---

## Wed 15 Apr 2026 — Daily Standup

**Yesterday:** Phase 2 closed end-to-end. P51 pass-back-as-event (migrations 033/033b + RPCs + mechanic pull queue + timeline chip), P52 job-detail header reorg, P50 universal realtime (migration 035, shared `useRealtimeRouterRefresh` hook across 14 staff surfaces + status-page polling), P46 assign-tech modal polish, P38 mobile-first responsive pass, P53 override-handler command palette (migration 037 + atomic RPC), P54 unified Job Activity timeline (migration 036 + `set_job_status` RPC + customer-facing feed), P55 real pause/resume with worked-time accounting (migration 038). Today: Phase 3 kicked off — V1 theming infrastructure (migrations 039/040/041, brand columns + logos bucket + the silently-missing `garages` UPDATE policy, OKLCH token injection, Settings → Branding page) and P56.0 spacing scale + density primitives (codemod rewrote 100 off-grid tokens across 39 files, new `<Section>` / `<Stack>` / `Card size` primitives, `pnpm lint:spacing` gate). 180/180 unit + 82/82 RLS green.

**Today:** STAGING_SMS_BYPASS standalone, then P56.2 (forms + `<FormCard>` / `<FormActions>`). Commit the full P51→P56.0 + V1 changeset before continuing — 190 files dirty, 0 commits since `c44a5bb` on 2026-04-13, two days stale and growing.

**Blockers:** Massive uncommitted changeset (190 files, 5 new migrations 039–043 already pushed to remote DB) is the only real risk. No external blockers.

**Decision from Hossein:** Commit strategy — one omnibus commit covering P51–P55 + V1 + P56.0, or split per-feature? Recommend per-feature for reviewability; need confirmation before splitting.

**Calendar:** Original M1 = Thu 16 Apr (tomorrow), M2 = Thu 23 Apr (8 days). Both superseded by 2026-04-14 quality-over-deadline decision. NOT flagged overdue under the new policy.

---

## Tue 14 Apr 2026 — Daily Standup

**Yesterday:** Phase 1 kickoff. P47 check-in routing landed: three `026_p47_*` migrations (enum `awaiting_mechanic`, routing policy, insert_passback_booking RPC), `PassbackDialog`, `ResumeMotButton`, `jobs/passback/actions.ts`, 11-item passback constants. Role-scoped sidebar + nav + `session.ts` refactored for multi-role (P48). `ROLE_TEST_PLAN.md` created. Two pre-seeded defects CLOSED: D1 (work_logs RLS — migration 015 had never been pushed to live DB) and D3 (bookings promote — migrations 016 + 018 same drift). All live-DB drift fixed via Supabase MCP `apply_migration`. Also backfilled missing `private.staff_roles` row for Hossein.

**Today:** 52 files modified, zero commits since `c44a5bb` (2 days stale). Commit the P47 + sidebar + defect-fix work first, then begin the manager-role walkthrough against live Supabase per `ROLE_TEST_PLAN.md`. D2 (title-edit layout shift) still OPEN — decide whether to fold into P36 scope or fix standalone.

**Blockers:** Large uncommitted changeset at risk until committed. No external blockers.

**Decision from Hossein:** None pending. Priority reorder (no-deadline quality bar) locked 2026-04-14.

**Calendar:** Original M1 = Thu 16 Apr (2 days out), superseded by 2026-04-14 decision. Not flagged overdue — ship-when-ready applies.

---

## Mon 13 Apr 2026 — Daily Standup

**Yesterday:** Two commits landed — "Part D complete" (invoices, charges, warranties rework, stock locations, staff mgmt, UX polish) and "P9+P12" (edit job details, bay/tech assignment, add/delete parts). 72 files changed, ~6k lines net. Feature code is now substantially complete across all M2 items (M2.1-M2.5 done).

**Today:** Three items remain before M1 go-live (Thu 16 Apr, 3 days out): (1) Fluent Forms real import, (2) backups verified, (3) staging deploy. M2.6 (mobile UX polish + accessibility) and M2.7 (admin guide) still open. PRE-DEPLOY test pass partially done — migrations 012+013 pending DB apply, 4 known open items from Run 2 (assertPasswordNotPwned zero callers, kiosk rate limit, kiosk profanity filter, STATUS_PHONE_PEPPER key separation). UI AUDIT_PROMPT tracker not updated — all phases show PENDING despite code existing.

**Blockers:** Production Supabase creds still needed for staging deploy. Cannot verify backups or run T13 dynamic tests without live DB.

**Decision needed from Hossein:** Are the self-hosted Supabase URL + service-role key available for staging deploy this week? M1 deadline is Thu 16 Apr — deploy prep must start by Wed at latest.

---

## Fri 10 Apr 2026 — Daily Standup

**Yesterday:** Planning pack committed (requirements, CLAUDE.md, BACKEND_SPEC, audit prompts, design system). Substantial development work in working tree: repo scaffold, 4 migrations (schema/RLS/helpers/seed), Server Actions, test harness — all uncommitted.

**Today:** Git shows only 1 commit vs large uncommitted changeset (next.config, migrations, tests, scripts all untracked). BACKEND_AUDIT_PROMPT claims Phase 17 CURRENT (security audit) but AUDIT_PROMPT shows all UI phases PENDING. CLAUDE.md tracker shows M1.0a-M1.8 done, M2.1-M2.5 done, but M1.9-M1.10 incomplete. Tracker inconsistency suggests work-in-progress needs stabilization via commit before continuing.

**Blockers:** None technical. Large uncommitted changeset at risk if session ends. UI completely unstarted (0% vs backend ~60-80% per trackers).

**Decision needed:** M1 deadline is Thu 16 Apr (6 days). Commit current backend work first to secure progress, or continue building? UI represents 50%+ of M1 scope and hasn't begun — need clarity on sequencing strategy.

**ALERT:** M1 on track to miss deadline unless UI work starts immediately. Backend advanced but uncommitted = fragile.

---

## Fri 10 Apr 2026 — Earlier Entry

**Yesterday:** Planning docs committed early morning (CLAUDE.md, BACKEND_SPEC, requirements). Phases 0-3 implemented but not committed: repo scaffold with security headers, 11 database migrations (schema through audit log RPCs), Server Actions for customers/vehicles/jobs/parts/approvals/warranties, API routes for DVSA/status/kiosk, 29 RLS + unit tests passing.

**Today:** Critical gap identified — substantial codebase in working tree uncommitted. Tracker inconsistency: BACKEND_AUDIT_PROMPT shows Phase 17 (security audit) CURRENT but AUDIT_PROMPT shows all UI phases PENDING. CLAUDE.md shows M1.0a-M1.8 done, M1.9-M1.10 incomplete. Zero UI code exists (no React components, no forms, no pages beyond stubs).

**Blockers:** Production Supabase credentials pending (blocks M1 deploy). Large uncommitted changeset needs review before continuing.

**Decision needed:** M1 is Thu 16 Apr (6 days). Backend ~60% complete but uncommitted. UI 0% started. Commit and stabilize first, or continue building? Need clarity on phase priorities.

**ALERT:** M1 deadline approaching. Backend on track but UI represents majority of remaining M1 scope and hasn't begun.

---

## Sat 11 Apr 2026 (Phase 1 — Schema + RLS landed)

**Today:**
- `supabase/migrations/001_init.sql` — full schema from BACKEND_SPEC §1: garages, staff, private.staff_roles, customers, vehicles, mot_history_cache, bays, jobs, job_assignments, work_logs, job_parts, approval_requests, warranties, stock_items, stock_movements, private.status_codes, private.rate_limits, bookings, audit_log. Extensions: pgcrypto, citext, pg_trgm. Generated `total_pence` and `duration_seconds` columns. All required partial + GIN indexes. updated_at triggers on customers/jobs/stock_items. Tail loop enables RLS on every public table.
- `supabase/migrations/002_helpers.sql` — `private.current_garage()`, `private.current_role()`, `private.is_manager()`, `private.is_staff_or_manager()` reading `request.jwt.claims` (works with both PostgREST and direct psql via `set local`). `private.next_job_number()` SECURITY DEFINER, atomic, per-tenant `DUD-2026-00001` format. `private.purge_customer()` + `private.customer_data_export()` for GDPR. Sensitive grants on `staff` (only `full_name`, `phone` updatable). Whole `private` schema revoked from `authenticated`/`anon`.
- `supabase/migrations/003_rls.sql` — every policy from BACKEND_SPEC §2. Mechanic isolation overlay on jobs/work_logs/job_parts/approval_requests via `job_assignments`. Approval-request updates have NO policy (single-use update is service-role only). Bookings writes are service-role only (kiosk/online routes). `garage_id` REVOKE UPDATE on every domain table. Final `force row level security` loop so even table-owners can't bypass.
- `supabase/migrations/004_seed.sql` — Dudley garage row (fixed UUID `…d0d1e`), 5 bays with capabilities, job-number sequence primed for `DUD-2026-00001`. Idempotent.

**Phase 1 follow-up (same day, end of evening):**
- Brought up local Supabase via `supabase init` + `supabase start` (Docker on this Mac). All four migrations now apply clean from a wiped `public` + `private` schema.
- Caught two real bugs the dry-run would have missed:
  1. `002_helpers` revoked *all* private functions from `authenticated`, including the JWT-reader helpers (`current_garage`, `current_role`, `is_manager`, `is_staff_or_manager`) that every RLS policy invokes — instant `permission denied for function current_garage` storm. Fixed: revoke stays the default, then explicit `grant execute` on the four read-only helpers + `grant usage on schema private`.
  2. `003_rls` assumed Supabase's `grant all on public tables` event trigger had run, but raw-psql migrations bypass it, so `authenticated` had zero table grants and RLS never even ran. Fixed: explicit `grant select, insert, update, delete on all tables in schema public to authenticated` at the top of `003_rls`, with the existing `revoke update (garage_id)` block running afterwards so column locks survive.
- Ran `tests/rls/` end-to-end. Suite: `tenant_isolation` (11), `mechanic_isolation` (7), `private_schema` (6) = **24/24 passing**. Covers: cross-tenant SELECT/INSERT/UPDATE denied; `garage_id` column unwritable; mechanic-only-sees-assigned-jobs overlay; unassigned mechanic sees zero jobs; mechanic INSERT on jobs denied; assigned mechanic CAN start a work_log but cross-tenant insert fails; `private.staff_roles`/`status_codes`/`rate_limits`/`next_job_number`/`purge_customer` all `42501` for both `authenticated` and `anon`.
- Wired `vitest` projects: `unit` (jsdom) stays the default, `rls` (node, sequential, 15 s timeout) is opt-in via `pnpm test:rls`. CI will gate on both.
- Re-verified the audit grid against the live DB after a full reset: 0 tables without `force row level security`, 0 `USING (true)`, 0 INSERT/UPDATE policies missing `WITH CHECK`. Job-number generator returns `DUD-2026-00001`.

**Audit gate (Phase 1):**
- [x] Migrations apply clean against empty Postgres 15 (local self-hosted Supabase)
- [x] Zero `USING (true)` and zero `USING (auth.uid() IS NOT NULL)` — grep confirms
- [x] Every INSERT/UPDATE policy carries `WITH CHECK`
- [x] `garage_id` not in any `update (...)` grant; explicit REVOKE on every table
- [x] `private` schema fully revoked from `authenticated`/`anon`
- [x] No DELETE policies on domain tables (hard delete is SECURITY DEFINER only)

**Tomorrow (Phase 1.5 — RLS test harness):**
- Bring up local Supabase (`supabase start`) or stub Postgres if Dudley's instance creds still pending
- Vitest harness that forges JWTs with `{garage_id, role, sub}` claims, sets `request.jwt.claims` via `set_config`, and runs the cross-tenant matrix: 2 garages × 4 roles × every table × {select, insert, update}. Target ~200 assertions. Cross-tenant forge MUST fail every verb.
- Then move to Phase 2 (Customer + vehicle CRUD + Fluent Forms import dry-run).

**Blockers:** Same Q1 from yesterday — still need self-hosted Supabase URL + service-role key from Hossein, otherwise RLS suite runs against local supabase-cli (acceptable but unverified against the prod Postgres version).

**Calendar:** M1 in 5 days (Thu 16 Apr). On schedule.

---

## Sat 11 Apr 2026 – Phase 2 — Auth + roles + JWT claims

**Today:**
- `supabase/migrations/005_auth_hook.sql` — SECURITY DEFINER `public.custom_access_token_hook(event)` reads `private.staff_roles` + `public.staff`, writes `garage_id` + `role` into `app_metadata`. Inactive staff get `null`/`null` (deny-all). Execute restricted to `supabase_auth_admin`.
- `supabase/config.toml` — enabled `[auth.hook.custom_access_token]` → `pg-functions://postgres/public/custom_access_token_hook`. Minimum password length 8 (NIST). Global signup disabled (`enable_signup = false`) while email provider stays ON.
- Caught config pitfall: `[auth.email] enable_signup = false` maps to `GOTRUE_EXTERNAL_EMAIL_ENABLED=false`, which kills the entire email provider (including login!). The correct combo is top-level `[auth] enable_signup = false` + leave `[auth.email] enable_signup = true`.
- `src/lib/supabase/server.ts` — SSR client via `@supabase/ssr`, bound to `next/headers` cookie jar.
- `src/lib/supabase/admin.ts` — service-role client (server-only), bypasses RLS. For Route Handlers + admin scripts only.
- `src/lib/supabase/browser.ts` — browser singleton for client components (realtime later).
- `src/lib/supabase/proxy-client.ts` — session-refresh helper for the proxy (cookie rotation).
- `src/proxy.ts` — Next 16 edge proxy. Refreshes Supabase cookies, bounces `/app/*` to `/login` if unauthenticated, bounces `/login` back to `/app` if already logged in.
- `src/lib/auth/session.ts` — `getStaffSession()`, `requireStaffSession()`, `requireRole(allowed)`, `requireManager()`, `requireManagerOrTester()`. All server-trusted via JWT `app_metadata` claims.
- `src/lib/security/pwned-passwords.ts` — k-anonymity check against api.pwnedpasswords.com. Fail-closed (reject on HIBP failure). Constant-time suffix scan. `Add-Padding: true` to prevent response-size leakage.
- `src/app/(auth)/login/` — login page (Server Component) + `LoginForm` (Client Component, `useActionState`) + `loginAction` (Server Action, zod-validated). Anti-enumeration: same generic error for wrong email, wrong password, missing staff row, or inactive user.
- `src/app/(auth)/logout/route.ts` — POST handler, revokes refresh token + clears cookies.
- `src/app/403/page.tsx` — terse forbidden page for role mismatches.
- `src/app/(app)/app/page.tsx` — now uses `requireStaffSession()`, showing email + role + garage.
- `scripts/seed-dev-users.ts` — provisions manager/tester/mechanic with well-known credentials for local dev. Idempotent. Uses service-role admin API + direct `pg` for `private.staff_roles`.
- `.env.local` wired to local Supabase.

**Bugs caught during Phase 2:**
1. `supabase_auth_admin` lacked `USAGE` on `public` schema → `permission denied for schema public` when GoTrue called the hook. Fixed: explicit grant in 005.
2. `service_role` had zero table grants (same raw-psql bypass of Supabase's event trigger). Fixed: `grant all on all tables in schema public to service_role` in 003_rls.
3. Broad `grant ... to authenticated` in 003 clobbered the narrow `staff` column lock from 002 (REVOKE insert/update/delete). Fixed: re-apply staff locks AFTER the broad grant, plus added `audit_log` lockdown (append-only).

**Phase 2 audit gate:**
- [x] JWT custom claims correct on every login — 3 roles tested via `tests/rls/auth_hook.test.ts`
- [x] Inactive staff get role=null/garage_id=null → deny-all
- [x] No way to set `garage_id` from the client — PostgREST PATCH on `staff` with `garage_id` is rejected (tested)
- [x] Passwords: NIST 800-63B min 8, pwned-passwords check in unit test (5 assertions)
- [x] Session cookies: httpOnly, secure=true in prod (via @supabase/ssr), SameSite=Lax (Supabase default)
- [x] Logout revokes refresh token + clears all cookies (POST /logout handler)
- [x] Typecheck, lint, secrets audit, build all clean
- [x] 29 RLS tests passing, 6 unit tests passing, clean migration apply from wiped schema
- [ ] Pwned-passwords on sign-up flow (not yet tested live against GoTrue because public signup is disabled — will test when managers provision users in Phase 3+)

**Tomorrow (Phase 3 — Customers, vehicles, import dry-run):**
- `createCustomer`, `updateCustomer`, `softDeleteCustomer` server actions
- `createVehicle`, `updateVehicle` server actions
- Phone normalisation (libphonenumber-js, GB default, E.164)
- Registration normalisation (uppercase, strip whitespace)
- Dedup on phone (UI conflict resolution)
- `scripts/import-fluent-forms.ts` dry-run against sample CSV
- zod validation on every action

---

## Sat 11 Apr 2026 – Phase 3 — Customers, vehicles, import dry-run

**Today:**
- `src/lib/validation/phone.ts` — phone normalisation via `libphonenumber-js/core` + explicit metadata (avoids ESM↔CJS interop bug with the default entry). E.164, GB default region.
- `src/lib/validation/registration.ts` — reg normalisation: strip whitespace, uppercase.
- `src/lib/validation/schemas.ts` — shared zod schemas for customer + vehicle CRUD. Used by both Server Actions (enforcement) and future client forms (UX).
- `src/app/(app)/app/customers/actions.ts` — `createCustomer`, `updateCustomer`, `softDeleteCustomer` Server Actions. zod-validated, phone normalised, duplicate phone detected via Postgres unique_violation (23505). `requireManagerOrTester()` on every action. `garage_id` always from session, never from client.
- `src/app/(app)/app/customers/vehicles/actions.ts` — `createVehicle`, `updateVehicle` Server Actions. Reg normalised, duplicate reg detected.
- `scripts/import-fluent-forms.ts` — Fluent Forms CSV importer. Dry-run by default, `--commit` for live writes. Authenticates as a manager via email+password (NOT service_role), reads `garage_id` from decoded JWT claims, all writes go through PostgREST + RLS. Handles missing name/phone (skip), invalid phone (error), in-CSV duplicates (dupe). Select-then-insert pattern for partial unique indexes.
- `tests/fixtures/sample-import.csv` — 7-row fixture covering ok, skip, error, and dupe cases.
- Live import verified: 3 customers + 2 vehicles written to Dudley garage with normalised phones and registrations.

**Bugs caught:**
1. `libphonenumber-js` default ESM entry has an interop bug under tsx where `metadata.min.json.js`'s `export default` gets wrapped in `{ default: ... }`. Fixed: import from `libphonenumber-js/core` + load metadata via CJS require in scripts, direct JSON import in app code.
2. Partial unique index (`garage_id, phone WHERE deleted_at IS NULL`) doesn't support ON CONFLICT via PostgREST `upsert`. Fixed: select-then-insert pattern.
3. `user.app_metadata` from `signInWithPassword` doesn't reflect auth-hook additions — those live only in the JWT. Fixed: decode `session.access_token` to read claims.

**Phase 3 audit gate:**
- [x] zod validates every input on every Server Action
- [x] Cross-tenant insert blocked by RLS WITH CHECK (proven in Phase 1 RLS suite, 29 tests passing)
- [x] Import script does not bypass RLS — uses anon key + manager-scoped session, not service_role
- [x] Phone normalised to E.164 on write, no raw phone stored alongside hash in any log
- [x] Typecheck, lint, build clean
- [x] 6 unit tests + 29 RLS tests passing

**Calendar:** M1 in 5 days (Thu 16 Apr). Phases 0–3 done in 2 days. On track.

---

## Fri 10 Apr 2026 (end of day)

**Yesterday:** Planning docs completed (CLAUDE.md, BACKEND_SPEC.md, BACKEND_AUDIT_PROMPT.md, AUDIT_PROMPT.md, DESIGN_SYSTEM.md, requirements). No code written yet.

**Today (Phase 0 — Repo + infra scaffold):**
- Scaffolded Next.js **16.2.3** (the latest, strict superset of the Next 15 architecture in BACKEND_SPEC) with App Router, TypeScript strict (+`noUncheckedIndexedAccess`), Tailwind v4, ESLint flat config, src/ layout
- Installed runtime deps: `@supabase/ssr`, `@supabase/supabase-js`, `zod` v4, `react-hook-form`, `@react-pdf/renderer`, `twilio`, `file-type`, `libphonenumber-js`, `lucide-react`, `clsx`, `cva`, `tailwind-merge`, `date-fns`, `server-only`
- Installed dev deps: `vitest` + `@testing-library/react` + `jsdom`, `@playwright/test`, `prettier` + tailwind plugin, `eslint-plugin-security`, `tsx`
- Created folder skeleton matching CLAUDE.md: `src/app/(app)/app/{tech,jobs,customers,bay-board,bookings,settings}`, `src/app/(public)/{status,kiosk}`, `src/app/(auth)/login`, `src/app/api/{kiosk,status,approvals,twilio,dvsa}`, `src/lib/{db,auth,sms,pdf,security,validation}`, `src/components/{ui,app}`, `supabase/{migrations,seed}`, `tests/{unit,e2e}`, `scripts/`
- **Security headers** in `next.config.ts`: CSP (default-src 'self', frame-ancestors 'none', upgrade-insecure-requests, dev-only 'unsafe-eval'), HSTS 2y+preload, X-Frame-Options DENY, X-Content-Type-Options, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy zeroed-out by default, COOP/CORP same-origin. Per-route override on `/kiosk/*` re-enables `camera=(self)` for part-invoice photo capture
- `productionBrowserSourceMaps: false` (audit gate item) and `poweredByHeader: false`
- `.env.example` documenting every env var the app will need across all phases — every secret labelled SERVER ONLY, only true public keys behind `NEXT_PUBLIC_*`
- `src/lib/env.ts` (server-only, zod-validated, lazy-cached) and `src/lib/env.public.ts` (client-safe NEXT_PUBLIC_* surface) — single typed entry point, fail-loud on boot
- `scripts/audit-public-env.ts`: walks every `git ls-files` source file and bans `NEXT_PUBLIC_*_SECRET`/`*_TOKEN`/`*_PRIVATE`/`*_PASSWORD`/`*_API_KEY` identifiers. Wired as `pnpm audit:secrets`
- Vitest config + sanity test (passing). Playwright config + security-headers e2e spec (verifies all 6 headers + kiosk camera override + no `X-Powered-By`)
- GitHub Actions CI: lint → typecheck → vitest → build → playwright → gitleaks. CI ships with placeholder envs that satisfy `env.ts` zod schema without exposing real secrets
- Stub pages for `/`, `/app`, `/kiosk`, `/status`, `/login` so the build resolves all 6 routes
- Phase 0 audit gate ✅
  - `pnpm typecheck` clean
  - `pnpm lint` clean
  - `pnpm test:unit` passing (1/1)
  - `pnpm audit:secrets` passing
  - `pnpm build` passing — 6 routes prerendered
  - No secrets committed; `.gitignore` covers `.env*` and `*.pem`

**Tomorrow (Phase 1 — Schema + RLS foundation):**
- `001_init.sql` — every table from BACKEND_SPEC §1 in dependency order
- `002_rls.sql` — every policy from §2 + the migration tail RLS-enable loop
- `003_helpers.sql` — `private.current_garage`, `private.current_role`, `private.next_job_number`
- `004_seed.sql` — Dudley garage row, 5 bays, 3 placeholder manager staff (real accounts in Phase 2)
- Vitest RLS suite scaffolding: forge JWTs per role × tenant × table × verb. Aiming for ~200 tests
- Audit gate: zero `pg_tables` rows with `rowsecurity=false`, no `using (true)`, every INSERT/UPDATE has `WITH CHECK`, cross-tenant forge test passes

**Blockers:** None hard. Two open questions for Hossein, batched (one ask, one heads-up):
1. **Supabase connection details** — need URL + anon key + service role for the self-hosted instance, plus Dokploy staging vs production env names. Without these the Phase 1 RLS suite can only run against a local supabase-cli instance (acceptable fallback).
2. **Heads-up:** scaffold landed on Next.js 16.2.3 instead of 15. Strict superset architecturally — App Router, RSC, Server Actions are unchanged; the only material rename is `middleware.ts` → `proxy.ts`. No spec changes needed. Flagging so you're not surprised.

**Calendar check:** M1 in 6 days (Thu 16 Apr), M2 in 13 days (Thu 23 Apr). Phase 0 done on day 1, on schedule.

---

## Thu 9 Apr 2026

**Yesterday:** Initial scope conversations with Hossein. Walked through Dudley's pain points.

**Today:** Drafted full planning pack — `dudley-requirements-v1.md` (signed scope), `CLAUDE.md` (architecture rules), `BACKEND_SPEC.md` (normative schema/RLS/API), `BACKEND_AUDIT_PROMPT.md` (18-phase build plan), `DESIGN_SYSTEM.md` (4-UI design system), `AUDIT_PROMPT.md` (19-phase UI plan). Initial commit landed.

**Blockers:** None. Awaiting Dudley sign-off so build can start.
