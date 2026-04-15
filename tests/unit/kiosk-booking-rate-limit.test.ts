/**
 * B9 (M1 Go-Live Blocker) — kiosk booking endpoint must rate-limit
 * before writing to the bookings table. This protects against a paired
 * tablet being abused by walk-ins / kids / curious customers spamming
 * the submit button.
 *
 * We exercise the route handler directly with mocked dependencies so the
 * test stays hermetic (no DB, no Supabase). The behavioural contract:
 *   - Per-IP bucket caps overall throughput.
 *   - Per-(IP + reg) bucket caps repeat submissions for the same plate.
 *   - On rate-limit hit: 429 + same `{ error }` shape used by the
 *     /api/status routes (see `verify-code/route.ts`).
 *   - The DB insert MUST NOT happen when rate-limited.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/kiosk-cookie", () => ({
  verifyKioskCookie: vi
    .fn()
    .mockResolvedValue("00000000-0000-0000-0000-0000000000aa"),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: vi.fn(),
}));

const insertSingle = vi.fn();
const insertSelect = vi.fn(() => ({ single: insertSingle }));
const insert = vi.fn(() => ({ select: insertSelect }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({ insert })),
  })),
}));

import { POST } from "@/app/api/kiosk/booking/route";
import { checkRateLimit } from "@/lib/security/rate-limit";

const validBody = {
  service: "mot",
  customerName: "Jane Driver",
  customerPhone: "07911 123456",
  customerEmail: "",
  registration: "ab12 cde",
  make: "",
  model: "",
  preferredDate: "",
  notes: "",
};

function makeRequest(body: unknown = validBody, ip = "203.0.113.5") {
  return new Request("https://example.test/api/kiosk/booking", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
      "user-agent": "Test",
    },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

beforeEach(() => {
  vi.mocked(checkRateLimit)
    .mockReset()
    .mockResolvedValue({ allowed: true, remaining: 99 });
  insertSingle
    .mockReset()
    .mockResolvedValue({
      data: { id: "00000000-0000-0000-0000-000000000111" },
      error: null,
    });
  insert.mockClear();
  insertSelect.mockClear();
});

describe("POST /api/kiosk/booking — rate limiting (B9)", () => {
  it("checks both per-IP and per-(IP+reg) buckets before inserting", async () => {
    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(checkRateLimit).toHaveBeenCalledTimes(2);
    expect(checkRateLimit).toHaveBeenNthCalledWith(
      1,
      "kiosk_booking_ip:203.0.113.5",
      5,
    );
    // Reg is normalised (whitespace stripped, upper-cased) before keying.
    expect(checkRateLimit).toHaveBeenNthCalledWith(
      2,
      "kiosk_booking_ip_reg:203.0.113.5|AB12CDE",
      3,
    );

    // Insert ran exactly once for the happy path.
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("returns 429 with the standard error shape when the per-IP bucket is exhausted, and skips the insert", async () => {
    vi.mocked(checkRateLimit)
      .mockResolvedValueOnce({ allowed: false, remaining: 0 }) // IP bucket
      .mockResolvedValueOnce({ allowed: true, remaining: 3 }); // never reached

    const res = await POST(makeRequest());

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "Too many requests" });
    expect(insert).not.toHaveBeenCalled();
    // Per-(IP+reg) check should be short-circuited once IP fails.
    expect(checkRateLimit).toHaveBeenCalledTimes(1);
  });

  it("returns 429 when the per-(IP+reg) bucket is exhausted, and skips the insert", async () => {
    vi.mocked(checkRateLimit)
      .mockResolvedValueOnce({ allowed: true, remaining: 4 }) // IP ok
      .mockResolvedValueOnce({ allowed: false, remaining: 0 }); // reg bucket full

    const res = await POST(makeRequest());

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "Too many requests" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("simulates 10 rapid submissions and asserts the trailing calls are rejected", async () => {
    let calls = 0;
    vi.mocked(checkRateLimit).mockImplementation(async (bucket: string) => {
      calls += 1;
      // First 5 IP-bucket calls succeed, the 6th onwards is rate-limited.
      // Each request makes 1 IP call + 1 (IP+reg) call, so after request
      // #5 the IP bucket flips to denied for request #6+.
      if (bucket.startsWith("kiosk_booking_ip:")) {
        const requestIndex = Math.ceil(calls / 2);
        return { allowed: requestIndex <= 5, remaining: Math.max(0, 5 - requestIndex) };
      }
      return { allowed: true, remaining: 3 };
    });

    const results: number[] = [];
    for (let i = 0; i < 10; i += 1) {
      const res = await POST(makeRequest());
      results.push(res.status);
    }

    // First 5 succeed, last 5 are rate-limited. (The exact count is what
    // matters — proves the limiter is wired in, not bypassed.)
    const ok = results.filter((s) => s === 200).length;
    const tooMany = results.filter((s) => s === 429).length;
    expect(ok).toBe(5);
    expect(tooMany).toBe(5);
    expect(insert).toHaveBeenCalledTimes(5);
  });

  it("uses the x-forwarded-for IP literally (no trust beyond the proxy header)", async () => {
    await POST(makeRequest(validBody, "198.51.100.99"));

    expect(checkRateLimit).toHaveBeenNthCalledWith(
      1,
      "kiosk_booking_ip:198.51.100.99",
      5,
    );
  });

  it("falls back to a sentinel bucket when no x-forwarded-for header is present", async () => {
    const req = new Request("https://example.test/api/kiosk/booking", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validBody),
    }) as unknown as import("next/server").NextRequest;

    await POST(req);

    expect(checkRateLimit).toHaveBeenNthCalledWith(
      1,
      "kiosk_booking_ip:unknown",
      5,
    );
  });
});
