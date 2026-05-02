/**
 * B5.2 — composeVehicleJobsSearchPredicate normalises URL searchParams
 * into a structured predicate. The runtime (`searchVehicleJobs`) then
 * applies the predicate against RLS-scoped queries.
 *
 * This test pins the parser contract so unexpected input from a stale
 * URL (e.g. `?repair=mot,unknown,maintenance`) silently drops invalid
 * chips rather than blowing up the page.
 */
import { describe, expect, it } from "vitest";

import { composeVehicleJobsSearchPredicate } from "@/lib/search/vehicle-jobs";

describe("composeVehicleJobsSearchPredicate", () => {
  it("empty input → both q and chips empty", () => {
    const p = composeVehicleJobsSearchPredicate({});
    expect(p.q).toBeNull();
    expect(p.repairChips).toEqual([]);
  });

  it("trims and sanitises q (strip PostgREST reserved chars)", () => {
    const p = composeVehicleJobsSearchPredicate({ q: "  brake,(*) " });
    expect(p.q).not.toBeNull();
    expect(p.q).not.toMatch(/[,()*\\]/);
    expect(p.q?.trim()).toBe(p.q);
  });

  it("collapses whitespace-only q to null", () => {
    const p = composeVehicleJobsSearchPredicate({ q: "   " });
    expect(p.q).toBeNull();
  });

  it("parses single chip", () => {
    const p = composeVehicleJobsSearchPredicate({ repair: "mot" });
    expect(p.repairChips).toEqual(["mot"]);
  });

  it("parses multiple chips comma-separated", () => {
    const p = composeVehicleJobsSearchPredicate({
      repair: "mot,electrical",
    });
    expect(p.repairChips.sort()).toEqual(["electrical", "mot"]);
  });

  it("drops unknown chip values silently", () => {
    const p = composeVehicleJobsSearchPredicate({
      repair: "mot,bodyshop,electrical",
    });
    // bodyshop is not a valid RepairChip — gone, but mot/electrical survive
    expect(p.repairChips.sort()).toEqual(["electrical", "mot"]);
  });

  it("lowercases chip values defensively", () => {
    const p = composeVehicleJobsSearchPredicate({ repair: "MOT,Electrical" });
    expect(p.repairChips.sort()).toEqual(["electrical", "mot"]);
  });

  it("ignores empty / whitespace segments", () => {
    const p = composeVehicleJobsSearchPredicate({ repair: ",mot, ,," });
    expect(p.repairChips).toEqual(["mot"]);
  });
});
