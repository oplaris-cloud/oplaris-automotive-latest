#!/usr/bin/env tsx
/**
 * P56.0 (S-C2) — One-shot codemod that rewrites off-grid Tailwind
 * spacing utilities to the canonical 4 px scale from DESIGN_SYSTEM.md
 * §1.3.
 *
 * Policy:
 *   - `gap-1.5`   → KEEP (the `space-icon` optical token)
 *   - `py-0.5`    → `py-1` EXCEPT inside `src/components/ui/reg-plate.tsx`
 *   - `-0.5`      → `-1`  (every prefix: p/m/pt/pb/...; 2 px → 4 px)
 *   - `-1.5`      → `-2`  (non-gap prefixes; 6 px → 8 px)
 *   - `-2.5`      → `-3`  (10 px → 12 px — conservative upsize; auditor
 *                          can downsize to `-2` per call-site if 8 px fits)
 *   - `-3.5`      → `-4`
 *   - `space-y-1.5` / `space-x-1.5` → `-2` (stack rhythms only live on on-grid values)
 *
 * Run via: `pnpm tsx scripts/codemod-off-grid.ts`. Idempotent.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";

const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "src");

// File-level exception: reg-plate.tsx keeps its `py-0.5` to match the
// real UK plate aspect ratio.
const REG_PLATE = `src${sep}components${sep}ui${sep}reg-plate.tsx`;

/** Regex catches ALL Tailwind spacing prefixes that permit `.5` stops.
 *  Captured groups: 1 = prefix (p, pt, gap, space-y, ...), 2 = stop. */
const OFF_GRID = /\b((?:[pm][tblrxy]?|gap|space-[xy]))-(0\.5|1\.5|2\.5|3\.5)\b/g;

interface Change {
  file: string;
  from: string;
  to: string;
  line: number;
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
    } else if (extname(entry) === ".tsx" || extname(entry) === ".ts") {
      out.push(full);
    }
  }
  return out;
}

function rewriteClass(
  prefix: string,
  stop: "0.5" | "1.5" | "2.5" | "3.5",
  inRegPlate: boolean,
): string | null {
  // gap-1.5 is the icon-label token — never touch.
  if (prefix === "gap" && stop === "1.5") return null;
  // reg-plate keeps py-0.5 (only).
  if (inRegPlate && prefix === "py" && stop === "0.5") return null;

  const map: Record<typeof stop, string> = {
    "0.5": "1",
    "1.5": "2",
    "2.5": "3",
    "3.5": "4",
  };
  return `${prefix}-${map[stop]}`;
}

function codemodFile(file: string): Change[] {
  const rel = relative(ROOT, file);
  const inRegPlate = rel === REG_PLATE;
  const source = readFileSync(file, "utf8");
  const changes: Change[] = [];

  const lines = source.split("\n");
  const rewritten = lines.map((line, idx) => {
    return line.replace(OFF_GRID, (match, prefix: string, stop: string) => {
      const replacement = rewriteClass(
        prefix,
        stop as "0.5" | "1.5" | "2.5" | "3.5",
        inRegPlate,
      );
      if (replacement === null) return match; // allow-list hit
      changes.push({
        file: rel,
        from: match,
        to: replacement,
        line: idx + 1,
        context: line.trim().slice(0, 120),
      });
      return replacement;
    });
  });

  if (changes.length > 0) {
    writeFileSync(file, rewritten.join("\n"), "utf8");
  }
  return changes;
}

function main(): void {
  const files = listTsxFiles(SRC);
  const totals: Record<string, number> = {};
  let overall = 0;
  const fileCount = new Set<string>();

  for (const file of files) {
    const found = codemodFile(file);
    if (found.length === 0) continue;
    fileCount.add(found[0]!.file);
    overall += found.length;
    for (const c of found) {
      const key = `${c.from} → ${c.to}`;
      totals[key] = (totals[key] ?? 0) + 1;
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    overall === 0
      ? "✓ codemod: nothing to do — tree already on-grid."
      : `✓ codemod: rewrote ${overall} token${overall === 1 ? "" : "s"} across ${fileCount.size} file${fileCount.size === 1 ? "" : "s"}:`,
  );
  for (const [k, n] of Object.entries(totals).sort((a, b) => b[1] - a[1])) {
    // eslint-disable-next-line no-console
    console.log(`  ${n}× ${k}`);
  }
}

main();
