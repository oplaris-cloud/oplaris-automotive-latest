import "server-only";

import { serverEnv } from "@/lib/env";

/**
 * Send an SMS via Twilio. Server-only.
 *
 * Uses the REST API directly instead of the twilio SDK to keep the
 * bundle small and avoid the SDK's heavyweight auto-import of every
 * Twilio service. We only need one endpoint:
 *   POST /2010-04-01/Accounts/{SID}/Messages.json
 */
export async function sendSms(
  to: string,
  body: string,
  from?: string,
): Promise<{ sid: string }> {
  const env = serverEnv();
  const sid = env.TWILIO_ACCOUNT_SID;
  const token = env.TWILIO_AUTH_TOKEN;
  const fromNumber = from ?? env.TWILIO_FROM_NUMBER;

  if (!sid || !token || !fromNumber) {
    throw new Error("Twilio credentials not configured");
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
    },
    body: new URLSearchParams({ To: to, From: fromNumber, Body: body }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Twilio API error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { sid: string };
  return { sid: data.sid };
}
