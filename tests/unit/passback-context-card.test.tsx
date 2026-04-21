/**
 * Audit F5 — `PassbackContextCard`. Display-only RSC; tests focus on
 * prop-driven render shape, semantic markup (h2 + blockquote), and
 * the defensive fallback for unknown item keys.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { PassbackContextCard } from "@/app/(app)/app/tech/job/[id]/PassbackContextCard";

const CREATED_AT = "2026-04-21T08:30:00Z";

describe("PassbackContextCard", () => {
  it("renders one chip per item plus the free-text note", () => {
    render(
      <PassbackContextCard
        items={[
          { item: "brake_pads" },
          { item: "wipers" },
          { item: "light_bulb", detail: "N/S front" },
        ]}
        note="Customer said the brake noise started yesterday."
        createdAt={CREATED_AT}
        fromRole="mot_tester"
      />,
    );
    expect(screen.getByText("Brake pads")).toBeDefined();
    expect(screen.getByText("Wipers")).toBeDefined();
    expect(screen.getByText("Light bulb (N/S front)")).toBeDefined();
    const blockquote = screen.getByText(/brake noise started yesterday/i);
    expect(blockquote.tagName).toBe("BLOCKQUOTE");
  });

  it("omits the blockquote when note is null", () => {
    const { container } = render(
      <PassbackContextCard
        items={[{ item: "tyres" }]}
        note={null}
        createdAt={CREATED_AT}
        fromRole="mot_tester"
      />,
    );
    expect(container.querySelector("blockquote")).toBeNull();
  });

  it("falls back to the raw item key for unknown values", () => {
    render(
      <PassbackContextCard
        items={[{ item: "unknown_future_item" }]}
        note={null}
        createdAt={CREATED_AT}
        fromRole="mot_tester"
      />,
    );
    expect(screen.getByText("unknown_future_item")).toBeDefined();
  });

  it("renders the section title as an h2 (a11y)", () => {
    render(
      <PassbackContextCard
        items={[]}
        note={null}
        createdAt={CREATED_AT}
        fromRole="mot_tester"
      />,
    );
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.textContent).toBe("Passed back from MOT");
  });

  it("labels the from_role description in human-readable form", () => {
    render(
      <PassbackContextCard
        items={[]}
        note={null}
        createdAt={CREATED_AT}
        fromRole="mot_tester"
      />,
    );
    // The Section description carries the timestamp + role label.
    expect(screen.getByText(/from MOT tester/i)).toBeDefined();
  });

  it("survives null items array (defensive)", () => {
    const { container } = render(
      <PassbackContextCard
        items={null}
        note={null}
        createdAt={CREATED_AT}
        fromRole="mot_tester"
      />,
    );
    // No crash, no badges rendered beyond the static PassbackBadge.
    expect(container).toBeDefined();
  });
});
