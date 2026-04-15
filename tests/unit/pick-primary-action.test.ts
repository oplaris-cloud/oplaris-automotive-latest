/**
 * P52 — exercises the pure `pickPrimaryAction` helper so the role-aware
 * Primary CTA selection is a covered surface, independent of the
 * surrounding React render tree. Each branch maps to one of the bullets
 * in `MASTER_PLAN.md > P52 > Header reorg`.
 */
import { describe, expect, it } from "vitest";

// next/navigation pulls in App-Router internals when JobActionsRow loads.
// We stub it so the import graph stays jsdom-friendly.
import { vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

import {
  pickPrimaryAction,
  type JobForActions,
  type ViewerContext,
} from "@/app/(app)/app/jobs/[id]/JobActionsRow";

const motJob = (
  current_role: JobForActions["current_role"],
  status: JobForActions["status"] = "in_diagnosis",
): JobForActions => ({
  id: "11111111-1111-1111-1111-111111111111",
  status,
  service: "mot",
  current_role,
});

const elecJob = (
  status: JobForActions["status"] = "in_diagnosis",
  current_role: JobForActions["current_role"] = "mechanic",
): JobForActions => ({
  id: "22222222-2222-2222-2222-222222222222",
  status,
  service: "electrical",
  current_role,
});

const tester: ViewerContext = { roles: ["mot_tester"], isAssignedMechanic: false };
const mechanicAssigned: ViewerContext = {
  roles: ["mechanic"],
  isAssignedMechanic: true,
};
const mechanicUnassigned: ViewerContext = {
  roles: ["mechanic"],
  isAssignedMechanic: false,
};
const manager: ViewerContext = { roles: ["manager"], isAssignedMechanic: false };

describe("pickPrimaryAction", () => {
  it("MOT tester on mot_tester+in_diagnosis MOT job → Pass to mechanic", () => {
    expect(pickPrimaryAction(motJob("mot_tester"), tester)).toEqual({
      kind: "passback",
      jobId: motJob("mot_tester").id,
    });
  });

  it("MOT tester on mot_tester+awaiting_mechanic (legacy) → Resume MOT", () => {
    expect(
      pickPrimaryAction(
        motJob("mot_tester", "awaiting_mechanic"),
        tester,
      ),
    ).toMatchObject({ kind: "resume_mot" });
  });

  it("Mechanic assigned to a mechanic-current_role job → Return to MOT tester", () => {
    expect(
      pickPrimaryAction(motJob("mechanic"), mechanicAssigned),
    ).toMatchObject({ kind: "return_to_tester" });
  });

  it("Unassigned mechanic on a mechanic-current_role job → status fallback (NOT return)", () => {
    const result = pickPrimaryAction(motJob("mechanic"), mechanicUnassigned);
    expect(result.kind).toBe("transition");
  });

  it("Manager on a mechanic-current_role job → Return to MOT tester (manager override)", () => {
    expect(pickPrimaryAction(motJob("mechanic"), manager)).toMatchObject({
      kind: "return_to_tester",
    });
  });

  it("non-MOT job in_diagnosis → first legal transition (Start Repair)", () => {
    expect(pickPrimaryAction(elecJob("in_diagnosis"), mechanicAssigned)).toEqual({
      kind: "transition",
      jobId: elecJob("in_diagnosis").id,
      target: "in_repair",
    });
  });

  it("non-MOT job in_repair → Ready for Collection", () => {
    expect(pickPrimaryAction(elecJob("in_repair"), mechanicAssigned)).toEqual({
      kind: "transition",
      jobId: elecJob("in_repair").id,
      target: "ready_for_collection",
    });
  });

  it("ready_for_collection → first legal target (completed)", () => {
    const job = elecJob("ready_for_collection");
    expect(pickPrimaryAction(job, manager)).toEqual({
      kind: "transition",
      jobId: job.id,
      target: "completed",
    });
  });

  it("completed terminal → none", () => {
    expect(
      pickPrimaryAction(elecJob("completed"), manager),
    ).toEqual({ kind: "none" });
  });

  it("primary never returns awaiting_mechanic as a target (P52 invariant)", () => {
    for (const status of [
      "checked_in",
      "in_diagnosis",
      "in_repair",
      "awaiting_parts",
      "awaiting_customer_approval",
      "ready_for_collection",
    ] as const) {
      const job: JobForActions = {
        id: "00000000-0000-0000-0000-000000000099",
        status,
        service: "electrical",
        current_role: null,
      };
      const result = pickPrimaryAction(job, manager);
      if (result.kind === "transition") {
        expect(result.target).not.toBe("awaiting_mechanic");
      }
    }
  });
});
