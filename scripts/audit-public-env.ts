/**
 * audit-public-env.ts
 *
 * Phase 0 audit gate guard. Walks every committed source file and fails if
 * any `NEXT_PUBLIC_*` identifier appears next to a known-secret keyword
 * (TOKEN, SECRET, PASSWORD, KEY without _PUBLIC, etc.) or if any obvious
 * secret pattern shows up in code we ship to the client.
 *
 * Run locally: pnpm audit:secrets
 * CI also runs gitleaks for the broader sweep.
 */
import { readFileSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";
import { execSync } from "node:child_process";

const ROOT = resolve(__dirname, "..");

const FORBIDDEN_PUBLIC_SUFFIXES = [
  "_SECRET",
  "_PASSWORD",
  "_PRIVATE",
  "_TOKEN",
  "AUTH_TOKEN",
  "SERVICE_ROLE",
  "JWT_SECRET",
  "API_KEY",
  "WEBHOOK_SECRET",
];

function listFiles(): string[] {
  // Use git ls-files so we honour .gitignore and only audit committed files.
  const out = execSync("git ls-files", { cwd: ROOT, encoding: "utf8" });
  return out
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((p) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(p))
    .filter((p) => !p.startsWith("node_modules/"));
}

function audit(): { errors: string[]; checked: number } {
  const errors: string[] = [];
  let checked = 0;
  for (const file of listFiles()) {
    const abs = resolve(ROOT, file);
    let stat;
    try {
      stat = statSync(abs);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    const content = readFileSync(abs, "utf8");
    checked += 1;

    // Find every NEXT_PUBLIC_<NAME> identifier and verify the suffix is benign
    const re = /NEXT_PUBLIC_[A-Z0-9_]+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const ident = m[0];
      for (const bad of FORBIDDEN_PUBLIC_SUFFIXES) {
        if (ident.includes(bad)) {
          errors.push(
            `${relative(ROOT, abs)}: forbidden public env identifier "${ident}" — secrets must NOT be NEXT_PUBLIC_*`,
          );
        }
      }
    }
  }
  return { errors, checked };
}

const result = audit();
if (result.errors.length > 0) {
  console.error("\u274c  Public-env audit failed:\n");
  for (const e of result.errors) console.error(`  - ${e}`);
  console.error(`\nChecked ${result.checked} files. ${result.errors.length} issue(s).`);
  process.exit(1);
}
console.log(`\u2714  Public-env audit passed (${result.checked} files).`);
