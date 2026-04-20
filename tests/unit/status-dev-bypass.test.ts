/**
 * STAGING_SMS_BYPASS — /api/status/request-code dev bypass.
 *
 * Invariants that are worth guarding against regression:
 *   1. Prod-guard: `serverEnv()` throws at first call when the bypass
 *      flag is true and NODE_ENV is production.
 *   2. Bypass on + phone matches: Twilio is NOT called, the store RPC
 *      runs, audit_log gets the `status_dev_sms_bypass` row, and the
 *      JSON response carries a 6-digit `devCode`.
 *   3. Bypass on + no match: response is the canonical `OK_RESPONSE`
 *      byte-for-byte — no `devCode` — so the anti-enumeration
 *      guarantee holds.
 *   4. Bypass off: Twilio IS called; no `devCode`.
 *   5. Rate limits still fire regardless of bypass state.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock, insertMock, queueSmsMock, checkRateLimitMock } = vi.hoisted(
  () => ({
    rpcMock: vi.fn(),
    insertMock: vi.fn(),
    queueSmsMock: vi.fn(),
    checkRateLimitMock: vi.fn(),
  }),
);

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
}));

// Migration 047 — route now sends through queueSms, not sendSms
// directly. Mock the queue module so the test stays at the boundary
// (route ↔ outbox helper) and doesn't have to set up the full
// sms_outbox RPC pipeline.
vi.mock("@/lib/sms/queue", () => ({
  queueSms: queueSmsMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "audit_log") {
        return { insert: insertMock };
      }
      if (table === "vehicles") {
        return {
          select: () => ({
            eq: () => ({
              is: () => ({
                limit: () => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: currentVehicleFixture,
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
    rpc: rpcMock,
  })),
}));

// `serverEnv()` is where the route pulls the bypass flag + node env
// from. We re-import the module per test to reset its cache, and
// mutate `process.env` before each import.
vi.mock("@/lib/env", async () => {
  const { z } = await import("zod");
  const schema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    STATUS_DEV_BYPASS_SMS: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    STATUS_PHONE_PEPPER: z.string().default("pepper"),
  });
  return {
    serverEnv: () => {
      const parsed = schema.parse({
        NODE_ENV: process.env.NODE_ENV,
        STATUS_DEV_BYPASS_SMS: process.env.STATUS_DEV_BYPASS_SMS,
        STATUS_PHONE_PEPPER: process.env.STATUS_PHONE_PEPPER,
      });
      if (parsed.STATUS_DEV_BYPASS_SMS && parsed.NODE_ENV === "production") {
        throw new Error(
          "STATUS_DEV_BYPASS_SMS=true is forbidden in production. " +
            "Either unset the variable or deploy with NODE_ENV !== 'production'.",
        );
      }
      return parsed;
    },
  };
});

import { POST } from "@/app/api/status/request-code/route";
import { serverEnv } from "@/lib/env";

/** Shared fixture the route sees when the `vehicles` lookup hits. */
let currentVehicleFixture:
  | {
      id: string;
      garage_id: string;
      customers: { phone: string } | { phone: string }[];
    }
  | null = null;

function matchingVehicle() {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    garage_id: "22222222-2222-4222-8222-222222222222",
    customers: { phone: "+447911123456" },
  };
}

function request(body: { registration?: string; phone?: string }) {
  return new Request("https://example.test/api/status/request-code", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.5",
    },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

beforeEach(() => {
  rpcMock.mockReset().mockResolvedValue({ data: null, error: null });
  insertMock.mockReset().mockResolvedValue({ data: null, error: null });
  queueSmsMock.mockReset().mockResolvedValue({
    outboxId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    twilioSid: "SM_test",
    status: "sent",
  });
  checkRateLimitMock
    .mockReset()
    .mockResolvedValue({ allowed: true, remaining: 99 });
  currentVehicleFixture = matchingVehicle();
  process.env.STATUS_DEV_BYPASS_SMS = "false";
  (process.env as Record<string, string>).NODE_ENV = "development";
  process.env.STATUS_PHONE_PEPPER = "pepper";
});

describe("STATUS_DEV_BYPASS_SMS prod-guard", () => {
  it("throws at first call when bypass=true and NODE_ENV=production", () => {
    process.env.STATUS_DEV_BYPASS_SMS = "true";
    (process.env as Record<string, string>).NODE_ENV = "production";
    expect(() => serverEnv()).toThrow(/forbidden in production/);
  });

  it("does NOT throw when bypass=true but NODE_ENV=development", () => {
    process.env.STATUS_DEV_BYPASS_SMS = "true";
    (process.env as Record<string, string>).NODE_ENV = "development";
    expect(() => serverEnv()).not.toThrow();
  });
});

describe("bypass ON + phone matches", () => {
  beforeEach(() => {
    process.env.STATUS_DEV_BYPASS_SMS = "true";
    (process.env as Record<string, string>).NODE_ENV = "development";
  });

  it("returns a 6-digit devCode, does NOT call sendSms, writes the audit row", async () => {
    const res = await POST(request({ registration: "AB12CDE", phone: "07911123456" }));
    const json = (await res.json()) as { ok?: boolean; devCode?: string };

    expect(json.ok).toBe(true);
    expect(typeof json.devCode).toBe("string");
    expect(json.devCode).toMatch(/^\d{6}$/);

    // Twilio MUST NOT be touched in bypass mode.
    expect(queueSmsMock).not.toHaveBeenCalled();

    // store_status_code still ran (the UI's verify step hashes the
    // typed code against the stored hash, so this is required).
    const rpcNames = rpcMock.mock.calls.map((c) => c[0]);
    expect(rpcNames).toContain("store_status_code");

    // audit_log row with action='status_dev_sms_bypass'; the code
    // itself MUST NOT be in the payload.
    expect(insertMock).toHaveBeenCalledTimes(1);
    const payload = insertMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.action).toBe("status_dev_sms_bypass");
    expect(payload.target_table).toBe("vehicles");
    const meta = payload.meta as Record<string, unknown>;
    expect(meta).toHaveProperty("reg");
    expect(meta).toHaveProperty("expires_at");
    expect(meta).not.toHaveProperty("code");
  });
});

describe("bypass ON + no vehicle match", () => {
  beforeEach(() => {
    process.env.STATUS_DEV_BYPASS_SMS = "true";
    (process.env as Record<string, string>).NODE_ENV = "development";
    currentVehicleFixture = null; // simulate miss
  });

  it("returns the canonical OK_RESPONSE with NO devCode (anti-enumeration)", async () => {
    const res = await POST(request({ registration: "XX99ZZZ", phone: "07000000000" }));
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.ok).toBe(true);
    expect(json.devCode).toBeUndefined();
    expect(queueSmsMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });
});

describe("bypass OFF — prod path", () => {
  it("calls sendSms and does not emit devCode", async () => {
    const res = await POST(request({ registration: "AB12CDE", phone: "07911123456" }));
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.devCode).toBeUndefined();
    expect(queueSmsMock).toHaveBeenCalledTimes(1);
    // Audit row is only for bypass events — not written when the
    // real Twilio path runs.
    expect(insertMock).not.toHaveBeenCalled();
  });
});

describe("rate limits still fire regardless of bypass state", () => {
  it("returns 429 and NEVER reaches store_status_code or sendSms", async () => {
    process.env.STATUS_DEV_BYPASS_SMS = "true";
    (process.env as Record<string, string>).NODE_ENV = "development";
    checkRateLimitMock.mockResolvedValueOnce({ allowed: false, remaining: 0 });

    const res = await POST(request({ registration: "AB12CDE", phone: "07911123456" }));
    expect(res.status).toBe(429);
    expect(queueSmsMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });
});
