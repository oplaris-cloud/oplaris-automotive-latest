/**
 * RequestApprovalSheet — F2 / §4.4. Asserts the £ → pence conversion
 * on submit, the required-description validation guard (no server
 * round-trip wasted on an empty description), and the server-error
 * surface when `requestApproval` rejects.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { RequestApprovalSheet } from "@/app/(app)/app/tech/job/[id]/RequestApprovalSheet";
import { requestApproval } from "@/app/(app)/app/jobs/approvals/actions";

vi.mock("@/app/(app)/app/jobs/approvals/actions", () => ({
  requestApproval: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/hooks/use-media-query", () => ({
  useMediaQuery: () => true,
}));
vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const JOB_ID = "00000000-0000-0000-0000-000000000bbb";

function open() {
  render(<RequestApprovalSheet jobId={JOB_ID} />);
  fireEvent.click(screen.getByRole("button", { name: /request approval/i }));
}

describe("RequestApprovalSheet", () => {
  beforeEach(() => {
    vi.mocked(requestApproval).mockReset();
  });

  it("submits pence + trimmed description to requestApproval", async () => {
    vi.mocked(requestApproval).mockResolvedValueOnce({ ok: true });
    open();
    fireEvent.change(screen.getByLabelText(/what needs approval/i), {
      target: { value: "  Brake discs need replacing  " },
    });
    fireEvent.change(screen.getByLabelText(/amount/i), {
      target: { value: "180.00" },
    });
    fireEvent.submit((screen.getByRole("button", { name: /send sms/i }) as HTMLButtonElement).form!);

    await waitFor(() => {
      expect(requestApproval).toHaveBeenCalledWith({
        jobId: JOB_ID,
        description: "Brake discs need replacing",
        amountPence: 18000,
      });
    });
  });

  it("blocks empty description locally without calling the server", async () => {
    open();
    // Bypass native HTML `required` so the client-side guard is exercised.
    const descInput = screen.getByLabelText(/what needs approval/i) as HTMLTextAreaElement;
    descInput.removeAttribute("required");
    fireEvent.change(screen.getByLabelText(/amount/i), {
      target: { value: "100" },
    });
    fireEvent.submit((screen.getByRole("button", { name: /send sms/i }) as HTMLButtonElement).form!);

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(
        "Description is required",
      );
    });
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it("shows the server error when the action rejects", async () => {
    vi.mocked(requestApproval).mockResolvedValueOnce({
      ok: false,
      error: "Customer has no phone number on file",
    });
    open();
    fireEvent.change(screen.getByLabelText(/what needs approval/i), {
      target: { value: "Replace alternator" },
    });
    fireEvent.change(screen.getByLabelText(/amount/i), {
      target: { value: "320" },
    });
    fireEvent.submit((screen.getByRole("button", { name: /send sms/i }) as HTMLButtonElement).form!);

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(
        "Customer has no phone number",
      );
    });
  });
});
