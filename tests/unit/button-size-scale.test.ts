/**
 * P56.1 (UI-C1) — Button primitive size scale.
 *
 * Pure className assertions — the Button primitive uses `cva`, so we
 * can render `buttonVariants({ size })` to a string and check that
 * the canonical Tailwind height utility is present. No jsdom round-
 * trip required. These guard against accidental drift of any size
 * below CLAUDE.md's 44×44 minimum.
 */
import { describe, expect, it } from "vitest";

import { buttonVariants } from "@/components/ui/button";

describe("Button size scale", () => {
  it.each([
    // [size, expected Tailwind height class, px for the comment]
    ["default", "h-11"], // 44 — WCAG 2.5.5 minimum
    ["sm", "h-9"], // 36 — dense tables, opt-in
    ["lg", "h-12"], // 48 — primary CTAs on mobile
    ["xl", "h-16"], // 64 — hero CTAs
  ] as const)(
    "size=%s emits %s",
    (size, expected) => {
      const className = buttonVariants({ size });
      expect(className).toContain(expected);
    },
  );

  it.each([
    ["icon", "size-11"], // 44×44
    ["icon-sm", "size-9"], // 36×36 dense
    ["icon-lg", "size-12"], // 48×48
  ] as const)(
    "icon size=%s emits %s",
    (size, expected) => {
      const className = buttonVariants({ size });
      expect(className).toContain(expected);
    },
  );

  it("retired sizes xs and icon-xs are no longer in the variants map", () => {
    // Passing a retired value should fall through to `default` (cva
    // silently ignores unknown keys). Regression guard: if someone
    // re-adds `xs`, this test stays green but the next one fails.
    const retired = ["xs", "icon-xs"] as const;
    for (const bad of retired) {
      const className = buttonVariants({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        size: bad as any,
      });
      expect(className).not.toContain("h-6");
      expect(className).not.toContain("size-6");
    }
  });

  it("no size in the variants map is shorter than 36 px (h-9)", () => {
    // Sanity — the shortest primitive size is the opt-in `sm` for
    // dense tables. If anyone ever re-adds an `h-7`/`h-8` variant
    // the regex below catches it.
    const sizes = ["default", "sm", "lg", "xl", "icon", "icon-sm", "icon-lg"] as const;
    for (const s of sizes) {
      const className = buttonVariants({ size: s });
      // Disallow the old sub-WCAG classes the audit retired.
      expect(className).not.toMatch(/\bh-[678]\b/);
      expect(className).not.toMatch(/\bsize-[678]\b/);
    }
  });
});
