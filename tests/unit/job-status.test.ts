import { describe, expect, it } from "vitest";

import {
  isValidTransition,
  JOB_STATUSES,
  STATUS_TRANSITIONS,
  type JobStatus,
} from "@/lib/validation/job-schemas";

describe("job status state machine", () => {
  it("allows checked_in → in_diagnosis", () => {
    expect(isValidTransition("checked_in", "in_diagnosis")).toBe(true);
  });

  it("allows checked_in → cancelled", () => {
    expect(isValidTransition("checked_in", "cancelled")).toBe(true);
  });

  it("rejects completed → in_repair", () => {
    expect(isValidTransition("completed", "in_repair")).toBe(false);
  });

  it("rejects cancelled → anything", () => {
    for (const s of JOB_STATUSES) {
      expect(isValidTransition("cancelled", s)).toBe(false);
    }
  });

  it("completed is a terminal state", () => {
    expect(STATUS_TRANSITIONS["completed"]).toEqual([]);
  });

  it("every status in JOB_STATUSES has an entry in STATUS_TRANSITIONS", () => {
    for (const s of JOB_STATUSES) {
      expect(STATUS_TRANSITIONS[s]).toBeDefined();
    }
  });

  it("ready_for_collection can only go to completed", () => {
    expect(STATUS_TRANSITIONS["ready_for_collection"]).toEqual(["completed"]);
  });

  it("rejects self-transition for terminal states", () => {
    expect(isValidTransition("completed", "completed")).toBe(false);
    expect(isValidTransition("cancelled", "cancelled")).toBe(false);
  });

  it("all target statuses in transitions map are valid statuses", () => {
    const statusSet = new Set<string>(JOB_STATUSES);
    for (const [from, targets] of Object.entries(STATUS_TRANSITIONS)) {
      for (const to of targets) {
        expect(statusSet.has(to), `${from} → ${to} references unknown status`).toBe(true);
      }
    }
  });

  it("returns false for a `from` status that is not in the transition map", () => {
    // Defensive nullish fallback — exercises the `?? false` branch on the
    // optional-chain lookup. Cast because TS alone rejects the malformed input.
    expect(isValidTransition("nonsense" as unknown as JobStatus, "completed")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// P52 — `awaiting_mechanic` is not a forward target
// ---------------------------------------------------------------------------

describe("P52 — awaiting_mechanic is no longer a forward target", () => {
  const FORWARD_FROMS: JobStatus[] = [
    "in_diagnosis",
    "in_repair",
    "checked_in",
    "awaiting_parts",
    "awaiting_customer_approval",
    "ready_for_collection",
  ];

  for (const from of FORWARD_FROMS) {
    it(`STATUS_TRANSITIONS["${from}"] does NOT include "awaiting_mechanic" as a target`, () => {
      expect(STATUS_TRANSITIONS[from]).not.toContain("awaiting_mechanic");
    });

    it(`isValidTransition("${from}", "awaiting_mechanic") returns false`, () => {
      expect(isValidTransition(from, "awaiting_mechanic")).toBe(false);
    });
  }

  it("the awaiting_mechanic key itself remains so legacy soak jobs can roll back", () => {
    expect(STATUS_TRANSITIONS["awaiting_mechanic"]).toBeDefined();
    // Reverse transitions still legal: awaiting_mechanic → in_diagnosis / in_repair / cancelled
    expect(STATUS_TRANSITIONS["awaiting_mechanic"]).toContain("in_diagnosis");
    expect(STATUS_TRANSITIONS["awaiting_mechanic"]).toContain("in_repair");
    expect(STATUS_TRANSITIONS["awaiting_mechanic"]).toContain("cancelled");
  });
});
