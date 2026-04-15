#!/usr/bin/env tsx
/**
 * P56.0 (S-C2) — Off-grid Tailwind spacing lint.
 *
 * Scans every TS / TSX file under src/ for Tailwind spacing utilities
 * with a `.5` suffix (e.g. `mt-1.5`, `py-0.5`), which sit off the
 * project's 4 px base grid. Canonical scale + exceptions are documented
 * in DESIGN_SYSTEM.md §1.3.
 *
 * Allow-list (the only off-grid values permitted):
 *   - `gap-1.5`   — icon-label optical pairing (`space-icon` token).
 *   - `py-0.5`    — deliberate, only inside `src/components/ui/reg-plate.tsx`
 *                   to match the real UK plate aspect ratio.
 *
 * Exit code 0 when the tree is clean (allow-list only), non-zero when
 * any other `.5` class is present. CI gate. Runs via `pnpm lint:spacing`
 * and from `tests/unit/spacing-tokens.test.ts`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";

const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "src");

// Off-grid Tailwind class regex. Covers every spacing utility prefix +
// the handful of `.5` stops the spec calls out. Anchored to word
// boundary so `size-1.5` (there isn't one today) or string literals
// inside JSDoc aren't falsely matched.
const OFF_GRID =
  /\b(?:[pm][tblrxy]?|gap|space-[xy])-(?:0\.5|1\.5|2\.5|3\.5)\b/g;

// Accepted violations — keyed by file path (relative to repo root) and
// the exact classname token.
const ALLOW_LIST: Record<string, Set<string>> = {
  // `py-0.5` only here; nothing else gets a pass.
  [`src${sep}components${sep}ui${sep}reg-plate.tsx`]: new Set(["py-0.5"]),
};

// `gap-1.5` is allowed anywhere — it's the project's `space-icon` token.
const GLOBAL_ALLOW = new Set(["gap-1.5"]);

interface Violation {
  file: string;
  line: number;
  column: number;
  token: string;
  context: string;
}

function listTsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    // Skip build/test artefacts we don't care about.
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...listTsxFiles(full));
    } else if (extname(entry) === ".tsx" || extname(entry) === ".ts") {
      out.push(full);
    }
  }
  return out;
}

function scan(file: string): Violation[] {
  const rel = relative(ROOT, file);
  const source = readFileSync(file, "utf8");
  const perFileAllow = ALLOW_LIST[rel] ?? new Set<string>();
  const violations: Violation[] = [];

  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    let m: RegExpExecArray | null;
    // `exec` keeps state across calls on the same regex — reset for
    // each line so we find every match.
    const re = new RegExp(OFF_GRID.source, "g");
    while ((m = re.exec(line)) !== null) {
      const token = m[0];
      if (GLOBAL_ALLOW.has(token)) continue;
      if (perFileAllow.has(token)) continue;
      violations.push({
        file: rel,
        line: i + 1,
        column: m.index + 1,
        token,
        context: line.trim().slice(0, 120),
      });
    }
  }

  return violations;
}

function main(): void {
  const files = listTsxFiles(SRC);
  let total = 0;
  const grouped = new Map<string, Violation[]>();

  for (const file of files) {
    const found = scan(file);
    if (found.length === 0) continue;
    total += found.length;
    grouped.set(found[0]!.file, found);
  }

  if (total === 0) {
    // eslint-disable-next-line no-console
    console.log("✓ spacing: clean — no off-grid Tailwind tokens outside the allow-list.");
    process.exit(0);
  }

  // eslint-disable-next-line no-console
  console.error(
    `✗ spacing: found ${total} off-grid token${total === 1 ? "" : "s"} in ${grouped.size} file${grouped.size === 1 ? "" : "s"}:\n`,
  );
  for (const [file, vs] of grouped) {
    // eslint-disable-next-line no-console
    console.error(`  ${file}`);
    for (const v of vs) {
      // eslint-disable-next-line no-console
      console.error(`    ${v.line}:${v.column}  ${v.token}    ${v.context}`);
    }
  }
  // eslint-disable-next-line no-console
  console.error(
    "\n  See DESIGN_SYSTEM.md §1.3 for the canonical scale.\n" +
      "  Add to the allow-list in scripts/check-spacing-tokens.ts only with justification.",
  );
  process.exit(1);
}

main();
