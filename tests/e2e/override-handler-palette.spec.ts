import { test, expect } from "@playwright/test";

/**
 * P53 — Change Handler command palette + override dialog. Two flows:
 *
 *   1. Manager happy path — opens palette, picks "Return to MOT tester
 *      queue", confirms Jake pre-ticked for removal, picks "Assign
 *      directly to Sarah", submits. Timeline shows the override event.
 *   2. Ambiguity guard — manager picks Sarah directly when Sarah holds
 *      both roles and current_role=manager (no overlap) → friendly
 *      error toast + no write.
 *
 * Skipped until staging has: a manager user, a mechanic-current MOT job
 * with Jake on the team, and Sarah holding mechanic+mot_tester roles.
 */
test.describe.skip("P53 — Change Handler palette", () => {
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

  test("manager happy path — queue + direct-assign flow (P53.1, P53.3, P53.6, P53.7)", async ({
    page,
  }) => {
    await loginAs(page, "manager@dudley.local");
    await page.goto(motJobUrl);

    // Open the overflow menu + the Change handler palette.
    await page.getByRole("button", { name: /more actions/i }).click();
    await page.getByRole("menuitem", { name: /change handler/i }).click();

    // Palette shows both queue options + grouped staff.
    const palette = page.getByRole("dialog").first();
    await expect(palette).toBeVisible();
    await expect(palette.getByText(/reset to queue/i)).toBeVisible();
    await expect(palette.getByText(/mot testers/i)).toBeVisible();
    await expect(palette.getByText(/mechanics/i)).toBeVisible();

    // Pick "Return to MOT tester queue".
    await palette
      .getByRole("option", { name: /return to mot tester queue/i })
      .click();

    // Confirm dialog appears with Jake pre-ticked, Sarah unticked.
    const confirm = page.getByRole("dialog").last();
    await expect(confirm.getByText("Jake")).toBeVisible();
    await expect(confirm.getByLabel(/remove jake/i)).toBeChecked();
    await expect(confirm.getByLabel(/remove sarah/i)).not.toBeChecked();

    // Open Assign-directly picker + pick Sarah.
    await confirm.getByRole("radio", { name: /assign directly/i }).click();
    await confirm.getByRole("button", { name: /sarah/i }).click();

    // Button label should now reflect the composite action.
    await expect(
      confirm.getByRole("button", {
        name: /return to mot tester queue · assign sarah/i,
      }),
    ).toBeVisible();

    // Submit and wait for the page to refresh.
    await confirm
      .getByRole("button", { name: /return to mot tester queue · assign/i })
      .click();

    // Timeline picks up the override within 2s via realtime (P50).
    await expect(
      page.getByText(/pass-back timeline|job activity/i),
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      page.getByText(/mechanic → mot tester/i).first(),
    ).toBeVisible();
  });

  test("ambiguity guard — multi-role Sarah with no current-role overlap (P53.11)", async ({
    page,
  }) => {
    await loginAs(page, "manager@dudley.local");

    // Assume the job has been manually set to current_role='manager' for
    // this scenario — a stage setup step not expressed here because
    // staging test harnesses typically mint the fixture via an API call
    // in globalSetup.
    await page.goto(motJobUrl);

    await page.getByRole("button", { name: /more actions/i }).click();
    await page.getByRole("menuitem", { name: /change handler/i }).click();

    // Pick Sarah directly.
    await page.getByRole("option", { name: /sarah/i }).click();

    // Friendly error, no write.
    await expect(
      page.getByText(/holds both.*use "return to.*queue"/i),
    ).toBeVisible();
    // No confirm dialog opened.
    await expect(page.getByText(/currently assigned/i)).not.toBeVisible();
  });
});
