/**
 * B4 — TraderBadge contract.
 *
 * Renders nothing when isTrader is false / null / undefined; renders
 * a "TRADER" chip with the warning-token treatment when true. Used
 * inline after customer names everywhere.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { TraderBadge } from "@/components/ui/trader-badge";

describe("<TraderBadge />", () => {
  it("renders nothing when isTrader is false", () => {
    const { container } = render(<TraderBadge isTrader={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when isTrader is null", () => {
    const { container } = render(<TraderBadge isTrader={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when isTrader is undefined", () => {
    const { container } = render(<TraderBadge isTrader={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a "TRADER" chip with the warning-token treatment when true', () => {
    const { container } = render(<TraderBadge isTrader={true} />);
    const chip = container.firstChild as HTMLElement;
    expect(chip).not.toBeNull();
    expect(chip.tagName.toLowerCase()).toBe("span");
    expect(screen.getByText("TRADER")).toBeDefined();
    // Warning token (amber) — distinct from primary/success/destructive.
    expect(chip.className).toMatch(/bg-warning\/15/);
    expect(chip.className).toMatch(/text-warning/);
    expect(chip.className).toMatch(/ring-warning\/30/);
    // Style hooks: uppercase + letterspaced + bold so the chip reads
    // as a label tag, not a button.
    expect(chip.className).toMatch(/uppercase/);
    expect(chip.className).toMatch(/font-bold/);
    // data-slot for downstream styling / tests.
    expect(chip.getAttribute("data-slot")).toBe("trader-badge");
  });

  it("merges className overrides on top of the default chip styling", () => {
    const { container } = render(
      <TraderBadge isTrader={true} className="ml-0" />,
    );
    const chip = container.firstChild as HTMLElement;
    expect(chip.className).toContain("ml-0");
    // Default classes still present.
    expect(chip.className).toMatch(/bg-warning\/15/);
  });
});
