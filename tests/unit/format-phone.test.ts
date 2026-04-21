/**
 * `formatPhone` — UK display formatter for tap-to-call surfaces
 * (audit F7, My Work tap-to-call). Accepts E.164 or local input;
 * renders `07XXX XXX XXX`. Falls back to raw input for non-UK / odd
 * shapes so the customer-facing display never goes blank.
 */
import { describe, expect, it } from "vitest";

import { formatPhone } from "@/lib/format";

describe("formatPhone", () => {
  it("normalises +44 mobile to 07XXX XXX XXX", () => {
    expect(formatPhone("+447700900001")).toBe("07700 900 001");
  });

  it("accepts the 44-prefixed shape (no leading +) and converts", () => {
    expect(formatPhone("447700900001")).toBe("07700 900 001");
  });

  it("formats already-local 07XXXXXXXXX with spacing", () => {
    expect(formatPhone("07700900001")).toBe("07700 900 001");
  });

  it("strips spaces / dashes from the input before parsing", () => {
    expect(formatPhone("+44 7700 900 001")).toBe("07700 900 001");
    expect(formatPhone("07700-900-001")).toBe("07700 900 001");
  });

  it("returns empty string for null / undefined / empty", () => {
    expect(formatPhone(null)).toBe("");
    expect(formatPhone(undefined)).toBe("");
    expect(formatPhone("")).toBe("");
  });

  it("falls back to the raw input for non-UK / odd-length numbers", () => {
    // Foreign-format E.164 — return as-is rather than mangle.
    expect(formatPhone("+33612345678")).toBe("+33612345678");
    // Truncated number — preserve verbatim.
    expect(formatPhone("0770090")).toBe("0770090");
  });
});
