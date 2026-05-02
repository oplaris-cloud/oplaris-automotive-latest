/**
 * RegPlateInput visual contract — Hossein flagged 2026-04-27 that the
 * UK side strip on the Add Vehicle modal looked like a solid blue void
 * with no flag/label visible. The original SVG drew a blue circle on a
 * blue background (invisible) plus 12 sub-pixel "EU stars" (also
 * invisible), and the "UK" wordmark below it was sized at 9px so it
 * barely registered. Test asserts the post-fix structure: a Union Jack
 * mini-flag SVG with all three plate colours present + a readable "UK"
 * wordmark.
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import { RegPlateInput } from "@/components/ui/reg-plate";

describe("RegPlateInput side strip", () => {
  it("renders a Union Jack mini-flag (white + blue + red) inside the blue strip", () => {
    const { container } = render(<RegPlateInput defaultValue="AB12 CDE" />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    const fillsAndStrokes = Array.from(svg!.querySelectorAll("*"))
      .flatMap((el) => [
        el.getAttribute("fill"),
        el.getAttribute("stroke"),
      ])
      .filter(Boolean)
      .map((c) => c!.toUpperCase());
    expect(fillsAndStrokes).toContain("#012169"); // navy field
    expect(fillsAndStrokes).toContain("#FFFFFF"); // white saltire/cross
    expect(fillsAndStrokes).toContain("#C8102E"); // red overlay
  });

  it('renders a readable "UK" wordmark in white below the flag', () => {
    const { container } = render(<RegPlateInput defaultValue="AB12 CDE" />);
    const wordmark = Array.from(container.querySelectorAll("span")).find(
      (el) => el.textContent === "UK",
    );
    expect(wordmark).toBeDefined();
    // Must use a token-grade size, not the prior text-[9px] arbitrary
    // value that left the wordmark near-invisible against the strip.
    // Bug-2 (2026-05-02): tightened to text-[10px] so the wordmark
    // sits cleanly inside the slim h-12 plate strip — `text-xs` (12 px)
    // overflowed the strip vertically when the surrounding plate
    // shrank to match the lookup-button height.
    expect(wordmark!.className).toMatch(/text-\[10px\]/);
    expect(wordmark!.className).toMatch(/text-white/);
    expect(wordmark!.className).toMatch(/font-bold/);
  });

  it("keeps the rear-plate yellow background on the input itself", () => {
    const { container } = render(
      <RegPlateInput defaultValue="AB12 CDE" variant="rear" />,
    );
    const input = container.querySelector("input");
    expect(input).not.toBeNull();
    expect(input!.className).toMatch(/bg-\[#FFD307\]/);
  });
});
