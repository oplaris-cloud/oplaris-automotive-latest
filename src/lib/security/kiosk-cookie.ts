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

  let payload: { garage_id: string; paired_at: string };
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
  } catch {
    return null;
  }

  if (!payload.garage_id) return null;

  const expectedSig = createHmac("sha256", env.KIOSK_PAIRING_SECRET)
    .update(JSON.stringify(payload))
    .digest("base64url");

  const a = Buffer.from(expectedSig, "utf8");
  const b = Buffer.from(sig, "utf8");
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  return payload.garage_id;
}
