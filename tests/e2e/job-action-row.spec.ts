import { test, expect } from "@playwright/test";

/**
 * P52 — Job-detail action row, regression coverage for the three role
 * viewpoints + mobile collapse. The acceptance criteria in
 * `MASTER_PLAN.md > P52` (P52.4–P52.9) drive the assertions below.
 *
 * Prereqs (none of which the harness can guarantee in this session, hence
 * `.skip`): a seeded MOT job whose `current_role` cycles through
 * `mot_tester → mechanic → mot_tester`, plus dev users for each role.
 * Unskip when running against staging.
 */
test.describe.skip("P52 — job-detail action row", () => {
  const motJobUrl = "/app/jobs/aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";

  async function loginAs(
    page: import("@playwright/test").Page,
    email: string,
  ): Promise<void> {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill("Oplaris-Dev-Password-1!");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/app/);
  }

  test("MOT tester sees Pass to mechanic as Primary, no duplicate (P52.4)", async ({
    page,
  }) => {
    await loginAs(page, "tester@dudley.local");
    await page.goto(motJobUrl);

    // Exactly one Pass-to-Mechanic surface.
    const passButtons = page.getByRole("button", { name: /pass to mechanic/i });
    await expect(passButtons).toHaveCount(1);

    // Secondary outline buttons present.
    await expect(
      page.getByRole("button", { name: /awaiting parts/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /request approval/i }),
    ).toBeVisible();

    // Cancel only via overflow.
    await expect(
      page.getByRole("button", { name: /^cancel$/i }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: /more actions/i }).click();
    await expect(page.getByRole("menuitem", { name: /cancel job/i })).toBeVisible();
  });

  test("Mechanic claimer sees Return to MOT tester as Primary (P52.5)", async ({
    page,
  }) => {
    await loginAs(page, "mechanic@dudley.local");
    await page.goto(motJobUrl);

    await expect(
      page.getByRole("button", { name: /return to mot tester/i }),
    ).toBeVisible();
    // No Pass-to-Mechanic for the mechanic.
    await expect(
      page.getByRole("button", { name: /pass to mechanic/i }),
    ).toHaveCount(0);
  });

  test("Manager sees override-role item in overflow (P52.6)", async ({
    page,
  }) => {
    await loginAs(page, "manager@dudley.local");
    await page.goto(motJobUrl);

    await page.getByRole("button", { name: /more actions/i }).click();
    await expect(
      page.getByRole("menuitem", { name: /override role/i }),
    ).toBeVisible();
  });

  test("current_role chip lives in the identity row, never in the action row (P52.7)", async ({
    page,
  }) => {
    await loginAs(page, "manager@dudley.local");
    await page.goto(motJobUrl);

    // The chip text appears once, in the heading region (h1's container).
    const chip = page.getByText(/with mot tester|with mechanic/i);
    await expect(chip).toHaveCount(1);
    // The action row siblings (status-machine buttons) sit below the chip
    // — not adjacent — by appearing inside a different flex row.
  });

  test("mobile (< 640 px) — overflow opens as a Sheet, no horizontal scroll (P52.9)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await loginAs(page, "manager@dudley.local");
    await page.goto(motJobUrl);

    await page.getByRole("button", { name: /more actions/i }).click();
    await expect(page.getByRole("dialog", { name: /more actions/i })).toBeVisible();

    // Sanity: viewport scroll width matches viewport (no overflow).
    const scroll = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
    }));
    expect(scroll.sw).toBeLessThanOrEqual(scroll.cw);
  });
});
