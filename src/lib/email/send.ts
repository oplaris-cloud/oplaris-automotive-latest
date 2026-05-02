import "server-only";

import nodemailer, { type Transporter } from "nodemailer";

import { serverEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * B6.2 — Tenant-scoped email send.
 *
 * The flow is:
 *   1. Look up `private.smtp_settings` for the garage (decrypted via
 *      the SECURITY DEFINER `get_smtp_settings_for_send` shim, which
 *      is service-role-only).
 *   2. Build a nodemailer transporter using those creds.
 *   3. Send the message.
 *   4. Audit-log the send. The password NEVER appears in the audit
 *      payload — we log the to/subject/messageId/status only.
 *
 * Tests can inject a custom transporter via the `__transport` arg so
 * we never have to spin up a real SMTP server in CI.
 */

export interface SendEmailArgs {
  garageId: string;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  /** Optional: pin the audit_log target. Defaults to no target. */
  target?: { table: string; id: string };
  /** Internal — tests pass a stream-transport. */
  __transport?: Transporter;
}

export interface SendEmailResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

interface SmtpRow {
  host: string;
  port: number;
  username: string;
  password: string;
  from_email: string;
  from_name: string;
  secure: boolean;
}

export async function sendEmail(
  args: SendEmailArgs,
): Promise<SendEmailResult> {
  const env = serverEnv();
  const admin = createSupabaseAdminClient();

  const { data: settingsRows, error: settingsErr } = await admin.rpc(
    "get_smtp_settings_for_send",
    { p_garage_id: args.garageId, p_encryption_key: env.SMTP_ENCRYPTION_KEY },
  );
  if (settingsErr) {
    return { ok: false, error: `smtp config lookup failed: ${settingsErr.message}` };
  }
  const settings: SmtpRow | undefined = Array.isArray(settingsRows)
    ? settingsRows[0]
    : (settingsRows as SmtpRow | undefined);
  if (!settings) {
    return { ok: false, error: "no SMTP settings configured for this garage" };
  }

  const transport: Transporter =
    args.__transport ??
    nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      auth: { user: settings.username, pass: settings.password },
    });

  let messageId: string | undefined;
  let status: "sent" | "failed" = "sent";
  let errorMessage: string | undefined;

  try {
    const info = await transport.sendMail({
      from: `"${settings.from_name}" <${settings.from_email}>`,
      to: Array.isArray(args.to) ? args.to.join(", ") : args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    });
    messageId = info.messageId;
  } catch (e) {
    status = "failed";
    errorMessage = e instanceof Error ? e.message : "unknown SMTP error";
  }

  // Audit. Never log the password / encryption key. The `to` field is
  // OK to log because the customer's address is already on file in
  // `customers.email`.
  await admin.from("audit_log").insert({
    garage_id: args.garageId,
    actor_staff_id: null,
    action: "email_sent",
    target_table: args.target?.table ?? null,
    target_id: args.target?.id ?? null,
    meta: {
      to: Array.isArray(args.to) ? args.to : [args.to],
      subject: args.subject,
      message_id: messageId ?? null,
      status,
      error: errorMessage ?? null,
    },
  });

  return status === "sent"
    ? { ok: true, messageId }
    : { ok: false, error: errorMessage };
}
