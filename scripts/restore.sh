#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────────────
# Oplaris Automotive — restore driver (Rule #12 gate)
#
#   rclone pull latest *.age → age decrypt → pg_restore into a scratch DB
#
# CLAUDE.md Rule #12: "Backups before go-live. Nightly pg_dump to off-site
# encrypted storage. Restore tested at least once before M2 sign-off. No
# backups = no go-live."
#
# This script is the one-line way to prove a backup is usable. Intended
# for (a) a one-shot dry-run before the first production cutover, and
# (b) a quarterly re-validation thereafter.
#
# Required env:
#   BACKUP_RCLONE_REMOTE       — same remote backup.sh wrote to
#   BACKUP_AGE_IDENTITY_FILE   — path to the age *private* key (the one
#                                you kept offline — mount it at runtime,
#                                never commit it)
#   TARGET_DATABASE_URL        — scratch DB connection string; must NOT
#                                contain "prod" or "production" (safety)
#
# Optional env:
#   BACKUP_FILE                — override "latest" with an explicit file
#                                name (useful for point-in-time restores)
#
# Exit codes:
#   0   restored; table count printed
#   2   TARGET_DATABASE_URL contains prod/production (safety refusal)
#   3   no backup artefacts found at the remote
#   10  prerequisite missing (env, binary)
#   20  rclone pull failed
#   30  age decrypt failed
#   40  pg_restore failed
# ────────────────────────────────────────────────────────────────────────

set -euo pipefail

log() { printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$*"; }
fail() { log "ERROR: $1"; exit "${2:-1}"; }

# ── Env prereqs ─────────────────────────────────────────────────────────
for var in BACKUP_RCLONE_REMOTE BACKUP_AGE_IDENTITY_FILE TARGET_DATABASE_URL; do
  if [ -z "${!var:-}" ]; then
    fail "$var not set" 10
  fi
done

# ── Safety gate: refuse production URLs (fires BEFORE binary checks) ───
# This script destructively restores (--clean --if-exists drops tables).
# If someone mis-configures TARGET_DATABASE_URL to point at prod, they
# get an obituary instead of a restore. Hard-coded, not opt-out. Runs
# first so a mis-pointed URL cannot reach the `pg_restore` line even if
# the operator's PATH is set up.
case "$TARGET_DATABASE_URL" in
  *prod*|*production*)
    fail "TARGET_DATABASE_URL contains 'prod'/'production' — refusing" 2
    ;;
esac

# ── Binary prereqs (after safety gate) ──────────────────────────────────
for bin in rclone age pg_restore psql; do
  command -v "$bin" >/dev/null 2>&1 || fail "'$bin' not on PATH" 10
done

[ -r "$BACKUP_AGE_IDENTITY_FILE" ] \
  || fail "age identity file not readable: $BACKUP_AGE_IDENTITY_FILE" 10

# ── Work dir ────────────────────────────────────────────────────────────
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# ── Resolve backup file ─────────────────────────────────────────────────
if [ -n "${BACKUP_FILE:-}" ]; then
  LATEST="$BACKUP_FILE"
  log "using explicit BACKUP_FILE: $LATEST"
else
  log "resolving latest backup from $BACKUP_RCLONE_REMOTE/oplaris/..."
  # Recurse into YYYY/MM/ layout written by backup.sh; take the file
  # whose name sorts highest (UTC ISO timestamp ensures chronological
  # sort == temporal sort).
  LATEST="$(rclone lsf --recursive --include='*.age' \
    "$BACKUP_RCLONE_REMOTE/oplaris/" 2>/dev/null \
    | sort | tail -n1)"
  [ -n "$LATEST" ] || fail "no *.age backups found at $BACKUP_RCLONE_REMOTE/oplaris/" 3
  log "latest: $LATEST"
fi

# ── 1. Pull ─────────────────────────────────────────────────────────────
if ! rclone copy "$BACKUP_RCLONE_REMOTE/oplaris/$LATEST" "$WORK/" \
  --retries=3 --low-level-retries=10; then
  fail "rclone pull failed" 20
fi

ENC_FILE="$WORK/$(basename "$LATEST")"
[ -f "$ENC_FILE" ] || fail "pulled file not at $ENC_FILE" 20

# ── 2. Decrypt ──────────────────────────────────────────────────────────
PLAIN="$WORK/restore.dump"
log "age decrypt → $PLAIN"
if ! age -d -i "$BACKUP_AGE_IDENTITY_FILE" -o "$PLAIN" "$ENC_FILE"; then
  fail "age decrypt failed" 30
fi

# ── 3. Restore ──────────────────────────────────────────────────────────
log "pg_restore → $TARGET_DATABASE_URL (--clean --if-exists)"
if ! pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --dbname="$TARGET_DATABASE_URL" \
  "$PLAIN"; then
  fail "pg_restore failed" 40
fi

# ── 4. Sanity read ──────────────────────────────────────────────────────
TABLE_COUNT=$(psql "$TARGET_DATABASE_URL" -Atc \
  "select count(*) from information_schema.tables where table_schema='public'")
log "restore complete — public schema has $TABLE_COUNT tables"
