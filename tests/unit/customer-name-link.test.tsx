/**
 * B3.3 — CustomerNameLink + RegPlate vehicleId contract.
 *
 * Asserts the navigation rule: when an id is present, the primitive
 * renders an <a> pointing at the staff-app detail page; when absent,
 * the same primitive renders inert text so audit-log entries by
 * deleted users don't pretend to navigate.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { CustomerNameLink } from "@/components/ui/customer-name-link";
import { RegPlate } from "@/components/ui/reg-plate";

describe("CustomerNameLink", () => {
  it("renders a link to /app/customers/[id] when customerId is set", () => {
    render(
      <CustomerNameLink
        customerId="00000000-0000-0000-0000-0000000ac001"
        fullName="Anna Customer"
      />,
    );
    const link = screen.getByRole("link", { name: /view customer anna customer/i });
    expect(link).toBeDefined();
    expect(link.getAttribute("href")).toBe(
      "/app/customers/00000000-0000-0000-0000-0000000ac001",
    );
  });

  it("renders inert text when customerId is null/undefined", () => {
    const { container } = render(
      <CustomerNameLink customerId={null} fullName="Anonymous Audit" />,
    );
    expect(container.querySelector("a")).toBeNull();
    expect(screen.getByText("Anonymous Audit")).toBeDefined();
  });
});

describe("RegPlate vehicleId", () => {
  it("renders a link to /app/vehicles/[id] when vehicleId is set", () => {
    render(<RegPlate reg="AB12 CDE" vehicleId="vehicle-uuid-1" />);
    const link = screen.getByRole("link", { name: /view vehicle ab12 cde/i });
    expect(link.getAttribute("href")).toBe("/app/vehicles/vehicle-uuid-1");
  });

  it("renders an inert <span> when vehicleId is omitted (public surfaces)", () => {
    const { container } = render(<RegPlate reg="AB12 CDE" />);
    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("span")).not.toBeNull();
    expect(screen.getByText("AB12 CDE")).toBeDefined();
  });
});
