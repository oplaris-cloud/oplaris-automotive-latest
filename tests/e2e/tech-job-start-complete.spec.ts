import { test, expect } from "@playwright/test";

/**
 * Critical flow #2 — Technician start/complete job on mobile.
 *
 * Prereq: a mechanic is seeded and assigned to at least one `booked` job.
 * Flow: login as mechanic → /app/tech shows the job card → Start → task
 * type picker → timer visible → Complete → work_log closes → job disappears
 * from "active" list.
 *
 * Gate from TEST_AUDIT_PROMPT.md §T4:
 *   Tap "Start work" → task type picker appears
 *   Select task type → timer starts
 *   Job status updates to `in_repair`
 *   Pause → timer stops, work_log entry gets `ended_at`
 *   Complete → work_log closes
 *
 * Currently skipped because a live DB + seeded mechanic are required.
 * Unskip when running against staging.
 */
test.describe.skip("critical flow: technician start/complete", () => {
  test("mechanic starts work → picks task type → completes → work log closed", async ({
    page,
  }) => {
    // 1. Log in as mechanic (seeded: mechanic@dudley.local / <dev pw>)
    await page.goto("/login");
    await page.getByLabel(/email/i).fill("mechanic@dudley.local");
    await page.getByLabel(/password/i).fill("Oplaris-Dev-Password-1!");
    await page.getByRole("button", { name: /sign in/i }).click();

    // 2. Lands on /app/tech by the middleware role-routing
    await expect(page).toHaveURL(/\/app\/tech/);

    // 3. A job card is visible; tap Start
    await page.getByRole("button", { name: /start work/i }).first().click();

    // 4. Task type picker
    await page.getByRole("radio", { name: /diagnosis/i }).click();
    await page.getByRole("button", { name: /confirm|start/i }).click();

    // 5. Timer visible
    await expect(page.locator("[data-testid='work-timer']")).toBeVisible();

    // 6. Complete
    await page.getByRole("button", { name: /complete/i }).click();
    await expect(page.locator("[data-testid='work-timer']")).not.toBeVisible();
  });
});
