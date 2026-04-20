/**
 * Migration 047 — sms_outbox queue helper.
 *
 * Covers SMS_QUEUE_PLAN T1 + T2 + a third case the plan implies:
 *   T1. Happy path — insert row, call Twilio, stamp SID + status='sent'.
 *   T2. Twilio failure — row flips to status='failed' + error captured.
 *   T3. Future scheduledFor — leave queued, no Twilio call.
 *
 * Mocks:
 *   - `@/lib/sms/twilio.sendSms` — controllable per test
 *   - `@/lib/supabase/admin` — chainable rpc() that records every call
 *     so we can assert which RPCs ran in which order
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendSmsMock, rpcCalls } = vi.hoisted(() => ({
  sendSmsMock: vi.fn(),
  rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
}));

vi.mock("@/lib/sms/twilio", () => ({
  sendSms: sendSmsMock,
}));

// Reset the call log per test by re-binding it.
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (name === "insert_sms_outbox") {
        return { data: "11111111-1111-4111-8111-111111111111", error: null };
      }
      return { data: null, error: null };
    },
  }),
}));

vi.mock("@/lib/env", () => ({
  serverEnv: () => ({
    NEXT_PUBLIC_APP_URL: "http://test.local",
    TWILIO_WEBHOOK_BASE_URL: undefined,
  }),
}));

import { queueSms } from "@/lib/sms/queue";

const baseInput = {
  garageId: "22222222-2222-4222-8222-222222222222",
  phone: "+447911123456",
  messageBody: "Hello from the test suite",
  messageType: "quote_sent" as const,
};

beforeEach(() => {
  rpcCalls.length = 0;
  sendSmsMock.mockReset();
});

describe("queueSms — universal SMS outbox helper", () => {
  it("T1 — happy path: inserts row, sends, stamps SID + status='sent'", async () => {
    sendSmsMock.mockResolvedValue({ sid: "SM_real_test_sid" });

    const result = await queueSms(baseInput);

    expect(result.status).toBe("sent");
    expect(result.twilioSid).toBe("SM_real_test_sid");
    expect(result.outboxId).toBe("11111111-1111-4111-8111-111111111111");

    // RPC sequence: insert → attach_sid. No mark_failed.
    const rpcNames = rpcCalls.map((c) => c.name);
    expect(rpcNames).toEqual(["insert_sms_outbox", "attach_sms_twilio_sid"]);

    // Twilio called once with the body + status callback URL.
    expect(sendSmsMock).toHaveBeenCalledTimes(1);
    const [to, body, from, opts] = sendSmsMock.mock.calls[0]!;
    expect(to).toBe(baseInput.phone);
    expect(body).toBe(baseInput.messageBody);
    expect(from).toBeUndefined();
    expect(opts?.statusCallback).toBe(
      "http://test.local/api/webhooks/twilio/status",
    );
  });

  it("T2 — Twilio failure: row flips to 'failed' + error captured", async () => {
    sendSmsMock.mockRejectedValue(
      new Error("Twilio API error 21211: Invalid 'To' Phone Number"),
    );

    const result = await queueSms(baseInput);

    expect(result.status).toBe("failed");
    expect(result.twilioSid).toBeNull();
    expect(result.errorMessage).toMatch(/Invalid 'To'/);

    const rpcNames = rpcCalls.map((c) => c.name);
    expect(rpcNames).toEqual(["insert_sms_outbox", "mark_sms_failed"]);

    // Error code parsed from the Twilio error string for the
    // Messages-page colour-coding.
    const failCall = rpcCalls.find((c) => c.name === "mark_sms_failed");
    expect(failCall?.args.p_error_code).toBe("21211");
  });

  it("T3 — scheduledFor in future: leaves row queued, does NOT call Twilio", async () => {
    const future = new Date(Date.now() + 60_000);
    const result = await queueSms({ ...baseInput, scheduledFor: future });

    expect(result.status).toBe("queued");
    expect(result.twilioSid).toBeNull();
    expect(sendSmsMock).not.toHaveBeenCalled();

    // Only the insert ran. attach_sid + mark_failed are both no-ops
    // until the cron picks the row up.
    const rpcNames = rpcCalls.map((c) => c.name);
    expect(rpcNames).toEqual(["insert_sms_outbox"]);

    // Insert payload carried the scheduled timestamp.
    const insertCall = rpcCalls[0];
    expect(insertCall?.args.p_scheduled_for).toBe(future.toISOString());
  });
});
