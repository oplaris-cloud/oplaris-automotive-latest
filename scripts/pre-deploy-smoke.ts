/**
 * Pre-deploy smoke orchestrator (Phase 4).
 *
 * Runs the deterministic subset of TEST_AUDIT_PROMPT.md — everything
 * that can prove "the tree is safe to deploy" without a running app
 * or a browser. Called locally before a manual cutover and as the
 * reference for what `pnpm pre-deploy` means.
 *
 * Stops on the first red. Emits a single-line summary per step and a
 * final block with timings + the failing step (if any). The printed
 * failure pointer is the hand-off to whoever runs the command — it
 * says exactly which sub-command to re-run to reproduce.
 *
 * Expected warm-cache runtime: < 2 min on a recent laptop.
 */

import { spawn } from "node:child_process";

type Step = {
  name: string;
  command: string;
  /** Short hint shown in the failure summary. */
  hint: string;
};

const steps: Step[] = [
  {
    name: "typecheck",
    command: "pnpm typecheck",
    hint: "`pnpm typecheck` — TS errors block every downstream step",
  },
  {
    name: "lint",
    command: "pnpm lint",
    hint: "`pnpm lint` — ESLint + spacing-token gate",
  },
  {
    name: "test:unit",
    command: "pnpm test:unit",
    hint: "`pnpm test:unit` — Vitest unit suite",
  },
  {
    name: "test:rls",
    command: "pnpm test:rls",
    hint:
      "`pnpm test:rls` — Vitest RLS suite; needs local Supabase " +
      "(`npx supabase status` should show running services)",
  },
  {
    name: "audit:secrets",
    command: "pnpm audit:secrets",
    hint: "`pnpm audit:secrets` — NEXT_PUBLIC_* leak scan (Rule #5)",
  },
  {
    name: "format:check",
    command: "pnpm format:check",
    hint: "`pnpm format:check` — run `pnpm format` to auto-fix",
  },
];

type Result = {
  name: string;
  command: string;
  ok: boolean;
  ms: number;
};

function runStep(step: Step): Promise<Result> {
  const started = Date.now();
  return new Promise((resolve) => {
    // shell:true so `pnpm ...` resolves via the user's PATH the same
    // way it would in a terminal.
    const child = spawn(step.command, {
      shell: true,
      stdio: "inherit",
    });
    child.on("close", (code) => {
      resolve({
        name: step.name,
        command: step.command,
        ok: code === 0,
        ms: Date.now() - started,
      });
    });
  });
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = (ms / 1000).toFixed(1);
  return `${s}s`;
}

async function main(): Promise<number> {
  const startedAll = Date.now();
  const results: Result[] = [];

  process.stderr.write("\n▸ pre-deploy smoke starting\n");
  process.stderr.write("  Runs: " + steps.map((s) => s.name).join(" → ") + "\n\n");

  for (const step of steps) {
    process.stderr.write(`▸ ${step.name} (${step.command})\n`);
    const result = await runStep(step);
    results.push(result);
    if (!result.ok) {
      const totalMs = Date.now() - startedAll;
      process.stderr.write("\n");
      process.stderr.write("✖ pre-deploy smoke FAILED\n");
      process.stderr.write(`  Failing step: ${step.name} (${formatMs(result.ms)})\n`);
      process.stderr.write(`  Reproduce:    ${step.hint}\n`);
      process.stderr.write(`  Total elapsed: ${formatMs(totalMs)}\n`);
      return 1;
    }
  }

  const totalMs = Date.now() - startedAll;
  process.stderr.write("\n✓ pre-deploy smoke passed\n");
  for (const r of results) {
    process.stderr.write(`  ${r.name.padEnd(14)} ${formatMs(r.ms).padStart(8)}\n`);
  }
  process.stderr.write(`  ${"total".padEnd(14)} ${formatMs(totalMs).padStart(8)}\n`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error("pre-deploy-smoke crashed:", err);
    process.exit(1);
  },
);
