/**
 * Bug-6 — top-bar Global Search button.
 *
 * Two contracts to pin down:
 *   - Click dispatches the SPOTLIGHT_OPEN_EVENT so the SpotlightModal
 *     opens without the button having to share component state with
 *     the modal.
 *   - macOS shows ⌘K, every other UA shows Ctrl K — the hint badge
 *     auto-detects platform after mount (server-rendered HTML
 *     intentionally omits it to avoid hydration mismatch).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { GlobalSearchButton } from "@/components/spotlight/global-search-button";
import { SPOTLIGHT_OPEN_EVENT } from "@/components/spotlight/spotlight-events";

describe("<GlobalSearchButton>", () => {
  let originalPlatform: string;

  beforeEach(() => {
    originalPlatform = navigator.platform;
  });

  afterEach(() => {
    Object.defineProperty(navigator, "platform", {
      value: originalPlatform,
      configurable: true,
    });
  });

  it("dispatches SPOTLIGHT_OPEN_EVENT on click", () => {
    const listener = vi.fn();
    window.addEventListener(SPOTLIGHT_OPEN_EVENT, listener);
    try {
      render(<GlobalSearchButton />);
      fireEvent.click(screen.getByRole("button", { name: /Global Search/i }));
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(SPOTLIGHT_OPEN_EVENT, listener);
    }
  });

  it("renders the visible label 'Global Search'", () => {
    render(<GlobalSearchButton />);
    expect(screen.getByText("Global Search")).toBeInTheDocument();
  });

  it("shows ⌘K hint on macOS", async () => {
    Object.defineProperty(navigator, "platform", {
      value: "MacIntel",
      configurable: true,
    });
    render(<GlobalSearchButton />);
    // The kbd badge is set inside a useEffect after mount.
    await screen.findByText("⌘K");
  });

  it("shows Ctrl K hint on Windows", async () => {
    Object.defineProperty(navigator, "platform", {
      value: "Win32",
      configurable: true,
    });
    render(<GlobalSearchButton />);
    await screen.findByText("Ctrl K");
  });
});
