import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { verifyTwilioSignature } from "@/lib/sms/twilio-verify";

/**
 * POST /api/webhooks/twilio/status — Twilio delivery status callback.
 *
 * Migration 047 — Step 3 of SMS_QUEUE_PLAN.md.
 *
 * Twilio POSTs here every time an outbound SMS transitions state:
 *   queued → sent → delivered (or failed / undelivered)
 * The `statusCallback` URL was attached when `queueSms()` fired the
 * Twilio create call (Step 2), so every row in `sms_outbox` with a
 * non-null `twilio_sid` is eligible to receive updates here.
 *
 * Architecture rule #6: every Twilio inbound MUST verify the
 * `X-Twilio-Signature` HMAC. We reject anything that doesn't match
 * before touching the DB — a forged callback could otherwise flip
 * a real SMS row to "delivered" when it never landed, or to
 * "failed" when it did.
 *
 * Status mapping (Twilio → ours):
 *   queued / accepted / sending      → 'sent'
 *     (Twilio has accepted the message but not yet handed it to the
 *     carrier; we already moved to 'sent' inside queueSms when the
 *     create call returned, so these are no-ops most of the time)
 *   delivered                        → 'delivered'
 *   failed / undelivered             → 'failed'
 *   anything else                    → ignored
 */

// Map of Twilio MessageStatus values onto our `sms_outbox.status`
// CHECK-constrained enum. Anything not in the map is ignored.
const STATUS_MAP: Record<string, "sent" | "delivered" | "failed"> = {
  queued: "sent",
  accepted: "sent",
  sending: "sent",
  sent: "sent",
  delivered: "delivered",
  failed: "failed",
  undelivered: "failed",
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const signature = request.headers.get("x-twilio-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  // Reconstruct the URL Twilio signed against. Behind a proxy this
  // can drift if `request.url` reports the internal port; if/when we
  // hit that on Dokploy we'll add an `X-Forwarded-Proto/Host`-aware
  // builder.
  const url = request.url;

  const formData = await request.formData();
  const params: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") {
      params[key] = value;
    }
  }

  if (!verifyTwilioSignature(url, params, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const messageSid = params.MessageSid;
  const messageStatus = params.MessageStatus;

  if (!messageSid || !messageStatus) {
    return NextResponse.json(
      { error: "Missing MessageSid or MessageStatus" },
      { status: 400 },
    );
  }

  const mappedStatus = STATUS_MAP[messageStatus];
  if (!mappedStatus) {
    // Twilio shipped a status we don't model (e.g. "scheduled"). Ack
    // with 200 so Twilio stops retrying, but don't touch the row.
    return NextResponse.json({ ok: true, ignored: messageStatus });
  }

  // Twilio includes ErrorCode + ErrorMessage on failed/undelivered.
  // For successful states they're absent; pass null so the previous
  // error_code (if any) gets cleared.
  const isFailure = mappedStatus === "failed";
  const errorCode = isFailure ? params.ErrorCode ?? null : null;
  const errorMessage = isFailure
    ? (params.ErrorMessage ?? null)?.slice(0, 500) ?? null
    : null;

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.rpc("update_sms_status", {
    p_twilio_sid: messageSid,
    p_status: mappedStatus,
    p_error_code: errorCode,
    p_error_message: errorMessage,
  });

  if (error) {
    // Log + return 500 so Twilio retries. update_sms_status itself is
    // idempotent (UPDATE on twilio_sid match) so retries are safe.
    console.error("[twilio-status] update_sms_status failed:", error);
    return NextResponse.json(
      { error: "Could not update status" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
