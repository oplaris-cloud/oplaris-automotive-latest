/**
 * Audit F6 — `--warning` token-pair contrast guards.
 *
 * Step 6 of the mechanic/MOT UX fix plan migrated every `text-warning`
 * site that sat on a neutral / lightly-tinted background to either
 *   (a) `text-foreground` on the same background, or
 *   (b) a pilled `bg-warning text-warning-foreground` chip (solid).
 *
 * This test pins the contrast outcomes for the THREE token pairs in
 * use after the migration. If anyone retunes `--warning` (Approach A
 * deferred to a design-system epic) or accidentally re-introduces the
 * bare-`text-warning`-on-white pattern, the assertions catch it.
 *
 * Hex equivalents derive from the OKLCH literals in `src/app/globals.css`
 * via the canonical CSS oklch → linear-sRGB → gamma transform. They
 * are baked here so the test does not depend on the inverse-OKLCH
 * helper that `src/lib/brand/oklch.ts` does NOT yet export. Source
 * literals live in `globals.css`; if a token retunes, regenerate the
 * hex AND update the assertion thresholds.
 */
import { describe, expect, it } from "vitest";

import { relativeLuminance } from "@/lib/brand/oklch";

// Token hex equivalents — derived from the OKLCH literals in
// src/app/globals.css. See the file header for the regeneration recipe.
const LIGHT = {
  background: "#ffffff",         // --background = oklch(1 0 0)
  foreground: "#0a0a0a",         // --foreground = oklch(0.145 0 0)
  warning: "#ef9900",            // --warning    = oklch(0.75 0.18 75)
  warningFg: "#161616",          // --warning-fg = oklch(0.2 0 0)
};
const DARK = {
  background: "#0a0a0a",         // --background = oklch(0.145 0 0)
  foreground: "#fafafa",         // --foreground = oklch(0.985 0 0)
  warning: "#ffb113",            // --warning    = oklch(0.82 0.17 75)
  warningFg: "#060606",          // --warning-fg = oklch(0.12 0 0)
};

/** WCAG 2.1 contrast ratio per §1.4.3.
 *  ratio = (Llighter + 0.05) / (Ldarker + 0.05) */
function contrastRatio(fgHex: string, bgHex: string): number {
  const fg = relativeLuminance(fgHex);
  const bg = relativeLuminance(bgHex);
  if (fg === null || bg === null) {
    throw new Error(`relativeLuminance returned null for ${fgHex}/${bgHex}`);
  }
  const [hi, lo] = fg > bg ? [fg, bg] : [bg, fg];
  return (hi + 0.05) / (lo + 0.05);
}

describe("--warning token contrast (audit F6)", () => {
  it("text-foreground on bg-card passes WCAG AA (≥4.5:1) in both themes", () => {
    // The fix shape — every freestanding `text-warning` site that we
    // could not pill switched to `text-foreground`. Trivially passes
    // because foreground/background are the design system's primary
    // contrast pair.
    expect(contrastRatio(LIGHT.foreground, LIGHT.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(DARK.foreground, DARK.background)).toBeGreaterThanOrEqual(4.5);
  });

  it("text-warning-foreground on solid bg-warning passes WCAG AA in both themes", () => {
    // The pre-validated solid chip pattern (Paused chip, status
    // badges, kiosk service-category buttons). If `--warning` or
    // `--warning-foreground` retunes and breaks this pair, every
    // chip across the app starts failing simultaneously.
    expect(contrastRatio(LIGHT.warningFg, LIGHT.warning)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(DARK.warningFg, DARK.warning)).toBeGreaterThanOrEqual(4.5);
  });

  it("text-warning on light bg-card FAILS WCAG AA — regression guard for the bug F6 fixed", () => {
    // The pattern audit F6 named: bare `text-warning` text on a
    // neutral white card. ~2.3:1 — fails AA. If anyone re-introduces
    // this combo they should be forced to re-think.
    //
    // NOTE — dark mode is INTENTIONALLY excluded from this assertion.
    // In dark theme, `text-warning` (#ffb113, light amber) on
    // `bg-background` (#0a0a0a, near-black) is the inverse contrast
    // direction and clears AA at ~10.4:1. The bug + the fix are both
    // light-mode-only. If a future engineer adds dark-mode support
    // for the bare-text-warning pattern they should still avoid it
    // for visual-consistency reasons (the pattern reads as "alert"
    // in light mode and "highlight" in dark — confusing).
    expect(contrastRatio(LIGHT.warning, LIGHT.background)).toBeLessThan(4.5);
  });
});
