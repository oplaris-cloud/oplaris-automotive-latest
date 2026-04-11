import { describe, expect, it } from "vitest";

import {
  isValidTransition,
  JOB_STATUSES,
  STATUS_TRANSITIONS,
} from "@/lib/validation/job-schemas";

describe("job status state machine", () => {
  it("allows draft → booked", () => {
    expect(isValidTransition("draft", "booked")).toBe(true);
  });

  it("allows draft → cancelled", () => {
    expect(isValidTransition("draft", "cancelled")).toBe(true);
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
});
