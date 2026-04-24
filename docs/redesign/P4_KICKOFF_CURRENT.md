# Phase 4 — Deploy Infrastructure · Kickoff plan

> Each step is **self-contained for a Claude Code terminal agent** — prerequisites, files, diff outline, tests, acceptance. Work strictly in order unless marked "parallelisable".
>
> **Convention:** every step ends with "Definition of done" — treat it as a hard gate. Do not mark a task closed until all bullets are ticked.
>
> **Scope discipline:** Phase 4 draws the deploy infrastructure for staging + production. It does **not** deploy. It does not touch the mechanic/MOT branch, migration 052 (hardening sweep), or migration 034 (P51.10 column drop). Those three tracks are already in flight and are Hossein's to land before cutover.

## Read order before any code

1. `CLAUDE.md` — Architecture rules (esp. #5 secrets, #6 Twilio sig, #9 file uploads, #10 passwords, #11 GDPR, **#12 backups**), "Current priority order" (Phase 4 scope), "Phase tracker" (M1/M2 state).
2. `dudley-requirements-v1.md` — Signed scope. Confirm nothing below expands it.
3. `docs/redesign/PRE_PHASE_4_HARDENING.md` — Known RLS + naming + migration-hygiene items. Phase 4 does **not** execute these; it does design the CI gate that blocks deploy if any of them regress.
4. `docs/redesign/STAGING_SMS_BYPASS.md` — The `STATUS_DEV_BYPASS_SMS` guard. Phase 4 adds a CI check that refuses to build if `STATUS_DEV_BYPASS_SMS=true` is set in a production-labelled env.
5. `docs/redesign/TEST_AUDIT_PROMPT.md` — T0–T13 pre-deploy checklist. Phase 4 automates what can be automated (T0, T1, T9, T10, T12); T2–T8, T13 remain manual on staging.
6. `.env.example` at repo root — source of truth for every env var. No new variable may appear in `compose.yml`, `Dockerfile`, or `deploy.yml` without a matching entry in `.env.example`.

## Ground rules

- **Rule #5 (secrets).** No variable prefixed `NEXT_PUBLIC_*` may hold anything that is not safe to print on a billboard. Everything else is server-only, injected at runtime by Dokploy. `.env.example` documents every variable; CI must fail if a server-only key is accidentally prefixed `NEXT_PUBLIC_*`. The existing `pnpm audit:secrets` script (`scripts/audit-public-env.ts`) already encodes this — wire it into the deploy gate.
- **Rule #12 (backups).** Nightly encrypted `pg_dump` to off-site storage. **Restore must be tested at least once** before any production use. No backups → no go-live. Phase 4 ships both `backup.sh` and `restore.sh`, plus a runbook step that forces a dry-run restore on staging before the first production cutover.
- **No business logic in infra.** Everything in this phase is declarative (Dockerfile, compose.yml, workflow YAML, shell scripts). No Server Actions, no migrations, no TypeScript beyond lint/audit helpers.
- **Every PR ends green.** `pnpm lint && pnpm typecheck && pnpm test:unit && pnpm test:rls` must all pass cold-cache at each step's definition of done. Dynamic e2e (`pnpm test:e2e`) remains `E2E_STAGING_READY`-gated.

---

## Step 0 — Branch + baseline

**Skill to consult:** none.

**Do:**
1. `git checkout -b feat/phase4-deploy-infra`
2. Confirm baseline: `rm -rf .next tsconfig.tsbuildinfo && pnpm typecheck && pnpm lint && pnpm test:unit && pnpm test:rls`. Record the counts.
3. Read this doc end-to-end. Read the 6 references above.
4. Open `.github/workflows/ci.yml` and keep it open throughout Phase 4 — Step 7 extends it rather than replacing.

**Definition of done:** branch exists; baseline suite is green with counts recorded in the first commit message of Step 1.

---

## Step 1 — [P0] Enable Next.js standalone output

**Goal:** `next build` produces a self-contained server bundle at `.next/standalone/` so the Docker image stays small (no `node_modules` copy).

**Files:**
- `next.config.ts`

**Diff outline:**
1. Add `output: "standalone"` to the `NextConfig` object. Place it next to `poweredByHeader: false`.
2. No change to `headers()`, `allowedDevOrigins`, `experimental`.

**Tests:**
- `pnpm build` — succeeds locally.
- Verify `.next/standalone/server.js` and `.next/standalone/package.json` exist.
- `pnpm typecheck` — clean.

**Definition of done:** `.next/standalone/` is generated; build logs show it; lint + typecheck clean.

---

## Step 2 — [P0] Dockerfile (multi-stage, non-root)

**Goal:** a production image built from pnpm that runs as a non-root user and starts `node server.js` from the Next standalone bundle.

**Files (new):**
- `Dockerfile`
- `.dockerignore`

**Diff outline (Dockerfile):**
```
# Stage 1: deps
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json pnpm-lock.yaml .npmrc* ./
RUN corepack enable && pnpm install --frozen-lockfile

# Stage 2: build
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && pnpm build

# Stage 3: runner
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S nodejs -g 1001 && adduser -S nextjs -u 1001 -G nodejs
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD \
  node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
```

**Diff outline (.dockerignore):** mirror `.gitignore` + explicitly exclude `.env*`, `.next/cache`, `tests/`, `playwright-report/`, `coverage/`, `*.log`, `docs/`.

**Sibling work (server-side):**
- Add `src/app/api/health/route.ts` if absent — returns 200 JSON `{status:"ok"}`. Public, no-auth, no-DB-hit. This is what the Docker HEALTHCHECK probes.

**Tests:**
- `docker build -t oplaris-automotive .` locally — succeeds.
- `docker run --rm -p 3000:3000 --env-file .env.local oplaris-automotive` — container starts, `curl localhost:3000/api/health` returns 200.
- Confirm running user is `nextjs` (uid 1001): `docker exec <id> id` → `uid=1001(nextjs)`.

**Definition of done:** image builds; health endpoint green; `docker history oplaris-automotive` shows layer count ≤ 10 and total size < 300 MB. No `.env*` files in the final image (`docker run --rm oplaris-automotive sh -c 'ls -la /app | grep env'` returns nothing).

---

## Step 3 — [P0] `compose.yml` for Dokploy

**Goal:** one-file stack definition that Dokploy can consume. Dokploy reads env vars from its own UI and injects at runtime — `compose.yml` references them, never hard-codes them.

**Files (new):**
- `compose.yml`

**Diff outline:**
```yaml
services:
  app:
    image: ${DOKPLOY_IMAGE:-oplaris-automotive:latest}
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: "3000"
      HOSTNAME: "0.0.0.0"
      NEXT_PUBLIC_APP_URL: ${NEXT_PUBLIC_APP_URL}
      NEXT_PUBLIC_STATUS_URL: ${NEXT_PUBLIC_STATUS_URL}
      NEXT_PUBLIC_SUPABASE_URL: ${NEXT_PUBLIC_SUPABASE_URL}
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}
      NEXT_PUBLIC_HCAPTCHA_SITE_KEY: ${NEXT_PUBLIC_HCAPTCHA_SITE_KEY}
      SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_ROLE_KEY}
      SUPABASE_JWT_SECRET: ${SUPABASE_JWT_SECRET}
      TWILIO_ACCOUNT_SID: ${TWILIO_ACCOUNT_SID}
      TWILIO_AUTH_TOKEN: ${TWILIO_AUTH_TOKEN}
      TWILIO_FROM_NUMBER: ${TWILIO_FROM_NUMBER}
      TWILIO_WEBHOOK_BASE_URL: ${TWILIO_WEBHOOK_BASE_URL}
      DVSA_CLIENT_ID: ${DVSA_CLIENT_ID}
      DVSA_CLIENT_SECRET: ${DVSA_CLIENT_SECRET}
      DVSA_TENANT_ID: ${DVSA_TENANT_ID}
      DVSA_SCOPE: ${DVSA_SCOPE}
      DVSA_API_KEY: ${DVSA_API_KEY}
      DVSA_BASE_URL: ${DVSA_BASE_URL}
      DVSA_HISTORY_BASE_URL: ${DVSA_HISTORY_BASE_URL}
      APPROVAL_HMAC_SECRET: ${APPROVAL_HMAC_SECRET}
      STATUS_PHONE_PEPPER: ${STATUS_PHONE_PEPPER}
      NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: ${NEXT_SERVER_ACTIONS_ENCRYPTION_KEY}
      KIOSK_PAIRING_SECRET: ${KIOSK_PAIRING_SECRET}
      HCAPTCHA_SECRET: ${HCAPTCHA_SECRET}
      STATUS_DEV_BYPASS_SMS: ${STATUS_DEV_BYPASS_SMS:-false}
      BACKUP_RCLONE_REMOTE: ${BACKUP_RCLONE_REMOTE}
      BACKUP_AGE_PUBLIC_KEY: ${BACKUP_AGE_PUBLIC_KEY}
    ports:
      - "3000:3000"
    healthcheck:
      test: ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]
      interval: 30s
      timeout: 5s
      retries: 5
      start_period: 20s
    deploy:
      resources:
        limits:
          memory: 1G
        reservations:
          memory: 512M
```

**Tests:**
- `docker compose config` — valid; no substitutions warnings beyond the expected "variable is not set" for runtime-only vars.
- Start locally with a `.env.local` symlink to verify: `docker compose --env-file .env.local up -d && sleep 20 && curl localhost:3000/api/health`.

**Definition of done:** `compose.yml` parses cleanly with `docker compose config`; no secret hard-coded; every variable also present in `.env.example`; comment-header explains the Dokploy injection model.

---

## Step 4 — [P0] `scripts/backup.sh` — encrypted nightly pg_dump

**Goal:** dump Postgres, encrypt with `age`, push off-site via `rclone`. Idempotent, exit-codes meaningful, structured logs.

**Files (new):**
- `scripts/backup.sh` (mode 0755)

**Dependencies (image-time or runner-time):** `postgresql-client`, `age`, `rclone`. Prefer a dedicated backup container (Dokploy "scheduled tasks") rather than bloating the app image.

**Diff outline:**
```bash
#!/usr/bin/env bash
# Nightly encrypted pg_dump → age → rclone remote. Exits non-zero on any step.
# Env: DATABASE_URL, BACKUP_AGE_PUBLIC_KEY, BACKUP_RCLONE_REMOTE
set -euo pipefail
: "${DATABASE_URL:?missing}"
: "${BACKUP_AGE_PUBLIC_KEY:?missing}"
: "${BACKUP_RCLONE_REMOTE:?missing}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

DUMP="$WORK/oplaris-$STAMP.dump"
ENC="$DUMP.age"

echo "[$(date -u +%FT%TZ)] dumping → $DUMP"
pg_dump --format=custom --no-owner --no-privileges --compress=9 \
  --file="$DUMP" "$DATABASE_URL"

echo "[$(date -u +%FT%TZ)] encrypting → $ENC"
age -r "$BACKUP_AGE_PUBLIC_KEY" -o "$ENC" "$DUMP"

echo "[$(date -u +%FT%TZ)] pushing → $BACKUP_RCLONE_REMOTE/oplaris/"
rclone copy "$ENC" "$BACKUP_RCLONE_REMOTE/oplaris/" --s3-no-check-bucket

echo "[$(date -u +%FT%TZ)] done"
```

**Tests:**
- Unit (bash): `bash -n scripts/backup.sh`.
- Local smoke (dev): with a disposable Postgres + age keypair + rclone local remote, run `DATABASE_URL=... BACKUP_AGE_PUBLIC_KEY=... BACKUP_RCLONE_REMOTE=/tmp/oplaris-test bash scripts/backup.sh`. Confirm `.age` file lands at the remote path.

**Definition of done:** script runs cleanly against a local disposable DB; produces a decryptable `.age` artefact at the target remote; documented in `docs/DEPLOYMENT.md` (Step 9).

---

## Step 5 — [P0] `scripts/restore.sh` — restore-test driver (Rule #12)

**Goal:** rule #12 demands a tested restore. This script drives it: pull latest backup from the rclone remote, decrypt, restore into a scratch Postgres. Fails loudly if any step misbehaves. Intended for a one-time pre-go-live run + quarterly thereafter.

**Files (new):**
- `scripts/restore.sh` (mode 0755)

**Diff outline:**
```bash
#!/usr/bin/env bash
# Download latest backup → age decrypt → pg_restore into TARGET_DATABASE_URL.
# Intended for staging; will refuse to run if TARGET_DATABASE_URL contains 'prod'.
set -euo pipefail
: "${BACKUP_RCLONE_REMOTE:?missing}"
: "${BACKUP_AGE_IDENTITY_FILE:?missing}"
: "${TARGET_DATABASE_URL:?missing}"
case "$TARGET_DATABASE_URL" in *prod*|*production*)
  echo "refusing to restore into an URL containing 'prod' — aborting"; exit 2 ;;
esac

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

LATEST="$(rclone lsf "$BACKUP_RCLONE_REMOTE/oplaris/" --include='*.age' | sort | tail -n1)"
[ -n "$LATEST" ] || { echo "no backups found"; exit 3; }

rclone copy "$BACKUP_RCLONE_REMOTE/oplaris/$LATEST" "$WORK/"
age -d -i "$BACKUP_AGE_IDENTITY_FILE" -o "$WORK/restore.dump" "$WORK/$LATEST"

pg_restore --clean --if-exists --no-owner --no-privileges \
  --dbname="$TARGET_DATABASE_URL" "$WORK/restore.dump"

echo "restore ok — tables: $(psql "$TARGET_DATABASE_URL" -Atc 'select count(*) from information_schema.tables where table_schema=\"public\"')"
```

**Tests:**
- `bash -n scripts/restore.sh`.
- Local smoke (staging-shaped): after Step 4 ran, point `TARGET_DATABASE_URL` at a scratch database, `BACKUP_AGE_IDENTITY_FILE` at the matching age identity, and run. Confirm table count is non-zero.

**Definition of done:** local restore runs end-to-end from a real `backup.sh` artefact. Prod-URL-refusal is test-verified (set `TARGET_DATABASE_URL=postgres://x/prod` and confirm the script exits 2).

---

## Step 6 — [P1] `.github/workflows/deploy.yml`

**Goal:** extend (don't replace) `.github/workflows/ci.yml`. Add a `deploy` workflow that runs **after** `ci.yml` passes on `main`, builds + pushes the image to the registry, and triggers a Dokploy redeploy via webhook.

**Files (new):**
- `.github/workflows/deploy.yml`

**Diff outline:**
```yaml
name: deploy
on:
  workflow_run:
    workflows: ["ci"]
    types: [completed]
    branches: [main]

jobs:
  deploy:
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
        with: { ref: ${{ github.event.workflow_run.head_sha }} }

      - name: Verify no NEXT_PUBLIC_ leak of secret-class vars
        run: pnpm install --frozen-lockfile && pnpm audit:secrets

      - name: Refuse deploy if STATUS_DEV_BYPASS_SMS=true would land in prod
        run: |
          if grep -nE '^STATUS_DEV_BYPASS_SMS=true' .env.production* 2>/dev/null; then
            echo "::error::STATUS_DEV_BYPASS_SMS=true found in a .env.production* file — refusing"
            exit 1
          fi

      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: |
            ghcr.io/${{ github.repository }}:${{ github.event.workflow_run.head_sha }}
            ghcr.io/${{ github.repository }}:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Trigger Dokploy redeploy
        run: |
          curl -fsSL -X POST "${{ secrets.DOKPLOY_WEBHOOK_URL }}" \
            -H "Authorization: Bearer ${{ secrets.DOKPLOY_TOKEN }}"
```

**Secrets required (Hossein adds in GitHub repo settings):** `DOKPLOY_WEBHOOK_URL`, `DOKPLOY_TOKEN`. Nothing else: registry auth uses `GITHUB_TOKEN`.

**Tests:**
- `actionlint .github/workflows/deploy.yml` — clean.
- Dry-run: push the branch, watch that the workflow is recognised but does not run yet (needs `ci.yml` green on `main`).
- Step-6 smoke: push a trivial commit to `main`, confirm `deploy.yml` triggers and the image lands at `ghcr.io/<repo>:<sha>`.

**Definition of done:** `actionlint` clean; at least one successful run on `main` with image present in GHCR. Dokploy webhook call can no-op if the secret is unset (Hossein sets it when infra is live).

---

## Step 7 — [P1] `.env.example` audit

**Goal:** verify every runtime variable used by the app is documented. Add any missing.

**Files:**
- `.env.example`

**Diff outline:**
1. `grep -rn 'process\.env\.' src/ scripts/ | sed -E 's/.*process\.env\.([A-Z0-9_]+).*/\1/' | sort -u` → compare to `.env.example`.
2. Any var in code but not documented → add with a one-line comment pointing at the call site.
3. Any var in `.env.example` but not in code → delete it unless a comment explains why it's reserved (e.g. `BACKUP_AGE_PUBLIC_KEY` used by `scripts/backup.sh` — script is infra, not app, but still document).

**Tests:**
- Fresh dev spin-up: `cp .env.example .env.local`, fill stubs, `pnpm build` — succeeds. This catches typos.

**Definition of done:** `.env.example` matches the union of `process.env.*` in `src/` + `scripts/` + new infra files; comments explain which subsystem owns each variable.

---

## Step 8 — [P1] `docs/DEPLOYMENT.md` runbook

**Goal:** a one-page operator runbook for the first cutover, kept in version control. Written so Hossein can follow it with zero Claude assistance.

**Files (new):**
- `docs/DEPLOYMENT.md`

**Structure:**
1. Prerequisites checklist (GHCR token, Dokploy project created, DNS + TLS, Supabase instance up, Twilio + DVSA creds in Dokploy env, backup remote configured, age keypair generated + identity stored off-device).
2. First deploy — merge to `main`, watch GHCR push, watch Dokploy redeploy, smoke-test `/api/health`.
3. Post-deploy staging verification — run T2–T8, T10, T13 from `TEST_AUDIT_PROMPT.md` per the checklist there. Append outcomes to the tracker.
4. Backup verification gate — run `scripts/restore.sh` against a scratch DB. **No production traffic until this passes.**
5. DNS flip / cutover steps — Dokploy proxies, HSTS, Twilio webhook URL update (`TWILIO_WEBHOOK_BASE_URL`), DVSA allow-list IP verification.
6. Rollback procedure — previous-image redeploy via Dokploy UI, DNS unchanged.
7. Incident playbook — health endpoint failing, DB connection churn, Twilio signature verification failing (→ check `TWILIO_WEBHOOK_BASE_URL`).

**Tests:** none auto — this is a runbook. Hossein reads it end-to-end and flags anything ambiguous; revise.

**Definition of done:** runbook linked from `CLAUDE.md` "Current priority order" under Phase 4; Hossein has read it and raised zero clarifying questions.

---

## Step 9 — [P2] `scripts/pre-deploy-smoke.ts`

**Goal:** one command that runs the deterministic subset of T13 locally before every manual cutover. Automates T0, T1, T9, T10, T12 from `TEST_AUDIT_PROMPT.md` (typecheck, unit, RLS, CSP, audit:secrets, format:check).

**Files (new):**
- `scripts/pre-deploy-smoke.ts`

**Diff outline:** orchestrate `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`, `pnpm test:rls`, `pnpm audit:secrets`, `pnpm format:check` in order; each step red stops the run; final green prints a summary.

**Tests:** run it once on a green working tree — passes.

**Definition of done:** `pnpm pre-deploy` (script alias added to `package.json`) runs in < 2 min on a warm cache, exits 0 when the tree is clean, exits non-zero with a clear pointer when not.

---

## Step 10 — Consolidation

1. Open `CLAUDE.md` → "Phase tracker" → tick the **Phase 4 prereq** sub-items (Dockerfile ✓, compose ✓, CI deploy ✓, backup.sh ✓, restore.sh ✓, runbook ✓, pre-deploy-smoke ✓). Leave "Ship → live" unchecked — that flips only after the staging gate in `DEPLOYMENT.md` passes.
2. Run the md-hygiene audit: `python3 ../Oplaris-Skills/md-hygiene/scripts/audit.py --docs docs/redesign/`. No new findings.
3. Run `pnpm pre-deploy`. Green.
4. Single merged-commit or two commits max; push `feat/phase4-deploy-infra`; open PR with the baseline counts + final counts in the body.
5. **Do not merge** until:
   - Hossein has read `docs/DEPLOYMENT.md`.
   - Migration 052 (PRE_PHASE_4_HARDENING.md) has landed on `main`.
   - Migration 034 (P51.10 drop) has landed on `main` — its soak window ends ~2026-04-28.
   - The mechanic/MOT branch (`feat/mechanic-mot-ux-2026-04-20`) has landed on `main`.

**Definition of done (phase):** all four conditions above cleared; PR approved; image tagged at `ghcr.io/<repo>:<sha>`; Dokploy webhook confirmed. The next action after Phase 4 is Hossein running `scripts/restore.sh` against staging from a real backup — Rule #12 gate.

---

## Out of scope (do **not** start)

- The mechanic/MOT branch close-out (Steps 8–14 of `MECHANIC_MOT_FIX_PLAN_CURRENT.md`).
- Migration 052 (RLS hardening sweep) — separate branch, separate review.
- Migration 034 (P51.10 column drop) — soak-gated.
- Phase 5 (Fluent Forms → production import) — happens **after** the staging gate in `DEPLOYMENT.md` clears.
- Any change to business logic, Server Actions, or migrations.

---

## Commit discipline

- One PR, incremental commits per step.
- Every commit: `pnpm lint && pnpm typecheck && pnpm test:unit && pnpm test:rls` clean.
- Cold-cache typecheck (`rm -rf .next tsconfig.tsbuildinfo && pnpm typecheck`) at step 1, 3, 6, 10.
- Commit messages follow the existing convention (`feat(infra): …`, `fix(infra): …`, `docs(deploy): …`).

---

## Open questions for Hossein (batched)

1. **Container registry.** Default is GHCR (`ghcr.io/<repo>`). Confirm or name an alternative (Docker Hub, DigitalOcean registry, self-hosted Harbor).
2. **Off-site backup target.** What storage (Backblaze B2? AWS S3? self-hosted Minio?). Needs an rclone remote name + a service-account key.
3. **Age keypair.** I'll generate a keypair in the runbook instructions. Confirm you want to hold the identity file offline (USB stick / 1Password) and we only store the public key in env.
4. **Dokploy webhook.** After Dokploy project is set up, you paste `DOKPLOY_WEBHOOK_URL` and `DOKPLOY_TOKEN` into GitHub repo secrets. No Claude access needed.
5. **Domain + TLS.** Dokploy's built-in Let's Encrypt is fine? Or do you want Cloudflare in front?

These five answers unblock the final 10% of `DEPLOYMENT.md`. Everything else in Phase 4 can proceed now.
