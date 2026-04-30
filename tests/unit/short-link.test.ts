/**
 * P2.1 — short-link generator + writer contract.
 *
 * Asserts the alphabet stays inside the visually-unambiguous set Hossein
 * locked in (no 0/O/I/1/l confusables), the length is fixed at 6, and
 * the writer retries on a unique-violation collision before giving up.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const insert = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({ insert }),
  }),
}));

vi.mock("@/lib/env", () => ({
  serverEnv: () => ({ NEXT_PUBLIC_APP_URL: "https://example.test" }),
}));

import {
  createShortLink,
  generateShortLinkId,
  mintShortApprovalLink,
} from "@/lib/sms/short-link";

const ALPHABET_RE = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz]{6}$/;

describe("generateShortLinkId", () => {
  it("returns a 6-character id over the unambiguous alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const id = generateShortLinkId();
      expect(id, `iteration ${i}: ${id}`).toMatch(ALPHABET_RE);
    }
  });

  it("never emits a confusable character (0, 1, I, O, l, o)", () => {
    const banned = /[01IOlo]/;
    for (let i = 0; i < 200; i++) {
      expect(generateShortLinkId()).not.toMatch(banned);
    }
  });

  it("produces sufficient uniqueness over 1000 draws (bias check)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(generateShortLinkId());
    // 56^6 ≈ 30.8 B, so 1000 draws should be functionally unique.
    expect(seen.size).toBeGreaterThan(998);
  });
});

describe("createShortLink", () => {
  beforeEach(() => {
    insert.mockReset();
  });

  it("inserts and returns the id on first try", async () => {
    insert.mockResolvedValueOnce({ error: null });
    const id = await createShortLink({
      garageId: "00000000-0000-0000-0000-000000000001",
      targetUrl: "https://example.test/approve/abc",
      expiresAt: new Date(Date.now() + 60_000),
      purpose: "approval",
    });
    expect(id).toMatch(ALPHABET_RE);
    expect(insert).toHaveBeenCalledTimes(1);
    const inserted = insert.mock.calls[0]![0] as Record<string, unknown>;
    expect(inserted.id).toBe(id);
    expect(inserted.purpose).toBe("approval");
  });

  it("retries on unique-violation (23505) and succeeds", async () => {
    insert
      .mockResolvedValueOnce({ error: { code: "23505", message: "dup" } })
      .mockResolvedValueOnce({ error: { code: "23505", message: "dup" } })
      .mockResolvedValueOnce({ error: null });
    const id = await createShortLink({
      garageId: "g",
      targetUrl: "https://example.test/x",
      expiresAt: new Date(Date.now() + 60_000),
      purpose: "approval",
    });
    expect(id).toMatch(ALPHABET_RE);
    expect(insert).toHaveBeenCalledTimes(3);
  });

  it("re-throws non-collision errors immediately", async () => {
    insert.mockResolvedValueOnce({
      error: { code: "23502", message: "not_null_violation" },
    });
    await expect(
      createShortLink({
        garageId: "g",
        targetUrl: "https://example.test/x",
        expiresAt: new Date(Date.now() + 60_000),
        purpose: "approval",
      }),
    ).rejects.toThrow(/not_null_violation/);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("gives up after 5 collision attempts", async () => {
    insert.mockResolvedValue({ error: { code: "23505", message: "dup" } });
    await expect(
      createShortLink({
        garageId: "g",
        targetUrl: "https://example.test/x",
        expiresAt: new Date(Date.now() + 60_000),
        purpose: "approval",
      }),
    ).rejects.toThrow(/5 collision attempts/);
    expect(insert).toHaveBeenCalledTimes(5);
  });
});

describe("mintShortApprovalLink", () => {
  beforeEach(() => {
    insert.mockReset();
  });

  it("stores the canonical /approve/<token> target and returns /r/<id>", async () => {
    insert.mockResolvedValueOnce({ error: null });
    const url = await mintShortApprovalLink({
      token: "PAYLOAD.SIGNATURE",
      baseUrl: "https://example.test",
      expiresAt: new Date("2026-05-01T00:00:00Z"),
      garageId: "g",
    });
    expect(url).toMatch(
      /^https:\/\/example\.test\/r\/[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz]{6}$/,
    );
    const inserted = insert.mock.calls[0]![0] as Record<string, unknown>;
    expect(inserted.target_url).toBe(
      "https://example.test/approve/PAYLOAD.SIGNATURE",
    );
    expect(inserted.purpose).toBe("approval");
  });

  it("normalises a typo'd base URL (https:host) before composing the target", async () => {
    insert.mockResolvedValueOnce({ error: null });
    const url = await mintShortApprovalLink({
      token: "PAYLOAD.SIG",
      baseUrl: "https:example.test", // missing //
      expiresAt: new Date("2026-05-01T00:00:00Z"),
      garageId: "g",
    });
    expect(url).toMatch(/^https:\/\/example\.test\/r\//);
    const inserted = insert.mock.calls[0]![0] as Record<string, unknown>;
    expect(inserted.target_url).toBe(
      "https://example.test/approve/PAYLOAD.SIG",
    );
  });
});
