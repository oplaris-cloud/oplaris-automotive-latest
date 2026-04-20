import { describe, it, expect } from "vitest";

import { isMotExpired, isMotExpiringSoon } from "@/lib/mot/expiry";

const NOW = new Date("2026-04-20T12:00:00Z");

describe("isMotExpired", () => {
  it("returns true when the expiry is one day in the past", () => {
    expect(isMotExpired(new Date("2026-04-19T12:00:00Z"), NOW)).toBe(true);
  });

  it("returns false at the exact cutoff (strict <)", () => {
    expect(isMotExpired(new Date("2026-04-20T12:00:00Z"), NOW)).toBe(false);
  });

  it("returns false one day in the future", () => {
    expect(isMotExpired(new Date("2026-04-21T12:00:00Z"), NOW)).toBe(false);
  });

  it("accepts an ISO string for expiryDate", () => {
    expect(isMotExpired("2026-04-19T12:00:00Z", NOW)).toBe(true);
    expect(isMotExpired("2026-04-21T12:00:00Z", NOW)).toBe(false);
  });
});

describe("isMotExpiringSoon", () => {
  it("returns false when the MOT has already expired", () => {
    expect(
      isMotExpiringSoon(new Date("2026-04-19T12:00:00Z"), NOW),
    ).toBe(false);
  });

  it("returns true 29 days out (inside the default 30-day window)", () => {
    const expiry = new Date("2026-05-19T12:00:00Z");
    expect(isMotExpiringSoon(expiry, NOW)).toBe(true);
  });

  it("returns false at the exact 30-day boundary (strict <)", () => {
    const expiry = new Date("2026-05-20T12:00:00Z");
    expect(isMotExpiringSoon(expiry, NOW)).toBe(false);
  });

  it("returns false 31 days out", () => {
    const expiry = new Date("2026-05-21T12:00:00Z");
    expect(isMotExpiringSoon(expiry, NOW)).toBe(false);
  });

  it("honours a custom `withinDays` window", () => {
    const expiry = new Date("2026-05-25T12:00:00Z");
    expect(isMotExpiringSoon(expiry, NOW, 60)).toBe(true);
    expect(isMotExpiringSoon(expiry, NOW, 30)).toBe(false);
  });

  it("accepts an ISO string for expiryDate", () => {
    expect(isMotExpiringSoon("2026-05-19T12:00:00Z", NOW)).toBe(true);
    expect(isMotExpiringSoon("2026-05-21T12:00:00Z", NOW)).toBe(false);
  });
});
