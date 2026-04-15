/**
 * P55 — Pure timer math for the tech UI pause/resume flow.
 *
 * The DB stores pause-time accumulation server-side; the client
 * renders the effective worked-seconds value via this helper. These
 * tests pin the decision tree so refactors in the UI don't silently
 * double-count or miss a pause interval.
 */
import { describe, expect, it } from "vitest";

import {
  isPaused,
  workedSeconds,
  type ActiveWorkLogForTimer,
} from "@/app/(app)/app/tech/job/[id]/work-log-timer";

const isoAt = (ms: number) => new Date(ms).toISOString();

describe("workedSeconds", () => {
  it("returns wall-time when the log has no pauses", () => {
    const log: ActiveWorkLogForTimer = {
      started_at: isoAt(0),
      paused_at: null,
      paused_seconds_total: 0,
    };
    expect(workedSeconds(log, new Date(60_000))).toBe(60);
  });

  it("subtracts paused_seconds_total accumulated from prior pauses", () => {
    // Started 120s ago, accumulated 30s of pauses already, now running.
    const log: ActiveWorkLogForTimer = {
      started_at: isoAt(0),
      paused_at: null,
      paused_seconds_total: 30,
    };
    expect(workedSeconds(log, new Date(120_000))).toBe(90);
  });

  it("freezes at paused_at minus paused_seconds_total when paused", () => {
    // Started at T=0, paused_at=T=100, paused_seconds_total=20.
    // Frozen elapsed = 100 - 20 = 80, regardless of `now`.
    const log: ActiveWorkLogForTimer = {
      started_at: isoAt(0),
      paused_at: isoAt(100_000),
      paused_seconds_total: 20,
    };
    expect(workedSeconds(log, new Date(300_000))).toBe(80);
    expect(workedSeconds(log, new Date(9_999_000))).toBe(80);
  });

  it("clamps to zero when bookkeeping would push negative", () => {
    // Defensive — if paused_seconds_total is erroneously larger than
    // the wall-clock span, never render a negative timer.
    const log: ActiveWorkLogForTimer = {
      started_at: isoAt(0),
      paused_at: null,
      paused_seconds_total: 1000,
    };
    expect(workedSeconds(log, new Date(60_000))).toBe(0);
  });
});

describe("isPaused", () => {
  it("null log → false", () => {
    expect(isPaused(null)).toBe(false);
    expect(isPaused(undefined)).toBe(false);
  });

  it("paused_at = null → false", () => {
    expect(
      isPaused({ started_at: isoAt(0), paused_at: null, paused_seconds_total: 0 }),
    ).toBe(false);
  });

  it("paused_at set → true", () => {
    expect(
      isPaused({
        started_at: isoAt(0),
        paused_at: isoAt(10_000),
        paused_seconds_total: 0,
      }),
    ).toBe(true);
  });
});
