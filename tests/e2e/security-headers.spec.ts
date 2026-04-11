import { test, expect } from "@playwright/test";

// Phase 0 audit gate proof: every response carries our security headers.
// If anything in next.config.ts regresses, this test fails CI.
test("baseline security headers are present on /", async ({ request }) => {
  const response = await request.get("/");
  const headers = response.headers();

  expect(headers["content-security-policy"]).toContain("default-src 'self'");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["strict-transport-security"]).toContain("max-age=63072000");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("camera=()");
  expect(headers["x-powered-by"]).toBeUndefined();
});

test("kiosk route allows camera in Permissions-Policy", async ({ request }) => {
  const response = await request.get("/kiosk");
  const headers = response.headers();
  expect(headers["permissions-policy"]).toContain("camera=(self)");
});
