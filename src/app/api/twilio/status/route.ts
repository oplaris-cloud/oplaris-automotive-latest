import { NextResponse, type NextRequest } from "next/server";

import { verifyTwilioSignature } from "@/lib/sms/twilio-verify";

/**
 * POST /api/twilio/status — Twilio delivery status callback.
 *
 * Twilio calls this when an SMS transitions state (queued → sent →
 * delivered / failed / undelivered). We MUST verify the X-Twilio-Signature
 * header before processing anything — reject if it doesn't match.
 *
 * Currently we just log the status. In a later phase this could update
 * an `sms_log` table or trigger a retry on failure.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const signature = request.headers.get("x-twilio-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  // Reconstruct the full URL that Twilio signed against
  const url = request.url;

  // Parse the form-encoded body
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

  // Signature valid — process the status update.
  // For now, just acknowledge. Future: write to sms_log table.
  const messageSid = params.MessageSid ?? "unknown";
  const messageStatus = params.MessageStatus ?? "unknown";
  console.log(`[twilio] ${messageSid} → ${messageStatus}`);

  return NextResponse.json({ ok: true });
}
