/**
 * P56.0 (S-C2) — Spacing-token CI gate.
 *
 * Wraps `scripts/check-spacing-tokens.ts`. The script exits 0 when the
 * tree is on-grid (modulo the documented allow-list for `gap-1.5` and
 * `py-0.5` inside `reg-plate.tsx`) and non-zero otherwise. We invoke
 * it via `tsx` so the test catches off-grid drift the same way CI
 * would.
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");

describe("spacing tokens lint", () => {
  it("scripts/check-spacing-tokens.ts exits 0 — no off-grid Tailwind classes outside the allow-list", () => {
    const res = spawnSync(
      "npx",
      ["tsx", "scripts/check-spacing-tokens.ts"],
      { cwd: ROOT, encoding: "utf8" },
    );
    if (res.status !== 0) {
      // Surface the script's error report so the test failure is
      // diagnostic instead of "exit 1".
      // eslint-disable-next-line no-console
      console.error(res.stdout);
      // eslint-disable-next-line no-console
      console.error(res.stderr);
    }
    expect(res.status, "lint:spacing must be clean").toBe(0);
  });
});
