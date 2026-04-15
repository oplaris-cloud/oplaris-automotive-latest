import { test, expect } from "@playwright/test";

/**
 * P54 — Unified Job Activity feed, staff + customer views.
 *
 *   1. Staff view: mechanic starts work → `work_running` row pins to top
 *      within 2 s (realtime via P50). Mechanic stops → row collapses into
 *      a `work_session` with the duration filled in.
 *   2. Customer view: the same job, polled via /api/status/state every
 *      4 s, shows the friendly-labeled subset — no enum values, no last
 *      names.
 *   3. P53 override event written by override_job_handler surfaces on
 *      the staff timeline as passed_to_* with the manager's note.
 *
 * Skipped until staging has: the demo job, the tech login, and a
 * matching vehicle+customer pair with a verified phone on file for the
 * customer flow.
 */
test.describe.skip("P54 — Job Activity", () => {
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

  test("staff view pins running work sessions to the top (P54.4, P54.7, P54.10)", async ({
    page,
  }) => {
    await loginAs(page, "manager@dudley.local");
    await page.goto(motJobUrl);

    await expect(page.getByRole("heading", { name: /job activity/i })).toBeVisible();

    // Mechanic starts work on a different browser context — the manager's
    // page should pick it up via realtime within 2 s.
    // (Cross-context orchestration omitted here; staging test harness
    // usually ticks the RPC directly.)
    await expect(
      page.getByText(/is working now/i).first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("customer view renders the curated subset with friendly labels (P54.8, P54.11)", async ({
    page,
  }) => {
    // Full verify flow is out of scope for this spec; assume the signed
    // session cookie is seeded by the harness's globalSetup.
    await page.goto("/status");

    // No raw enum values anywhere on the page.
    const body = await page.content();
    expect(body).not.toMatch(/in_diagnosis|awaiting_parts|awaiting_mechanic/);

    // Curated labels are visible.
    const visibleCopy = [
      /Diagnosis in progress|Repair in progress|Ready for collection|Passed to mechanic/i,
    ];
    for (const re of visibleCopy) {
      await expect(page.getByText(re).first()).toBeVisible();
    }
  });

  test("P53 override events surface on the P54 timeline (P54.9)", async ({
    page,
  }) => {
    await loginAs(page, "manager@dudley.local");
    await page.goto(motJobUrl);

    // Harness runs the override RPC out-of-band; the timeline picks it up.
    await expect(
      page.getByText(/passed to (mechanic|mot tester)/i).first(),
    ).toBeVisible({ timeout: 5_000 });
  });
});
