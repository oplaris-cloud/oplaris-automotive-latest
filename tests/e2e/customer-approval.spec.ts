import { test, expect } from "@playwright/test";

/**
 * Critical flow #3 — Customer approval flow.
 *
 * Prereq: a mechanic is on an active job; an approval_request is created
 * (either via the UI or seeded directly in the DB for deterministic tests).
 * Flow: mechanic taps "Request approval" → SMS is sent → customer opens
 * the approval URL → clicks Approve → the approval_requests row flips to
 * `approved` and the mechanic's screen updates via realtime.
 *
 * Gate from TEST_AUDIT_PROMPT.md §T5:
 *   Token is HMAC-signed and stored as sha256 (T5 unit/static coverage)
 *   Single-use enforced (second hit = 410)
 *   Expired/tampered/invalid tokens all return 410 with same body
 *
 * Currently skipped — needs a live DB to seed the approval_requests row
 * and to produce the signed token the test needs to open the URL.
 * Unskip when running against staging.
 */
test.describe.skip("critical flow: customer approval", () => {
  test("customer opens signed approval link → approves → single-use enforced", async ({
    page,
    request,
  }) => {
    // 1. The test fixture must seed an approval_requests row and expose
    //    the raw token (since the DB only stores sha256(token)).
    //    See tests/e2e/fixtures.ts (to be written).
    const token = process.env.E2E_APPROVAL_TOKEN ?? "<seeded-by-fixture>";

    // 2. Open the approval URL
    await page.goto(`/api/approvals/${encodeURIComponent(token)}`);

    // 3. Shows description + amount
    await expect(page.getByText(/£/)).toBeVisible();

    // 4. Approve
    const postRes = await request.post(`/api/approvals/${encodeURIComponent(token)}`, {
      data: { decision: "approved" },
    });
    expect(postRes.status()).toBe(200);

    // 5. Second POST → 410 Gone (single-use)
    const replay = await request.post(`/api/approvals/${encodeURIComponent(token)}`, {
      data: { decision: "approved" },
    });
    expect(replay.status()).toBe(410);
  });
});
