/**
 * P2.6 — `getClientIp` is the centralised seam every rate-limited
 * route reads through. Real Traefik behind Dokploy lands the
 * originating client IP as the *first* token of `x-forwarded-for`;
 * subsequent tokens are reverse-proxy hops. We strip whitespace,
 * fall back to `x-real-ip`, then to the literal `"unknown"` so the
 * rate-limit RPC never gets a null bucket key.
 */
import { describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";

import { getClientIp } from "@/lib/security/client-ip";

function reqWith(headers: Record<string, string>): NextRequest {
  return {
    headers: {
      get: (k: string) => headers[k.toLowerCase()] ?? null,
    },
  } as unknown as NextRequest;
}

describe("getClientIp", () => {
  it("returns the only IP when XFF has a single token", () => {
    expect(getClientIp(reqWith({ "x-forwarded-for": "1.2.3.4" }))).toBe("1.2.3.4");
  });

  it("returns the first token when XFF has a comma-separated chain", () => {
    expect(
      getClientIp(reqWith({ "x-forwarded-for": "1.2.3.4, 10.0.0.1, 172.16.0.1" })),
    ).toBe("1.2.3.4");
  });

  it("trims whitespace inside the XFF chain", () => {
    expect(
      getClientIp(reqWith({ "x-forwarded-for": "   1.2.3.4   , 10.0.0.1" })),
    ).toBe("1.2.3.4");
  });

  it("handles an IPv6 source unchanged", () => {
    expect(
      getClientIp(reqWith({ "x-forwarded-for": "2001:db8::1, 10.0.0.1" })),
    ).toBe("2001:db8::1");
  });

  it("falls back to x-real-ip when XFF is missing", () => {
    expect(getClientIp(reqWith({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
  });

  it("prefers XFF over x-real-ip when both are present", () => {
    expect(
      getClientIp(
        reqWith({ "x-forwarded-for": "1.2.3.4", "x-real-ip": "5.6.7.8" }),
      ),
    ).toBe("1.2.3.4");
  });

  it("returns 'unknown' when no IP-bearing header is present", () => {
    expect(getClientIp(reqWith({}))).toBe("unknown");
  });

  it("returns 'unknown' when XFF is empty string", () => {
    expect(getClientIp(reqWith({ "x-forwarded-for": "" }))).toBe("unknown");
  });

  it("returns 'unknown' when XFF is whitespace", () => {
    expect(getClientIp(reqWith({ "x-forwarded-for": "   " }))).toBe("unknown");
  });

  it("returns 'unknown' when XFF is a lone comma", () => {
    // Pathological input — first token is empty, fall through to x-real-ip
    // (also missing here), then "unknown".
    expect(getClientIp(reqWith({ "x-forwarded-for": "," }))).toBe("unknown");
  });
});
