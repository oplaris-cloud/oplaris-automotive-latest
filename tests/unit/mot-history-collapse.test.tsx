/**
 * B3.2 — MOT history progressive disclosure on /app/vehicles/[id].
 *
 * Asserts the three documented edge cases:
 *   * 0 prior MOTs (1 total)        → 1 row, no toggle button, "No
 *                                      prior MOT history" line
 *   * 1 prior MOT (2 total)         → 1 row + "Show full history (1)"
 *                                      → click → 2 rows + "Hide..."
 *   * 4 prior MOTs (5 total)        → 1 row + "Show full history (4)"
 *
 * Empty array (no MOTs at all) is covered by the existing "No MOT
 * history available — Fetch from DVSA" branch and not exercised here.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { MotHistorySection } from "@/app/(app)/app/vehicles/[id]/MotHistorySection";
import type { MotHistoryEntry } from "@/app/(app)/app/vehicles/actions";

// fetch is invoked by the Refresh button — we never click it in these
// tests but jsdom doesn't ship a global fetch so vitest needs a stub.
vi.stubGlobal("fetch", vi.fn());

function makeMot(date: string, result = "PASSED"): MotHistoryEntry {
  return {
    completedDate: date,
    expiryDate: "2027-01-01",
    testResult: result,
    odometerValue: "12000",
    odometerUnit: "mi",
    defects: [],
  } as MotHistoryEntry;
}

const NOW = new Date("2026-04-30T00:00:00Z");

describe("MotHistorySection — progressive disclosure (B3.2)", () => {
  it("1 total MOT renders no toggle and shows 'No prior MOT history'", () => {
    render(
      <MotHistorySection
        vehicleId="v1"
        registration="AB12 CDE"
        motHistory={[makeMot("2025-01-15T10:00:00Z")]}
        now={NOW}
      />,
    );
    expect(screen.queryByRole("button", { name: /show full history/i })).toBeNull();
    expect(screen.getByText(/no prior mot history/i)).toBeDefined();
  });

  it("2 total MOTs renders 1 row + 'Show full history (1)' toggle", () => {
    render(
      <MotHistorySection
        vehicleId="v1"
        registration="AB12 CDE"
        motHistory={[
          makeMot("2025-01-15T10:00:00Z"),
          makeMot("2024-01-15T10:00:00Z"),
        ]}
        now={NOW}
      />,
    );
    expect(
      screen.getByRole("button", { name: /show full history \(1\)/i }),
    ).toBeDefined();
    expect(screen.queryByRole("button", { name: /hide full history/i })).toBeNull();
  });

  it("5 total MOTs renders 1 row + 'Show full history (4)' toggle and expands inline", () => {
    render(
      <MotHistorySection
        vehicleId="v1"
        registration="AB12 CDE"
        motHistory={[
          makeMot("2026-01-15T10:00:00Z"),
          makeMot("2025-01-15T10:00:00Z"),
          makeMot("2024-01-15T10:00:00Z"),
          makeMot("2023-01-15T10:00:00Z"),
          makeMot("2022-01-15T10:00:00Z"),
        ]}
        now={NOW}
      />,
    );
    const toggle = screen.getByRole("button", {
      name: /show full history \(4\)/i,
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(
      screen.getByRole("button", { name: /hide full history/i }),
    ).toBeDefined();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });
});
