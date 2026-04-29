// P3.1 — Pure helpers for the /app/staff live status surface.
//
// The list page renders a card per staff member with a red/green status
// dot driven by whether the staff has any running work_log (ended_at is
// null) plus a "jobs completed today" count from this calendar day's
// closed logs. These helpers exist as pure functions so the date-boundary
// + status logic can be unit-tested without spinning up the DB.

export interface WorkLogStatusRow {
  /** Optional in row payloads — present only on running logs. */
  ended_at: string | null;
}

export interface CompletedLogRow {
  ended_at: string | null;
  job_id: string;
}

export type StaffStatus = "busy" | "free";

/** "busy" if at least one work_log is open (ended_at is null), else "free". */
export function computeStaffStatus(logs: readonly WorkLogStatusRow[]): StaffStatus {
  return logs.some((l) => l.ended_at === null) ? "busy" : "free";
}

/** Count of distinct `job_id` values among work_logs whose `ended_at`
 *  falls within the local-day window of `now`. Logs without an
 *  `ended_at` (still running) and logs ended on a different calendar
 *  day are ignored. */
export function jobsCompletedToday(
  logs: readonly CompletedLogRow[],
  now: Date,
): number {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const ids = new Set<string>();
  for (const log of logs) {
    if (!log.ended_at) continue;
    const ended = new Date(log.ended_at);
    if (Number.isNaN(ended.getTime())) continue;
    if (ended < dayStart || ended >= dayEnd) continue;
    ids.add(log.job_id);
  }
  return ids.size;
}
