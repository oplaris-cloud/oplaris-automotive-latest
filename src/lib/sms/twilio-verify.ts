import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { serverEnv } from "@/lib/env";

/**
 * Verify Twilio webhook signatures.
 *
 * Twilio signs every request with an HMAC-SHA1 of the full URL + POST
 * body using your auth token as the key. The signature is in the
 * `X-Twilio-Signature` header. We must verify this before processing
 * any status callback to prevent forged webhook attacks.
 *
 * Reference: https://www.twilio.com/docs/usage/security#validating-requests
 */
export function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string,
): boolean {
  const env = serverEnv();
  const token = env.TWILIO_AUTH_TOKEN;
  if (!token) return false;

  // Sort params by key and append key=value to the URL
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const key of sortedKeys) {
    data += key + params[key];
  }

  const expected = createHmac("sha1", token).update(data, "utf8").digest("base64");

  // Constant-time comparison
  if (expected.length !== signature.length) return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
