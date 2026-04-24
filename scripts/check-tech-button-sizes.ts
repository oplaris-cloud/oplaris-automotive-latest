#!/usr/bin/env tsx
/**
 * Audit F4 (2026-04-20) — `size="sm"` regression guard for tech surfaces.
 *
 * Tech-facing primary actions must be at least 44 px tall (WCAG 2.5.5,
 * the design system's "glove-safe" rule). The shadcn `Button` primitive
 * has four sizes:
 *   - sm = 36 px (dense-tables-only)
 *   - default = 44 px (WCAG floor)
 *   - lg = 48 px (glove-safe)
 *   - xl = 64 px (start/pause/complete primaries)
 *
 * Steps 1–4 of the mechanic/MOT UX fix plan migrated every primary
 * tech action away from `sm`. This lint guards against `sm` creeping
 * back in via copy-paste from the manager surface.
 *
 * Guarded paths (recursive):
 *   - src/app/(app)/app/tech/**
 *   - src/app/(app)/app/bookings/Start*.tsx (StartMotButton + StartWorkButton)
 *   - src/app/(app)/app/tech/ClaimPassbackButton.tsx
 *
 * Heuristic: flag any `size="sm"` literal in the guarded paths UNLESS
 * it appears on the same line as `<RegPlate` (RegPlate is a separate
 * primitive with its own size variants — display-only, not a tap target).
 *
 * Wire-up: `pnpm lint` runs this after eslint + spacing. Failure exit
 * code is 1 with a clear file/line/context report.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "src");

// File-globbing predicates. Each guarded path either matches a
// directory prefix (recursive) or an exact filename pattern.
const GUARDED_DIRS = [
  join(SRC, "app", "(app)", "app", "tech"),
];

const GUARDED_FILES = new Set([
  join(SRC, "app", "(app)", "app", "bookings", "StartMotButton.tsx"),
  join(SRC, "app", "(app)", "app", "bookings", "StartWorkButton.tsx"),
]);

// Anchored to the literal source spelling — we don't try to parse JSX.
const SIZE_SM = /size="sm"/g;
// Lines containing this substring are exempt — they're a different
// primitive (RegPlate) whose `size` variants are visual-only.
const REGPLATE_TAG = "<RegPlate";

interface Violation {
  file: string;
  line: number;
  column: number;
  context: string;
}

function listTsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...listTsxFiles(full));
    } else if (extname(entry) === ".tsx") {
      out.push(full);
    }
  }
  return out;
}

function scan(file: string): Violation[] {
  const rel = relative(ROOT, file);
  const source = readFileSync(file, "utf8");
  const violations: Violation[] = [];

  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.includes(REGPLATE_TAG)) continue;
    let m: RegExpExecArray | null;
    const re = new RegExp(SIZE_SM.source, "g");
    while ((m = re.exec(line)) !== null) {
      violations.push({
        file: rel,
        line: i + 1,
        column: m.index + 1,
        context: line.trim().slice(0, 120),
      });
    }
  }

  return violations;
}

function main(): void {
  const candidates = new Set<string>();
  for (const d of GUARDED_DIRS) {
    for (const f of listTsxFiles(d)) candidates.add(f);
  }
  for (const f of GUARDED_FILES) candidates.add(f);

  let total = 0;
  const grouped = new Map<string, Violation[]>();
  for (const file of candidates) {
    const found = scan(file);
    if (found.length === 0) continue;
    total += found.length;
    grouped.set(found[0]!.file, found);
  }

  if (total === 0) {
    console.log("✓ tech-button-sizes: clean — no size=\"sm\" in guarded paths.");
    process.exit(0);
  }

  console.error(
    `✗ tech-button-sizes: found ${total} size="sm" instance${total === 1 ? "" : "s"} in ${grouped.size} file${grouped.size === 1 ? "" : "s"}:\n`,
  );
  for (const [file, vs] of grouped) {
    console.error(`  ${file}`);
    for (const v of vs) {
      console.error(`    ${v.line}:${v.column}  ${v.context}`);
    }
  }
  console.error(
    "\n  Tech-surface primary actions must be size=\"lg\" (48 px) per WCAG 2.5.5\n" +
      "  + design-system glove-safe rule. Task-type radio pills in TechJobClient\n" +
      "  may use size=\"default\" (44 px). RegPlate sizes are exempt automatically.",
  );
  process.exit(1);
}

main();
