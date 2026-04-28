/**
 * P2.9 — `retryMessage` server action's type-aware gate.
 *
 * Vibe-security invariant: the server-side `canRetry` check must hold
 * even if the client UI is bypassed. A determined caller doing a
 * direct `await retryMessage({ id })` for a 9-minute-old failed OTP
 * row must be refused; otherwise the cron's policy is undermined.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const requireManager = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  requireManager: () => requireManager(),
}));

const fromMock = vi.fn();
const adminFromMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ from: fromMock })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({
    from: adminFromMock,
    rpc: vi.fn(),
  })),
}));

const queueSms = vi.fn();
vi.mock("@/lib/sms/queue", () => ({
  queueSms: (...args: unknown[]) => queueSms(...args),
}));

import { retryMessage } from "@/app/(app)/app/messages/actions";

const ROW_ID = "abcd1234-abcd-4abc-8abc-abcdabcdabcd";
const GARAGE = "00000000-0000-0000-0000-0000000d0d1e";
const STAFF = "00000000-0000-0000-0000-0000000a0001";

beforeEach(() => {
  fromMock.mockReset();
  adminFromMock.mockReset();
  queueSms.mockReset();
  requireManager.mockReset().mockResolvedValue({
    userId: STAFF,
    email: "m@example.com",
    garageId: GARAGE,
    roles: ["manager"],
  });
});

function rowChain(result: { data: unknown; error?: unknown }) {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve(result),
      }),
    }),
  };
}

describe("retryMessage — P2.9 type-aware gate", () => {
  it("refuses an 8m01s-old failed status_code OTP with the expired-by-policy error", async () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    fromMock.mockReturnValueOnce(
      rowChain({
        data: {
          vehicle_id: null,
          customer_id: null,
          job_id: null,
          phone: "+447700900001",
          message_body: "code: 482917",
          message_type: "status_code",
          status: "failed",
          created_at: tenMinutesAgo,
        },
      }),
    );

    const r = await retryMessage({ id: ROW_ID });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/older than the 8 minutes retry window/);
    }
    expect(queueSms).not.toHaveBeenCalled();
  });

  it("refuses a 25h-old failed approval_request", async () => {
    const t = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    fromMock.mockReturnValueOnce(
      rowChain({
        data: {
          vehicle_id: null,
          customer_id: null,
          job_id: null,
          phone: "+447700900002",
          message_body: "approve here: link",
          message_type: "approval_request",
          status: "failed",
          created_at: t,
        },
      }),
    );

    const r = await retryMessage({ id: ROW_ID });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/older than the 24 hours retry window/);
    }
    expect(queueSms).not.toHaveBeenCalled();
  });

  it("retries a 5-minute-old failed status_code OTP", async () => {
    const t = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    fromMock.mockReturnValueOnce(
      rowChain({
        data: {
          vehicle_id: null,
          customer_id: null,
          job_id: null,
          phone: "+447700900003",
          message_body: "code: 117832",
          message_type: "status_code",
          status: "failed",
          created_at: t,
        },
      }),
    );
    queueSms.mockResolvedValueOnce({
      outboxId: "00000000-0000-0000-0000-000000001234",
      twilioSid: "SMabc",
      status: "sent",
    });

    const r = await retryMessage({ id: ROW_ID });
    expect(r.ok).toBe(true);
    expect(queueSms).toHaveBeenCalledTimes(1);
  });

  it("retries an old failed quote_sent (indefinite window)", async () => {
    const t = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    fromMock.mockReturnValueOnce(
      rowChain({
        data: {
          vehicle_id: null,
          customer_id: null,
          job_id: "00000000-0000-0000-0000-000000005678",
          phone: "+447700900004",
          message_body: "quote here",
          message_type: "quote_sent",
          status: "failed",
          created_at: t,
        },
      }),
    );
    queueSms.mockResolvedValueOnce({
      outboxId: "00000000-0000-0000-0000-000000005678",
      twilioSid: "SMquote",
      status: "sent",
    });

    const r = await retryMessage({ id: ROW_ID });
    expect(r.ok).toBe(true);
  });

  it("refuses a non-failed row regardless of age", async () => {
    fromMock.mockReturnValueOnce(
      rowChain({
        data: {
          vehicle_id: null,
          customer_id: null,
          job_id: null,
          phone: "+447700900005",
          message_body: "x",
          message_type: "status_code",
          status: "delivered",
          created_at: new Date().toISOString(),
        },
      }),
    );

    const r = await retryMessage({ id: ROW_ID });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/Cannot retry/);
    }
    expect(queueSms).not.toHaveBeenCalled();
  });
});
