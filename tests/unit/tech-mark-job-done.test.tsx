/**
 * Bug-1 — Completion checklist must NOT fire on Pause / Stop session.
 *
 * The checklist is for the JOB, not the work session. A tech on a
 * multi-day repair pauses + stops several times and the dialog
 * blocked them on each cycle, which Hossein flagged. This test pins
 * the new contract:
 *   - "Stop" → completeWork() runs straight through, no checklist call
 *   - "Mark Job Done" → checklist fetched, then on submit
 *     updateJobStatus(ready_for_collection) fires
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";

import { TechJobClient } from "@/app/(app)/app/tech/job/[id]/TechJobClient";

// ----- mocks -----
// vi.mock is hoisted, so mocked-fn references go through vi.hoisted().
const mocks = vi.hoisted(() => {
  type ActionLike = (input: unknown) => Promise<{
    ok: boolean;
    id?: string;
    error?: string;
  }>;
  return {
    startWork: vi.fn<ActionLike>(async () => ({ ok: true, id: "wl-new" })),
    pauseWork: vi.fn<ActionLike>(async () => ({ ok: true, id: "wl-1" })),
    resumeWork: vi.fn<ActionLike>(async () => ({ ok: true, id: "wl-1" })),
    completeWork: vi.fn<ActionLike>(async () => ({ ok: true, id: "wl-1" })),
    updateJobStatus: vi.fn<ActionLike>(async () => ({ ok: true, id: "j-1" })),
    getActiveChecklist: vi.fn<
      (input: unknown) => Promise<null | { role: string; items: string[] }>
    >(async () => null),
  };
});
const {
  startWork,
  pauseWork,
  resumeWork,
  completeWork,
  updateJobStatus,
  getActiveChecklist,
} = mocks;

vi.mock("@/app/(app)/app/jobs/work-logs/actions", () => ({
  startWork: mocks.startWork,
  pauseWork: mocks.pauseWork,
  resumeWork: mocks.resumeWork,
  completeWork: mocks.completeWork,
}));

vi.mock("@/app/(app)/app/jobs/actions", () => ({
  updateJobStatus: mocks.updateJobStatus,
  createJob: vi.fn(),
  updateJobDetails: vi.fn(),
  assignBay: vi.fn(),
  assignTech: vi.fn(),
  unassignTech: vi.fn(),
  softDeleteJob: vi.fn(),
}));

vi.mock("@/app/(app)/app/jobs/completion/actions", () => ({
  getActiveChecklist: mocks.getActiveChecklist,
  submitCompletionCheck: vi.fn(),
}));

// next/navigation
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

// next-themes (sidebar provider) is unused here but a sibling import
// could pull it in via a chain — stub for safety.
vi.mock("next-themes", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
}));

const ACTIVE_LOG = {
  id: "wl-1",
  task_type: "brakes",
  started_at: new Date(Date.now() - 60_000).toISOString(),
  ended_at: null,
  paused_at: null,
  paused_seconds_total: 0,
};

const baseProps = {
  jobId: "j-1",
  jobNumber: "JOB-001",
  status: "in_repair",
  description: "brake pads",
  vehicleId: "v-1",
  vehicleReg: "AB12CDE",
  vehicleMakeModel: "Ford Focus",
  customerId: "c-1",
  customerName: "Carla Customer",
  customerPhone: "+447700900001",
};

beforeEach(() => {
  startWork.mockClear();
  pauseWork.mockClear();
  resumeWork.mockClear();
  completeWork.mockClear();
  updateJobStatus.mockClear();
  getActiveChecklist.mockClear();
  mockRefresh.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("TechJobClient — Bug-1 checklist trigger", () => {
  it("Stop ends the work session WITHOUT calling getActiveChecklist", async () => {
    render(<TechJobClient {...baseProps} activeWorkLog={ACTIVE_LOG} />);

    const stopBtn = screen.getByRole("button", { name: /^Stop$/i });
    await act(async () => {
      fireEvent.click(stopBtn);
    });

    await waitFor(() => expect(completeWork).toHaveBeenCalledTimes(1));
    expect(completeWork).toHaveBeenCalledWith({ workLogId: "wl-1" });
    expect(getActiveChecklist).not.toHaveBeenCalled();
    expect(updateJobStatus).not.toHaveBeenCalled();
  });

  it("Mark Job Done with no checklist transitions to ready_for_collection", async () => {
    getActiveChecklist.mockResolvedValueOnce(null);
    render(<TechJobClient {...baseProps} activeWorkLog={ACTIVE_LOG} />);

    const doneBtn = screen.getByRole("button", { name: /Mark Job Done/i });
    await act(async () => {
      fireEvent.click(doneBtn);
    });

    // Stops the running session first…
    await waitFor(() => expect(completeWork).toHaveBeenCalledTimes(1));
    // …then asks for a checklist…
    await waitFor(() => expect(getActiveChecklist).toHaveBeenCalledTimes(1));
    // …then flips status.
    await waitFor(() => expect(updateJobStatus).toHaveBeenCalledTimes(1));
    expect(updateJobStatus).toHaveBeenCalledWith({
      jobId: "j-1",
      status: "ready_for_collection",
    });
  });

  it("Mark Job Done with no active session skips completeWork and goes straight to checklist", async () => {
    getActiveChecklist.mockResolvedValueOnce(null);
    render(<TechJobClient {...baseProps} activeWorkLog={null} />);

    const doneBtn = screen.getByRole("button", { name: /Mark Job Done/i });
    await act(async () => {
      fireEvent.click(doneBtn);
    });

    await waitFor(() => expect(getActiveChecklist).toHaveBeenCalledTimes(1));
    expect(completeWork).not.toHaveBeenCalled();
    await waitFor(() => expect(updateJobStatus).toHaveBeenCalledTimes(1));
  });

  it("status picker exposes the tech-allowed transitions only (no completed/cancelled)", () => {
    render(<TechJobClient {...baseProps} activeWorkLog={null} />);

    // in_repair → awaiting_parts / awaiting_customer_approval are
    // tech-driveable; ready_for_collection lives behind Mark Job Done;
    // completed + cancelled are manager-only and must not appear.
    expect(
      screen.getByRole("button", { name: /awaiting parts/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /awaiting customer approval/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^completed$/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^cancelled$/i }),
    ).not.toBeInTheDocument();
  });

  it("Mark Job Done is hidden once the job is already ready_for_collection", () => {
    render(
      <TechJobClient
        {...baseProps}
        status="ready_for_collection"
        activeWorkLog={null}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /Mark Job Done/i }),
    ).not.toBeInTheDocument();
  });

  it("status picker click calls updateJobStatus with the picked target", async () => {
    render(<TechJobClient {...baseProps} activeWorkLog={null} />);
    const btn = screen.getByRole("button", { name: /awaiting parts/i });
    await act(async () => {
      fireEvent.click(btn);
    });
    await waitFor(() => expect(updateJobStatus).toHaveBeenCalledTimes(1));
    expect(updateJobStatus).toHaveBeenCalledWith({
      jobId: "j-1",
      status: "awaiting_parts",
    });
  });
});
