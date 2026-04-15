/**
 * P56.0 (S-H2) — Card size variants.
 *
 * The Card primitive uses `data-size=` + `group-data-[size=X]/card:`
 * Tailwind variants to switch padding / gap. These tests render each
 * size and assert the canonical class is in the rendered DOM, plus
 * that the slot-data attribute is plumbed correctly so child slots
 * (CardHeader / CardContent / CardFooter) can branch off it.
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

describe("Card size variants", () => {
  it.each([
    ["sm", "py-3", "data-[size=sm]:py-3"],
    ["default", "py-4", "py-4"],
    ["lg", "py-6", "data-[size=lg]:py-6"],
  ] as const)(
    "size=%s carries the canonical class for the %s padding",
    (size, _padding, expectedClass) => {
      const { getByTestId } = render(
        <Card size={size} data-testid="card">
          <CardHeader>
            <CardTitle>Title</CardTitle>
          </CardHeader>
          <CardContent>body</CardContent>
        </Card>,
      );
      const root = getByTestId("card");
      // The data-size attribute drives every group-data-[size=X] child
      // selector; without it the padding tokens never apply.
      expect(root.getAttribute("data-size")).toBe(size);
      // The class string includes the variant token verbatim — Tailwind
      // generates the actual styles at build time.
      expect(root.className).toContain(expectedClass);
    },
  );

  it("falls back to size=default when no prop is passed", () => {
    const { getByTestId } = render(
      <Card data-testid="card">
        <CardContent>body</CardContent>
      </Card>,
    );
    expect(getByTestId("card").getAttribute("data-size")).toBe("default");
  });
});
