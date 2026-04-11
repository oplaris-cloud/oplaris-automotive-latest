import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      exclude: [
        "**/*.config.*",
        "**/*.d.ts",
        ".next/**",
        "node_modules/**",
        "tests/**",
      ],
    },
    projects: [
      {
        plugins: [react()],
        resolve: {
          alias: {
            "@": resolve(__dirname, "./src"),
            // `server-only` throws on import from a Client Component — that
            // guard makes sense at build time, but during tests we want to
            // exercise server modules directly.
            "server-only": resolve(__dirname, "./tests/unit/server-only-shim.ts"),
          },
        },
        test: {
          name: "unit",
          environment: "jsdom",
          globals: true,
          include: ["tests/unit/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
          setupFiles: ["tests/unit/setup.ts"],
        },
      },
      {
        plugins: [react()],
        resolve: {
          alias: { "@": resolve(__dirname, "./src") },
        },
        test: {
          name: "rls",
          // Talks to a real Postgres; don't spin up jsdom.
          environment: "node",
          globals: true,
          include: ["tests/rls/**/*.test.ts"],
          // RLS tests share fixtures across files via setup/teardown,
          // so they must run sequentially within a single worker.
          fileParallelism: false,
          testTimeout: 15_000,
        },
      },
    ],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
