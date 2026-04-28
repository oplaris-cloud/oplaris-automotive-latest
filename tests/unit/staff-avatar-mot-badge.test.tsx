/**
 * P1.2 followup — StaffAvatar's optional `roles` prop overlays a
 * small MOT badge in the top-right corner whenever the staff member
 * is an MOT tester. The badge replaces the previous Phosphor
 * SealCheck inline glyph and is the canonical surface used by
 * TechAssignmentModal, /app/settings/staff, and any future avatar
 * surface — so the test pins the visibility/absence rules so a
 * regression here ripples the same way to every consumer.
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import { StaffAvatar } from "@/components/ui/staff-avatar";

describe("StaffAvatar — MOT badge overlay", () => {
  it("renders a single avatar element when no roles are passed", () => {
    const { container, queryByTitle } = render(
      <StaffAvatar name="Alice" size={64} />,
    );
    // No badge title, no overlay wrapper: one rounded-full descendant.
    expect(queryByTitle("MOT tester")).toBeNull();
    expect(container.querySelectorAll(".rounded-full").length).toBeLessThanOrEqual(1);
  });

  it("renders the MOT badge when roles include mot_tester", () => {
    const { getByTitle } = render(
      <StaffAvatar
        name="Bob"
        size={80}
        roles={["mot_tester", "mechanic"]}
      />,
    );
    const badge = getByTitle("MOT tester");
    expect(badge).toBeTruthy();
    // sr-only label sits inside the badge for screen readers.
    expect(badge.textContent).toContain("MOT tester");
    // Badge is positioned at the top-right corner of the avatar.
    expect(badge.className).toContain("absolute");
    expect(badge.className).toContain("right-0");
    expect(badge.className).toContain("top-0");
  });

  it("does not render the badge when roles do not include mot_tester", () => {
    const { queryByTitle } = render(
      <StaffAvatar name="Carla" size={80} roles={["mechanic"]} />,
    );
    expect(queryByTitle("MOT tester")).toBeNull();
  });

  it("does not render the badge when roles is null or empty", () => {
    const { queryByTitle, rerender } = render(
      <StaffAvatar name="Dave" size={80} roles={null} />,
    );
    expect(queryByTitle("MOT tester")).toBeNull();

    rerender(<StaffAvatar name="Dave" size={80} roles={[]} />);
    expect(queryByTitle("MOT tester")).toBeNull();
  });

  it("scales the badge to ~32% of a large avatar", () => {
    // size=80 → badgeSize=Math.round(80*0.32)=26
    const { getByTitle } = render(
      <StaffAvatar name="Eve" size={80} roles={["mot_tester"]} />,
    );
    expect((getByTitle("MOT tester") as HTMLElement).style.width).toBe("26px");
  });

  it("floors the badge at 16px on a tiny avatar", () => {
    // size=40 → 40*0.32=12.8 → floored to 16 by the Math.max guard.
    const { getByTitle } = render(
      <StaffAvatar name="Eve" size={40} roles={["mot_tester"]} />,
    );
    expect((getByTitle("MOT tester") as HTMLElement).style.width).toBe("16px");
  });
});
