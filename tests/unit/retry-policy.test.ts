/**
 * P2.9 — Type-aware retry windows. Pure boundary tests; the same
 * windows are mirrored in SQL (migration 058) and exercised by the
 * server action's security gate (messages/actions.ts).
 */
import { describe, expect, it } from "vitest";

import {
  RETRY_FINITE_TYPES,
  canRetry,
  formatRetryWindow,
} from "@/lib/sms/retry-policy";

const NOW = new Date("2026-04-28T12:00:00Z");
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60 * 1000);
const hoursAgo = (n: number) => new Date(NOW.getTime() - n * 60 * 60 * 1000);

describe("canRetry — status_code (8-minute window)", () => {
  it("ok at 5 minutes", () => {
    expect(canRetry("status_code", minutesAgo(5), NOW)).toEqual({ ok: true });
  });

  it("ok at 7m59s (just inside)", () => {
    const t = new Date(NOW.getTime() - (8 * 60 * 1000 - 1000));
    expect(canRetry("status_code", t, NOW)).toEqual({ ok: true });
  });

  it("expired at 8m01s (just outside)", () => {
    const t = new Date(NOW.getTime() - (8 * 60 * 1000 + 1000));
    const r = canRetry("status_code", t, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("expired_by_policy");
      expect(r.windowMs).toBe(8 * 60 * 1000);
      expect(r.ageMs).toBeGreaterThan(8 * 60 * 1000);
    }
  });

  it("expired at 30 minutes (well past)", () => {
    const r = canRetry("status_code", minutesAgo(30), NOW);
    expect(r.ok).toBe(false);
  });
});

describe("canRetry — approval_request (24-hour window)", () => {
  it("ok at 23 hours", () => {
    expect(canRetry("approval_request", hoursAgo(23), NOW)).toEqual({ ok: true });
  });

  it("expired at 25 hours", () => {
    const r = canRetry("approval_request", hoursAgo(25), NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("expired_by_policy");
  });
});

describe("canRetry — mot_reminder windows (24 hours each)", () => {
  for (const t of ["mot_reminder_30d", "mot_reminder_7d", "mot_reminder_5d"]) {
    it(`${t} ok at 12 hours`, () => {
      expect(canRetry(t, hoursAgo(12), NOW)).toEqual({ ok: true });
    });
    it(`${t} expired at 25 hours`, () => {
      expect(canRetry(t, hoursAgo(25), NOW).ok).toBe(false);
    });
  }
});

describe("canRetry — indefinite types", () => {
  for (const t of ["quote_sent", "quote_updated", "invoice_sent"]) {
    it(`${t} ok at 1 day`, () => {
      expect(canRetry(t, hoursAgo(24), NOW)).toEqual({ ok: true });
    });
    it(`${t} ok at 30 days`, () => {
      expect(canRetry(t, hoursAgo(24 * 30), NOW)).toEqual({ ok: true });
    });
    it(`${t} ok at 1 year`, () => {
      expect(canRetry(t, hoursAgo(24 * 365), NOW)).toEqual({ ok: true });
    });
  }
});

describe("canRetry — unknown type", () => {
  it("rejects with unknown_type reason", () => {
    const r = canRetry("not_a_real_type", minutesAgo(1), NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("unknown_type");
      expect(r.windowMs).toBeNull();
    }
  });
});

describe("canRetry — input shape", () => {
  it("accepts ISO string for createdAt", () => {
    expect(
      canRetry("status_code", minutesAgo(5).toISOString(), NOW),
    ).toEqual({ ok: true });
  });

  it("accepts Date for createdAt", () => {
    expect(canRetry("status_code", minutesAgo(5), NOW)).toEqual({ ok: true });
  });
});

describe("formatRetryWindow", () => {
  it("formats minute windows", () => {
    expect(formatRetryWindow("status_code")).toBe("8 minutes");
  });
  it("formats hour windows", () => {
    expect(formatRetryWindow("approval_request")).toBe("24 hours");
    expect(formatRetryWindow("mot_reminder_30d")).toBe("24 hours");
  });
  it("returns 'no expiry' for indefinite types", () => {
    expect(formatRetryWindow("quote_sent")).toBe("no expiry");
    expect(formatRetryWindow("invoice_sent")).toBe("no expiry");
  });
  it("returns 'unknown' for unknown types", () => {
    expect(formatRetryWindow("not_a_real_type")).toBe("unknown");
  });
});

describe("RETRY_FINITE_TYPES", () => {
  it("lists the five finite-window types only", () => {
    expect(RETRY_FINITE_TYPES.sort()).toEqual(
      [
        "approval_request",
        "mot_reminder_30d",
        "mot_reminder_5d",
        "mot_reminder_7d",
        "status_code",
      ].sort(),
    );
  });
});
