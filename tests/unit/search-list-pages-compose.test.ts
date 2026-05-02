/**
 * B5.3 — composer functions for the 5 in-page list searches.
 *
 * The messages composer is the most complex (multi-select chip group
 * + phone normalisation + status + date range), so we focus the
 * largest chunk of unit coverage there. The other composers get
 * smoke-coverage so a regression on `sanitise` or chip parsing is
 * caught at the unit level.
 */
import { describe, expect, it } from "vitest";

import {
  composeCustomersSearchPredicate,
  composeMessagesSearchPredicate,
  composeStockSearchPredicate,
  composeVehiclesSearchPredicate,
  composeWarrantiesSearchPredicate,
} from "@/lib/search/list-pages";

describe("composeCustomersSearchPredicate", () => {
  it("strips reserved chars + collapses empty q", () => {
    const a = composeCustomersSearchPredicate({ q: "  " });
    expect(a.q).toBeNull();
    const b = composeCustomersSearchPredicate({ q: "(*)" });
    expect(b.q).toBeNull();
  });

  it("expands phone-like q to E.164 + variants", () => {
    const p = composeCustomersSearchPredicate({ q: "07911 123456" });
    expect(p.phonePatterns).toContain("+447911123456");
    expect(p.phonePatterns).toContain("07911123456");
  });

  it("traderOnly only when 'trader' chip is set", () => {
    expect(composeCustomersSearchPredicate({}).traderOnly).toBe(false);
    expect(
      composeCustomersSearchPredicate({ filters: "trader" }).traderOnly,
    ).toBe(true);
    expect(
      composeCustomersSearchPredicate({ filters: "TRADER" }).traderOnly,
    ).toBe(true);
    expect(
      composeCustomersSearchPredicate({ filters: "x" }).traderOnly,
    ).toBe(false);
  });
});

describe("composeVehiclesSearchPredicate", () => {
  it("upper-cases qUpper for reg-style matching, leaves q untouched", () => {
    const p = composeVehiclesSearchPredicate({ q: "ab12cde" });
    expect(p.q).toBe("ab12cde");
    expect(p.qUpper).toBe("AB12CDE");
  });

  it("collapses empty input", () => {
    const p = composeVehiclesSearchPredicate({ q: "  " });
    expect(p.q).toBeNull();
    expect(p.qUpper).toBeNull();
  });
});

describe("composeStockSearchPredicate", () => {
  it("trims and sanitises", () => {
    const p = composeStockSearchPredicate({ q: "  brake (pad) " });
    expect(p.q).not.toBeNull();
    expect(p.q).not.toMatch(/[(),*\\]/);
  });
});

describe("composeWarrantiesSearchPredicate", () => {
  it("smoke", () => {
    expect(composeWarrantiesSearchPredicate({}).q).toBeNull();
    expect(composeWarrantiesSearchPredicate({ q: "Bosch" }).q).toBe("Bosch");
  });
});

describe("composeMessagesSearchPredicate (most complex composer)", () => {
  it("returns empty predicate for empty input", () => {
    const p = composeMessagesSearchPredicate({});
    expect(p.q).toBeNull();
    expect(p.types).toEqual([]);
    expect(p.status).toBeNull();
    expect(p.dateFrom).toBeNull();
    expect(p.dateTo).toBeNull();
    expect(p.phonePatterns).toEqual([]);
  });

  it("parses a single chip", () => {
    const p = composeMessagesSearchPredicate({ types: "approval_request" });
    expect(p.types).toEqual(["approval_request"]);
  });

  it("parses comma-separated chips into typed array", () => {
    const p = composeMessagesSearchPredicate({
      types: "status_code,approval_request,mot_reminder_30d",
    });
    expect(p.types.sort()).toEqual([
      "approval_request",
      "mot_reminder_30d",
      "status_code",
    ]);
  });

  it("accepts an array directly (controlled-state path)", () => {
    const p = composeMessagesSearchPredicate({
      types: ["quote_sent", "invoice_sent"],
    });
    expect(p.types.sort()).toEqual(["invoice_sent", "quote_sent"]);
  });

  it("drops unknown SmsType values silently", () => {
    const p = composeMessagesSearchPredicate({
      types: "status_code,bogus,quote_sent",
    });
    // bogus dropped, others kept
    expect(p.types.sort()).toEqual(["quote_sent", "status_code"]);
  });

  it("ignores empty / whitespace segments", () => {
    const p = composeMessagesSearchPredicate({
      types: ",status_code, , ,quote_sent",
    });
    expect(p.types.sort()).toEqual(["quote_sent", "status_code"]);
  });

  it("expands phone-shaped q into E.164 patterns AND keeps message_body match", () => {
    const p = composeMessagesSearchPredicate({ q: "07911123456" });
    expect(p.q).toBe("07911123456");
    // Phone variants populated for the customer match — non-phone
    // queries get a single raw pattern (q itself).
    expect(p.phonePatterns).toContain("+447911123456");
  });

  it("non-phone q produces only the raw pattern", () => {
    const p = composeMessagesSearchPredicate({ q: "brake pad" });
    expect(p.phonePatterns).toEqual(["brake pad"]);
  });

  it("preserves status + date-range fields when set", () => {
    const p = composeMessagesSearchPredicate({
      status: "delivered",
      dateFrom: "2026-04-01",
      dateTo: "2026-04-30",
    });
    expect(p.status).toBe("delivered");
    expect(p.dateFrom).toBe("2026-04-01");
    expect(p.dateTo).toBe("2026-04-30");
  });

  it("collapses whitespace-only status + dates to null", () => {
    const p = composeMessagesSearchPredicate({
      status: "  ",
      dateFrom: "  ",
      dateTo: "  ",
    });
    expect(p.status).toBeNull();
    expect(p.dateFrom).toBeNull();
    expect(p.dateTo).toBeNull();
  });
});
