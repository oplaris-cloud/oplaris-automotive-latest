import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { serverEnv } from "@/lib/env";

/**
 * Verify the kiosk device cookie and return the garage_id if valid.
 * Returns null if the cookie is missing, expired, or forged.
 */
export async function verifyKioskCookie(): Promise<string | null> {
  const env = serverEnv();
  const store = await cookies();
  const cookie = store.get("kiosk_device")?.value;
  if (!cookie) return null;

  const parts = cookie.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  if (!payloadB64 || !sig) return null;

  // Verify HMAC over the raw payload bytes BEFORE parsing. Never trust a
  // parser with unauthenticated input, and never re-stringify a parsed
  // object to check a signature — JSON.stringify key-ordering is
  // environment-dependent.
  let rawPayload: string;
  try {
    rawPayload = Buffer.from(payloadB64, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const expectedSig = createHmac("sha256", env.KIOSK_PAIRING_SECRET)
    .update(rawPayload)
    .digest("base64url");

  const a = Buffer.from(expectedSig, "utf8");
  const b = Buffer.from(sig, "utf8");
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  // Signature valid — now safe to parse the payload.
  let payload: { garage_id: string; paired_at: string };
  try {
    payload = JSON.parse(rawPayload);
  } catch {
    return null;
  }

  if (!payload.garage_id) return null;

  return payload.garage_id;
}
