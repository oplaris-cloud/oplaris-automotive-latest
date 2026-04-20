/**
 * P50 — pure-helper coverage for the realtime layer:
 *   * `ALLOWED_TABLES` / `isAllowedTable` — whitelist boundary
 *   * `garageFilter` / `eqUuidFilter` / `idInFilter` — runtime UUID and
 *     character-class validation, our hedge against a future call site
 *     accidentally piping a user-supplied string straight into a filter.
 *
 * Covers acceptance criterion P50.S8 (input validation) at the unit
 * layer. The hook itself is React-bound; an integration test in
 * Playwright would drive the rest of S8 (validation throws on mount)
 * but the surface area covered here is the security-relevant one.
 */
import { describe, expect, it } from "vitest";

import {
  ALLOWED_TABLES,
  isAllowedTable,
} from "@/lib/realtime/allowed-tables";
import {
  eqUuidFilter,
  garageFilter,
  idInFilter,
} from "@/lib/realtime/filters";

const VALID_UUID = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const VALID_UUID_2 = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";

describe("ALLOWED_TABLES", () => {
  it("matches the publication membership we expect (manual sync with migrations 035 + 036 + 047)", () => {
    expect([...ALLOWED_TABLES].sort()).toEqual([
      "approval_requests",
      "bays",
      "bookings",
      "customers",
      "invoices",
      "job_assignments",
      "job_charges",
      "job_parts",
      "job_passbacks",
      // Added by migration 036 (P54) — the status transition audit
      // that feeds the unified Job Activity timeline.
      "job_status_events",
      "jobs",
      // Added by migration 047 — universal SMS outbox; Messages page
      // subscribes to status flips from Twilio's status callback.
      "sms_outbox",
      "staff",
      "stock_items",
      "stock_movements",
      "vehicles",
      "warranties",
      "work_logs",
    ]);
  });

  it("rejects banned tables — audit_log MUST never be subscribed (rule #3 + P50.S1)", () => {
    expect(isAllowedTable("audit_log")).toBe(false);
    expect(isAllowedTable("approval_tokens")).toBe(false);
    expect(isAllowedTable("rate_limits")).toBe(false);
    expect(isAllowedTable("mot_history_cache")).toBe(false);
  });

  it("accepts the coverage-matrix tables", () => {
    for (const t of ALLOWED_TABLES) {
      expect(isAllowedTable(t)).toBe(true);
    }
  });
});

describe("garageFilter", () => {
  it("returns garage_id=eq.<uuid> for a valid UUID", () => {
    expect(garageFilter(VALID_UUID)).toBe(`garage_id=eq.${VALID_UUID}`);
  });

  it("accepts a typed extra clause", () => {
    expect(garageFilter(VALID_UUID, "service=eq.mot")).toBe(
      `and=(garage_id.eq.${VALID_UUID},service=eq.mot)`,
    );
  });

  it("throws on non-UUID input — defends rule #1", () => {
    expect(() => garageFilter("not-a-uuid")).toThrow(/invalid UUID/);
    expect(() => garageFilter("' or 1=1; --")).toThrow(/invalid UUID/);
    expect(() => garageFilter("")).toThrow(/invalid UUID/);
  });

  it("throws on a malformed extra clause", () => {
    expect(() =>
      garageFilter(VALID_UUID, "service.eq.mot;DROP TABLE staff"),
    ).toThrow(/invalid extra clause/);
  });
});

describe("eqUuidFilter", () => {
  it("returns column=eq.<uuid> for valid input", () => {
    expect(eqUuidFilter("job_id", VALID_UUID)).toBe(`job_id=eq.${VALID_UUID}`);
  });

  it("rejects non-identifier column names — no SQL-y characters allowed", () => {
    expect(() => eqUuidFilter("id; drop table", VALID_UUID)).toThrow(
      /invalid column/,
    );
    expect(() => eqUuidFilter("foo bar", VALID_UUID)).toThrow(/invalid column/);
  });

  it("rejects non-UUID values", () => {
    expect(() => eqUuidFilter("id", "deadbeef")).toThrow(/invalid UUID/);
  });
});

describe("idInFilter", () => {
  it("joins multiple UUIDs", () => {
    expect(idInFilter([VALID_UUID, VALID_UUID_2])).toBe(
      `id=in.(${VALID_UUID},${VALID_UUID_2})`,
    );
  });

  it("requires ≥1 id — rule #8 status-page filter must never be empty", () => {
    expect(() => idInFilter([])).toThrow(/requires ≥1/);
  });

  it("validates every id, not just the first", () => {
    expect(() => idInFilter([VALID_UUID, "garbage"])).toThrow(/invalid UUID/);
  });
});
