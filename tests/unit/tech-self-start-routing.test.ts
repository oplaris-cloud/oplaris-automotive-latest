import { describe, it, expect } from "vitest";

import { pickStartDestination } from "@/lib/tech/self-start-routing";

const JOB_ID = "00000000-0000-0000-0000-0000000a0b01";

describe("pickStartDestination", () => {
  it("manager-only → manager job detail", () => {
    expect(pickStartDestination(["manager"], JOB_ID)).toBe(`/app/jobs/${JOB_ID}`);
  });

  it("mechanic → tech job UI", () => {
    expect(pickStartDestination(["mechanic"], JOB_ID)).toBe(
      `/app/tech/job/${JOB_ID}`,
    );
  });

  it("mot_tester → tech job UI", () => {
    expect(pickStartDestination(["mot_tester"], JOB_ID)).toBe(
      `/app/tech/job/${JOB_ID}`,
    );
  });

  it("manager + mechanic (multi-role) → tech job UI", () => {
    expect(pickStartDestination(["manager", "mechanic"], JOB_ID)).toBe(
      `/app/tech/job/${JOB_ID}`,
    );
  });

  it("manager + mot_tester (multi-role) → tech job UI", () => {
    expect(pickStartDestination(["manager", "mot_tester"], JOB_ID)).toBe(
      `/app/tech/job/${JOB_ID}`,
    );
  });

  it("empty roles → tech job UI (safer default for a broken session)", () => {
    expect(pickStartDestination([], JOB_ID)).toBe(`/app/tech/job/${JOB_ID}`);
  });
});
