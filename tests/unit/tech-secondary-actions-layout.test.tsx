/**
 * F2 layout smoke — TechSecondaryActions renders a 3-column row with
 * two live triggers (Add part / Request approval) and a disabled
 * "Add note" placeholder that 2b will replace.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { TechSecondaryActions } from "@/app/(app)/app/tech/job/[id]/TechSecondaryActions";

// The sheets pull in server actions as module imports; stub them so
// the component tree can render in jsdom without hitting a real
// Supabase client.
vi.mock("@/app/(app)/app/jobs/parts/actions", () => ({
  addJobPart: vi.fn(),
}));
vi.mock("@/app/(app)/app/jobs/approvals/actions", () => ({
  requestApproval: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/hooks/use-media-query", () => ({
  useMediaQuery: () => false,
}));

describe("TechSecondaryActions", () => {
  it("renders the three slots in a 3-column grid", () => {
    const { container } = render(
      <TechSecondaryActions jobId="00000000-0000-0000-0000-000000000000" />,
    );
    const grid = container.firstElementChild as HTMLElement;
    expect(grid.className).toContain("grid-cols-3");
    expect(screen.getByText("Add part")).toBeDefined();
    expect(screen.getByText("Request approval")).toBeDefined();
    expect(screen.getByText("Add note")).toBeDefined();
  });

  it("marks Add note as disabled with a 'coming soon' aria-label", () => {
    render(<TechSecondaryActions jobId="00000000-0000-0000-0000-000000000000" />);
    const addNote = screen.getByLabelText(/Add note — coming soon/i);
    expect(addNote).toBeDefined();
    expect((addNote as HTMLButtonElement).disabled).toBe(true);
  });

  it("uses tap-target-safe min-height on every trigger button", () => {
    const { container } = render(
      <TechSecondaryActions jobId="00000000-0000-0000-0000-000000000000" />,
    );
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThanOrEqual(3);
    for (const btn of buttons) {
      expect(btn.className).toMatch(/min-h-11/);
    }
  });
});
