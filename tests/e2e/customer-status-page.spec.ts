import { test, expect } from "@playwright/test";

/**
 * Critical flow #4 — Customer status page.
 *
 * Hostile-internet hardened public endpoint. Flow:
 *   1. Customer hits /status
 *   2. Enters reg + phone
 *   3. Receives SMS code (stub in test mode)
 *   4. Enters code → sees status badge
 *
 * Gate from TEST_AUDIT_PROMPT.md §T6:
 *   Anti-enumeration: same response shape for hit/miss
 *   Rate limits: 3/phone/hour + 10/IP/hour
 *   Codes single-use, 10-min expiry
 *   Cookie scoped to single vehicle
 *
 * Currently skipped because a live DB + a seeded vehicle + an SMS test
 * stub are required to produce the code. Unskip when running against
 * staging (or when a test fixture that plants codes directly into
 * `private.status_codes` is added).
 */
test.describe.skip("critical flow: customer status page", () => {
  test("happy path: reg+phone → code → status badge", async ({ page, request }) => {
    await page.goto("/status");

    // 1. Enter reg + phone
    await page.getByLabel(/registration/i).fill("AB12CDE");
    await page.getByLabel(/phone/i).fill("07700900111");
    await page.getByRole("button", { name: /send code/i }).click();

    // 2. Test fixture must intercept the SMS and expose the code.
    const code = process.env.E2E_STATUS_CODE ?? "<seeded-by-fixture>";

    // 3. Enter code
    for (let i = 0; i < 6; i++) {
      await page.locator(`[data-testid='code-input-${i}']`).fill(code[i]!);
    }

    // 4. Status badge visible
    await expect(page.locator("[data-testid='status-badge']")).toBeVisible();
  });

  test("anti-enumeration: bogus reg returns same 200 shape as hit", async ({ request }) => {
    const hit = await request.post("/api/status/request-code", {
      data: { registration: "AB12CDE", phone: "07700900111" },
    });
    const miss = await request.post("/api/status/request-code", {
      data: { registration: "ZZ99ZZZ", phone: "07700900111" },
    });

    expect(hit.status()).toBe(200);
    expect(miss.status()).toBe(200);

    // Same body shape (both should be the generic OK_RESPONSE)
    expect(await hit.json()).toEqual(await miss.json());
  });
});
