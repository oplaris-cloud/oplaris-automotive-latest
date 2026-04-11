import { describe, expect, it } from "vitest";

// Phase 0 sanity check — proves the test runner is wired up.
// Real tests land in Phase 1 (RLS suite) and beyond.
describe("phase 0 sanity", () => {
  it("can run a test", () => {
    expect(2 + 2).toBe(4);
  });
});
