import "server-only";

import { serverEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { sendSms } from "./twilio";

/**
 * Migration 047 — universal SMS outbox.
 *
 * Replaces direct `sendSms()` calls everywhere we need an audit trail
 * + delivery tracking + manager visibility. Every outgoing SMS now
 * goes through here so the Messages page (`/app/messages`) can show
 * the team what's been sent, what's failed, and what's queued.
 *
 * Flow:
 *   1. Insert a row into `sms_outbox` via `private.insert_sms_outbox`
 *      (admin client + SECURITY DEFINER — `authenticated` is revoked
 *      from direct INSERT). Status starts as `queued`.
 *   2. If `scheduledFor` is in the future, return — the cron Edge
 *      Function (Step 4) will pick it up at the right time.
 *   3. Otherwise call Twilio. On success, stamp the SID + flip to
 *      `sent`. On failure, flip to `failed` with the error code so
 *      the Messages page surfaces it instead of swallowing the bug
 *      in a console.error.
 *
 * The Twilio create call carries a `statusCallback` URL pointing at
 * `/api/webhooks/twilio/status` — the next migration step. That
 * webhook upgrades the status to `delivered` once Twilio's carriers
 * confirm landing on the device.
 *
 * Compared to the old direct-call pattern:
 *   - Failures are visible (was: console.error, lost)
 *   - Manager can retry / cancel from the UI
 *   - Customer status page can correlate "we sent you a quote" against
 *     the actual delivery state without polling Twilio
 *   - MOT-reminder cron (Step 4) gets a free dedup index via
 *     `sms_outbox_vehicle_idx` so we never double-fire a reminder
 */

export type SmsType =
  | "mot_reminder_30d"
  | "mot_reminder_7d"
  | "mot_reminder_5d"
  | "quote_sent"
  | "quote_updated"
  | "approval_request"
  | "status_code"
  | "invoice_sent";

export interface QueueSmsInput {
  garageId: string;
  /** Foreign-key context — all optional. Set whichever apply so the
   *  Messages page can render "View vehicle / View job / View customer"
   *  links without an extra round-trip. */
  vehicleId?: string;
  customerId?: string;
  jobId?: string;
  /** E.164 phone number (`+447xxxxxxxxx`). Trust the caller — every
   *  current call site already has the canonical phone from `customers`. */
  phone: string;
  messageBody: string;
  messageType: SmsType;
  /** Future timestamp = "leave as queued for the cron". Omit / null =
   *  "send immediately, synchronously". */
  scheduledFor?: Date;
}

export interface QueueSmsResult {
  /** sms_outbox.id — surfaces in the Messages UI even when Twilio
   *  failed, so the manager has something to retry. */
  outboxId: string;
  /** Twilio SID when the create call succeeded; null when scheduled
   *  for later or when Twilio failed. */
  twilioSid: string | null;
  status: "queued" | "sent" | "failed";
  errorMessage?: string;
}

/** Status-callback URL appended to every Twilio create call so
 *  delivery updates flow back into our outbox. Computed per call so
 *  changes to `TWILIO_WEBHOOK_BASE_URL` (or a per-env override) take
 *  effect without restart. */
function statusCallbackUrl(): string | undefined {
  const env = serverEnv();
  const base = env.TWILIO_WEBHOOK_BASE_URL || env.NEXT_PUBLIC_APP_URL;
  if (!base) return undefined;
  return `${base.replace(/\/+$/, "")}/api/webhooks/twilio/status`;
}

export async function queueSms(input: QueueSmsInput): Promise<QueueSmsResult> {
  const supabase = createSupabaseAdminClient();

  // 1. Insert the row. The RPC returns the new uuid so we can stamp
  //    the SID back onto the same row after Twilio responds.
  const { data: outboxId, error: insertErr } = await supabase.rpc(
    "insert_sms_outbox",
    {
      p_garage_id: input.garageId,
      p_vehicle_id: input.vehicleId ?? null,
      p_customer_id: input.customerId ?? null,
      p_job_id: input.jobId ?? null,
      p_phone: input.phone,
      p_message_body: input.messageBody,
      p_message_type: input.messageType,
      p_scheduled_for: input.scheduledFor?.toISOString() ?? null,
    },
  );

  if (insertErr || typeof outboxId !== "string") {
    // Outbox insert itself failed — the helper can't even record the
    // failure because there's no row to update. Surface it loudly so
    // the caller can decide whether to abort or retry.
    throw new Error(
      `sms_outbox insert failed: ${insertErr?.message ?? "unknown error"}`,
    );
  }

  // 2. Scheduled for the future → leave queued. The cron picks it up.
  if (input.scheduledFor && input.scheduledFor.getTime() > Date.now()) {
    return { outboxId, twilioSid: null, status: "queued" };
  }

  // 3. Send now. Failure is captured on the row, not thrown — the
  //    Messages page is the source of truth for what happened.
  try {
    const callbackUrl = statusCallbackUrl();
    const { sid } = await sendSms(
      input.phone,
      input.messageBody,
      undefined,
      callbackUrl ? { statusCallback: callbackUrl } : undefined,
    );
    await supabase.rpc("attach_sms_twilio_sid", {
      p_outbox_id: outboxId,
      p_twilio_sid: sid,
      p_status: "sent",
    });
    return { outboxId, twilioSid: sid, status: "sent" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Surface a Twilio API error code if the message looks like
    // "Twilio API error 400: …" so the Messages UI can colour-code
    // common failures (21211 invalid phone, 21610 unsubscribed, etc.).
    const codeMatch = message.match(/Twilio API error (\d+)/);
    const errorCode = codeMatch?.[1] ?? null;

    await supabase.rpc("mark_sms_failed", {
      p_outbox_id: outboxId,
      p_error_code: errorCode,
      p_error_message: message.slice(0, 500),
    });
    return {
      outboxId,
      twilioSid: null,
      status: "failed",
      errorMessage: message,
    };
  }
}
