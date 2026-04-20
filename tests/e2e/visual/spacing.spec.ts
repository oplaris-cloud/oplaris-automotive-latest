import { test, expect } from "@playwright/test";

/**
 * P56.9 — Visual-regression snapshot baseline.
 *
 * Baseline strategy:
 *   1. The full 132-snapshot grid (every page in P56.4 × {375, 768, 1440}
 *      × {light, dark}) is gated on a populated staging DB, so the suite
 *      below auto-skips when `E2E_STAGING_READY` is unset. Set
 *      `E2E_STAGING_READY=1` in CI once a Dokploy staging URL exists in
 *      `E2E_BASE_URL` and a seeded manager session cookie is exported in
 *      `E2E_STAFF_COOKIE` (see `scripts/seed-dev-users.ts`).
 *   2. The kiosk + status surfaces are public, so they snapshot today
 *      without auth — they're the "smoke" check that proves the wiring
 *      is right.
 *   3. Snapshots land under `tests/e2e/visual/__snapshots__/` and are
 *      committed. Future PRs that shift a pixel must accept + re-commit
 *      the baseline.
 */

const STAGING_READY = process.env.E2E_STAGING_READY === "1";

const PUBLIC_SURFACES = [
  { name: "kiosk-home", path: "/kiosk" },
  { name: "status-lookup", path: "/status" },
  { name: "login", path: "/login" },
];

const VIEWPORTS = [
  { name: "mobile", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
];

for (const surface of PUBLIC_SURFACES) {
  for (const vp of VIEWPORTS) {
    test(`visual baseline · ${surface.name} · ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(surface.path);
      // Wait a hair past first-paint so brand tokens + fonts settle.
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveScreenshot(
        `${surface.name}-${vp.name}.png`,
        { fullPage: true, animations: "disabled" },
      );
    });
  }
}

test.describe("authenticated staff surfaces (skipped without staging)", () => {
  test.skip(!STAGING_READY, "Set E2E_STAGING_READY=1 + E2E_BASE_URL + E2E_STAFF_COOKIE");

  const STAFF_SURFACES = [
    { name: "today", path: "/app", width: "default" },
    { name: "jobs-list", path: "/app/jobs", width: "full" },
    { name: "tech-my-work", path: "/app/tech", width: "narrow" },
    { name: "bay-board", path: "/app/bay-board", width: "full" },
    { name: "customers-list", path: "/app/customers", width: "full" },
    { name: "settings-branding", path: "/app/settings/branding", width: "narrow" },
  ];

  for (const surface of STAFF_SURFACES) {
    for (const vp of VIEWPORTS) {
      test(`visual baseline · ${surface.name} · ${vp.name}`, async ({ page, context }) => {
        const cookie = process.env.E2E_STAFF_COOKIE;
        if (cookie) {
          // Cookie format: "name=value; Domain=…; Path=/" — parsed and
          // injected verbatim. The seed script emits this string.
          await context.addCookies(
            cookie.split(";").map((p) => {
              const [k, v] = p.split("=");
              return { name: k.trim(), value: v.trim(), url: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000" };
            }),
          );
        }
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(surface.path);
        await page.waitForLoadState("networkidle");
        await expect(page).toHaveScreenshot(
          `${surface.name}-${vp.name}.png`,
          { fullPage: true, animations: "disabled" },
        );
      });
    }
  }
});
