import "server-only";

import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { serverEnv } from "@/lib/env";

/**
 * Customer approval token system.
 *
 * Format: base64url(payload).base64url(HMAC-SHA256(secret, payload))
 * Where payload = JSON { job_id, request_id, expires_at, nonce }
 *
 * Stored in DB as sha256(full_token) so the DB never holds the cleartext
 * token. Lookup is: compute sha256(token_from_url), SELECT WHERE token_hash = $1.
 * Comparison is constant-time via the DB index lookup + SHA-256 preimage.
 *
 * Properties:
 *   - Unforgeable: HMAC-SHA256 with a server-only secret
 *   - Single-use: DB marks `used_at` on first use; WHERE status='pending'
 *   - Expiring: 24h, checked at use time
 *   - No PII: the URL contains only the opaque token, not job details
 */

function base64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function fromBase64url(s: string): Buffer {
  return Buffer.from(s, "base64url");
}

export interface TokenPayload {
  job_id: string;
  request_id: string;
  expires_at: string; // ISO 8601
  nonce: string;
}

/**
 * Generate a signed approval token and its sha256 hash for DB storage.
 */
export function generateApprovalToken(
  jobId: string,
  requestId: string,
  expiresAt: Date,
): { token: string; tokenHash: string } {
  const env = serverEnv();

  const payload: TokenPayload = {
    job_id: jobId,
    request_id: requestId,
    expires_at: expiresAt.toISOString(),
    nonce: randomBytes(16).toString("hex"),
  };

  const payloadStr = JSON.stringify(payload);
  const payloadB64 = base64url(Buffer.from(payloadStr, "utf8"));

  const sig = createHmac("sha256", env.APPROVAL_HMAC_SECRET)
    .update(payloadStr)
    .digest();
  const sigB64 = base64url(sig);

  const token = `${payloadB64}.${sigB64}`;
  const tokenHash = createHash("sha256").update(token).digest("hex");

  return { token, tokenHash };
}

/**
 * Verify an approval token's HMAC signature. Returns the decoded payload
 * if valid, null if the signature is wrong or the format is bad.
 *
 * This does NOT check expiry or single-use — those are DB-level checks.
 * The purpose here is to reject garbage/forged tokens before hitting the DB.
 */
export function verifyApprovalToken(token: string): TokenPayload | null {
  const env = serverEnv();
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;

  let payloadStr: string;
  try {
    payloadStr = fromBase64url(payloadB64).toString("utf8");
  } catch {
    return null;
  }

  const expectedSig = createHmac("sha256", env.APPROVAL_HMAC_SECRET)
    .update(payloadStr)
    .digest();

  let actualSig: Buffer;
  try {
    actualSig = fromBase64url(sigB64);
  } catch {
    return null;
  }

  if (actualSig.length !== expectedSig.length) return null;
  if (!timingSafeEqual(expectedSig, actualSig)) return null;

  try {
    const payload = JSON.parse(payloadStr) as TokenPayload;
    if (!payload.job_id || !payload.request_id || !payload.expires_at || !payload.nonce) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Compute the sha256 hash of a token for DB lookup.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
