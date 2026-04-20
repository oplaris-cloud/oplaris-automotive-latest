/**
 * P54 — Customer-facing label map for the activity feed.
 *
 * The fetcher calls `isCustomerVisibleKind` + a builder from
 * `CUSTOMER_KIND_COPY` to decide what the customer sees. Anything not
 * in the map or whose builder returns null is filtered out. These
 * tests pin the curated subset to the spec.
 */
import { describe, expect, it } from "vitest";

import {
  CUSTOMER_KIND_COPY,
  CUSTOMER_STATUS_LABELS,
  firstNameOf,
  isCustomerVisibleKind,
} from "@/lib/timeline/customer-labels";

describe("isCustomerVisibleKind", () => {
  it.each([
    "passed_to_mechanic",
    "returned_from_mechanic",
    "status_changed",
  ])("returns true for the curated subset member %s", (kind) => {
    expect(isCustomerVisibleKind(kind)).toBe(true);
  });

  // work_running and work_session were removed 2026-04-18 (Hossein
  // decision: customers must not see work durations or technician names).
  it.each([
    "work_running",
    "work_session",
    "passed_to_mot_tester",
    "returned_from_mot_tester",
    "unknown_kind",
    "",
  ])("returns false for excluded / unknown kinds (%s)", (kind) => {
    expect(isCustomerVisibleKind(kind)).toBe(false);
  });
});

describe("CUSTOMER_KIND_COPY builders", () => {
  it("passed_to_mechanic uses a fixed friendly line (no staff name leak)", () => {
    const r = CUSTOMER_KIND_COPY.passed_to_mechanic!({
      payload: { note: "anything", items: [] },
      actorFirstName: "Jake",
    });
    expect(r?.line).toBe("Passed to mechanic for repair work");
  });

  it("work_running is NOT in the customer copy map (privacy, 2026-04-18)", () => {
    expect(CUSTOMER_KIND_COPY.work_running).toBeUndefined();
  });

  it("work_session is NOT in the customer copy map (privacy, 2026-04-18)", () => {
    expect(CUSTOMER_KIND_COPY.work_session).toBeUndefined();
  });

  it("status_changed returns null for statuses not in the customer-safe map", () => {
    const r = CUSTOMER_KIND_COPY.status_changed!({
      payload: { to_status: "checked_in" }, // internal
      actorFirstName: null,
    });
    expect(r).toBeNull();
  });

  it("status_changed returns the curated label for customer-safe statuses", () => {
    const r = CUSTOMER_KIND_COPY.status_changed!({
      payload: { to_status: "ready_for_collection" },
      actorFirstName: null,
    });
    expect(r?.line).toBe("Ready for collection");
  });

  it("CUSTOMER_STATUS_LABELS covers the six customer-safe statuses", () => {
    expect(Object.keys(CUSTOMER_STATUS_LABELS).sort()).toEqual(
      [
        "awaiting_customer_approval",
        "awaiting_parts",
        "completed",
        "in_diagnosis",
        "in_repair",
        "ready_for_collection",
      ].sort(),
    );
  });
});

describe("firstNameOf", () => {
  it("returns the first token of a full name", () => {
    expect(firstNameOf("Jake Smith")).toBe("Jake");
  });

  it("handles hyphenated first names as one token", () => {
    expect(firstNameOf("Mary-Jane Holmes")).toBe("Mary-Jane");
  });

  it("returns null for missing or empty input", () => {
    expect(firstNameOf(null)).toBeNull();
    expect(firstNameOf(undefined)).toBeNull();
    expect(firstNameOf("   ")).toBeNull();
  });

  it("trims surrounding whitespace", () => {
    expect(firstNameOf("  Jake  ")).toBe("Jake");
  });
});
