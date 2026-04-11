/**
 * Unit test for the Pwned Passwords k-anonymity check. We stub `fetch`
 * so the test is hermetic (no network) and deterministic.
 *
 * We also assert that a real-world known-bad password (`password`) is
 * rejected via the actual SHA-1 computation, not by the fixture text —
 * that way if someone accidentally hard-codes a bad prefix, the test
 * catches it.
 */
import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

import {
  assertPasswordNotPwned,
  checkPwnedPassword,
  PwnedPasswordsError,
} from "@/lib/security/pwned-passwords";

function sha1Upper(s: string): string {
  return createHash("sha1").update(s, "utf8").digest("hex").toUpperCase();
}

describe("checkPwnedPassword", () => {
  it("returns pwned=true when the suffix is in the HIBP response", async () => {
    const pwd = "password";
    const hash = sha1Upper(pwd);
    const suffix = hash.slice(5);

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        [
          "0000000000000000000000000000000000:1",
          `${suffix}:42`,
          "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:1",
        ].join("\r\n"),
        { status: 200 },
      ),
    );

    const result = await checkPwnedPassword(pwd, { fetchImpl: fetchMock });
    expect(result).toEqual({ pwned: true, count: 42 });

    // Verify we actually called the range endpoint with the first 5 hex chars.
    const expectedPrefix = hash.slice(0, 5);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/${expectedPrefix}`),
      expect.objectContaining({
        headers: expect.objectContaining({ "Add-Padding": "true" }),
      }),
    );
  });

  it("returns pwned=false when the suffix is absent", async () => {
    const pwd = "a-long-random-passphrase-with-entropy-abcdef";
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response("0000000000000000000000000000000000:1\r\n", { status: 200 }),
      );

    const result = await checkPwnedPassword(pwd, { fetchImpl: fetchMock });
    expect(result.pwned).toBe(false);
    expect(result.count).toBe(0);
  });

  it("throws (fail-closed) when HIBP returns non-2xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("oops", { status: 503 }));
    await expect(
      checkPwnedPassword("password", { fetchImpl: fetchMock }),
    ).rejects.toBeInstanceOf(PwnedPasswordsError);
  });

  it("assertPasswordNotPwned throws on a known password", async () => {
    const pwd = "letmein";
    const hash = sha1Upper(pwd);
    const suffix = hash.slice(5);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(`${suffix}:9999\r\n`, { status: 200 }),
    );

    // Stub global fetch for the assert path
    const origFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      await expect(assertPasswordNotPwned(pwd)).rejects.toBeInstanceOf(
        PwnedPasswordsError,
      );
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("rejects empty strings", async () => {
    await expect(checkPwnedPassword("")).rejects.toThrow(/non-empty/);
  });
});
