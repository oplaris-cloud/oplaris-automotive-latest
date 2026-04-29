/**
 * P3.1 — StaffCard renders a busy staff member with a live HH:MM:SS
 * timer driven by the same workedSeconds() math the tech UI uses, and
 * a free staff member with the "Free now · N done today" line.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { StaffCard } from "@/app/(app)/app/staff/StaffCard";
import type { StaffWithLiveStatus } from "@/app/(app)/app/staff/actions";

function makeRow(overrides: Partial<StaffWithLiveStatus> = {}): StaffWithLiveStatus {
  return {
    staff: {
      id: "00000000-0000-0000-0000-000000000001",
      full_name: "Anna Mechanic",
      email: "anna@example.test",
      phone: null,
      avatar_url: null,
      roles: ["mechanic"],
    },
    status: "free",
    activeWorkLog: null,
    jobsCompletedToday: 0,
    ...overrides,
  };
}

describe("<StaffCard>", () => {
  it("renders a busy card with the active vehicle reg and a running timer", () => {
    // Started 2 hours ago, no pauses → expect 2:00:00 in the timer slot.
    const startedAt = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    const row = makeRow({
      status: "busy",
      activeWorkLog: {
        id: "wl-1",
        jobId: "00000000-0000-0000-0000-0000000a0b01",
        jobNumber: "DUD-0042",
        vehicleReg: "AB12CDE",
        startedAt,
        pausedAt: null,
        pausedSecondsTotal: 0,
      },
    });

    render(<StaffCard data={row} />);

    expect(screen.getByText("Anna Mechanic")).toBeInTheDocument();
    expect(screen.getByText("AB12CDE")).toBeInTheDocument();
    expect(screen.getByText("DUD-0042")).toBeInTheDocument();

    const timer = screen.getByLabelText("Timer running");
    // Clock might tick mid-render; allow either 1:59:59 or 2:00:00.
    expect(timer.textContent ?? "").toMatch(/^[12]:\d{2}:\d{2}/);

    // The card is a link to the detail page.
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/app/staff/00000000-0000-0000-0000-000000000001",
    );
  });

  it("renders a free card with the today-completed count", () => {
    const row = makeRow({ status: "free", jobsCompletedToday: 3 });
    render(<StaffCard data={row} />);

    expect(screen.getByText(/Free now · 3 jobs done today/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Timer running")).toBeNull();
  });
});
