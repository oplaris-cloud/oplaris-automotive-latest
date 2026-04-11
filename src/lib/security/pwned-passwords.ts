import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Pwned Passwords k-anonymity check.
 *
 * Computes SHA-1 of the candidate password, sends the first 5 hex
 * characters to api.pwnedpasswords.com, and scans the returned list for
 * the remaining 35 characters. The full hash never leaves this process.
 *
 * We use this on both signup and password-change flows in addition to
 * GoTrue's length check, as required by NIST SP 800-63B §5.1.1.2:
 *
 *   "Verifiers SHALL compare the prospective secrets against a list
 *    that contains values known to be commonly-used, expected, or
 *    compromised."
 *
 * Failure modes:
 *   - Network failure / 5xx from HIBP → we treat it as "unknown" and
 *     FAIL CLOSED (reject the password). The opposite (fail-open) lets
 *     an attacker force-weaken their own account by DDoSing HIBP.
 *
 * Reference: https://haveibeenpwned.com/API/v3#PwnedPasswords
 */

const HIBP_URL = "https://api.pwnedpasswords.com/range";

export interface PwnedCheckResult {
  pwned: boolean;
  /** Number of times this hash appears in the HIBP corpus, if pwned. */
  count: number;
}

export async function checkPwnedPassword(
  password: string,
  opts: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
): Promise<PwnedCheckResult> {
  if (!password) throw new Error("password must be a non-empty string");

  const hash = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(`${HIBP_URL}/${prefix}`, {
    // `Add-Padding: true` makes every response a constant size, so the
    // length of the response doesn't leak whether the prefix has many or
    // few matches.
    headers: { "Add-Padding": "true", "User-Agent": "oplaris-automotive/1.0" },
    signal: opts.signal,
  });

  if (!res.ok) {
    throw new PwnedPasswordsError(
      `HIBP range lookup failed with status ${res.status}`,
    );
  }

  const body = await res.text();

  // Body is one "SUFFIX:COUNT" per line. We compare suffixes in constant
  // time so the timing of the scan doesn't reveal whether a particular
  // password is pwned.
  const suffixBuf = Buffer.from(suffix, "utf8");
  let matchedCount = 0;

  for (const line of body.split(/\r?\n/)) {
    if (!line) continue;
    const [candidate, countStr] = line.split(":");
    if (!candidate || candidate.length !== suffixBuf.length) continue;
    const candidateBuf = Buffer.from(candidate, "utf8");
    // `timingSafeEqual` throws on length mismatch, which we already
    // guarded against above.
    const equal = timingSafeEqual(candidateBuf, suffixBuf);
    if (equal) {
      matchedCount = Number.parseInt(countStr ?? "0", 10) || 0;
      // Don't early-return — keep scanning so the total loop time is
      // the same whether the password is pwned or not. (The padding
      // header already gives us constant response size; the loop also
      // walks the whole list either way.)
    }
  }

  return { pwned: matchedCount > 0, count: matchedCount };
}

/**
 * Assertion variant — throws `PwnedPasswordsError` with a user-friendly
 * message if the password is known. Call this from the login/signup
 * server action before handing the password to GoTrue.
 */
export async function assertPasswordNotPwned(password: string): Promise<void> {
  const result = await checkPwnedPassword(password);
  if (result.pwned) {
    throw new PwnedPasswordsError(
      "This password has appeared in a known data breach. Please choose a different password.",
    );
  }
}

export class PwnedPasswordsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PwnedPasswordsError";
  }
}
