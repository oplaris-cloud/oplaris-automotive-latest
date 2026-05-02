/**
 * B5.1 — <ListSearch> primitive: debounce contract.
 *
 * The 200ms debounce is the difference between feeling-live and
 * hammering the DB. We verify the timing here so a future "let's bump
 * it to 50ms" change has to break this test on purpose.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

import { ListSearch } from "@/components/ui/list-search";

const mockReplace = vi.fn();
const mockSearchParams = { current: new URLSearchParams() };

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => "/app/jobs",
  useSearchParams: () => mockSearchParams.current,
}));

describe("<ListSearch>", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockReplace.mockClear();
    mockSearchParams.current = new URLSearchParams();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the search input with the correct placeholder", () => {
    render(<ListSearch placeholder="Find a job…" />);
    expect(screen.getByPlaceholderText("Find a job…")).toBeInTheDocument();
  });

  it("does not fire router.replace before the 200ms debounce elapses", () => {
    render(<ListSearch placeholder="Search…" />);
    const input = screen.getByPlaceholderText("Search…");

    fireEvent.change(input, { target: { value: "AB12" } });
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("fires router.replace once with the trimmed query after debounce", () => {
    render(<ListSearch placeholder="Search…" />);
    const input = screen.getByPlaceholderText("Search…");

    fireEvent.change(input, { target: { value: "AB12CDE" } });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith(
      "/app/jobs?q=AB12CDE",
      expect.objectContaining({ scroll: false }),
    );
  });

  it("collapses rapid typing into a single replace call", () => {
    render(<ListSearch placeholder="Search…" />);
    const input = screen.getByPlaceholderText("Search…");

    fireEvent.change(input, { target: { value: "A" } });
    act(() => vi.advanceTimersByTime(50));
    fireEvent.change(input, { target: { value: "AB" } });
    act(() => vi.advanceTimersByTime(50));
    fireEvent.change(input, { target: { value: "AB12" } });
    act(() => vi.advanceTimersByTime(50));
    fireEvent.change(input, { target: { value: "AB12CDE" } });
    act(() => vi.advanceTimersByTime(200));

    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenLastCalledWith(
      "/app/jobs?q=AB12CDE",
      expect.objectContaining({ scroll: false }),
    );
  });

  it("clears the q param when the input is emptied", () => {
    mockSearchParams.current = new URLSearchParams("q=AB12");
    render(<ListSearch placeholder="Search…" />);
    const input = screen.getByPlaceholderText("Search…");
    expect((input as HTMLInputElement).value).toBe("AB12");

    fireEvent.change(input, { target: { value: "" } });
    act(() => vi.advanceTimersByTime(200));

    expect(mockReplace).toHaveBeenCalledWith(
      "/app/jobs",
      expect.objectContaining({ scroll: false }),
    );
  });

  it("resets ?page= on a new search to avoid showing 'page 5 of 1'", () => {
    mockSearchParams.current = new URLSearchParams("q=foo&page=5");
    render(<ListSearch placeholder="Search…" />);
    const input = screen.getByPlaceholderText("Search…");

    fireEvent.change(input, { target: { value: "bar" } });
    act(() => vi.advanceTimersByTime(200));

    expect(mockReplace).toHaveBeenCalledWith(
      "/app/jobs?q=bar",
      expect.objectContaining({ scroll: false }),
    );
  });
});
