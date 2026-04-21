/**
 * Audit F3 + F11 — `PassbackDialog`. Mobile-first checklist with
 * shadcn `<Checkbox>`, 44 px tap targets, and per-field inline
 * "Detail is required" errors gated behind first-submit.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { PassbackDialog } from "@/app/(app)/app/jobs/[id]/PassbackDialog";
import { passJobToMechanic } from "@/app/(app)/app/jobs/passback/actions";

vi.mock("@/app/(app)/app/jobs/passback/actions", () => ({
  passJobToMechanic: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const JOB_ID = "00000000-0000-0000-0000-0000000a0b01";

function openDialog() {
  render(<PassbackDialog jobId={JOB_ID} />);
  fireEvent.click(screen.getByRole("button", { name: /pass to mechanic/i }));
}

function clickItemCheckbox(label: RegExp) {
  // Each row is a `<label>` wrapping `<Checkbox>` + `<span>`. Querying
  // the label by text and clicking it toggles the inner checkbox via
  // the implicit-association — same path the user takes with thumb.
  const labelEl = screen.getByText(label).closest("label");
  if (!labelEl) throw new Error(`label for ${label} not found`);
  fireEvent.click(labelEl);
}

describe("PassbackDialog (audit F3 + F11)", () => {
  beforeEach(() => {
    vi.mocked(passJobToMechanic).mockReset();
  });

  it("submitting before filling required details shows inline errors per failing field, not a top-level error", async () => {
    openDialog();
    // Tick Light bulb (requires detail) and Other (requires detail). Leave both empty.
    clickItemCheckbox(/^Light bulb$/);
    clickItemCheckbox(/^Other$/);

    // Submit via the form (not the trigger button) so React's submit handler fires.
    const submitButton = screen.getByRole("button", { name: /^Pass to mechanic$/i }) as HTMLButtonElement;
    fireEvent.submit(submitButton.form!);

    await waitFor(() => {
      const alerts = screen.getAllByRole("alert");
      // Two field-level alerts, NOT one top-level + redundant copy.
      expect(alerts).toHaveLength(2);
      for (const a of alerts) {
        expect(a.textContent).toContain("Detail is required");
      }
    });
    expect(passJobToMechanic).not.toHaveBeenCalled();
  });

  it("only the failing field shows an error — Light bulb empty + Other filled => 1 alert", async () => {
    openDialog();
    clickItemCheckbox(/^Light bulb$/);
    clickItemCheckbox(/^Other$/);
    fireEvent.change(screen.getByLabelText(/^Other detail$/i), {
      target: { value: "Brake fluid leak" },
    });

    fireEvent.submit((screen.getByRole("button", { name: /^Pass to mechanic$/i }) as HTMLButtonElement).form!);

    await waitFor(() => {
      const alerts = screen.getAllByRole("alert");
      expect(alerts).toHaveLength(1);
      expect(alerts[0]!.textContent).toContain("Detail is required");
    });
    expect(passJobToMechanic).not.toHaveBeenCalled();
  });

  it("submit succeeds once both required details are filled", async () => {
    vi.mocked(passJobToMechanic).mockResolvedValueOnce({ ok: true });
    openDialog();
    clickItemCheckbox(/^Light bulb$/);
    fireEvent.change(screen.getByLabelText(/^Light bulb detail$/i), {
      target: { value: "N/S front" },
    });

    fireEvent.submit((screen.getByRole("button", { name: /^Pass to mechanic$/i }) as HTMLButtonElement).form!);

    await waitFor(() => {
      expect(passJobToMechanic).toHaveBeenCalledWith({
        jobId: JOB_ID,
        items: [{ item: "light_bulb", detail: "N/S front" }],
        note: undefined,
      });
    });
  });

  it("every checkbox row has a 44 px (`min-h-11`) tap surface", () => {
    openDialog();
    // The wrapping <label> carries the tap-target class.
    const labels = document.querySelectorAll(
      "label.flex.min-h-11.cursor-pointer",
    );
    // 11 items in PASSBACK_ITEMS — every one should be ≥44 px.
    expect(labels.length).toBe(11);
  });

  it("unchecked required-detail item does NOT render its detail input", () => {
    openDialog();
    // Light bulb requires detail but is unchecked by default.
    expect(screen.queryByLabelText(/^Light bulb detail$/i)).toBeNull();
    clickItemCheckbox(/^Light bulb$/);
    expect(screen.getByLabelText(/^Light bulb detail$/i)).toBeDefined();
  });

  it("does NOT show inline errors before the first submit (attempted=false)", () => {
    openDialog();
    clickItemCheckbox(/^Light bulb$/); // tick required-detail, leave empty
    // No submit yet — no alert.
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
