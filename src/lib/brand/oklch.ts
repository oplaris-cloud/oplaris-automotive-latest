// Phase 3 > V1 — Pure sRGB → OKLCH conversion.
//
// Standard Björn Ottosson OKLab pipeline:
//   sRGB hex → linear sRGB → LMS → OKLab → OKLCH
//
// OKLCH is the CSS Color 4 perceptually-uniform polar colour space —
// the one shadcn/ui already uses in `globals.css`. Expressing the
// garage brand tokens in OKLCH lets the existing component library
// pick them up via `var(--primary)` with zero changes.
//
// Pure, stateless, no network — safe to import from both client and
// server code. Unit-tested against known-answer conversions.

export interface OklchTuple {
  l: number;
  c: number;
  h: number;
}

export interface LinearRgb {
  r: number;
  g: number;
  b: number;
}

/** Parse `#rgb`, `#rgba`, `#rrggbb`, or `#rrggbbaa`. Returns 0..1 rgba
 *  channels, or `null` for malformed input. */
export function parseHex(input: string): { r: number; g: number; b: number } | null {
  const s = input.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]+$/.test(s)) return null;
  let rs: string, gs: string, bs: string;
  if (s.length === 3 || s.length === 4) {
    rs = s[0]! + s[0]!;
    gs = s[1]! + s[1]!;
    bs = s[2]! + s[2]!;
  } else if (s.length === 6 || s.length === 8) {
    rs = s.slice(0, 2);
    gs = s.slice(2, 4);
    bs = s.slice(4, 6);
  } else {
    return null;
  }
  return {
    r: parseInt(rs, 16) / 255,
    g: parseInt(gs, 16) / 255,
    b: parseInt(bs, 16) / 255,
  };
}

/** Gamma-decode a single sRGB channel (0..1). */
function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Gamma-encode a single linear channel back to sRGB (0..1). */
export function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

export function srgbHexToLinear(hex: string): LinearRgb | null {
  const parsed = parseHex(hex);
  if (!parsed) return null;
  return {
    r: srgbToLinear(parsed.r),
    g: srgbToLinear(parsed.g),
    b: srgbToLinear(parsed.b),
  };
}

/** Linear sRGB → OKLCH, via OKLab. Values are in the usual ranges:
 *    l ∈ [0,1], c ∈ [0,~0.4], h ∈ [0,360). */
export function linearRgbToOklch({ r, g, b }: LinearRgb): OklchTuple {
  // sRGB → LMS
  const L_ = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const M_ = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const S_ = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  // Non-linear: LMS^(1/3)
  const l_ = Math.cbrt(L_);
  const m_ = Math.cbrt(M_);
  const s_ = Math.cbrt(S_);
  // LMS → OKLab
  const L  = 0.2104542553 * l_ + 0.793617785  * m_ - 0.0040720468 * s_;
  const aa = 1.9779984951 * l_ - 2.428592205  * m_ + 0.4505937099 * s_;
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766  * s_;
  // OKLab → OKLCH
  const c = Math.sqrt(aa * aa + bb * bb);
  let h = (Math.atan2(bb, aa) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c, h };
}

export function hexToOklch(hex: string): OklchTuple | null {
  const lin = srgbHexToLinear(hex);
  if (!lin) return null;
  return linearRgbToOklch(lin);
}

/** CSS `oklch(…)` literal with fixed precision. Rounds to 4dp L/C and
 *  2dp H — matches the precision shadcn/ui uses in globals.css. */
export function oklchCss({ l, c, h }: OklchTuple): string {
  return `oklch(${l.toFixed(4)} ${c.toFixed(4)} ${h.toFixed(2)})`;
}

/** Relative luminance per WCAG, from sRGB hex. Used to pick a
 *  high-contrast foreground. */
export function relativeLuminance(hex: string): number | null {
  const lin = srgbHexToLinear(hex);
  if (!lin) return null;
  return 0.2126 * lin.r + 0.7152 * lin.g + 0.0722 * lin.b;
}

/** Pick a foreground token (near-black vs near-white) for readable
 *  text on a given background hex. Returns a ready-to-embed OKLCH
 *  string. Falls back to near-black on parse failure.
 *
 *  Uses OKLCH perceptual lightness (not raw WCAG luminance) with a
 *  0.65 threshold. For saturated brand colours — reds like
 *  `#e12d2d`, deep blues, emerald greens — WCAG contrast is often a
 *  near-tie between black and white, which drops the math on the
 *  wrong side of the line and renders unreadable dark text on vivid
 *  backgrounds. OKLCH L is perceptually uniform and matches how
 *  humans actually judge "should this text be white or black",
 *  which is what we want here. */
export function foregroundFor(hex: string): string {
  const oklch = hexToOklch(hex);
  if (oklch === null) return "oklch(0.145 0 0)"; // near-black fallback
  // Threshold tuned so saturated primaries (L ≈ 0.55–0.65) still get
  // white text while pastels (L > 0.7) get dark text.
  return oklch.l >= 0.65
    ? "oklch(0.145 0 0)"
    : "oklch(0.985 0 0)";
}
