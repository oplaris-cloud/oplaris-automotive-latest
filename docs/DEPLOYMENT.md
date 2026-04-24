# Oplaris Automotive — Deployment Runbook

> Operator: Hossein. Environment: **Supabase managed** (supabase.com)
> for DB + Auth + Storage + Realtime; Dokploy (on Oplaris hardware)
> hosts the app container only. Version-controlled; any change to the
> procedure must be PR'd with a rationale.

This document takes you from a merged-to-`main` PR to a production
Dudley Auto Service deployment. Every step has an explicit success
signal — if you don't see the signal, stop and investigate; do not
press on.

---

## 0. One-time prerequisites

Tick once, per environment (staging then production). Do not skip.

- [ ] **GHCR access.** Dokploy's image-pull credential is a GitHub PAT
  scoped to `read:packages` for this repo. Generated once; stored in
  Dokploy's registry credentials UI.
- [ ] **Dokploy projects created** — one per environment (`oplaris-staging`,
  `oplaris-prod`). Each points at `compose.yml` from the repo.
- [ ] **Domain + TLS.** DNS A/AAAA records for the app hostname
  (`app.dudleyautoservice.co.uk`), status hostname
  (`status.dudleyautoservice.co.uk`), and Supabase hostname all point
  at the Dokploy host. Let's Encrypt certs auto-issued via Dokploy's
  built-in Traefik integration. (Can front with Cloudflare later —
  not required for v1.)
- [ ] **Supabase managed project.** Staging + production projects
  created at supabase.com. Every migration in `supabase/migrations/`
  applied via `supabase db push` or the CLI. From the project dashboard
  collect: Project URL, anon key, service role key, JWT secret,
  direct Postgres connection string. All five go into Dokploy's env UI
  for the app project (`NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `SUPABASE_JWT_SECRET`, and `DATABASE_URL` for the backup sidecar).
- [ ] **Twilio.** Account + messaging service configured. `TWILIO_*`
  env vars set in Dokploy. Phone number verified end-to-end with a
  test SMS before go-live.
- [ ] **DVSA API.** OAuth2 client (tenant + client id + secret), API
  key, scope, and both base URLs set in Dokploy. Test lookup against
  a known reg before go-live.
- [ ] **Age keypair for backups.**
  - Generate once: `age-keygen -o ~/oplaris-backup.age`
  - Copy the PRIVATE block into 1Password + a hardware-held USB stick.
    **Do not commit, do not email, do not store in Dokploy persistent
    env.**
  - Copy the PUBLIC key (one line, starts `age1...`) into Dokploy's
    env UI as `BACKUP_AGE_PUBLIC_KEY`.
- [ ] **rclone remote configured.** On the Dokploy host (or in the
  backup sidecar), run `rclone config` to set up the off-site target
  (Backblaze B2 recommended; S3-compatible works). Test with
  `rclone lsd <remote>:`. Name the remote explicitly in
  `BACKUP_RCLONE_REMOTE` (e.g. `b2:oplaris-backups`).
- [ ] **GitHub repo secrets + variables.** Settings → Secrets and
  Variables → Actions.
  - Secrets: `DOKPLOY_WEBHOOK_URL`, `DOKPLOY_TOKEN`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
  - Variables: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_STATUS_URL`,
    `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_HCAPTCHA_SITE_KEY`.

---

## 1. First deploy

Assumes Section 0 is done, CI is green on `main`, Phase 4 PR is
merged. The deploy workflow runs automatically on `push to main`
after CI passes; there is no manual trigger step.

1. **Kick off:** `git push origin main` (or merge a PR to main).
2. **Watch CI:** GitHub Actions → `CI` workflow. Must reach
   `conclusion: success`. If a Phase 4 prereq (migration 052 hardening
   sweep, migration 034 column drop, mechanic/MOT branch) is not yet
   landed, RLS tests will stay green but you should hold the production
   cutover until all three have landed.
3. **Watch deploy:** The `deploy` workflow triggers automatically.
   Confirm:
   - `Audit public env leak` step green (Rule #5).
   - `Refuse STATUS_DEV_BYPASS_SMS=true for prod` step green
     (`STAGING_SMS_BYPASS.md` §7).
   - `Build + push image` produces a tagged image at
     `ghcr.io/<org>/oplaris-automotive:<sha>` AND `:latest`.
   - `Trigger Dokploy redeploy` either succeeds (202 / 204) or emits
     a `::notice::` that it was skipped because `DOKPLOY_WEBHOOK_URL`
     was unset (fine early in Phase 4 — Dokploy will pull `:latest`
     on its own schedule).
4. **Watch Dokploy:** the project should show a rolling restart within
   30s of the webhook. Container health check must go green
   (`/api/health` returns 200) within 60s — Dokploy's UI surfaces this.
5. **Smoke test the URL:**
   ```bash
   curl -fsS https://app.dudleyautoservice.co.uk/api/health
   # Expected: {"status":"ok"}
   ```
   - If it returns a 5xx, check the container logs in Dokploy.
     Most likely cause: missing runtime env (Supabase, APPROVAL_HMAC_SECRET,
     etc.) — `serverEnv()` throws at first request, not at boot.

---

## 2. Post-deploy staging verification

Before production traffic touches the app, re-run the TEST_AUDIT_PROMPT.md
manual phases against the staging URL.

| Phase | Scope | Signal |
|-------|-------|--------|
| **T2** | RLS + DB integrity | `pnpm test:rls` against the staging DB URL clean |
| **T3** | Auth + role routing | Login as each of manager / mot_tester / mechanic; each lands at the right page; the 403 page triggers on forbidden routes |
| **T4** | Job lifecycle | Two-window walkthrough (manager + mechanic): create → assign → start → complete; realtime updates within 2s |
| **T5** | Customer approval SMS | Mechanic requests approval → customer receives SMS → taps Approve → status page reflects the approval |
| **T6** | Customer status page | Enter reg + phone → 6-digit SMS → status page shows vehicle + job state; try a wrong phone → same response shape (anti-enumeration) |
| **T7** | Kiosk booking | Pair a device via `/api/kiosk/pair` (manager) → pick MOT / Electrical / Maintenance → booking lands in `/app/bookings` |
| **T8** | Parts + PDF | Add a PDF part-invoice → upload succeeds (< 10MB, magic-byte check); generate PDF job sheet → opens with "PRO-FORMA — NOT A VAT INVOICE" stamp |
| **T10** | Security headers | `curl -I https://app.<host>/login` shows CSP, HSTS 2-years, X-Frame-Options DENY, etc. |
| **T13** | Staging smoke | All of the above passing counts as T13 |

Append outcomes to the Findings log in `docs/redesign/TEST_AUDIT_PROMPT.md`.

---

## 3. Backup verification gate (CLAUDE.md Rule #12)

**No production traffic until this passes.** This is a hard gate.

Managed Supabase gives you daily backups + Point-in-Time Recovery
(Pro plan and above). Those are the primary line of defence — most
incidents (bad migration, runaway query, accidental DELETE) are
recovered from the Supabase dashboard in minutes without involving
this script. Confirm in the Supabase UI that daily backup + PITR are
enabled before relying on this section.

`scripts/backup.sh` writes an independent, encrypted, off-site copy to
a target we own. It protects against scenarios the managed provider
cannot: provider-wide outage, account lockout, ransomware that
encrypts the DB through legitimate credentials. Belt-and-braces.

### 3a. Confirm a backup exists

The Dokploy backup sidecar should have run `scripts/backup.sh` overnight.
Verify:

```bash
rclone lsf --recursive --include='*.age' <BACKUP_RCLONE_REMOTE>/oplaris/
# Expected: at least one file named `oplaris-YYYYMMDDTHHMMSSZ.dump.age`
# in a `YYYY/MM/` subdirectory.
```

If no file: check the sidecar logs in Dokploy, fix, wait for the next
run (or trigger manually via Dokploy's "run task now" UI).

### 3b. Restore into a scratch database

Spin up a scratch Postgres (e.g. a disposable Supabase branch or a
`docker run postgres:17` container). Then:

```bash
# From a workstation with age + rclone + postgresql17-client installed.
# BACKUP_AGE_IDENTITY_FILE is the PRIVATE key you saved off-device.
export BACKUP_RCLONE_REMOTE=b2:oplaris-backups
export BACKUP_AGE_IDENTITY_FILE=/path/to/oplaris-backup.age
export TARGET_DATABASE_URL=postgres://postgres@127.0.0.1:5432/scratch
./scripts/restore.sh
```

Expected final line: `restore complete — public schema has N tables`
with N > 30 (matches the production schema size).

The script refuses any `TARGET_DATABASE_URL` containing `prod` or
`production` with exit 2. Confirm once with a deliberately-bad URL:

```bash
TARGET_DATABASE_URL=postgres://user@host/oplaris_production \
  ./scripts/restore.sh ; echo "exit=$?"
# Expected: exit=2, error message "TARGET_DATABASE_URL contains 'prod'/'production' — refusing"
```

### 3c. Sanity-check a row

```bash
psql "$TARGET_DATABASE_URL" -c "select count(*) from customers;"
# Expected: non-zero (if staging has seeded fixtures) or zero (if
# staging is empty) — the number is less important than the query
# running cleanly.
```

Only after 3a-c are all green, proceed to Section 4.

---

## 4. Production cutover

1. **Flip DNS.** Point the public hostnames at the Dokploy host.
   TTLs should have been dropped to 60s an hour earlier to minimise
   stale cache. Expected resolution time: ≤ 120s.
2. **Update `TWILIO_WEBHOOK_BASE_URL`.** Must match the public app
   hostname (https://app.dudleyautoservice.co.uk). Twilio status +
   inbound webhooks go there; if stale, Rule #6 signature verification
   silently fails every inbound callback.
3. **Verify DVSA IP allow-list.** If DVSA restricts requests to a
   specific egress IP, confirm the Dokploy host's egress is registered
   (via DVSA portal). Test with one vehicle lookup from the app.
4. **Set `STATUS_DEV_BYPASS_SMS=false`.** (Or unset.) Confirm a
   restart — the env guard in `serverEnv()` makes the boot-fail
   message unmissable, but check anyway.
5. **Smoke test as a real user:**
   - Visit `https://app.<host>/login` → login as manager → walk a job.
   - Visit `https://status.<host>/` → type a reg+phone → receive SMS →
     enter code → see status.
   - Submit a kiosk booking → see it in `/app/bookings`.
6. **Announce go-live.** Dudley staff start using the app.

---

## 5. Rollback

Fast path — no code, no git, just Dokploy:

1. Dokploy → app project → Deployments history → pick the last known
   good SHA tag → "Redeploy this image".
2. Wait for the health check to flip green.
3. DNS stays where it is — don't touch it unless the rollback target
   requires a different hostname.

If the rollback image is broken too, **use the DB backups in this
order**:

1. **Supabase dashboard PITR first.** Managed Supabase → project →
   Database → Backups → restore to a point-in-time. Faster, less
   disruptive, no off-site-backup dependency.
2. **If Supabase is the incident** (outage, account lockout,
   ransomware that went through legitimate creds): stop the app
   container in Dokploy (DB is hosted elsewhere so no DB container
   to stop); provision a fresh Supabase project; run
   `scripts/restore.sh` against its direct Postgres URL. This script
   refuses URLs containing `prod`/`production` — for a true
   production restore you will need to intentionally override by
   editing the script locally. This is deliberate friction; do not
   script around it.
3. Restart the app pointing at the new project.

---

## 6. Incident playbook

| Symptom | First thing to check | Next |
|---------|---------------------|------|
| `/api/health` 5xx | Dokploy container logs | `serverEnv()` likely threw — a runtime env var is missing. Look for "Invalid input" zod message. |
| SMS approvals broken | `TWILIO_WEBHOOK_BASE_URL` matches the public hostname | Twilio console → Messaging → logs → check for X-Twilio-Signature failures |
| Customer status page shows wrong status | Realtime timing — sometimes a 2s-10s lag | Check Supabase Realtime status; fallback is the 4s HTTP poll (always runs in parallel) |
| Login works but `/app/tech` 500s | Check `auth_hook` edge function is deployed and the JWT carries `app_metadata.roles` | |
| DB writes rejected with 42501 | RLS working as designed — user's role doesn't cover the write | |
| DVSA lookup 401 | Token expired; OAuth2 client_credentials flow re-acquires automatically. If the flow itself fails, rotate the client secret in Azure AD + Dokploy env. | |
| Backup sidecar failing | `rclone` credentials expired OR the age recipient is wrong | `rclone lsd <remote>:` from the sidecar shell |

For anything not above, grab the container stderr from Dokploy, the
relevant migration timestamp, and a 30s-window of the Supabase logs.
Log into `docs/redesign/AGENT_LOG.md` with the headings the file uses.

---

## 7. Recurring operations

- **Weekly (automatic):** backup retention runs in the bucket policy
  (keep 90 days, then expire). Nothing to do.
- **Monthly:** tail `rclone ls <remote>:oplaris/$(date +%Y/%m)/` to
  confirm the backup sidecar is still writing. One minute.
- **Quarterly:** repeat Section 3b — full restore into a scratch DB.
  15 minutes. Don't skip; backups rot silently.
- **Before any migration that alters a table:** take an extra manual
  backup (`docker exec <sidecar> /app/backup.sh`) and keep it labelled.

---

## 8. Phase-4 open questions (batched; defaults from P4_KICKOFF_CURRENT.md)

These are live in the PR description and don't block the runbook.

| # | Question | Default (unless you say otherwise) |
|---|----------|-----------------------------------|
| 1 | Container registry | GHCR (`ghcr.io/<repo>`) |
| 2 | Off-site backup target | Backblaze B2 via `rclone` |
| 3 | Age identity storage | Offline (USB + 1Password); public key only in Dokploy env |
| 4 | Dokploy webhook | You paste URL + token into GitHub repo secrets |
| 5 | Domain + TLS | Dokploy's built-in Let's Encrypt (Cloudflare optional later) |

Answers in writing → applied to this runbook → run Section 3b → flip.
