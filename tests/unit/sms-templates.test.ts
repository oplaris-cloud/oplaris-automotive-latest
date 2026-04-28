/**
 * P2.3 — pure functions inside src/lib/sms/templates.ts. The DB-aware
 * `renderTemplate` helper isn't tested here (it'd need a Supabase round-
 * trip; the RLS suite handles the policy side). substitute and
 * previewSegments are pure → unit-testable in isolation.
 */
import { describe, expect, it } from "vitest";

import {
  FALLBACK_BODIES,
  SAMPLE_VARS,
  TEMPLATE_KEYS,
  TEMPLATE_VARS,
  previewSegments,
  substitute,
  type TemplateKey,
} from "@/lib/sms/templates";

describe("substitute", () => {
  it("replaces every {{var}} occurrence", () => {
    const out = substitute(
      "Hello {{name}}, your code is {{code}}.",
      { name: "Hossein", code: "482917" },
    );
    expect(out).toBe("Hello Hossein, your code is 482917.");
  });

  it("tolerates whitespace inside the placeholder braces", () => {
    expect(substitute("Hello {{ name }}", { name: "Hossein" })).toBe(
      "Hello Hossein",
    );
  });

  it("leaves unknown variables as the literal placeholder", () => {
    // Better than silently sending "Hello " with a missing name.
    expect(substitute("Hello {{name}}", {})).toBe("Hello {{name}}");
  });

  it("treats undefined values the same as missing keys", () => {
    expect(substitute("Hello {{name}}", { name: undefined })).toBe(
      "Hello {{name}}",
    );
  });

  it("replaces every match, not just the first", () => {
    expect(
      substitute("{{x}} and {{x}} and {{x}}", { x: "Y" }),
    ).toBe("Y and Y and Y");
  });
});

describe("previewSegments", () => {
  it("returns a single text segment when there are no variables", () => {
    const out = previewSegments("Plain message", {});
    expect(out).toEqual([{ type: "text", value: "Plain message" }]);
  });

  it("classifies filled vs unfilled placeholders distinctly", () => {
    const out = previewSegments("Code: {{code}}, Name: {{name}}", {
      code: "482917",
    });
    expect(out).toEqual([
      { type: "text", value: "Code: " },
      { type: "filled", value: "482917", varName: "code" },
      { type: "text", value: ", Name: " },
      { type: "unfilled", value: "[name]", varName: "name" },
    ]);
  });

  it("preserves order across consecutive placeholders", () => {
    const out = previewSegments("{{a}}{{b}}{{c}}", { a: "1", c: "3" });
    expect(out.map((s) => `${s.type}:${s.value}`)).toEqual([
      "filled:1",
      "unfilled:[b]",
      "filled:3",
    ]);
  });

  it("handles trailing text after the last variable", () => {
    const out = previewSegments("Hello {{name}}!", { name: "World" });
    expect(out).toEqual([
      { type: "text", value: "Hello " },
      { type: "filled", value: "World", varName: "name" },
      { type: "text", value: "!" },
    ]);
  });
});

describe("template schema invariants (P2.3 followup)", () => {
  // Migration 057 added quote_sent / quote_updated / invoice_sent to
  // both the DB CHECK constraint and the schema. These tests catch the
  // common drift modes: a key listed in TEMPLATE_KEYS but missing from
  // TEMPLATE_VARS, or a fallback body that references a variable the
  // schema doesn't declare. Either of those would silently send a
  // half-rendered SMS.

  const newKeys: readonly TemplateKey[] = [
    "quote_sent",
    "quote_updated",
    "invoice_sent",
  ];

  function placeholdersIn(body: string): Set<string> {
    const out = new Set<string>();
    for (const m of body.matchAll(/\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi)) {
      if (m[1]) out.add(m[1]);
    }
    return out;
  }

  it.each(newKeys)("%s is registered in TEMPLATE_KEYS", (key) => {
    expect(TEMPLATE_KEYS).toContain(key);
  });

  it.each(newKeys)("%s declares variables in TEMPLATE_VARS", (key) => {
    expect(TEMPLATE_VARS[key]?.length ?? 0).toBeGreaterThan(0);
  });

  it.each(newKeys)(
    "%s fallback body's placeholders match TEMPLATE_VARS exactly",
    (key) => {
      const declared = new Set(TEMPLATE_VARS[key]);
      const used = placeholdersIn(FALLBACK_BODIES[key]);
      expect(Array.from(used).sort()).toEqual(Array.from(declared).sort());
    },
  );

  it.each(newKeys)(
    "%s SAMPLE_VARS covers every declared variable",
    (key) => {
      const declared = TEMPLATE_VARS[key];
      const sample = SAMPLE_VARS[key];
      for (const v of declared) {
        expect(sample[v]).toBeDefined();
      }
    },
  );

  it("quote_updated references the revision variable, quote_sent does not", () => {
    expect(TEMPLATE_VARS.quote_updated).toContain("revision");
    expect(TEMPLATE_VARS.quote_sent).not.toContain("revision");
  });

  it("substituting SAMPLE_VARS into FALLBACK_BODIES leaves no placeholders", () => {
    for (const key of newKeys) {
      const out = substitute(FALLBACK_BODIES[key], SAMPLE_VARS[key]);
      expect(out, `template ${key} still has placeholders: ${out}`).not.toMatch(
        /\{\{[^}]+\}\}/,
      );
    }
  });
});
