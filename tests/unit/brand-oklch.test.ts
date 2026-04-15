/**
 * V1 — Pure sRGB → OKLCH conversion + foreground picker.
 *
 * Known-answer tests against values you can verify in any OKLCH
 * calculator (e.g. oklch.com). Tolerances are 2 decimal places on
 * L/C and 0.5° on H — browser implementations vary slightly and our
 * 4-dp output rounds to this resolution anyway.
 */
import { describe, expect, it } from "vitest";

import {
  foregroundFor,
  hexToOklch,
  oklchCss,
  parseHex,
  relativeLuminance,
} from "@/lib/brand/oklch";

function closeTo(a: number, b: number, eps = 0.01): boolean {
  return Math.abs(a - b) <= eps;
}

describe("parseHex", () => {
  it("accepts #RGB shorthand", () => {
    expect(parseHex("#fff")).toEqual({ r: 1, g: 1, b: 1 });
    expect(parseHex("#000")).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("accepts 6-digit hex", () => {
    const p = parseHex("#D4232A")!;
    expect(closeTo(p.r, 0xd4 / 255)).toBe(true);
    expect(closeTo(p.g, 0x23 / 255)).toBe(true);
    expect(closeTo(p.b, 0x2a / 255)).toBe(true);
  });

  it("rejects malformed input", () => {
    expect(parseHex("not-a-colour")).toBeNull();
    expect(parseHex("#ZZ")).toBeNull();
    expect(parseHex("")).toBeNull();
    // 5-digit hex is not valid.
    expect(parseHex("#12345")).toBeNull();
  });
});

describe("hexToOklch — known answers", () => {
  it("#FFFFFF → oklch(1, 0, h) (H unspecified for achromatic)", () => {
    const r = hexToOklch("#FFFFFF")!;
    expect(closeTo(r.l, 1.0, 0.01)).toBe(true);
    expect(closeTo(r.c, 0, 0.01)).toBe(true);
  });

  it("#000000 → oklch(0, 0, h)", () => {
    const r = hexToOklch("#000000")!;
    expect(closeTo(r.l, 0, 0.01)).toBe(true);
    expect(closeTo(r.c, 0, 0.01)).toBe(true);
  });

  it("#FF0000 (sRGB red) → oklch ≈ (0.628, 0.258, 29.2)", () => {
    const r = hexToOklch("#FF0000")!;
    expect(closeTo(r.l, 0.628, 0.02)).toBe(true);
    expect(closeTo(r.c, 0.258, 0.02)).toBe(true);
    expect(closeTo(r.h, 29.2, 1)).toBe(true);
  });

  it("#00FF00 (sRGB green) → oklch ≈ (0.866, 0.295, 142.5)", () => {
    const r = hexToOklch("#00FF00")!;
    expect(closeTo(r.l, 0.866, 0.02)).toBe(true);
    expect(closeTo(r.c, 0.295, 0.02)).toBe(true);
    expect(closeTo(r.h, 142.5, 1)).toBe(true);
  });

  it("#3B82F6 (shadcn default blue) → oklch in the 0.62/0.19/260 range", () => {
    const r = hexToOklch("#3B82F6")!;
    expect(closeTo(r.l, 0.623, 0.01)).toBe(true);
    expect(closeTo(r.c, 0.188, 0.01)).toBe(true);
    expect(closeTo(r.h, 259.8, 1)).toBe(true);
  });

  it("returns null for unparseable input", () => {
    expect(hexToOklch("not-a-colour")).toBeNull();
  });
});

describe("oklchCss", () => {
  it("formats with fixed precision", () => {
    expect(oklchCss({ l: 0.5, c: 0.123, h: 180 })).toBe("oklch(0.5000 0.1230 180.00)");
  });
});

describe("relativeLuminance", () => {
  it("white is 1.0", () => {
    expect(closeTo(relativeLuminance("#FFFFFF")!, 1, 0.001)).toBe(true);
  });
  it("black is 0", () => {
    expect(closeTo(relativeLuminance("#000000")!, 0, 0.001)).toBe(true);
  });
  it("mid-grey sits around 0.21", () => {
    // sRGB 50% grey, gamma-decoded ~ 0.214.
    expect(closeTo(relativeLuminance("#808080")!, 0.215, 0.01)).toBe(true);
  });
});

describe("foregroundFor — OKLCH L threshold picker", () => {
  it("white background → near-black foreground", () => {
    expect(foregroundFor("#FFFFFF")).toBe("oklch(0.145 0 0)");
  });

  it("black background → near-white foreground", () => {
    expect(foregroundFor("#000000")).toBe("oklch(0.985 0 0)");
  });

  it("saturated red (#D4232A — Dudley placeholder) → white text", () => {
    expect(foregroundFor("#D4232A")).toBe("oklch(0.985 0 0)");
  });

  it("saturated red (#e12d2d — the picker variant that tripped the old WCAG picker) → white text", () => {
    // Pre-042 the tie-breaker flipped to black for this specific hex
    // because black beat white by a hair on raw WCAG luminance, even
    // though the saturation makes white the obvious readable choice.
    // The OKLCH-L threshold gets it right by inspection.
    expect(foregroundFor("#e12d2d")).toBe("oklch(0.985 0 0)");
  });

  it("pale yellow → black text", () => {
    expect(foregroundFor("#FFFACD")).toBe("oklch(0.145 0 0)");
  });

  it("pale blue (high L) → black text", () => {
    expect(foregroundFor("#B3D4FF")).toBe("oklch(0.145 0 0)");
  });

  it("deep purple (low L) → white text", () => {
    expect(foregroundFor("#3B0C66")).toBe("oklch(0.985 0 0)");
  });

  it("unparseable input falls back to near-black", () => {
    expect(foregroundFor("not-a-hex")).toBe("oklch(0.145 0 0)");
  });
});
