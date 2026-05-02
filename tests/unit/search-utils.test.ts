/**
 * B5.4 — shared search utilities (sanitiseSearch + buildPhonePatterns).
 *
 * The spotlight composer + each list-page composer compose these two
 * helpers. The B5.1 + B5.3 tests exercise them indirectly; this file
 * pins them in isolation so a regression on either changes the
 * test-count, not just the cascading consumers.
 */
import { describe, expect, it } from "vitest";

import { sanitiseSearch, buildPhonePatterns } from "@/lib/search/utils";

describe("sanitiseSearch", () => {
  it("strips PostgREST-reserved chars + trims", () => {
    expect(sanitiseSearch("  brake,(*pads)  ")).toMatch(/^brake\s+pads$/);
  });

  it("preserves UK reg shape (no special chars)", () => {
    expect(sanitiseSearch("AB12 CDE")).toBe("AB12 CDE");
  });

  it("collapses an all-special input to empty", () => {
    expect(sanitiseSearch(",(*\"')")).toBe("");
  });
});

describe("buildPhonePatterns", () => {
  it("non-phone text returns just the raw pattern", () => {
    expect(buildPhonePatterns("john")).toEqual(["john"]);
  });

  it("UK mobile expands to E.164 + 0-prefixed local + bare national + digits-only", () => {
    const out = buildPhonePatterns("07911 123456");
    expect(out).toContain("07911 123456"); // raw
    expect(out).toContain("+447911123456"); // E.164
    expect(out).toContain("07911123456"); // local
    expect(out).toContain("7911123456"); // bare
    expect(out).toContain("447911123456"); // digits-only with country
  });

  it("E.164-formatted input expands to local + bare variants", () => {
    const out = buildPhonePatterns("+447911123456");
    expect(out).toContain("+447911123456");
    expect(out).toContain("07911123456");
  });

  it("dedupes when raw equals normalised", () => {
    const out = buildPhonePatterns("+447911123456");
    // No two identical entries
    expect(new Set(out).size).toBe(out.length);
  });

  it("empty input returns no patterns", () => {
    expect(buildPhonePatterns("")).toEqual([]);
    expect(buildPhonePatterns("   ")).toEqual([]);
  });
});
