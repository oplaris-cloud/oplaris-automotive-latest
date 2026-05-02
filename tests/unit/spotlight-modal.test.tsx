/**
 * B5.4 — <SpotlightModal> component contract.
 *
 * Three behaviours we lock down here so a future refactor can't
 * regress them:
 *   - Cmd+K (and Ctrl+K) toggle the modal open/closed
 *   - The fetch is debounced 200ms — fast typers don't hammer the API
 *   - Server-grouped results render under the right group headings,
 *     and clicking a row navigates via router.push
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";

import { SpotlightModal } from "@/components/spotlight/spotlight-modal";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockFetch = vi.fn();

const SAMPLE_PAYLOAD = {
  groups: {
    jobs: [
      {
        id: "j1",
        kind: "job",
        label: "JOB-001",
        sublabel: "Carla Customer · AB12CDE · in repair",
        href: "/app/jobs/j1",
      },
    ],
    customers: [
      {
        id: "c1",
        kind: "customer",
        label: "Carla Customer",
        sublabel: "+447700900001 · carla@example.com",
        href: "/app/customers/c1",
      },
    ],
    vehicles: [
      {
        id: "v1",
        kind: "vehicle",
        label: "AB12CDE",
        sublabel: "Ford Focus · Carla Customer",
        href: "/app/vehicles/v1",
      },
    ],
    messages: [],
    stock: [],
  },
};

describe("<SpotlightModal>", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockPush.mockClear();
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => SAMPLE_PAYLOAD,
    });
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("Cmd+K opens the modal and shows the input", () => {
    render(<SpotlightModal />);
    // Closed by default — the input doesn't appear in the document.
    expect(
      screen.queryByPlaceholderText(/Search jobs, customers/),
    ).not.toBeInTheDocument();

    act(() => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });

    expect(
      screen.getByPlaceholderText(/Search jobs, customers/),
    ).toBeInTheDocument();
  });

  it("Ctrl+K (non-Mac) also opens it", () => {
    render(<SpotlightModal />);
    act(() => {
      fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    });
    expect(
      screen.getByPlaceholderText(/Search jobs, customers/),
    ).toBeInTheDocument();
  });

  it("debounces 200ms before firing the fetch", async () => {
    render(<SpotlightModal />);
    act(() => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });
    const input = screen.getByPlaceholderText(/Search jobs, customers/);

    fireEvent.change(input, { target: { value: "AB" } });
    act(() => vi.advanceTimersByTime(50));
    fireEvent.change(input, { target: { value: "AB12" } });
    act(() => vi.advanceTimersByTime(50));
    expect(mockFetch).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(200));
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0]?.[0]).toContain("q=AB12");
  });

  it("renders results under the right group headings + routes on click", async () => {
    // Real timers — waitFor polls the DOM with real time.
    vi.useRealTimers();
    render(<SpotlightModal />);
    act(() => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });
    const input = screen.getByPlaceholderText(/Search jobs, customers/);

    fireEvent.change(input, { target: { value: "Carla" } });

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByText("JOB-001")).toBeInTheDocument(),
    );

    expect(screen.getByText("Jobs")).toBeInTheDocument();
    expect(screen.getByText("Customers")).toBeInTheDocument();
    expect(screen.getByText("Carla Customer")).toBeInTheDocument();
    expect(screen.getByText("Vehicles")).toBeInTheDocument();
    expect(screen.getByText("AB12CDE")).toBeInTheDocument();

    // Empty groups stay hidden.
    expect(screen.queryByText("Messages")).not.toBeInTheDocument();
    expect(screen.queryByText("Stock")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByText("JOB-001").closest("[role='option']") ??
        screen.getByText("JOB-001"),
    );
    expect(mockPush).toHaveBeenCalledWith("/app/jobs/j1");
  });
});
