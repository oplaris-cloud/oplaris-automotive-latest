// ────────────────────────────────────────────────────────────────────
// P2.9 — Type-aware retry windows for SMS messages.
//
// Both manual retry (`retryMessage` in /app/messages) and the cron
// worker (`process_sms_retry_queue` from migration 054, soon 058) ask
// `canRetry(type, createdAt)` before re-sending. A failed status_code
// OTP that's older than its 10-minute server-side validity is useless
// to deliver even if Twilio accepts it; a `mot_reminder_5d` 25h late
// would tell the customer "5 days" when there are actually 4. We'd
// rather mark these `failed_final` than burn an SMS segment on
// misleading content.
//
// Pure module: no DB, no env, no logging. Same shape used in the
// MessagesClient (UX gate) and the server action (security gate). The
// migration 058 retry worker re-implements the same boundaries inline
// in SQL — keep both in sync.
// ────────────────────────────────────────────────────────────────────

export type RetryReason = "expired_by_policy" | "unknown_type";

export type RetryDecision =
  | { ok: true }
  | { ok: false; reason: RetryReason; ageMs: number; windowMs: number | null };

/** Locked retry windows (Hossein 2026-04-25, plan P2.9).
 *
 *   status_code        — 8 minutes (server-side OTP validity is 10
 *                        min; ~2 min tail for SMS delivery + typing)
 *   approval_request   — 24 hours (signed HMAC token expires at 24h)
 *   mot_reminder_*d    — 24 hours (day late OK; week late mislabels)
 *   quote_sent /        \
 *   quote_updated /      } indefinite — no time-sensitive content
 *   invoice_sent       /
 */
const RETRY_WINDOW_MS: Record<string, number | null> = {
  status_code: 8 * 60 * 1000,
  approval_request: 24 * 60 * 60 * 1000,
  mot_reminder_30d: 24 * 60 * 60 * 1000,
  mot_reminder_7d: 24 * 60 * 60 * 1000,
  mot_reminder_5d: 24 * 60 * 60 * 1000,
  quote_sent: null,
  quote_updated: null,
  invoice_sent: null,
};

/** Decide whether a failed `messageType` row created at
 *  `originalCreatedAt` is still worth retrying. */
export function canRetry(
  messageType: string,
  originalCreatedAt: Date | string,
  now: Date = new Date(),
): RetryDecision {
  if (!(messageType in RETRY_WINDOW_MS)) {
    return {
      ok: false,
      reason: "unknown_type",
      ageMs: 0,
      windowMs: null,
    };
  }

  const window = RETRY_WINDOW_MS[messageType];
  if (window === null || window === undefined) {
    // `null` = indefinite — quote / invoice rows never expire.
    return { ok: true };
  }

  const created =
    originalCreatedAt instanceof Date
      ? originalCreatedAt
      : new Date(originalCreatedAt);
  const ageMs = now.getTime() - created.getTime();

  if (ageMs > window) {
    return {
      ok: false,
      reason: "expired_by_policy",
      ageMs,
      windowMs: window,
    };
  }
  return { ok: true };
}

/** Human-friendly window label for tooltips + toasts. e.g.
 *  `formatRetryWindow("status_code")` → "8 minutes". */
export function formatRetryWindow(messageType: string): string {
  const ms = RETRY_WINDOW_MS[messageType];
  if (ms === null) return "no expiry";
  if (ms === undefined) return "unknown";
  if (ms < 60 * 60 * 1000) {
    const mins = Math.round(ms / 60000);
    return `${mins} minute${mins === 1 ? "" : "s"}`;
  }
  const hours = Math.round(ms / (60 * 60 * 1000));
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

/** The full set of types that have a finite retry window. Useful to
 *  the SQL side of migration 058 / the cron worker if it ever wants to
 *  cross-check what TS thinks the policy is. */
export const RETRY_FINITE_TYPES = Object.entries(RETRY_WINDOW_MS)
  .filter(([, v]) => v !== null)
  .map(([k]) => k);
