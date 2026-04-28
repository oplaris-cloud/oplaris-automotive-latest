import { describe, expect, it } from "vitest";

import type { BayWithJobs } from "@/app/(app)/app/jobs/actions";
import {
  applyPendingMoves,
  pruneAcceptedMoves,
  type PendingMoves,
} from "@/app/(app)/app/bay-board/bay-board-overlay";

const job = (id: string, overrides: Partial<BayWithJobs["jobs"][number]> = {}) =>
  ({
    id,
    job_number: `DUD-2026-${id}`,
    status: "in_diagnosis",
    description: null,
    estimated_ready_at: null,
    customer: null,
    vehicle: null,
    assignments: [],
    work_logs: [],
    ...overrides,
  }) as BayWithJobs["jobs"][number];

const bay = (id: string, jobs: BayWithJobs["jobs"]): BayWithJobs => ({
  id,
  name: `Bay ${id}`,
  position: 0,
  capability: [],
  jobs,
});

describe("applyPendingMoves", () => {
  it("returns the same reference when no moves are pending", () => {
    const bays = [bay("b1", [job("j1")]), bay("b2", [])];
    const empty: PendingMoves = new Map();
    expect(applyPendingMoves(bays, empty)).toBe(bays);
  });

  it("relocates a job to its pending destination bay", () => {
    const bays = [bay("b1", [job("j1"), job("j2")]), bay("b2", [])];
    const overlay = new Map([["j1", "b2"]]);

    const out = applyPendingMoves(bays, overlay);

    expect(out[0]?.jobs.map((j) => j.id)).toEqual(["j2"]);
    expect(out[1]?.jobs.map((j) => j.id)).toEqual(["j1"]);
  });

  it("does not duplicate a job whose pending destination is its current bay", () => {
    const bays = [bay("b1", [job("j1")]), bay("b2", [])];
    const overlay = new Map([["j1", "b1"]]);

    const out = applyPendingMoves(bays, overlay);

    expect(out[0]?.jobs.map((j) => j.id)).toEqual(["j1"]);
    expect(out[1]?.jobs).toEqual([]);
  });

  it("ignores pending moves whose destination bay is not in the snapshot", () => {
    const bays = [bay("b1", [job("j1")])];
    const overlay = new Map([["j1", "b9"]]);

    const out = applyPendingMoves(bays, overlay);

    // The job is stripped from b1 but b9 doesn't exist, so it just disappears
    // from the rendered overlay. That's acceptable: the absent bay would be a
    // race after a peer deleted the bay; the next refresh will resolve it.
    expect(out[0]?.jobs).toEqual([]);
  });

  it("handles multiple concurrent moves", () => {
    const bays = [
      bay("b1", [job("j1"), job("j2")]),
      bay("b2", [job("j3")]),
      bay("b3", []),
    ];
    const overlay = new Map([
      ["j1", "b3"],
      ["j3", "b1"],
    ]);

    const out = applyPendingMoves(bays, overlay);

    expect(out.find((b) => b.id === "b1")?.jobs.map((j) => j.id)).toEqual([
      "j2",
      "j3",
    ]);
    expect(out.find((b) => b.id === "b2")?.jobs).toEqual([]);
    expect(out.find((b) => b.id === "b3")?.jobs.map((j) => j.id)).toEqual([
      "j1",
    ]);
  });

  it("does not mutate the input bays array", () => {
    const original = [bay("b1", [job("j1")]), bay("b2", [])];
    const snapshot = JSON.parse(JSON.stringify(original));
    const overlay = new Map([["j1", "b2"]]);

    applyPendingMoves(original, overlay);

    expect(original).toEqual(snapshot);
  });
});

describe("pruneAcceptedMoves", () => {
  it("returns the same reference when no overlay entries exist", () => {
    const bays = [bay("b1", [job("j1")])];
    const empty: PendingMoves = new Map();
    expect(pruneAcceptedMoves(bays, empty)).toBe(empty);
  });

  it("returns the same reference when no entries are reflected yet", () => {
    const bays = [bay("b1", [job("j1")]), bay("b2", [])];
    const overlay = new Map([["j1", "b2"]]);

    const out = pruneAcceptedMoves(bays, overlay);

    expect(out).toBe(overlay);
  });

  it("drops an entry once the prop snapshot reflects the move", () => {
    // After realtime fires, the prop puts j1 in b2; the overlay entry is now
    // redundant.
    const bays = [bay("b1", []), bay("b2", [job("j1")])];
    const overlay = new Map([["j1", "b2"]]);

    const out = pruneAcceptedMoves(bays, overlay);

    expect(out).not.toBe(overlay);
    expect(out.size).toBe(0);
  });

  it("keeps unreflected entries while pruning reflected ones", () => {
    const bays = [
      bay("b1", []),
      bay("b2", [job("j1")]),
      bay("b3", [job("j2")]),
    ];
    const overlay = new Map([
      ["j1", "b2"], // reflected — drop
      ["j2", "b1"], // not reflected (j2 still in b3) — keep
    ]);

    const out = pruneAcceptedMoves(bays, overlay);

    expect(Array.from(out.keys())).toEqual(["j2"]);
    expect(out.get("j2")).toBe("b1");
  });
});
