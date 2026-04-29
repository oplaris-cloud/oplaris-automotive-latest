/**
 * P3.1 — Pure helpers powering the /app/staff live-status surface.
 *
 * These tests pin (a) the busy/free decision tree and (b) the
 * "jobs completed today" date-boundary so a future timezone or grouping
 * refactor can't silently break the manager's headline number.
 */
import { describe, expect, it } from "vitest";

import {
  computeStaffStatus,
  jobsCompletedToday,
} from "@/lib/staff/status";

describe("computeStaffStatus", () => {
  it("returns 'busy' when at least one work_log is still running", () => {
    expect(
      computeStaffStatus([
        { ended_at: "2026-04-29T08:00:00.000Z" },
        { ended_at: null },
      ]),
    ).toBe("busy");
  });

  it("returns 'free' when every work_log is closed (or list is empty)", () => {
    expect(computeStaffStatus([])).toBe("free");
    expect(
      computeStaffStatus([
        { ended_at: "2026-04-29T08:00:00.000Z" },
        { ended_at: "2026-04-29T09:30:00.000Z" },
      ]),
    ).toBe("free");
  });
});

describe("jobsCompletedToday", () => {
  it("counts logs that ended on the same calendar day as `now`", () => {
    // Anchor `now` at 2026-04-29 14:00 local. A log ending at 09:00 the
    // same day should count; the helper builds the day window from the
    // local midnight of `now`.
    const now = new Date(2026, 3, 29, 14, 0, 0); // Apr=3 (0-indexed)
    const sameDayMorning = new Date(2026, 3, 29, 9, 0, 0).toISOString();
    const sameDayEvening = new Date(2026, 3, 29, 17, 30, 0).toISOString();
    const stillRunning = null;

    expect(
      jobsCompletedToday(
        [
          { ended_at: sameDayMorning, job_id: "j1" },
          { ended_at: sameDayEvening, job_id: "j2" },
          { ended_at: stillRunning, job_id: "j3" },
        ],
        now,
      ),
    ).toBe(2);
  });

  it("ignores yesterday's logs and de-duplicates same job_id", () => {
    const now = new Date(2026, 3, 29, 14, 0, 0);
    const yesterday = new Date(2026, 3, 28, 17, 0, 0).toISOString();
    const todayA = new Date(2026, 3, 29, 9, 0, 0).toISOString();
    const todayB = new Date(2026, 3, 29, 11, 0, 0).toISOString();

    // Two closed logs on the same job today + one yesterday → unique
    // count is 1, not 3.
    expect(
      jobsCompletedToday(
        [
          { ended_at: yesterday, job_id: "j-old" },
          { ended_at: todayA, job_id: "j1" },
          { ended_at: todayB, job_id: "j1" },
        ],
        now,
      ),
    ).toBe(1);
  });
});
