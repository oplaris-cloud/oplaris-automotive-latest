/**
 * B5.1 — composeJobsSearchPredicate is the single point where the URL
 * searchParams turn into a normalised predicate. If this is wrong, the
 * server-side filter is wrong (no input validation will save us).
 *
 * Spec coverage:
 *   - empty / whitespace-only inputs collapse to null (no false-positive
 *     filtering)
 *   - reserved chars `,()*\` are stripped (PostgREST .or() injection)
 *   - phone normalisation expands "07911 123456" → +447911123456 +
 *     local + bare-national variants so storage-format mismatches don't
 *     hide a customer from staff
 *   - date-range from/to round-trip through new Date().toISOString()
 *     so a "2026-04-30T09:00" datetime-local value becomes a UTC ISO
 *     timestamp the SQL layer can compare with `created_at`
 */
import { describe, expect, it } from "vitest";

import { composeJobsSearchPredicate } from "@/lib/search/jobs";

describe("composeJobsSearchPredicate", () => {
  it("returns all-null predicate for empty input", () => {
    const p = composeJobsSearchPredicate({});
    expect(p.q).toBeNull();
    expect(p.fromTs).toBeNull();
    expect(p.toTs).toBeNull();
    expect(p.status).toBeNull();
    expect(p.phonePatterns).toEqual([]);
  });

  it("collapses whitespace-only q to null", () => {
    const p = composeJobsSearchPredicate({ q: "    " });
    expect(p.q).toBeNull();
    expect(p.phonePatterns).toEqual([]);
  });

  it("strips reserved chars (PostgREST .or() injection guard)", () => {
    const p = composeJobsSearchPredicate({ q: "brake,(*pads)" });
    expect(p.q).not.toMatch(/[,()*\\]/);
    expect(p.q).toMatch(/^brake\s+pads$/);
  });

  it("preserves a plain reg-style query", () => {
    const p = composeJobsSearchPredicate({ q: "AB12CDE" });
    expect(p.q).toBe("AB12CDE");
  });

  it("expands a UK mobile number to E.164 + local + bare-national", () => {
    const p = composeJobsSearchPredicate({ q: "07911 123456" });
    expect(p.q).toBe("07911 123456");
    // raw + 3 derived variants
    expect(p.phonePatterns).toContain("07911 123456");
    expect(p.phonePatterns).toContain("+447911123456");
    expect(p.phonePatterns).toContain("07911123456");
    expect(p.phonePatterns).toContain("447911123456");
  });

  it("E.164-formatted query expands to local-format variants", () => {
    const p = composeJobsSearchPredicate({ q: "+447911123456" });
    expect(p.phonePatterns).toContain("+447911123456");
    expect(p.phonePatterns).toContain("07911123456");
    expect(p.phonePatterns).toContain("447911123456");
  });

  it("non-phone query produces only the raw pattern", () => {
    const p = composeJobsSearchPredicate({ q: "John Smith" });
    expect(p.phonePatterns).toEqual(["John Smith"]);
  });

  it("converts datetime-local strings to ISO UTC timestamps", () => {
    const p = composeJobsSearchPredicate({
      from: "2026-04-30T09:00",
      to: "2026-04-30T18:30",
    });
    // The exact UTC offset depends on the test runner's timezone; we
    // assert structure not value.
    expect(p.fromTs).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(p.toTs).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(new Date(p.fromTs!).getTime()).toBeLessThan(
      new Date(p.toTs!).getTime(),
    );
  });

  it("normalises status string", () => {
    const p = composeJobsSearchPredicate({ status: "  in_repair  " });
    expect(p.status).toBe("in_repair");
  });

  it("collapses empty status to null", () => {
    const p = composeJobsSearchPredicate({ status: "" });
    expect(p.status).toBeNull();
  });

  it("ignores unparseable phones and falls back to raw pattern only", () => {
    const p = composeJobsSearchPredicate({ q: "12" });
    // libphonenumber rejects "12" — only the raw pattern survives
    expect(p.phonePatterns).toEqual(["12"]);
  });
});
