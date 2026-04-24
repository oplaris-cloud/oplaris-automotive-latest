#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────────────
# Oplaris Automotive — nightly encrypted backup
#
#   pg_dump (custom format, compressed) → age (public-key encrypt) → rclone
#
# Pipeline is deliberately linear, atomic, and fails fast. Every stage
# is separate so an rclone outage doesn't leave half-encrypted dumps on
# disk, and an encryption failure doesn't push plaintext off-site.
#
# Belt-and-braces: Supabase managed already runs daily backups + PITR
# on Pro+. This script writes an INDEPENDENT, encrypted, off-site copy
# so provider-wide incidents (outage, account lockout, ransomware via
# legit creds) are recoverable. Not a replacement for Supabase's own
# dashboard-based restore, which stays the primary rollback.
#
# Required env (Dokploy "Scheduled Task" UI):
#   DATABASE_URL             — direct Postgres connection string from
#                              Supabase dashboard → Project Settings →
#                              Database → Connection string (use the
#                              "Session" pooler URL with the service-role
#                              password, NOT the pgbouncer transaction
#                              pooler — pg_dump needs prepared statements)
#   BACKUP_AGE_PUBLIC_KEY    — recipient public key; the matching identity
#                              lives OFFLINE (USB / 1Password), never in
#                              the app/backup container
#   BACKUP_RCLONE_REMOTE     — rclone remote spec, e.g. b2:oplaris-backups
#
# Required binaries: pg_dump (matching server major version), age, rclone.
# A dedicated Alpine image with `apk add postgresql17-client age rclone`
# is the minimum — do NOT bloat the app image.
#
# Exit codes:
#   0   success
#   10  prerequisite missing (env, binary)
#   20  pg_dump failed
#   30  age encryption failed
#   40  rclone upload failed
# ────────────────────────────────────────────────────────────────────────

set -euo pipefail

log() { printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$*"; }
# fail <message> [exit_code] — logs then exits. Default exit 1.
fail() { log "ERROR: $1"; exit "${2:-1}"; }

# ── Prereqs ─────────────────────────────────────────────────────────────
# Explicit checks (not `${VAR:?msg}`) so we can control the exit code —
# the parameter-expansion form hard-exits with 1 under `set -e` before
# any `|| exit N` runs.
for var in DATABASE_URL BACKUP_AGE_PUBLIC_KEY BACKUP_RCLONE_REMOTE; do
  if [ -z "${!var:-}" ]; then
    fail "$var not set" 10
  fi
done

for bin in pg_dump age rclone; do
  command -v "$bin" >/dev/null 2>&1 || fail "'$bin' not on PATH" 10
done

# ── Work dir (auto-cleaned) ─────────────────────────────────────────────
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP="$WORK/oplaris-$STAMP.dump"
ENC="$DUMP.age"

# ── 1. Dump ─────────────────────────────────────────────────────────────
log "pg_dump → $DUMP"
if ! pg_dump \
  --format=custom \
  --no-owner \
  --no-privileges \
  --compress=9 \
  --file="$DUMP" \
  "$DATABASE_URL"; then
  fail "pg_dump failed" 20
fi
DUMP_SIZE=$(wc -c < "$DUMP")
log "pg_dump done — ${DUMP_SIZE} bytes"

# ── 2. Encrypt ──────────────────────────────────────────────────────────
log "age encrypt → $ENC"
if ! age -r "$BACKUP_AGE_PUBLIC_KEY" -o "$ENC" "$DUMP"; then
  fail "age encrypt failed" 30
fi

# Scrub plaintext dump before anything can read it off the tmp dir.
shred -u "$DUMP" 2>/dev/null || rm -f "$DUMP"
log "age done; plaintext scrubbed"

# ── 3. Upload ───────────────────────────────────────────────────────────
# Store under YYYY/MM/ to make retention policies sane at the bucket
# level (e.g. "expire after 90 days" via a bucket lifecycle rule).
TARGET_PATH="oplaris/$(date -u +%Y)/$(date -u +%m)/"
log "rclone copy → $BACKUP_RCLONE_REMOTE/$TARGET_PATH"
if ! rclone copy "$ENC" "$BACKUP_RCLONE_REMOTE/$TARGET_PATH" \
  --s3-no-check-bucket \
  --retries=3 \
  --low-level-retries=10; then
  fail "rclone upload failed" 40
fi

log "backup complete — $ENC → $BACKUP_RCLONE_REMOTE/${TARGET_PATH}$(basename "$ENC")"
