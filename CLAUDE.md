# CLAUDE.md — Oplaris Automotive (Dudley Auto Service build)

> Auto-loaded by every Claude Code session. Keep compact. Source of truth for architectural rules. If a rule here conflicts with anything else, this file wins.

## Project

**Client:** Dudley Auto Service (UK independent garage, 5 bays, ~10 staff)
**Product:** Workshop management web app — replaces WhatsApp/voice/Excel chaos with one system. Also the v1 of an Oplaris resellable product for other UK garages.
**Contract:** £2,500 fixed. 2 weeks. 2 internal milestones (M1 = Go-Live Core, end of Week 1 / Thu 16 Apr 2026; M2 = Complete, end of Week 2 / Thu 23 Apr 2026). Everything in `dudley-requirements-v1.md` is in scope. Nothing is "Phase 2."
**Sign-off doc:** `dudley-requirements-v1.md` (root). Do not deviate from it without Hossein's explicit approval.

## Tech stack (locked)

- **Framework:** Next.js 15 (App Router, React Server Components, Server Actions)
- **Language:** TypeScript strict
- **DB / Auth / Storage / Realtime:** **Supabase managed** (Postgres 15+) at supabase.com. App container is Dokploy-hosted; DB + Auth + Storage + Realtime all run on Supabase's infra, not Oplaris hardware. Supabase's daily backups + PITR are the primary line of defence; `scripts/backup.sh` (off-site encrypted `pg_dump` via `rclone`) is belt-and-braces for ransomware / provider-loss scenarios.
- **Styling:** Tailwind + shadcn/ui
- **Forms / Validation:** react-hook-form + zod (zod schemas shared client+server)
- **PDF generation:** `@react-pdf/renderer` (server-side)
- **SMS:** Twilio (Dudley's existing account)
- **MOT lookup:** DVSA MOT History API (Dudley's existing credentials)
- **Background jobs / cron:** Postgres `pg_cron` + Supabase Edge Functions (no extra infra)
- **Rate limiting:** private-schema Postgres table + IP+user combined (no external Redis dependency for v1)
- **Tests:** Vitest (unit) + Playwright (e2e for the 4 critical flows: kiosk booking, tech start/complete job, customer approval, customer status page)

## Architecture rules (non-negotiable)

1. **Multi-tenant from day one.** Every domain table has `garage_id uuid not null references garages(id)`. Every RLS policy filters on it. Dudley = one row in `garages`. The resale product flips on by adding rows. No code anywhere may assume a single garage.
2. **Never trust the client.** Prices, role checks, garage_id, status transitions, ownership — all enforced server-side via RLS + Server Actions. No business logic in client components.
3. **RLS on every public table, always.** Migrations end with the `ENABLE ROW LEVEL SECURITY` loop from `vibe-security/references/database-security.md`. No `USING (true)`. No `USING (auth.uid() IS NOT NULL)`. Every INSERT/UPDATE policy has `WITH CHECK`. Sensitive columns (role, garage_id) are revoked from `authenticated` and only writable via `SECURITY DEFINER` functions in a `private` schema.
4. **UUID primary keys everywhere.** No serial/bigint exposed in URLs. Job numbers (human-facing) are a separate `job_number` column generated server-side.
5. **Secrets are server-only.** Service role key, Twilio auth token, DVSA key — never `NEXT_PUBLIC_*`. Server Actions and Route Handlers only. `.env.local` in `.gitignore`. Production secrets injected by Dokploy.
6. **Twilio webhooks verified.** Inbound status callbacks and approval callbacks check the `X-Twilio-Signature` header. Reject anything that doesn't match.
7. **Customer approval links are signed + single-use.** HMAC(SHA-256) with a server-only secret over `{job_id, line_item_id, expires_at, nonce}`. Stored in `approval_tokens` with `used_at`. 24h expiry. Constant-time comparison.
8. **Customer status page is hostile-internet hardened.** Rate-limited 3/phone/hour + 10/IP/hour. Same response shape regardless of whether reg/phone exists (no enumeration). 6-digit code, 10-min expiry, single use, audit-logged. Phone-on-file must match exactly. **Dev-only exception:** `STATUS_DEV_BYPASS_SMS=true` with `NODE_ENV!=="production"` returns the code inline in the response so staging can run E2E without a live Twilio account. Runtime-guarded in `serverEnv()` (throws at boot in prod), audit-logged per bypass, response shape stays canonical on reg/phone mismatch. Full spec: `docs/redesign/STAGING_SMS_BYPASS.md`.
9. **File uploads scoped to job.** Storage bucket policy keys files under `garage_id/job_id/...`. RLS on `storage.objects` enforces it. Max 10 MB. Allowed MIME: `application/pdf`, `image/jpeg`, `image/png`. Magic-byte check server-side, not just extension.
10. **Passwords follow NIST SP 800-63B.** Min 8 chars, no composition rules, checked against the Pwned Passwords k-anonymity API. Argon2id (Supabase default is fine). No password rotation policy.
11. **GDPR baked in.** Soft-delete with `deleted_at` + 30-day hard-delete cron. `customer_data_export(customer_id)` SECURITY DEFINER returns full JSON dump. `audit_log` table records every read of customer PII by staff.
12. **Backups before go-live.** Nightly `pg_dump` to off-site encrypted storage. Restore tested at least once before M2 sign-off. No backups = no go-live.
13. **No client-side env vars contain secrets.** Audit `NEXT_PUBLIC_*` on every PR.

## Invoice lifecycle (migrations 045 + 046)

Invoices move through four explicit states. Each transition has a named server action in `src/app/(app)/app/jobs/charges/actions.ts` and a dedicated button in `ChargesSection.tsx`. **Every backward transition is a manager override with a destructive-confirm dialog** — don't silently roll back history.

```
draft ──────── Send Quote ──────► quoted ──── Generate Invoice ─────► invoiced ──── Mark as Paid ──────► paid
  ▲                                  │                                   │                                 │
  │                                  │                                   │                                 │
  └── (no revert — drafts can      Revert to quoted              Revert to invoiced                   (terminal —
       just be deleted)             ◄──────────                   ◄──────────                          no state
                                    clears                         clears paid_at                      beyond paid)
                                    invoiced_at                    + payment_method
```

**Per-state behaviour:**
- **`draft`** — charges CRUD is free, no side effects, no customer visibility.
- **`quoted`** — charges **still editable**. Every charge mutation bumps `invoices.revision` + stamps `updated_at` (DB trigger from migration 045). `resendQuote()` action re-fires the SMS with revision-aware copy (`"Your quote …has been updated (rev 2). New total £X"`). Customer status page shows an amber "Updated" chip + `rev N` in the reference line.
- **`invoiced`** — charges **read-only**. Customer sees the amber quote tile still but the state-machine has locked edits. Escape hatch: `revertToQuoted()` manager override behind a `<ConfirmDialog destructive>`.
- **`paid`** — terminal. `paid_at` + `payment_method` (cash/card/bank_transfer/other) are stamped. Customer status page flips to a green PAID badge. Invoice PDF gets a diagonal green PAID watermark. Escape hatch: `revertToInvoiced()` — clears `paid_at` + `payment_method`, flips back to `invoiced`.

**Reports consequence (`/app/reports`, migration 046):** `getReceivablesSummary()` splits the book into three buckets — **Outstanding** (`invoiced + paid_at IS NULL`), **Paid this period** (`paid + paid_at >= cutoff`), **Still quoted** (`quoted` pipeline). Plus an aging table on the unpaid stack: 0–7 / 8–30 / 30+ days ("chase hard" amber row on 30+). The legacy "Parts Revenue" KPI is left in place for back-compat but is a superset; the new three-bucket split is the authoritative financial view.

**Invariants the central gate enforces** (`assertInvoiceEditable` in `charges/actions.ts`):
- Charge CRUD is refused with a clear toast on `invoiced` or `paid`. No silent no-ops.
- Revision only bumps on `quoted` state mutations — never on `draft` (nothing to revise yet) or `invoiced`/`paid` (locked).
- `markAsQuoted` + `markAsInvoiced` are self-healing — both call `getOrCreateInvoice` first so the row exists before the UPDATE runs. (Previous bug: silent no-op when the invoice row was missing — fixed 2026-04-18.)
- `revertToInvoiced` clears `paid_at` + `payment_method` atomically to prevent the reports page double-counting a reverted payment.

**Out-of-scope (Phase 2):** partial payments (needs child `invoice_payments` table), refunds (negative payments), receipt SMS on payment, HMRC-compliant credit-note + reissue flow for true VAT invoicing on resale garages.

## The four UIs

| UI | Audience | Device | Path |
|----|----------|--------|------|
| **Manager dashboard** | Managers (3) | Desktop primary, phone secondary | `/app/*` |
| **Technician mobile** | Mechanics + MOT testers (7) | Phone (old Android, gloves, bright light) | `/app/tech/*` |
| **Tablet kiosk** | Walk-in customers | 10" tablet in reception, locked-down | `/kiosk/*` |
| **Customer status page** | Public | Phone | `/status` |

Each UI has its own layout, its own auth model (status page = phone+SMS code; kiosk = no auth, hardware-trusted; app = email+password+role), and its own design rules in `docs/redesign/DESIGN_SYSTEM.md`.

## Roles

`manager` (full access, 3 users) · `mot_tester` (2) · `mechanic` (5, incl. 2 electrical) · `customer` (status page only, no DB user — phone-based ephemeral session)

**Multi-role support (migration 025):** A staff member can hold multiple roles simultaneously (e.g. mechanic + mot_tester). Roles stored as `text[]` array on `staff.roles` and as individual rows in `private.staff_roles`. JWT carries `roles` array in `app_metadata`. Sidebar shows union of all permitted pages. `requireRole()` passes if ANY of the user's roles matches. Managers can assign/change roles via Settings > Staff > Edit.

**Page access policy (P48 — Phase 2):** Sidebar and route access are role-scoped, with manager always able to override.

| Route | manager | mot_tester | mechanic |
|---|---|---|---|
| Today `/app` | ✓ | ✓ | ✓ |
| My Work `/app/tech` | ✓ | ✓ | ✓ |
| Job detail `/app/jobs/[id]` | ✓ all | ✓ if MOT or assigned | ✓ if assigned |
| Check-ins `/app/check-ins` | ✓ | — *(MOT check-ins surface in Today / My Work — no dedicated page)* | ✓ |
| Jobs list / Customers / Stock / Reports / Settings / Warranties | ✓ | — | — |
| MOT history (on job page) | ✓ | ✓ | — |

Enforced at three layers: sidebar nav (`NAV_ITEMS_BY_ROLE`), route middleware (redirect to `/403`), Server-Action + RLS policies. Never relax this table to pass a test.

**Check-in routing (P47 — Phase 2):** MOT testers see only MOT-type check-ins; mechanics see electrical + maintenance check-ins; manager sees all. MOT testers self-start. Mechanics self-start electrical / maintenance.

**Pass-back data model (P51 — Phase 2, supersedes P47 pass-back bits):** One job per vehicle visit. A pass-back is an **event on the job**, not a new booking or a new job. The MOT tester clicks "Pass to mechanic" → the 11-item checklist (droplink / tyres / washer pump / brake pads / brake disks / suspensions / hand brake / wipers / mirrors / light bulb [+detail] / other [+detail]) + note is written to `job_passbacks(job_id, from_role, to_role, items, note, created_at, returned_at)` and the job's `current_role` column flips `mot_tester → mechanic`. The mechanic's My Work shows a dedicated "Passed back to me" section powered by `jobs WHERE current_role='mechanic' AND no-mechanic-assigned`. One click Claim adds them to `job_assignments` on the same job id. When the mechanic finishes they call `return_job_to_mot_tester()` → `current_role` flips back, `job_passbacks.returned_at` stamped, tester resumes. **Result: 1 booking → 1 job → 1 invoice → 1 customer-facing timeline, regardless of how many pass-backs happen.** No `jobs.parent_job_id`, no second `bookings` row, no cross-job invoice merge. Full spec in `docs/redesign/MASTER_PLAN.md > P51` and visual walk-through at `docs/redesign/USER_FLOW_DIAGRAM.html`. Writes are mediated by SECURITY DEFINER RPCs `pass_job_to_mechanic()` and `return_job_to_mot_tester()`; manager can override via direct UPDATE (manager RLS policy). **Deprecation:** `jobs.awaiting_passback`, `jobs.status='awaiting_mechanic'`, and `bookings.{passback_note,passback_items,passed_from_job_id}` are kept for one 2-week soak then removed by migration 034. No new code may write to them.

**Work log state (P44 — Phase 2):** Three actions — start / pause / stop — each writing full HH:MM:SS timestamps to `work_logs`. One active log per (job, technician) enforced by partial unique index. Formatter util `formatWorkLogTime` / `formatWorkLogDuration` in `src/lib/format.ts` is the only rendering path.

**Live worker visibility (P49 — Phase 2):** Any live job shows a "Currently working" panel with active tech name + role + running timer. Visible on manager, tech, and customer status-page views of the job. RLS on `work_logs` allows status-page reads scoped to the viewer's own customer+vehicle.

**Realtime (P50 — Phase 2):** Single shared hook `useRealtimeRouterRefresh({ table, filter, event })` in `src/lib/realtime/`. Wired to sidebar badge, check-ins list, Today dashboard, and currently-working panel. RLS applies to realtime payloads — a mechanic cannot receive events for manager-only tables. Status-page realtime filters strictly by signed-session job IDs (rule #8 stays intact). Debounce 1 refresh per 2 s. REPLICA IDENTITY FULL on `bookings` + `work_logs`.

## Current priority order (quality over deadline)

> **Decision 2026-04-14:** The original Thu 16 Apr deadline is superseded. Hossein wants to ship a properly-tested, properly-polished product — no rush. Work proceeds in the 5 phases below, strictly in order. Do not jump ahead.

**Phase 1 — Functional testing across all roles (DONE 2026-04-14).** All defects in `PHASE1_DEFECTS.md` closed (D1, D3, D4, D5). Role-test matrix in `ROLE_TEST_PLAN.md` updated to reflect the My Work restructure.

**Phase 2 — Feature improvements (DONE 2026-04-15 bar P51.10 soak-gated drop).** Most of Part F shipped 2026-04-14: P36 inline→modals, P37 equal card heights, P39 P30 close-outs, P40 labour rate flexibility, P41 delete check-in audit, P42 sidebar badge polish, P43 kiosk DVSA lookup (kiosk-paired route), P44 work-log HH:MM:SS formatter, P45 kiosk email + manager visibility, P47 role-aware check-in routing (pass-back bits SUPERSEDED by P51), P48 role-based sidebar + access policy, P49 currently-working panel, **P51 pass-back-as-event (DONE 2026-04-14 — migration 033/033b applied, new RPCs `pass_job_to_mechanic` / `return_job_to_mot_tester` / `claim_passback`, mechanic "Passed back to me" pull queue, job-detail pass-back timeline + `current_role` chip; 12/12 new RLS tests green; P51.6 customer-status-page timeline + P51.10 migration 034 drop still pending post-soak)**. **P52 job-detail header reorg + P51 soak-bug fix (DONE 2026-04-14 — `awaiting_mechanic` removed from `STATUS_TRANSITIONS.in_diagnosis` / `in_repair` (key kept for legacy reverse rolls during soak), `updateJobStatus` server guard rejects awaiting_mechanic with the spec error, `JobActionsRow` extracted with Primary / Secondary / ⋯ Overflow zones + mobile Sheet via `useMediaQuery`, manager "Override role" sub-menu wired to direct UPDATE, `RoleBadge` split into `src/components/ui/role-badge.tsx` and moved into the identity row, orphaned `StatusActions.tsx` deleted; 35 unit tests + Playwright e2e spec; P52.1–12 all green).** **P50 universal realtime (DONE 2026-04-14 — migration 035 sets REPLICA IDENTITY FULL on 16 coverage-matrix tables incl. `job_passbacks` and curates the `supabase_realtime` publication; new shared hook `useRealtimeRouterRefresh` (zod-validated, debounced, SSR-safe) + typed `garageFilter` / `eqUuidFilter` / `idInFilter` + `ALLOWED_TABLES` whitelist; per-surface client shims wired into all 14 staff surfaces (sidebar, Today, My Work, Bookings, Jobs list + detail, Tech job detail, Customers list + detail, Vehicles list + detail, Stock, Reports, Settings → Staff, Bay board) + 4 s polling on the public status page (anon JWT can't subscribe); legacy `bay-board-channel.ts` deleted — `grep -rn 'supabase.channel(' src/` returns only `src/lib/realtime/`. 13 unit + 9 RLS realtime tests green, 81/81 unit total. Eight criteria fully test-verified (P50.10/.11/.15 + P50.S1/S2/S3/S6/S8); ten code-wired pending staging spot-check; two (P50.S9/S10) deferred to Phase 4 reverse-proxy.)** **P46 assign-tech modal polish (DONE 2026-04-14 — `promoteBookingToJob` renamed + tightened to `createJobFromCheckIn(checkInId, technicianId)` with manager gate, converted-check-in refusal, technician-role check, mandatory job_assignments insert; `getStaffAvailability` now filters to mechanic + mot_tester only and surfaces `currentJobId` for the busy-tech link; `groupTechsByAvailability` extracted to `bookings/group-techs.ts`; modal renders Available section first, then divider + Busy section with each row showing the in-flight job number plus a clickable `/app/jobs/{id}` link in the busy-confirmation panel; 7 new unit tests + 88/88 unit total green).** **P38 mobile-first responsive pass (DONE 2026-04-14 — `AppShell` extracts the static sidebar (md+) + mobile `<Sheet>` drawer (driven by the existing TopBar hamburger, closes on nav-link click); legacy `sidebar-nav.tsx` deleted; `SidebarNavList` shared between static + drawer surfaces, role-filtered through the same NAV_ITEMS table; Customers / Stock items / Active warranties / Bookings / Audit log all gained `md:hidden` mobile card lists above their `hidden md:block` desktop tables; job detail relaxed `max-w-4xl` → `md:max-w-4xl`, identity row stacks `flex-col sm:flex-row`, `grid-cols-1 sm:grid-cols-3` on the customer/vehicle/bay cards, main padding eased `p-4 sm:p-6`; NewCustomerForm + NewJobForm paired fields use `grid grid-cols-1 sm:grid-cols-2` with `w-full sm:w-auto` submits and `flex-col-reverse sm:flex-row` button stack; sidebar nav links pinned to `min-h-11` (WCAG 2.5.5). Six criteria fully done; P38.7 / P38.8 static-clean (`overflow-x-auto` only inside the Table primitive which is now `hidden md:block` everywhere) with manual 375 px spot-check still required at staging.).** **P53 override handler command palette (DONE 2026-04-14 — migration 037 applied; new SECURITY DEFINER RPC `public.override_job_handler(p_job_id, p_target_role, p_remove_staff_ids, p_assign_staff_id, p_note)` mediates role flip + assignee removal + optional direct assign + running-timer auto-stop + open-passback close-out + audit_log write, all atomic; server action `overrideJobHandler` replaces the P52 direct-UPDATE `overrideJobRole` (deleted); new client `ChangeHandlerDialog.tsx` renders shadcn `Command` palette (queue options + role-grouped staff w/ fuzzy search + availability pills) → override dialog with Zones A/B/C (assignees w/ pre-ticked mismatches, optional direct-assign picker, optional note) using `useMediaQuery` to swap Dialog ↔ Sheet at 639 px; `pickPrimaryAction` unchanged; overflow menu's three-item `Override role →` submenu replaced with one `Change handler…` item (manager-only); pure-logic helpers `computeDefaultRemovals` / `decidePaletteSelection` / `composeSubmitLabel` live in `change-handler-logic.ts`; 9/9 RLS tests + 14/14 unit tests green (6 action + 8 logic) + Playwright e2e spec (skipped pending staging); vibe-security audit clean (no Crit/High/Med); `StaffAvailability` gained a `roles: string[]` field to feed the palette grouping; RLS fixture also now syncs `public.staff.roles` from `private.staff_roles` to mirror production writes. P53.1–14 all green; browser-based design-critique is the sole pending-staging item (screenshots of palette + confirm dialog + mobile Sheet).)** **P54 unified Job Activity timeline (DONE 2026-04-15 — migration 036 applied local + remote; new `public.job_status_events` table with RLS + write-revoke, SECURITY DEFINER `public.set_job_status(p_job_id, p_new_status, p_reason)` mediates atomic status flip + event insert + completed_at stamp + awaiting_mechanic guard; best-effort backfill covers every existing job at created_at; `public.job_timeline_events` view unions job_passbacks (passed_to + returned_from), work_logs (work_session + work_running), and job_status_events, declared `with (security_invoker = on)` so base-table RLS stays authoritative; migration adds `job_status_events` to the `supabase_realtime` publication + REPLICA IDENTITY FULL, with the `ALLOWED_TABLES` whitelist kept in sync (17 tables now); `updateJobStatus` rewired to `supabase.rpc("set_job_status", …)` so every transition writes an event in one transaction; new `src/lib/timeline/{fetch.ts,customer-labels.ts}` — `getJobTimelineEvents(jobId, { audience: 'staff' | 'customer' })` batches actor full-names into first-name attribution and filters to the curated customer subset for the public page; new RSC `src/app/(app)/app/jobs/[id]/JobActivity.tsx` renders the unified feed with icon-gutter rows, running sessions pinned to top (absorbs P49's `CurrentlyWorkingPanel`), and the `Log Work` button in the section header; `/api/status/state` returns `timeline` payload (first-name-only, no enum leakage) for the 4 s polling public page; `JobDetailRealtime` shim extended with `job_status_events` subscription so the feed refreshes live on status transitions too; legacy `CurrentlyWorkingPanel.tsx` + the tech page's "Work History" block + `workLogs` prop on `TechJobClient` all deleted (`grep -rn CurrentlyWorkingPanel src/` is 0); P47.8 and P51.6 subsumed. **Bug fixes during implementation (same PR):** (a) view emits the same `event_id` for passed_to + returned_from pairs → React key collision caused stale/duplicate rows + a "sticky" top entry during realtime refresh; fixed by composing `key={kind-eventId}`, a client-side `(at desc, eventId asc)` stable sort in `JobActivity`, and a secondary `.order("event_id")` tiebreaker in the fetcher. (b) "Pause" button on the tech UI was mislabelled — `pauseWork` and `completeWork` are identical in the current schema (both set `ended_at`), so the UI looked "completed" after pause with no resume path; renamed the button to "Stop" (Square icon) so the effect matches the label — true resumable-pause deferred pending a `work_session_pauses` table. 11/11 new RLS tests + existing unit suite expanded to 127/127 green (added: 8 fetcher + 11 customer-labels + 11 job_timeline_view RLS + 2 realtime/publication updates), typecheck clean, vibe-security audit clean; Playwright e2e spec written (skipped pending staging). P54.1–15 all green except P54.10/.11 which are code-wired + test-verified but need a staging spot-check for the ≤2 s realtime loop.)** **P55 real pause/resume on work sessions (DONE 2026-04-15 — migration 038 applied local + remote; new `work_logs` columns `paused_at / paused_seconds_total / pause_count` gated by a `work_logs_pause_state_valid` CHECK constraint; generated `duration_seconds` recomputed to `greatest(0, ended_at-started_at - paused_seconds_total)` so every downstream reader (reports, PDF, charges, timeline view, dashboards) gets worked-time not wall-time for free; three reporting views (`job_timeline_events` / `v_tech_hours` / `v_common_repairs`) dropped + recreated to pick up the new column; three SECURITY DEFINER RPCs `pause_work_log` / `resume_work_log` / `complete_work_log` all owner-or-manager + single-garage, with state-machine guards (double-pause P0001, resume-without-pause P0001, complete idempotent on already-ended); `job_timeline_events` payload now carries `paused_seconds_total` + `paused_ms_total` + `pause_count` on work_session rows and the live `paused_at` marker on work_running rows; server actions `pauseWork` / `resumeWork` (new) / `completeWork` rewired to the RPCs; `TechJobClient.tsx` now has three button states (Start / Pause+Complete / Resume+Complete), timer freezes in amber with a "Paused" chip while paused, resumes from `(paused_at - started_at) - paused_seconds_total` in green on resume; pure timer math extracted to `work-log-timer.ts` with 7 unit tests. 14 new RLS tests + 7 unit tests green, 134/134 unit + 78/78 RLS total, typecheck clean, vibe-security audit clean. Supersedes the cosmetic Pause→Stop rename from earlier in the P54 session.)** **Remaining in priority order:** P51.10 (migration 034 after ~2026-04-28 soak end). No new code may write to `jobs.awaiting_passback`, `jobs.status='awaiting_mechanic'`, or the deprecated `bookings.passback_*` / `passed_from_job_id` fields — use the P51 RPCs. New realtime subscriptions must go through `useRealtimeRouterRefresh` (the only sanctioned `supabase.channel(` call site) and add their table to both the publication (migration) and `ALLOWED_TABLES` (whitelist).

**Phase 3 — Visual refinement (DONE 2026-04-18).** Full stack shipped. See `docs/redesign/VISUAL_IMPLEMENTATION_PLAN.md` for the per-phase test checklist and `STANDUP.md` 2026-04-18 for the close-out log.

**Phase 3 close-out includes two migrations layered on top of the visual work:**
- **Migration 045 — invoice revisions.** Adds `invoices.revision int default 1` + `updated_at timestamptz` with auto-bump trigger. Enables the `quoted`-state editing tier: charges stay mutable after Send Quote, every mutation bumps revision, `resendQuote()` action fires revision-aware SMS copy. Customer status page gets an amber "Updated" chip. See the Invoice lifecycle section below for the full state machine.
- **Migration 046 — invoice payments.** Adds `invoices.paid_at` + `payment_method` (CHECK-constrained: cash / card / bank_transfer / other) + partial index `invoices_unpaid_aging_idx` for the reports aging query. CHECK on `quote_status` widened to include `paid`. New `markAsPaid()` + `revertToInvoiced()` actions, "Mark as paid" dialog in `ChargesSection`, green PAID banner + PAID badge on customer status page, diagonal PAID watermark on invoice PDF, and a new Receivables section on `/app/reports` with 3 KPI cards (outstanding / paid-this-period / still-quoted) + 0-7 / 8-30 / 30+ day aging table.

Part of the resale positioning — Dudley is the first showcase, future prospects see this UI on demo day 1. **V1 theming infrastructure (DONE 2026-04-15 — migrations 039 + 040 + 041 applied local + remote; new brand_primary_hex / brand_accent_hex / brand_name / brand_font columns on `public.garages` with hex-shape CHECK constraints; new `garage-logos` Storage bucket with manager-only write + public read policies keyed under `{garage_id}/logo.{ext}`; migration 041 closes a pre-existing silent bug — `public.garages` had no UPDATE RLS policy, so the billing settings action had been no-op'ing without raising; new `garages_update_manager` policy scoped to `id = private.current_garage() and private.has_role('manager')`; new pure module `src/lib/brand/oklch.ts` implements sRGB → OKLab → OKLCH conversion + WCAG AA foreground picker (18 unit tests, known-answer vectors for #FFFFFF / #000000 / #FF0000 / #00FF00 / #3B82F6 / #D4232A); new RSC-cached loader `src/lib/brand/garage-brand.ts` exposes `getGarageBrand()` + `getGarageBrandById()` + `brandStyleBlock(brand)`; `(app)/layout.tsx` injects a server-rendered `<style id="garage-brand-tokens">` block overriding `--primary / --primary-foreground / --accent / --accent-foreground / --ring` (both `:root` and `.dark` scopes) so every shadcn/ui component re-themes automatically; new `src/components/ui/garage-logo.tsx` renders Next `<Image>` when a `logo_url` is set, else a wordmark in `var(--primary)`; `Sidebar` + mobile `Sheet` drawer title now read `garageName` + `garageLogoUrl` from the layout; manager-only `/app/settings/branding` page (page.tsx + BrandingForm.tsx + actions.ts) — native colour picker, hex text input, live-preview card, logo upload (SVG/PNG/JPEG/WebP, 2 MB, magic-byte validation for raster + XML-shape sniff for SVG) via `uploadGarageLogo` / `removeGarageLogo` server actions with manager gate; `updateGarageBrand` action zod-validates + writes through the new UPDATE policy + revalidates the layout. 4 new RLS tests (garages_update_policy) + 18 unit tests (brand-oklch); 152/152 unit + 82/82 RLS total green, typecheck clean, vibe-security audit clean. V1.6 (dark-mode toggle UI) + V1.7 (kiosk/status public brand resolution) deferred to V6 + V5 respectively per their natural scope.)** **P56.0 spacing scale, density primitives + codemod (DONE 2026-04-15 — `scripts/check-spacing-tokens.ts` lints every off-grid `.5` Tailwind class with a tight allow-list (`gap-1.5` icon-pair token + `py-0.5` only inside `reg-plate.tsx`); wired into `pnpm lint` and asserted by `tests/unit/spacing-tokens.test.ts`. `scripts/codemod-off-grid.ts` rewrote 100 off-grid tokens across 39 files in a single pass — full breakdown: 21× `mt-0.5→mt-1`, 16× `py-0.5→py-1`, 14× `px-1.5→px-2`, 13× `py-1.5→py-2`, 7× `px-2.5→px-3`, 5× `pl-1.5→pl-2`, 4× `py-2.5→py-3`, 3× each `mt-1.5→mt-2` / `gap-0.5→gap-1` / `pr-1.5→pr-2`, 2× each `mr-1.5→mr-2` / `space-y-1.5→space-y-2` / `ml-0.5→ml-1` / `gap-2.5→gap-3`, 1× each `p-0.5→p-1` / `p-2.5→p-3` / `pl-2.5→pl-3`. New `Card size` variants: `sm` (p-3, dense rows), `default` (p-4, KPIs + standard cards), `lg` (p-6, hero) with header/content/footer all picking up the size via `group-data-[size=X]/card:` selectors; covered by `tests/unit/card-density.test.tsx`. New `<Section>` primitive owns `mt-8 first:mt-0` between named sections + optional title/description/actions header + `mt-3` body gap (`src/components/ui/section.tsx`). New `<Stack gap="sm|md|lg">` (`space-y-2|4|6`, `as="div|ul|ol"`) replaces ad-hoc stack rhythms (`src/components/ui/stack.tsx`). Bay-board job card rewritten to use `<Card size="sm">` + `<Stack gap="sm">` with the audit's "internal-tighter-than-external" rhythm (S-C3); tech "My Work" Passback / Checked-in / In-progress sections wrapped in `<Section>` so the 32-px inter-section rhythm is enforced centrally (S-H1, S-H6); Today-page KPI cards switched to `size="sm"` + `text-2xl` shaving ~32 px per card off the F-pattern fold (S-H3); sidebar nav top padding aligned to app-shell's `p-4 sm:p-6` so the first nav link's baseline meets the page title's (S-M8). DESIGN_SYSTEM §1.3 (already updated by Hossein) is now load-bearing and matches the implementation. 5 new unit tests + the existing suite green: 180/180 unit + 82/82 RLS, typecheck clean, `pnpm lint:spacing` clean.)** **Phase 3 — all shipped 2026-04-18:**
- **STAGING_SMS_BYPASS** — done 2026-04-17 (env guard, dev-only inline code, CI prod guard).
- **P56.0 spacing codemod** — 100 off-grid tokens rewrote across 39 files; `pnpm lint:spacing` gate.
- **P56.1 foundation** — Button size scale aligned to 44-px rule; dark-mode semantic tokens; `font-heading` wired; `next-themes` toggle in top-bar user menu.
- **P56.2 forms** — `<FormCard>` + `<FormActions>` migrated across 14 staff forms (mobile thumb-zone Submit-on-top + desktop right-aligned, `(optional)` / `*` Label hints).
- **P56.3 primitive batch** — shipped `<PageContainer>`, `<PageTitle>`, `<RegPlate>` (static variants), `<PassbackBadge>`, `<ConfirmDialog>`, `<LoadingState>`, `<Combobox>`, `lib/toast.ts` facade; Toaster mounted in root layout.
- **P56.4 page-width migration** — 22 staff pages moved to `<PageContainer width="full|default|narrow|form">`; every ad-hoc `max-w-*` deleted from page roots.
- **P56.5 tech polish** — TechJobClient timer tokenised, task-type buttons, all `style={{minHeight:NN}}` escapes deleted in favour of Button `size="xl"`.
- **P56.6 confirm/alert sweep** — every `alert()` → `toast.error()`, every `window.confirm()` → `<ConfirmDialog>`.
- **P56.7 token migration** — 52 hardcoded colours migrated to semantic tokens across 18 files.
- **P56.8 Combobox + UX** — NewJobForm customer+vehicle pickers via cmdk-backed `<Combobox>` (matches across name/phone/reg). Global reduced-motion rule in `globals.css`.
- **P56.9 visual regression** — `tests/e2e/visual/spacing.spec.ts` scaffold (3 public surfaces at 3 viewports); authenticated surfaces gated on `E2E_STAGING_READY`.
- **P56.10 docs** — DESIGN_SYSTEM §2.1 documents the full primitive set + token migration table + page-width table.
- **V1 theming** (shipped 2026-04-15 — see legacy log below).
- **V2 icon system** — `@phosphor-icons/react` installed; `src/components/icons/index.tsx` barrel with 7 Phosphor automotive icons + 5 custom SVGs (BrakeDisc, OilDrop, Tyre, ObdPort, SparkPlug).
- **V3 illustrations** — bespoke Envato hand-drawn SVG kit (`scripts/import-illustrations.mjs` + `src/components/illustrations/`); 20 male-only / figure-free illustrations curated; 8 list pages wired via expanded `<EmptyState illustration>`. Import script fixed (latent CSS-in-JSX parse error closed).
- **V4 textures** — bespoke `<PatternBackground>` primitive consuming `public/pattern/pattern.svg` (hand-drawn car parts, same artist as V3). Applied at UX-audit-capped opacities to login (4%), bay-board (3%), kiosk welcome (4%), kiosk done (3%), status page (3% full bg). KPI strip + card elevation already shipped under P56.0.
- **V5 / V5.7 branded public surfaces** — `getPublicGarageBrand()` service-role helper + `(public)/layout.tsx` + `(auth)/layout.tsx` inject brand tokens on all pre-auth surfaces; kiosk + status split into server-component wrappers that pass brand props to client. `GarageLogo` on every public hero. **PDF job-sheet branded header** — full-bleed brand-primary bar + accent stripe + brand-coloured section underlines. Sidebar gained quiet "Powered by Oplaris" resale credit.
- **V6 micro-interactions** — page fade-in 200ms (`.page-fade-in` keyframe with `key={pathname}` re-trigger), bay-board drag elevation (scale-1.02 + shadow-xl + ring), dark-mode toggle shipped in P56.1, active-job pulse shipped earlier. Reduced-motion global rule shipped in P56.8.

**Outside Phase 3 but shipped in the same 2026-04-18 push:**
- **Migration 045 — invoice revisions.** See Invoice lifecycle section.
- **Migration 046 — invoice payments.** See Invoice lifecycle section + the Receivables section of `/app/reports`.

**Still pending:** P51.10 migration 034 column drop (~2026-04-28, soak-gated — unchanged).

**Phase 4 — Deploy infrastructure.** Only after Phases 1–3 are green. Hossein provides Dokploy access, staging + prod Supabase URLs + service-role keys, Twilio + DVSA keys, domain + TLS. Infrastructure deliverables shipped on branch `feat/phase4-deploy-infra`: `Dockerfile` + `.dockerignore` (multi-stage node:22-alpine, non-root uid 1001, 302 MB image), `src/app/api/health/route.ts`, `compose.yml` (Dokploy-consumable, every runtime env injected), `scripts/backup.sh` + `scripts/restore.sh` (pg_dump → age → rclone, with a prod-URL refusal on restore), `.github/workflows/deploy.yml` (workflow_run-triggered, pushes to GHCR, fires Dokploy webhook), `scripts/pre-deploy-smoke.ts` (`pnpm pre-deploy`). Operator runbook: **`docs/DEPLOYMENT.md`** — Hossein reads it end-to-end before merge. Backups (Rule #12) must have ≥1 tested restore before any production use. Run the T13 checklist in `TEST_AUDIT_PROMPT.md` against the deployed app before proceeding to Phase 5.

**Phase 5 — Production data import (FINAL step).** Real Fluent Forms CSV imports to the production Supabase **AFTER** the app is deployed and smoke-tested. Sequence: wipe/fresh prod domain tables → apply all migrations → dry-run `scripts/import-fluent-forms.ts` → Hossein + Claude Code eyeball diff → `--commit` → T13 smoke test → Dudley staff start using the app. The production DB never sees test data. Script hardening (dry-run, E.164, dedup, diff report) can happen any time during Phases 1–3 so the script is ready when needed.

**Already closed (do not revisit):**
- B8 `assertPasswordNotPwned` wired into `addStaffMember` in `src/app/(app)/app/settings/staff/actions.ts` — the sole password-set path today. Returns `fieldError.password` on HIBP match; fail-closed on HIBP outage. Tests: `tests/unit/staff-actions-pwned.test.ts`. *If a self-serve signup or password-reset path is added later, mirror the same gate.*
- B9 `/api/kiosk/booking` rate-limited — two hourly buckets `kiosk_booking_ip:{ip}` (5/hr) and `kiosk_booking_ip_reg:{ip}|{reg}` (3/hr), 429 on hit matching `/api/status/*` shape. Tests: `tests/unit/kiosk-booking-rate-limit.test.ts`. Note: `checkRateLimit` is hourly-only; per-minute needs a schema change, not worth it for v1.

**Known minors acceptable at Phase 4 deploy (fix later if desired):** `STATUS_PHONE_PEPPER` key separation (T6), kiosk profanity filter (T7).

## Phase tracker

M1 features — all implemented, test-pass pending staging:

- [x] **M1.0a** Repo scaffold: Next.js 15 + TS strict + Tailwind + security headers + CI
- [x] **M1.0** Supabase schema v1, RLS, auth, seed garage (migrations 001–023 applied)
- [x] **M1.1** Customer + vehicle CRUD; Fluent Forms import script tested on sample data
- [x] **M1.2** Job cards + bay board (drag/drop) + tech assignment
- [x] **M1.3** Tech mobile UI: start/pause/complete, time tracking
- [x] **M1.4** Customer approval SMS flow (signed HMAC links, Twilio webhook-verified)
- [x] **M1.5** Parts module (supplier dropdown, file upload with magic-byte check)
- [x] **M1.6** PDF job sheet (clean minimal style — data only, no branding)
- [x] **M1.7** Customer status page (rate-limited, anti-enumeration, 6-digit SMS code)
- [x] **M1.8** Tablet kiosk (MOT / Electrical / Maintenance) — *rate limit missing, see Blocker #5*
- [x] **M1.9** Manager dashboard
- [x] **M1.10** Twilio integration end-to-end (inbound + outbound + signature verified)
- [x] **M1.11** Charges basket + quote/invoice flow (3-status lifecycle: Draft → Quoted → Invoiced; clean PDF)
- [x] **M1.12** Stock-only supplier warranties (`warranties` table rebuilt, no job coupling)
- [x] **M1.13** Stock locations as managed dropdown
- [x] **M1.14** Staff management in Settings (create / edit / deactivate)
- [ ] **Ship → live** Gated on Phases 1–5 above (functional testing → features → visual → deploy → prod import). No deadline — ships when quality bar is met.

M2 features — already delivered:

- [x] **M2.1** Warranty tracking (rebuilt stock-only)
- [x] **M2.2** Stock management (full CRUD + movement history)
- [x] **M2.3** DVSA MOT history lookup (24h cache)
- [x] **M2.4** Reporting dashboard (date range, KPIs, revenue, CSV export)
- [x] **M2.5** GDPR export (full JSON dump inc. job_parts + work_logs via migration 013) + audit log UI
- [ ] **M2.6** Mobile UX polish + accessibility pass (U17) — deferred post-launch, spec'd in `MASTER_PLAN.md > Part F`
- [ ] **M2.7** Admin guide + walkthrough video (U18) — deferred post-launch

Pre-deploy tests — Run 2 on 2026-04-12:

- [~] T0 PASS, T1 PASS (33/33), T2–T8 STATIC-PASS (dynamic SKIPPED pending staging), T9 STATIC-PASS (reports toggle + CSV + GDPR export fixed), T10 STATIC-PASS (gitleaks SKIPPED), T11 SKIPPED, T12 PASS (4 passed / 10 skipped / 0 failed), T13 SKIPPED.
- Dynamic passes (T2–T8, T10, T13) must be re-run against staging on deploy day before flipping M1 → live to `[x]`.

## File map

**M1-critical (read every session):**
- `dudley-requirements-v1.md` — signed scope, contract, source of truth for *what*
- `CLAUDE.md` (this file) — architecture rules + M1 blockers, wins every conflict
- `docs/redesign/MASTER_PLAN.md` — phase tracker + history + M1/M2 execution plan
- `docs/redesign/BACKEND_SPEC.md` — schema, RLS, API surface, security
- `docs/redesign/DESIGN_SYSTEM.md` — 4-UI design system, tokens, components
- `docs/redesign/TEST_AUDIT_PROMPT.md` — pre-deploy test checklist (T0–T13)
- `docs/DEPLOYMENT.md` — Phase 4 operator runbook (prereqs, cutover, Rule #12 backup gate, rollback, incident playbook)
- `docs/redesign/E2E_TEST_PLAN.md` — browser-executable test plan (Chrome MCP tools)
- `docs/redesign/USER_FLOW_DIAGRAM.html` — visual walk-through of MOT tester ↔ mechanic pass-back flow; source of the P51 "one-job, pass-back-as-event" decision (2026-04-14). Open this first for any pass-back work.
- `docs/redesign/PHASE1_DEFECTS.md` — live defect register (D1–D5 CLOSED)

**History / reference (read when relevant):**
- `docs/redesign/AUDIT_PROMPT.md` — original phased UI build plan (Parts A–B)
- `docs/redesign/BACKEND_AUDIT_PROMPT.md` — original backend phased plan
- `docs/redesign/BUGFIX_PLAN.md` — past bug log (B1, B2)
- `docs/redesign/COMPLETION_PLAN.md` — superseded by MASTER_PLAN, kept for audit trail
- `docs/redesign/FEATURE_GAP_PLAN.md` — superseded by MASTER_PLAN

**Phase 3 pre-launch (active when Phases 1 & 2 complete):**
- `docs/redesign/VISUAL_IMPLEMENTATION_PLAN.md` — V1–V6 visual/theming work
- `docs/redesign/UI_RESEARCH_PLAN.md` — competitor/visual research underpinning V1–V6
- `docs/UIResearch/` — supporting research artefacts

**Skills (read directly):**
- `/sessions/ecstatic-busy-dijkstra/mnt/Oplaris-Skills/` — vibe-security, ux-audit, plan-generator

## Working rules for Claude

- **Work in phase order — Phase 1 → 2 → 3 → 4 → 5.** Do not jump ahead. If a task isn't in the current phase and isn't fixing a showstopper bug found during that phase, it's a distraction — log it for the next phase and move on.
- Read `dudley-requirements-v1.md` and `docs/redesign/MASTER_PLAN.md` at the start of every session. Re-read this file's M1 Blockers section first.
- Before touching auth, passwords, payments, RLS, Twilio, file upload, or the status page → consult `Oplaris-Skills/vibe-security/references/<area>.md` first.
- Before touching any of the 4 UIs → consult `Oplaris-Skills/ux-audit/references/<area>.md` first.
- Run the vibe-security audit pass over every PR that touches the backend before declaring the phase done.
- Run the ux-audit pass over every UI phase before declaring it done (post-launch UI phases only now).
- One question per day to Hossein, batched. If blocked, write what you'd do and continue with the next blocker.
- Update the phase tracker and `MASTER_PLAN.md` as items complete. Never mark complete with failing tests or a known security finding.
