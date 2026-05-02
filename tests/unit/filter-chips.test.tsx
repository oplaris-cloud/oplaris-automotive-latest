/**
 * B5.2 — <FilterChips> primitive: multi-select toggle, URL-state.
 *
 * The chip group is the entry point for repair-type filtering on the
 * vehicle Job History (B5.2), and will also back the TRADER filter on
 * customers + message_type chips on messages (B5.3). It must:
 *   - toggle a value into / out of the comma-separated URL param
 *   - announce its switch state for AT (`role=switch` / `aria-checked`)
 *   - drop the `page` param so a search doesn't show "page 5 of 1"
 *
 * Pure helper `parseChipParam` is exercised separately so the URL
 * round-trip stays correct under malformed inputs.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import {
  FilterChips,
  parseChipParam,
} from "@/components/ui/filter-chips";

const mockReplace = vi.fn();
const mockSearchParams = { current: new URLSearchParams() };

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => "/app/vehicles/v1",
  useSearchParams: () => mockSearchParams.current,
}));

const OPTS = [
  { value: "mot", label: "MOT" },
  { value: "electrical", label: "Electrical" },
  { value: "maintenance", label: "Maintenance" },
];

describe("parseChipParam", () => {
  it("returns empty Set for null / undefined / empty input", () => {
    expect(parseChipParam(null).size).toBe(0);
    expect(parseChipParam(undefined).size).toBe(0);
    expect(parseChipParam("").size).toBe(0);
  });

  it("splits comma-separated values", () => {
    const s = parseChipParam("mot,electrical");
    expect(s.has("mot")).toBe(true);
    expect(s.has("electrical")).toBe(true);
    expect(s.size).toBe(2);
  });

  it("ignores empty / whitespace-only segments (defensive against stale URLs)", () => {
    const s = parseChipParam("mot,, ,electrical");
    expect(Array.from(s).sort()).toEqual(["electrical", "mot"]);
  });
});

describe("<FilterChips>", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockSearchParams.current = new URLSearchParams();
  });

  it("renders one button per option with the correct switch state", () => {
    mockSearchParams.current = new URLSearchParams("repair=mot");
    render(<FilterChips paramName="repair" options={OPTS} />);

    expect(screen.getByRole("switch", { name: "MOT" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(
      screen.getByRole("switch", { name: "Electrical" }),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("toggling an unchecked chip writes the value to the URL param", () => {
    render(<FilterChips paramName="repair" options={OPTS} />);
    fireEvent.click(screen.getByRole("switch", { name: "MOT" }));

    expect(mockReplace).toHaveBeenCalledWith(
      "/app/vehicles/v1?repair=mot",
      expect.objectContaining({ scroll: false }),
    );
  });

  it("toggling a checked chip removes it; final empty group drops the param", () => {
    mockSearchParams.current = new URLSearchParams("repair=mot");
    render(<FilterChips paramName="repair" options={OPTS} />);
    fireEvent.click(screen.getByRole("switch", { name: "MOT" }));

    expect(mockReplace).toHaveBeenCalledWith(
      "/app/vehicles/v1",
      expect.objectContaining({ scroll: false }),
    );
  });

  it("multi-select: adding a second chip preserves the first", () => {
    mockSearchParams.current = new URLSearchParams("repair=mot");
    render(<FilterChips paramName="repair" options={OPTS} />);
    fireEvent.click(screen.getByRole("switch", { name: "Electrical" }));

    const last = mockReplace.mock.calls.at(-1);
    expect(last?.[0]).toMatch(/repair=/);
    const url = new URL("http://x" + last![0]);
    const value = url.searchParams.get("repair") ?? "";
    expect(value.split(",").sort()).toEqual(["electrical", "mot"]);
  });

  it("clears the page param so toggling never lands on 'page 5 of 1'", () => {
    mockSearchParams.current = new URLSearchParams("repair=mot&page=5");
    render(<FilterChips paramName="repair" options={OPTS} />);
    fireEvent.click(screen.getByRole("switch", { name: "Electrical" }));

    const last = mockReplace.mock.calls.at(-1);
    const url = new URL("http://x" + last![0]);
    expect(url.searchParams.get("page")).toBeNull();
  });

  it("preserves unrelated params (e.g. text query)", () => {
    mockSearchParams.current = new URLSearchParams("q=brake");
    render(<FilterChips paramName="repair" options={OPTS} />);
    fireEvent.click(screen.getByRole("switch", { name: "MOT" }));

    const last = mockReplace.mock.calls.at(-1);
    const url = new URL("http://x" + last![0]);
    expect(url.searchParams.get("q")).toBe("brake");
    expect(url.searchParams.get("repair")).toBe("mot");
  });
});
