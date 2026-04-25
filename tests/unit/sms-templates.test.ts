/**
 * P2.3 — pure functions inside src/lib/sms/templates.ts. The DB-aware
 * `renderTemplate` helper isn't tested here (it'd need a Supabase round-
 * trip; the RLS suite handles the policy side). substitute and
 * previewSegments are pure → unit-testable in isolation.
 */
import { describe, expect, it } from "vitest";

import {
  previewSegments,
  substitute,
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
