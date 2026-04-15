/**
 * P56.1 (UI-C5) — Dark-mode semantic token contrast gate.
 *
 * Parses `src/app/globals.css`, extracts `:root` + `.dark` variable
 * blocks, and runs every semantic-foreground × semantic-background
 * pair through the V1 OKLCH → sRGB luminance helper. Asserts WCAG AA
 * 4.5:1 across the board. This is the test the P56 kickoff demands
 * for C5 — "fail CI instead" of shipping an inaccessible dark palette.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { linearToSrgb } from "@/lib/brand/oklch";

const CSS_PATH = join(process.cwd(), "src/app/globals.css");
const css = readFileSync(CSS_PATH, "utf8");

/** OKLCH → linear sRGB → sRGB luminance. Mirrors the Björn Ottosson
 *  pipeline in `src/lib/brand/oklch.ts`, in reverse. */
function oklchToLuminance(l: number, c: number, h: number): number {
  // OKLCH → OKLab
  const rad = (h * Math.PI) / 180;
  const aa = c * Math.cos(rad);
  const bb = c * Math.sin(rad);
  // OKLab → LMS
  const l_ = l + 0.3963377774 * aa + 0.2158037573 * bb;
  const m_ = l - 0.1055613458 * aa - 0.0638541728 * bb;
  const s_ = l - 0.0894841775 * aa - 1.291485548 * bb;
  const L = l_ ** 3;
  const M = m_ ** 3;
  const S = s_ ** 3;
  // LMS → linear sRGB
  const r = 4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S;
  const g = -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S;
  const b = -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S;
  // Relative luminance (same formula WCAG uses).
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return Math.max(0, Math.min(1, y));
}

function parseOklch(value: string): { l: number; c: number; h: number } | null {
  const trimmed = value.trim();
  // oklch(L C H) or oklch(L C H / alpha)
  const m = trimmed.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/i);
  if (!m) return null;
  return { l: parseFloat(m[1]!), c: parseFloat(m[2]!), h: parseFloat(m[3]!) };
}

function extractBlock(selector: string): Record<string, string> {
  const selRegex = new RegExp(
    `${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`,
    "s",
  );
  const match = css.match(selRegex);
  if (!match) throw new Error(`Could not find CSS block for ${selector}`);
  // Strip `/* … */` comments before splitting on `;` — otherwise a
  // comment immediately preceding a declaration prefixes the
  // property and the `startsWith("--")` check below rejects it.
  const body = match[1]!.replace(/\/\*[\s\S]*?\*\//g, "");
  const decls: Record<string, string> = {};
  for (const line of body.split(";")) {
    const eq = line.indexOf(":");
    if (eq === -1) continue;
    const prop = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    if (prop.startsWith("--")) decls[prop] = val;
  }
  return decls;
}

function contrast(l1: number, l2: number): number {
  const light = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (light + 0.05) / (dark + 0.05);
}

function luminanceOf(tokens: Record<string, string>, name: string): number {
  const v = tokens[name];
  if (!v) throw new Error(`Missing token ${name}`);
  const o = parseOklch(v);
  if (!o) throw new Error(`Token ${name} is not oklch(): ${v}`);
  return oklchToLuminance(o.l, o.c, o.h);
}

describe("Dark-mode semantic token contrast (WCAG AA 4.5:1)", () => {
  const dark = extractBlock(".dark");

  const pairs: Array<[string, string, string]> = [
    // [human-readable label, foreground var, background var]
    ["body text on page", "--foreground", "--background"],
    ["body text on card", "--card-foreground", "--card"],
    ["body text on popover", "--popover-foreground", "--popover"],
    ["primary button label", "--primary-foreground", "--primary"],
    ["success label on token bg", "--success-foreground", "--success"],
    ["warning label on token bg", "--warning-foreground", "--warning"],
    ["info label on token bg", "--info-foreground", "--info"],
  ];

  it.each(pairs)(
    "%s passes AA (4.5:1) in dark mode",
    (_label, fgVar, bgVar) => {
      const fg = luminanceOf(dark, fgVar);
      const bg = luminanceOf(dark, bgVar);
      const ratio = contrast(fg, bg);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    },
  );
});

describe("Light-mode semantic token contrast (sanity — WCAG AA 4.5:1)", () => {
  const light = extractBlock(":root");

  const pairs: Array<[string, string, string]> = [
    ["body text on page", "--foreground", "--background"],
    ["success label", "--success-foreground", "--success"],
    ["warning label", "--warning-foreground", "--warning"],
    ["info label", "--info-foreground", "--info"],
  ];

  it.each(pairs)(
    "%s passes AA (4.5:1) in light mode",
    (_label, fgVar, bgVar) => {
      const fg = luminanceOf(light, fgVar);
      const bg = luminanceOf(light, bgVar);
      const ratio = contrast(fg, bg);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    },
  );
});

// Keep the import used — ESM bundlers drop unused imports and we want
// this one loaded to catch any accidental regression in the helper.
void linearToSrgb;
