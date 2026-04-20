/**
 * SMS_QUEUE_PLAN T3 + T4 — Twilio status callback webhook.
 *
 *   T3. Valid signature → row's status updated via the RPC.
 *   T4. Invalid signature → 401 + RPC NOT called.
 *   Plus: status mapping (queued → sent, delivered → delivered,
 *         failed → failed, scheduled → ignored), error code passed
 *         through on failures.
 *
 * Architecture rule #6 — every Twilio inbound MUST verify the
 * signature before any DB write. The "invalid signature" test is
 * the canary that catches a regression in that gate.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcCalls, verifyMock } = vi.hoisted(() => ({
  rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
  verifyMock: vi.fn(),
}));

vi.mock("@/lib/sms/twilio-verify", () => ({
  verifyTwilioSignature: verifyMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return { data: null, error: null };
    },
  }),
}));

import { POST } from "@/app/api/webhooks/twilio/status/route";

function buildRequest(
  bodyParams: Record<string, string>,
  signature: string | null = "valid_sig",
): Request {
  const body = new URLSearchParams(bodyParams).toString();
  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
  };
  if (signature) headers["x-twilio-signature"] = signature;
  return new Request("https://example.test/api/webhooks/twilio/status", {
    method: "POST",
    headers,
    body,
  });
}

beforeEach(() => {
  rpcCalls.length = 0;
  verifyMock.mockReset();
});

describe("Twilio status webhook", () => {
  it("T4 — rejects when X-Twilio-Signature header is missing", async () => {
    verifyMock.mockReturnValue(true); // would pass if we got there
    const res = await POST(
      buildRequest({ MessageSid: "SM_x", MessageStatus: "delivered" }, null) as never,
    );
    expect(res.status).toBe(401);
    expect(rpcCalls).toHaveLength(0);
  });

  it("T4 — rejects when signature does not verify", async () => {
    verifyMock.mockReturnValue(false);
    const res = await POST(
      buildRequest(
        { MessageSid: "SM_x", MessageStatus: "delivered" },
        "wrong",
      ) as never,
    );
    expect(res.status).toBe(401);
    expect(rpcCalls).toHaveLength(0);
  });

  it("T3 — valid signature + 'delivered' calls update_sms_status", async () => {
    verifyMock.mockReturnValue(true);
    const res = await POST(
      buildRequest({ MessageSid: "SM_real", MessageStatus: "delivered" }) as never,
    );
    expect(res.status).toBe(200);
    expect(rpcCalls).toHaveLength(1);
    const call = rpcCalls[0]!;
    expect(call.name).toBe("update_sms_status");
    expect(call.args.p_twilio_sid).toBe("SM_real");
    expect(call.args.p_status).toBe("delivered");
    expect(call.args.p_error_code).toBeNull();
    expect(call.args.p_error_message).toBeNull();
  });

  it("'failed' carries error code + message through to the RPC", async () => {
    verifyMock.mockReturnValue(true);
    const res = await POST(
      buildRequest({
        MessageSid: "SM_fail",
        MessageStatus: "failed",
        ErrorCode: "30007",
        ErrorMessage: "Carrier blocked",
      }) as never,
    );
    expect(res.status).toBe(200);
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]!.args).toMatchObject({
      p_twilio_sid: "SM_fail",
      p_status: "failed",
      p_error_code: "30007",
      p_error_message: "Carrier blocked",
    });
  });

  it("'undelivered' maps to our 'failed' status", async () => {
    verifyMock.mockReturnValue(true);
    await POST(
      buildRequest({
        MessageSid: "SM_undel",
        MessageStatus: "undelivered",
        ErrorCode: "30003",
      }) as never,
    );
    expect(rpcCalls[0]!.args.p_status).toBe("failed");
  });

  it("'queued' / 'sending' map to our 'sent' status (no-op most of the time)", async () => {
    verifyMock.mockReturnValue(true);
    await POST(
      buildRequest({ MessageSid: "SM_queued", MessageStatus: "sending" }) as never,
    );
    expect(rpcCalls[0]!.args.p_status).toBe("sent");
  });

  it("ignores statuses we don't model (e.g. 'scheduled') with 200 OK", async () => {
    verifyMock.mockReturnValue(true);
    const res = await POST(
      buildRequest({ MessageSid: "SM_sched", MessageStatus: "scheduled" }) as never,
    );
    expect(res.status).toBe(200);
    expect(rpcCalls).toHaveLength(0);
    const json = await res.json();
    expect(json.ignored).toBe("scheduled");
  });

  it("400 when MessageSid or MessageStatus missing from body", async () => {
    verifyMock.mockReturnValue(true);
    const res = await POST(
      buildRequest({ MessageSid: "SM_only" }) as never,
    );
    expect(res.status).toBe(400);
    expect(rpcCalls).toHaveLength(0);
  });
});
