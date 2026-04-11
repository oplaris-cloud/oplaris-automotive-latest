import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config. Phase 0 ships only a smoke test that the dev server starts and
 * `/` returns the security headers we set in next.config.ts.
 *
 * The four critical flows (kiosk booking, tech start/complete job, customer
 * approval, customer status page) get their own specs in Phase 11.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // Tech mobile target — old Android, what mechanics actually use.
    { name: "mobile-android", use: { ...devices["Pixel 5"] } },
  ],
  webServer: {
    command: "pnpm next start --port 3000",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
