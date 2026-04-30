import "server-only";

import { randomBytes } from "node:crypto";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { normaliseAppUrl } from "./template-schema";

/**
 * P2.1 — 6-char URL shortener for SMS bodies.
 *
 * The approval flow used to embed a ~250-char base64 HMAC token
 * directly in the SMS link, bloating each message past one segment
 * AND pointing at the API route (JSON, not a customer page).
 * The fix is two-fold:
 *
 *   1. A new customer-facing page at /approve/<token>
 *   2. This shortener: the SMS contains /r/<6-char-id> and the
 *      route handler 302s to the long URL after validating expiry.
 *
 * ID alphabet: 56 visually unambiguous characters.
 *   * digits 2-9        (8)   — drop 0 / 1 (confusable with O / I,l)
 *   * A-Z minus I, O    (24)
 *   * a-z minus l, o    (24)
 *
 * 56^6 ≈ 30.8 billion ids, comfortably outside enumeration range
 * given the per-IP rate limits the public surface enforces. Each
 * row carries an `expires_at` bound to the underlying token expiry
 * (24 h for approvals); the route handler refuses to redirect past
 * that horizon.
 */

const ALPHABET =
  "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
const ID_LENGTH = 6;

// Reject byte values in the bias zone so each character is sampled
// uniformly from ALPHABET. With ALPHABET.length=56 and 256 buckets
// the unbiased range covers 224 of the 256 byte values.
const UNBIASED_MAX =
  Math.floor(256 / ALPHABET.length) * ALPHABET.length;

export function generateShortLinkId(): string {
  const result: string[] = [];
  while (result.length < ID_LENGTH) {
    const buf = randomBytes(8);
    for (const byte of buf) {
      if (byte < UNBIASED_MAX) {
        result.push(ALPHABET[byte % ALPHABET.length]!);
        if (result.length === ID_LENGTH) break;
      }
    }
  }
  return result.join("");
}

export interface CreateShortLinkArgs {
  garageId: string;
  targetUrl: string;
  expiresAt: Date;
  purpose: "approval" | "status" | "invoice" | "quote";
}

export async function createShortLink({
  garageId,
  targetUrl,
  expiresAt,
  purpose,
}: CreateShortLinkArgs): Promise<string> {
  const supabase = createSupabaseAdminClient();
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = generateShortLinkId();
    const { error } = await supabase.from("short_links").insert({
      id,
      garage_id: garageId,
      target_url: targetUrl,
      expires_at: expiresAt.toISOString(),
      purpose,
    });
    if (!error) return id;
    // 23505 = unique_violation; retry with a fresh id. Anything else
    // is unexpected — surface it.
    if (error.code !== "23505") {
      throw new Error(`createShortLink: ${error.message}`);
    }
  }
  throw new Error("createShortLink: 5 collision attempts in a row");
}

export interface MintShortApprovalLinkArgs {
  /** The full HMAC approval token (base64url.payload.sig). */
  token: string;
  /** The validated public app URL (NEXT_PUBLIC_APP_URL); routed
   *  through normaliseAppUrl as belt-and-braces against the
   *  P2.7a operator-side typo. */
  baseUrl: string;
  /** Token expiry — the short link inherits this so visiting the
   *  /r/ route past expiry shows the static expired page rather
   *  than redirecting to a token the page would 410 anyway. */
  expiresAt: Date;
  garageId: string;
}

export async function mintShortApprovalLink({
  token,
  baseUrl,
  expiresAt,
  garageId,
}: MintShortApprovalLinkArgs): Promise<string> {
  const base = normaliseAppUrl(baseUrl);
  const targetUrl = `${base}/approve/${encodeURIComponent(token)}`;
  const id = await createShortLink({
    garageId,
    targetUrl,
    expiresAt,
    purpose: "approval",
  });
  return `${base}/r/${id}`;
}
