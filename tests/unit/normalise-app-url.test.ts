/**
 * P2.7a — `normaliseAppUrl` is the belt-and-braces fix for the
 * `https:host.tld` operator-typo (env value missing the `//` after the
 * scheme). Node's URL constructor parses that as scheme+path with empty
 * host, which silently passes `.url()` validation but then renders as
 * an unclickable link inside the SMS body. The helper repairs the
 * common case, throws on anything else suspicious, and strips the
 * trailing slash so callers can `+ "/status"` cleanly.
 */
import { describe, expect, it } from "vitest";

import { normaliseAppUrl } from "@/lib/sms/templates";

describe("normaliseAppUrl", () => {
  // ── The regression itself ───────────────────────────────────────
  it("repairs the `https:host.tld` operator typo by inserting `//`", () => {
    expect(normaliseAppUrl("https:oplaris-automotive-das.example.com")).toBe(
      "https://oplaris-automotive-das.example.com",
    );
  });

  it("repairs the same typo on http:// scheme too", () => {
    expect(normaliseAppUrl("http:host.tld")).toBe("http://host.tld");
  });

  it("repairs the typo case-insensitively", () => {
    expect(normaliseAppUrl("HTTPS:host.tld")).toBe("HTTPS://host.tld");
  });

  // ── Already-valid URLs pass through ─────────────────────────────
  it("passes a normal https URL through unchanged", () => {
    expect(normaliseAppUrl("https://oplaris.example.com")).toBe(
      "https://oplaris.example.com",
    );
  });

  it("passes a localhost dev URL through unchanged", () => {
    expect(normaliseAppUrl("http://localhost:3000")).toBe(
      "http://localhost:3000",
    );
  });

  it("preserves a path segment if present", () => {
    expect(normaliseAppUrl("https://example.com/app")).toBe(
      "https://example.com/app",
    );
  });

  // ── Trailing slash handling ─────────────────────────────────────
  it("strips a single trailing slash", () => {
    expect(normaliseAppUrl("https://example.com/")).toBe(
      "https://example.com",
    );
  });

  it("strips multiple trailing slashes", () => {
    expect(normaliseAppUrl("https://example.com//")).toBe(
      "https://example.com",
    );
  });

  it("strips trailing slash from a path too", () => {
    expect(normaliseAppUrl("https://example.com/app/")).toBe(
      "https://example.com/app",
    );
  });

  it("strips trailing slash AND repairs the typo in one pass", () => {
    expect(normaliseAppUrl("https:host.tld/")).toBe("https://host.tld");
  });

  // ── Trims surrounding whitespace ────────────────────────────────
  it("trims leading + trailing whitespace before parsing", () => {
    expect(normaliseAppUrl("  https://example.com  ")).toBe(
      "https://example.com",
    );
  });

  // ── Hard rejects ────────────────────────────────────────────────
  it("throws on empty string", () => {
    expect(() => normaliseAppUrl("")).toThrow(/empty input/);
  });

  it("throws on whitespace-only input", () => {
    expect(() => normaliseAppUrl("   ")).toThrow(/empty input/);
  });

  it("throws on a value that doesn't parse as a URL at all", () => {
    expect(() => normaliseAppUrl("not a url")).toThrow(/not parseable/);
  });

  it("throws on a value that lacks a scheme", () => {
    // `example.com` parses as a URL with `example.com` as scheme on
    // newer node versions only when followed by a colon — without the
    // colon it's not a URL at all.
    expect(() => normaliseAppUrl("example.com")).toThrow();
  });

  // ── Composition: the actual usage shape inside server actions ───
  it("safely composes a status link from a previously-broken env value", () => {
    const link = `${normaliseAppUrl("https:oplaris.example.com")}/status`;
    expect(link).toBe("https://oplaris.example.com/status");
  });

  it("safely composes an approval link from a previously-broken env value", () => {
    const link = `${normaliseAppUrl("https:oplaris.example.com")}/api/approvals/abc123`;
    expect(link).toBe("https://oplaris.example.com/api/approvals/abc123");
  });
});
