// P55 — Pure timer math for the tech UI.
//
// The DB stores `paused_seconds_total` (accumulated across prior pause
// intervals) plus `paused_at` (non-null iff a pause is in progress).
// Effective worked time is wall-clock minus those two, which this
// helper computes in a single, unit-testable function.

export interface ActiveWorkLogForTimer {
  started_at: string;
  paused_at: string | null;
  paused_seconds_total: number;
}

/** Worked seconds so far, netting out every pause (including the one
 *  currently in progress). Clamped to `>= 0`. Callers pass `now` so
 *  tests can avoid wall-clock dependencies. */
export function workedSeconds(
  log: ActiveWorkLogForTimer,
  now: Date = new Date(),
): number {
  const startedMs = new Date(log.started_at).getTime();
  const referenceMs = log.paused_at
    ? new Date(log.paused_at).getTime()
    : now.getTime();
  const raw = Math.floor((referenceMs - startedMs) / 1000) -
    (log.paused_seconds_total ?? 0);
  return Math.max(0, raw);
}

export function isPaused(log: ActiveWorkLogForTimer | null | undefined): boolean {
  return !!log && log.paused_at !== null;
}
