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
- **DB / Auth / Storage / Realtime:** **self-hosted Supabase** (Postgres 15+) on Oplaris in-house hardware via **Dokploy**
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
8. **Customer status page is hostile-internet hardened.** Rate-limited 3/phone/hour + 10/IP/hour. Same response shape regardless of whether reg/phone exists (no enumeration). 6-digit code, 10-min expiry, single use, audit-logged. Phone-on-file must match exactly.
9. **File uploads scoped to job.** Storage bucket policy keys files under `garage_id/job_id/...`. RLS on `storage.objects` enforces it. Max 10 MB. Allowed MIME: `application/pdf`, `image/jpeg`, `image/png`. Magic-byte check server-side, not just extension.
10. **Passwords follow NIST SP 800-63B.** Min 8 chars, no composition rules, checked against the Pwned Passwords k-anonymity API. Argon2id (Supabase default is fine). No password rotation policy.
11. **GDPR baked in.** Soft-delete with `deleted_at` + 30-day hard-delete cron. `customer_data_export(customer_id)` SECURITY DEFINER returns full JSON dump. `audit_log` table records every read of customer PII by staff.
12. **Backups before go-live.** Nightly `pg_dump` to off-site encrypted storage. Restore tested at least once before M2 sign-off. No backups = no go-live.
13. **No client-side env vars contain secrets.** Audit `NEXT_PUBLIC_*` on every PR.

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

Roles stored in `private.user_roles`, never on a user-writable `profiles` table. JWT custom claims set via Supabase Auth Hook.

## Phase tracker

- [x] **M1.0a** Repo scaffold (Phase 0): Next.js 16 + TS strict + Tailwind v4 + sec headers + CI
- [x] **M1.0** Supabase schema v1, RLS, auth, seed garage
- [x] **M1.1** Customer + vehicle CRUD, Fluent Forms import dry-run
- [x] **M1.2** Job cards + bay board (drag/drop) + tech assignment
- [x] **M1.3** Tech mobile UI: start/pause/complete, time tracking
- [x] **M1.4** Customer approval SMS flow (signed links, Twilio)
- [x] **M1.5** Parts module (supplier dropdown, file upload, payment)
- [x] **M1.6** PDF job sheet
- [x] **M1.7** Customer status page (rate-limited, anti-enumeration)
- [x] **M1.8** Tablet kiosk (MOT / Electrical / Maintenance)
- [x] **M1.9** Manager dashboard
- [x] **M1.10** Twilio integration end-to-end
- [ ] **M1 → live** Real Fluent Forms import (day 12), backups verified, deploy
- [x] **M2.1** Warranty tracking
- [x] **M2.2** Stock management (scope confirmed day 7)
- [x] **M2.3** DVSA MOT history lookup
- [x] **M2.4** Reporting dashboard
- [x] **M2.5** GDPR export + audit log UI
- [ ] **M2.6** Mobile UX polish + accessibility pass (U17)
- [ ] **M2.7** Admin guide + walkthrough video (U18)
- [ ] **PRE-DEPLOY** Test & troubleshooting pass (T0–T13)

## File map

- `dudley-requirements-v1.md` — signed scope, contract, source of truth for *what*
- `docs/redesign/CLAUDE.md` — (this file's twin, kept in sync)
- `docs/redesign/BACKEND_SPEC.md` — full schema, RLS, API surface, security
- `docs/redesign/BACKEND_AUDIT_PROMPT.md` — phased build execution plan, day-by-day
- `docs/redesign/DESIGN_SYSTEM.md` — 4-UI design system, tokens, components
- `docs/redesign/AUDIT_PROMPT.md` — phased UI build plan
- `docs/redesign/TEST_AUDIT_PROMPT.md` — pre-deploy test & troubleshooting plan (T0–T13)
- `/sessions/ecstatic-busy-dijkstra/mnt/Oplaris-Skills/` — vibe-security, ux-audit, plan-generator skills (read directly)

## Working rules for Claude

- Read `dudley-requirements-v1.md` and `docs/redesign/BACKEND_SPEC.md` at the start of every session before writing code.
- Before touching auth, payments, RLS, Twilio, file upload, or the status page → consult `Oplaris-Skills/vibe-security/references/<area>.md` first.
- Before touching any of the 4 UIs → consult `Oplaris-Skills/ux-audit/references/<area>.md` first.
- Run the vibe-security audit pass over every PR that touches the backend before declaring the phase done.
- Run the ux-audit pass over every UI phase before declaring it done.
- One question per day to Hossein, batched. If blocked, write what you'd do and continue with the next phase.
- Update the phase tracker above as items complete. Never mark complete with failing tests or a known security finding.
