import { describe, expect, it, vi } from "vitest";

// Mock serverEnv before importing the module
vi.mock("@/lib/env", () => ({
  serverEnv: () => ({
    APPROVAL_HMAC_SECRET: "test-secret-for-unit-tests-only-32chars!",
  }),
}));

import {
  generateApprovalToken,
  verifyApprovalToken,
  hashToken,
} from "@/lib/security/approval-tokens";

describe("approval token system", () => {
  const jobId = "00000000-0000-0000-0000-000000000001";
  const requestId = "00000000-0000-0000-0000-000000000002";
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  it("generates a token with two base64url parts", () => {
    const { token } = generateApprovalToken(jobId, requestId, expiresAt);
    const parts = token.split(".");
    expect(parts.length).toBe(2);
    expect(parts[0]!.length).toBeGreaterThan(10);
    expect(parts[1]!.length).toBeGreaterThan(10);
  });

  it("generates a sha256 hex hash for DB storage", () => {
    const { tokenHash } = generateApprovalToken(jobId, requestId, expiresAt);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("verifyApprovalToken succeeds on a valid token", () => {
    const { token } = generateApprovalToken(jobId, requestId, expiresAt);
    const payload = verifyApprovalToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.job_id).toBe(jobId);
    expect(payload!.request_id).toBe(requestId);
    expect(payload!.nonce).toBeTruthy();
  });

  it("verifyApprovalToken rejects a tampered token", () => {
    const { token } = generateApprovalToken(jobId, requestId, expiresAt);
    // Flip a character in the payload
    const tampered = "X" + token.slice(1);
    expect(verifyApprovalToken(tampered)).toBeNull();
  });

  it("verifyApprovalToken rejects a token with wrong signature", () => {
    const { token } = generateApprovalToken(jobId, requestId, expiresAt);
    const parts = token.split(".");
    const wrongSig = parts[0] + ".AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    expect(verifyApprovalToken(wrongSig)).toBeNull();
  });

  it("verifyApprovalToken rejects empty/garbage input", () => {
    expect(verifyApprovalToken("")).toBeNull();
    expect(verifyApprovalToken("not-a-token")).toBeNull();
    expect(verifyApprovalToken("a.b.c")).toBeNull();
  });

  it("hashToken produces consistent results", () => {
    const { token } = generateApprovalToken(jobId, requestId, expiresAt);
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("each token has a unique nonce", () => {
    const t1 = generateApprovalToken(jobId, requestId, expiresAt);
    const t2 = generateApprovalToken(jobId, requestId, expiresAt);
    expect(t1.token).not.toBe(t2.token);
    expect(t1.tokenHash).not.toBe(t2.tokenHash);
  });
});
