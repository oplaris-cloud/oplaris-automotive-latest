/**
 * P46 — `groupTechsByAvailability` puts available techs first, busy
 * techs after, and preserves the inbound order within each group.
 */
import { describe, expect, it } from "vitest";

import type { StaffAvailability } from "@/app/(app)/app/bookings/actions";
import { groupTechsByAvailability } from "@/app/(app)/app/bookings/group-techs";

const tech = (
  id: string,
  full_name: string,
  isBusy: boolean,
  jobNumber: string | null = null,
  jobId: string | null = null,
): StaffAvailability => ({
  id,
  full_name,
  avatar_url: null,
  isBusy,
  currentJobNumber: jobNumber,
  currentJobId: jobId,
  roles: ["mechanic"],
});

describe("groupTechsByAvailability", () => {
  it("returns Available + Busy buckets", () => {
    const all = [
      tech("a", "Alice", false),
      tech("b", "Bob", true, "DUD-2026-00001", "11111111-1111-4111-8111-111111111111"),
      tech("c", "Carla", false),
    ];
    const { available, busy } = groupTechsByAvailability(all);
    expect(available.map((t) => t.id)).toEqual(["a", "c"]);
    expect(busy.map((t) => t.id)).toEqual(["b"]);
  });

  it("preserves inbound name order inside each group", () => {
    const all = [
      tech("d", "Dave", false),
      tech("e", "Ed", false),
      tech("f", "Fay", false),
    ];
    const { available, busy } = groupTechsByAvailability(all);
    expect(available.map((t) => t.full_name)).toEqual(["Dave", "Ed", "Fay"]);
    expect(busy).toEqual([]);
  });

  it("handles all-busy and all-available edge cases", () => {
    const allBusy = [
      tech("g", "Gus", true, "X1"),
      tech("h", "Hank", true, "X2"),
    ];
    const r = groupTechsByAvailability(allBusy);
    expect(r.available).toEqual([]);
    expect(r.busy.map((t) => t.id)).toEqual(["g", "h"]);

    expect(groupTechsByAvailability([])).toEqual({ available: [], busy: [] });
  });
});
