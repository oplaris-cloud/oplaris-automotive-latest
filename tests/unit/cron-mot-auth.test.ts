/**
 * P2.8 — vibe-security audit on the CRON_SECRET handling.
 *
 * Both /api/cron/mot-refresh and /api/cron/mot-reminders are GET-only
 * routes that fire from a Dokploy "Schedules" curl. They MUST refuse
 * any caller without the matching bearer token + return 503 when the
 * env var isn't configured (so a misconfigured deploy doesn't silently
 * accept anonymous traffic).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: () => ({
        is: () => ({
          not: () => ({
            or: () => ({
              order: () =>
                Promise.resolve({ data: [], error: null }),
            }),
          }),
        }),
      }),
    })),
  })),
}));
vi.mock("@/lib/dvla/token", () => ({
  getDvsaAccessToken: vi.fn(async () => "fake-token"),
}));

const ORIG_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIG_ENV };
  vi.resetModules();
});

beforeEach(() => {
  // Required shape for serverEnv() to parse.
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  process.env.SUPABASE_JWT_SECRET = "jwt-secret-32-chars-x";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.invalid";
  process.env.NEXT_PUBLIC_STATUS_URL = "https://app.example.invalid/status";
  process.env.APPROVAL_HMAC_SECRET = "approval-hmac";
  process.env.STATUS_PHONE_PEPPER = "pepper";
  process.env.KIOSK_PAIRING_SECRET = "kiosk-secret";
  process.env.SUPER_ADMIN_COOKIE_SECRET = "sa-cookie-secret";
  process.env.SMTP_ENCRYPTION_KEY = "smtp-key-32-bytes";
  // NODE_ENV is read-only in @types/node; assign via index access.
  (process.env as Record<string, string>).NODE_ENV = "test";
});

function reqWith(headers: Record<string, string>) {
  return new Request("https://example.test/api/cron/mot-refresh", {
    method: "GET",
    headers,
  }) as unknown as import("next/server").NextRequest;
}

describe("/api/cron/mot-refresh — bearer gate", () => {
  it("returns 503 when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    const { GET } = await import("@/app/api/cron/mot-refresh/route");
    const res = await GET(reqWith({}));
    expect(res.status).toBe(503);
  });

  it("returns 401 when bearer is missing", async () => {
    process.env.CRON_SECRET = "supersecret-32";
    const { GET } = await import("@/app/api/cron/mot-refresh/route");
    const res = await GET(reqWith({}));
    expect(res.status).toBe(401);
  });

  it("returns 401 when bearer is wrong", async () => {
    process.env.CRON_SECRET = "supersecret-32";
    const { GET } = await import("@/app/api/cron/mot-refresh/route");
    const res = await GET(
      reqWith({ authorization: "Bearer wrongsecret-32" }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 when scheme is not Bearer", async () => {
    process.env.CRON_SECRET = "supersecret-32";
    const { GET } = await import("@/app/api/cron/mot-refresh/route");
    const res = await GET(
      reqWith({ authorization: "Basic supersecret-32" }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 503 when DVSA env vars missing (after auth passes)", async () => {
    process.env.CRON_SECRET = "supersecret-32";
    // No DVSA_* set.
    const { GET } = await import("@/app/api/cron/mot-refresh/route");
    const res = await GET(
      reqWith({ authorization: "Bearer supersecret-32" }),
    );
    expect(res.status).toBe(503);
  });

  it("accepts a valid bearer + DVSA vars and returns 200 with the metric shape", async () => {
    process.env.CRON_SECRET = "supersecret-32";
    process.env.DVSA_CLIENT_ID = "x";
    process.env.DVSA_API_KEY = "x";
    process.env.DVSA_BASE_URL = "https://tapi.dvsa.gov.uk/";
    const { GET } = await import("@/app/api/cron/mot-refresh/route");
    const res = await GET(
      reqWith({ authorization: "Bearer supersecret-32" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      scanned: expect.any(Number),
      updated: expect.any(Number),
      failed: expect.any(Number),
      took_ms: expect.any(Number),
    });
  });
});

describe("/api/cron/mot-reminders — bearer gate", () => {
  it("returns 503 when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    const { GET } = await import("@/app/api/cron/mot-reminders/route");
    const res = await GET(
      reqWith({ authorization: "Bearer anything" }),
    );
    expect(res.status).toBe(503);
  });

  it("returns 401 when bearer is missing", async () => {
    process.env.CRON_SECRET = "supersecret-32";
    const { GET } = await import("@/app/api/cron/mot-reminders/route");
    const res = await GET(reqWith({}));
    expect(res.status).toBe(401);
  });

  it("returns 401 when bearer length differs (constant-time guard)", async () => {
    process.env.CRON_SECRET = "supersecret-32";
    const { GET } = await import("@/app/api/cron/mot-reminders/route");
    const res = await GET(
      reqWith({ authorization: "Bearer short" }),
    );
    expect(res.status).toBe(401);
  });
});
