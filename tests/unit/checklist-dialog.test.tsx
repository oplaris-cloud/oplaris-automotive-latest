/**
 * P3.3 — ChecklistDialog. Phone-primary modal for the end-of-job
 * checklist. Pins:
 *   * Submit disabled until every item is answered.
 *   * Each answer button is ≥44 px tall (WCAG 2.5.5 — gloves usable).
 *   * Successful submission fires submitCompletionCheck then onSubmitted
 *     so the parent can chain into completeWork().
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ChecklistDialog } from "@/app/(app)/app/tech/job/[id]/ChecklistDialog";
import { submitCompletionCheck } from "@/app/(app)/app/jobs/completion/actions";

vi.mock("@/app/(app)/app/jobs/completion/actions", () => ({
  submitCompletionCheck: vi.fn(),
}));

const JOB_ID = "123e4567-e89b-42d3-a456-426614174000";
const ITEMS = [
  "Have you returned the wheel locking nut?",
  "Have you put your tools away?",
  "Have you left the vehicle clean?",
];

function renderDialog(overrides: Partial<{
  onSubmitted: () => void;
  onCancel: () => void;
}> = {}) {
  const onSubmitted = overrides.onSubmitted ?? vi.fn();
  const onCancel = overrides.onCancel ?? vi.fn();
  render(
    <ChecklistDialog
      jobId={JOB_ID}
      role="mechanic"
      items={ITEMS}
      open
      onCancel={onCancel}
      onSubmitted={onSubmitted}
    />,
  );
  return { onSubmitted, onCancel };
}

beforeEach(() => {
  vi.mocked(submitCompletionCheck).mockReset();
  // base-ui Dialog renders into a portal — testing-library's auto
  // cleanup handles the React tree, but explicit `cleanup()` here
  // protects against state from a previous test bleeding through if
  // the auto-cleanup runs after the next render call.
  cleanup();
});

describe("<ChecklistDialog>", () => {
  it("disables Submit until every question has a Yes or No answer", async () => {
    renderDialog();
    const submit = screen.getByRole("button", { name: /Submit & Complete/i });
    expect(submit).toBeDisabled();

    // Answer the first two only.
    const yesButtons = screen.getAllByRole("radio", { name: "Yes" });
    fireEvent.click(yesButtons[0]!);
    fireEvent.click(yesButtons[1]!);
    expect(submit).toBeDisabled();

    // Answer the last → Submit becomes available.
    fireEvent.click(yesButtons[2]!);
    expect(submit).toBeEnabled();
  });

  it("fires submitCompletionCheck + chains onSubmitted on a successful submit", async () => {
    vi.mocked(submitCompletionCheck).mockResolvedValueOnce({ ok: true, id: "x" });
    const { onSubmitted } = renderDialog();

    const yesButtons = screen.getAllByRole("radio", { name: "Yes" });
    const noButtons = screen.getAllByRole("radio", { name: "No" });
    fireEvent.click(yesButtons[0]!);
    fireEvent.click(noButtons[1]!);
    fireEvent.click(yesButtons[2]!);

    fireEvent.click(screen.getByRole("button", { name: /Submit & Complete/i }));

    await waitFor(() => {
      expect(submitCompletionCheck).toHaveBeenCalledWith({
        jobId: JOB_ID,
        answers: [
          { question: ITEMS[0], answer: "yes" },
          { question: ITEMS[1], answer: "no" },
          { question: ITEMS[2], answer: "yes" },
        ],
      });
      expect(onSubmitted).toHaveBeenCalled();
    });
  });

  it("renders every Yes/No button at min 44 px (h-12 = 48 px) for gloves usability", () => {
    renderDialog();
    const radios = screen.getAllByRole("radio");
    // 3 items × 2 buttons = 6 radios, each carrying the h-12 class.
    expect(radios.length).toBe(ITEMS.length * 2);
    for (const r of radios) {
      expect(r.className).toMatch(/\bh-12\b/);
    }
  });
});
