/**
 * AddPartSheet — F2 / §4.5. Asserts that submitting the form wires
 * the mobile-friendly £ price input into the pence-integer that
 * `addJobPart` requires, and that a validation error surfaces as a
 * field-level alert.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { AddPartSheet } from "@/app/(app)/app/tech/job/[id]/AddPartSheet";
import { addJobPart } from "@/app/(app)/app/jobs/parts/actions";

vi.mock("@/app/(app)/app/jobs/parts/actions", () => ({
  addJobPart: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/hooks/use-media-query", () => ({
  useMediaQuery: () => true, // pin to mobile (side="bottom") for the test
}));
vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const JOB_ID = "00000000-0000-0000-0000-000000000aaa";

function openAndFill(form: {
  description?: string;
  priceGbp?: string;
  qty?: string;
}) {
  render(<AddPartSheet jobId={JOB_ID} />);
  fireEvent.click(screen.getByRole("button", { name: /add part/i }));
  if (form.description !== undefined) {
    fireEvent.change(screen.getByLabelText(/part description/i), {
      target: { value: form.description },
    });
  }
  if (form.priceGbp !== undefined) {
    fireEvent.change(screen.getByLabelText(/unit price/i), {
      target: { value: form.priceGbp },
    });
  }
  if (form.qty !== undefined) {
    fireEvent.change(screen.getByLabelText(/qty/i), {
      target: { value: form.qty },
    });
  }
}

describe("AddPartSheet", () => {
  beforeEach(() => {
    vi.mocked(addJobPart).mockReset();
  });

  it("converts pounds input to pence before submit", async () => {
    vi.mocked(addJobPart).mockResolvedValueOnce({ ok: true });
    openAndFill({ description: "Front brake pads", priceGbp: "42.50", qty: "2" });

    fireEvent.submit((screen.getByRole("button", { name: /save part/i }) as HTMLButtonElement).form!);

    await waitFor(() => {
      expect(addJobPart).toHaveBeenCalledTimes(1);
    });
    const formData = vi.mocked(addJobPart).mock.calls[0]![0] as FormData;
    expect(formData.get("jobId")).toBe(JOB_ID);
    expect(formData.get("description")).toBe("Front brake pads");
    expect(formData.get("unitPricePence")).toBe("4250");
    expect(formData.get("quantity")).toBe("2");
    expect(formData.get("unitPricePounds")).toBeNull();
    expect(formData.get("purchasedAt")).toBeTruthy();
  });

  it("surfaces server-side field errors inline without toasting", async () => {
    vi.mocked(addJobPart).mockResolvedValueOnce({
      ok: false,
      error: "Validation failed",
      fieldErrors: { description: "Description is required" },
    });
    openAndFill({ description: "x", priceGbp: "1.00", qty: "1" });

    fireEvent.submit((screen.getByRole("button", { name: /save part/i }) as HTMLButtonElement).form!);

    await waitFor(() => {
      expect(
        screen.getByRole("alert", { name: "" }).textContent,
      ).toContain("Description is required");
    });
  });
});
