import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { serverEnv } from "@/lib/env";

/**
 * B6.1 — Server-side cookie carrying the impersonation target garage_id.
 *
 * Format:  <garage_id>.<expires_unix>.<base64url(hmac_sha256)>
 * Lifetime: 1 hour.
 *
 * Defence-in-depth notes:
 *   - HttpOnly + Secure + SameSite=Strict so JS can never read it and
 *     it never leaks across origins.
 *   - HMAC over `garage_id|expires` so a forged cookie value can't
 *     impersonate a different garage.
 *   - The cookie is one of TWO gates — even if it survives unsigned,
 *     the impersonation header is honoured by `private.current_garage()`
 *     ONLY when the JWT also carries `is_super_admin=true`. A revoked
 *     super_admin still has their next-refresh JWT update to lose
 *     access; the cookie alone gets ignored at the SQL layer.
 */

const COOKIE_NAME = "oplaris_impersonate";
const TTL_SECONDS = 60 * 60; // 1 hour

function sign(payload: string): string {
  const env = serverEnv();
  const mac = createHmac("sha256", env.SUPER_ADMIN_COOKIE_SECRET)
    .update(payload)
    .digest("base64url");
  return mac;
}

function verifySig(payload: string, sig: string): boolean {
  try {
    const expected = Buffer.from(sign(payload), "base64url");
    const actual = Buffer.from(sig, "base64url");
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export interface ImpersonationCookie {
  garageId: string;
  expiresAt: number;
}

/** Encode + set the cookie on the response. Server Action / Route Handler only. */
export async function setImpersonationCookie(garageId: string): Promise<void> {
  const expiresAt = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const payload = `${garageId}|${expiresAt}`;
  const sig = sign(payload);
  const value = `${garageId}.${expiresAt}.${sig}`;

  const store = await cookies();
  store.set(COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

/** Clear the cookie. Used by the "Exit impersonation" Server Action. */
export async function clearImpersonationCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/**
 * Read + verify the cookie. Returns the parsed payload only if the
 * signature checks out AND the cookie is unexpired.
 *
 * NEVER trust the return value as authorisation on its own — combine
 * with `getStaffSession().isSuperAdmin === true` so a stolen/leaked
 * cookie can't escalate a regular manager.
 */
export async function readImpersonationCookie(): Promise<ImpersonationCookie | null> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;

  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [garageId, expStr, sig] = parts;
  if (!garageId || !expStr || !sig) return null;

  const expiresAt = Number(expStr);
  if (!Number.isFinite(expiresAt)) return null;
  if (expiresAt < Math.floor(Date.now() / 1000)) return null;

  const payload = `${garageId}|${expiresAt}`;
  if (!verifySig(payload, sig)) return null;

  return { garageId, expiresAt };
}
