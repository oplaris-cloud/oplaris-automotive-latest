import { test, expect } from "@playwright/test";

/**
 * Critical flow #1 — Tablet kiosk booking.
 *
 * Happy path: open /kiosk → tap "MOT" → fill details → confirm → done.
 * The booking must land in `bookings` with `source='kiosk'`, `job_id=null`.
 *
 * Prerequisite: a kiosk device cookie has been issued via
 * `POST /api/kiosk/pair` (manager-authenticated). The spec seeds that
 * cookie at the start of the run via `request.post('/api/kiosk/pair')`
 * with a logged-in manager — see `tests/e2e/fixtures.ts` (to be written
 * alongside the other critical-flow specs).
 *
 * Gate from TEST_AUDIT_PROMPT.md §T12:
 *   Full booking flow completes in < 10 seconds
 *   No PII visible after submit (auto-clear)
 *   Kiosk cookie required
 *   Booking lands in manager inbox correctly
 *   Promote-to-job pre-fills customer data
 *
 * Currently skipped because the run-time prerequisites (seeded Supabase,
 * paired kiosk cookie, manager login) are not available in the local
 * pre-deploy audit environment. Unskip when running against staging.
 */
test.describe.skip("critical flow: kiosk booking", () => {
  test("manager pairs device → walk-in submits MOT booking → manager sees it in inbox", async ({
    page,
    request,
  }) => {
    // 1. Manager logs in (via login form or a pre-seeded session cookie)
    //    then POSTs /api/kiosk/pair to mint the device cookie.
    await request.post("/api/kiosk/pair");

    // 2. Open kiosk; pick MOT
    await page.goto("/kiosk");
    await page.getByRole("button", { name: /MOT/i }).click();

    // 3. Fill details
    await page.getByLabel(/name/i).fill("Playwright Kiosk");
    await page.getByLabel(/phone/i).fill("07700900111");
    await page.getByLabel(/reg/i).fill("AB12 CDE");
    await page.getByRole("button", { name: /submit|confirm/i }).click();

    // 4. Done screen + auto-return to welcome within 10s
    await expect(page.getByText(/thanks/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /MOT/i })).toBeVisible({
      timeout: 10_000,
    });

    // 5. Manager side — booking shows up in inbox
    await page.goto("/app/bookings");
    await expect(page.getByText("AB12CDE")).toBeVisible();
  });
});
