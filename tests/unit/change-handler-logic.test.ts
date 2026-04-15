/**
 * P53 — pure logic for the Change Handler palette/dialog.
 *
 * These are the derivation rules that decide what gets pre-ticked for
 * removal and when a direct palette selection is ambiguous. The UI reads
 * these decisions; covering them here keeps render tests free of
 * fixture complexity.
 */
import { describe, expect, it } from "vitest";

import {
  composeSubmitLabel,
  computeDefaultRemovals,
  decidePaletteSelection,
  type AssigneeInfo,
  type EligibleStaffInfo,
} from "@/app/(app)/app/jobs/[id]/change-handler-logic";

const jake: AssigneeInfo = {
  id: "jake",
  full_name: "Jake Mechanic",
  roles: ["mechanic"],
  hasActiveTimer: true,
};
const sarah: AssigneeInfo = {
  id: "sarah",
  full_name: "Sarah Hybrid",
  roles: ["mechanic", "mot_tester"],
  hasActiveTimer: false,
};
const anna: AssigneeInfo = {
  id: "anna",
  full_name: "Anna Tester",
  roles: ["mot_tester"],
  hasActiveTimer: false,
};

const eligibleJake: EligibleStaffInfo = {
  id: "jake",
  full_name: "Jake Mechanic",
  roles: ["mechanic"],
  isBusy: false,
  currentJobNumber: null,
  currentJobId: null,
};
const eligibleSarah: EligibleStaffInfo = {
  id: "sarah",
  full_name: "Sarah Hybrid",
  roles: ["mechanic", "mot_tester"],
  isBusy: false,
  currentJobNumber: null,
  currentJobId: null,
};
const eligibleJohn: EligibleStaffInfo = {
  id: "john",
  full_name: "John Multi",
  roles: ["mechanic", "manager"],
  isBusy: false,
  currentJobNumber: null,
  currentJobId: null,
};

describe("computeDefaultRemovals", () => {
  it("pre-ticks only assignees that don't hold the target role", () => {
    expect(
      computeDefaultRemovals([jake, sarah, anna], "mot_tester"),
    ).toEqual(["jake"]);
  });

  it("returns empty when every assignee covers the target role", () => {
    expect(computeDefaultRemovals([sarah, anna], "mot_tester")).toEqual([]);
  });

  it("empty assignee list returns empty", () => {
    expect(computeDefaultRemovals([], "mechanic")).toEqual([]);
  });
});

describe("decidePaletteSelection — queue", () => {
  it("returns a confirm seed with pre-ticked mismatched assignees", () => {
    const d = decidePaletteSelection({
      selection: { kind: "queue", targetRole: "mot_tester" },
      currentRole: "mechanic",
      assignees: [jake, sarah],
      eligibleStaff: [],
    });
    expect(d).toEqual({
      kind: "confirm",
      targetRole: "mot_tester",
      removeStaffIds: ["jake"],
      assignStaffId: null,
      assignFirstName: null,
    });
  });
});

describe("decidePaletteSelection — person", () => {
  it("person holds the current role → straight reassign, no removals", () => {
    const d = decidePaletteSelection({
      selection: { kind: "person", staffId: "sarah" },
      currentRole: "mechanic",
      assignees: [jake],
      eligibleStaff: [eligibleSarah],
    });
    expect(d).toMatchObject({
      kind: "confirm",
      targetRole: "mechanic",
      removeStaffIds: [],
      assignStaffId: "sarah",
      assignFirstName: "Sarah",
    });
  });

  it("single-role person, no overlap with current role → flip + pre-tick mismatches", () => {
    const d = decidePaletteSelection({
      selection: { kind: "person", staffId: "jake" },
      currentRole: "mot_tester",
      assignees: [anna, jake],
      eligibleStaff: [eligibleJake],
    });
    expect(d).toMatchObject({
      kind: "confirm",
      targetRole: "mechanic",
      removeStaffIds: ["anna"],
      assignStaffId: "jake",
      assignFirstName: "Jake",
    });
  });

  it("multi-role person with no current-role overlap → ambiguous", () => {
    // Current role = mot_tester. John = [mechanic, manager] — no overlap.
    // Palette must flag the ambiguity.
    const d = decidePaletteSelection({
      selection: { kind: "person", staffId: "john" },
      currentRole: "mot_tester",
      assignees: [],
      eligibleStaff: [eligibleJohn],
    });
    expect(d).toMatchObject({
      kind: "ambiguous",
      staffId: "john",
      currentRole: "mot_tester",
    });
  });

  it("unknown staff id (UI drift) → fails closed with ambiguous", () => {
    const d = decidePaletteSelection({
      selection: { kind: "person", staffId: "ghost" },
      currentRole: "mechanic",
      assignees: [],
      eligibleStaff: [],
    });
    expect(d.kind).toBe("ambiguous");
  });
});

describe("composeSubmitLabel", () => {
  it("base queue label when no direct assignee", () => {
    expect(
      composeSubmitLabel({ targetRole: "mot_tester", assignFirstName: null }),
    ).toBe("Return to MOT tester queue");
    expect(
      composeSubmitLabel({ targetRole: "mechanic", assignFirstName: null }),
    ).toBe("Return to mechanic queue");
  });

  it("appends the assignee first-name when a person is picked", () => {
    expect(
      composeSubmitLabel({ targetRole: "mot_tester", assignFirstName: "Sarah" }),
    ).toBe("Return to MOT tester queue · assign Sarah");
  });
});
