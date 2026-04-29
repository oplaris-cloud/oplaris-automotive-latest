/**
 * P3.3 — zod validation pinning for the completion-check answer payload.
 *
 * The DB-side RPC re-validates everything, but the client + server
 * actions both run the schema first to surface bad input loudly. These
 * tests pin the contract so a future schema tweak doesn't drift the
 * client and server out of sync.
 */
import { describe, expect, it } from "vitest";

import {
  checklistAnswersSchema,
  submitCompletionCheckSchema,
  setChecklistEnabledSchema,
  updateChecklistItemsSchema,
} from "@/lib/validation/checklist-schemas";

const validAnswers = [
  { question: "Have you returned the wheel locking nut?", answer: "yes" },
  { question: "Have you put your tools away?", answer: "no" },
];

describe("checklistAnswersSchema", () => {
  it("accepts a well-formed array of yes/no answers", () => {
    expect(checklistAnswersSchema.parse(validAnswers)).toEqual(validAnswers);
  });

  it("accepts 'n/a' for forward-compat with a future skip affordance", () => {
    expect(
      checklistAnswersSchema.parse([{ question: "q1", answer: "n/a" }]),
    ).toEqual([{ question: "q1", answer: "n/a" }]);
  });

  it("rejects entries missing the question field", () => {
    expect(
      checklistAnswersSchema.safeParse([{ answer: "yes" }]).success,
    ).toBe(false);
  });

  it("rejects entries with a non-yes/no/n/a answer", () => {
    expect(
      checklistAnswersSchema.safeParse([
        { question: "q1", answer: "maybe" },
      ]).success,
    ).toBe(false);
  });

  it("rejects entries with extra unknown fields (strict)", () => {
    expect(
      checklistAnswersSchema.safeParse([
        { question: "q1", answer: "yes", smuggled: "evil" },
      ]).success,
    ).toBe(false);
  });

  it("rejects an empty answer list", () => {
    expect(checklistAnswersSchema.safeParse([]).success).toBe(false);
  });
});

describe("submitCompletionCheckSchema", () => {
  it("requires a UUID jobId + non-empty answers list", () => {
    const validUuid = "123e4567-e89b-42d3-a456-426614174000";
    expect(
      submitCompletionCheckSchema.parse({
        jobId: validUuid,
        answers: validAnswers,
      }),
    ).toMatchObject({ jobId: validUuid });

    expect(
      submitCompletionCheckSchema.safeParse({
        jobId: "not-a-uuid",
        answers: validAnswers,
      }).success,
    ).toBe(false);
  });
});

describe("manager-side schemas", () => {
  it("setChecklistEnabledSchema: role must be mechanic|mot_tester, enabled must be bool", () => {
    expect(
      setChecklistEnabledSchema.parse({ role: "mechanic", enabled: true }),
    ).toEqual({ role: "mechanic", enabled: true });
    expect(
      setChecklistEnabledSchema.safeParse({ role: "manager", enabled: true })
        .success,
    ).toBe(false);
  });

  it("updateChecklistItemsSchema trims items + caps the list at 20", () => {
    const items = ["  Item one  ", "Item two"];
    const out = updateChecklistItemsSchema.parse({
      role: "mechanic",
      items,
    });
    expect(out.items).toEqual(["Item one", "Item two"]);

    const tooMany = Array.from({ length: 21 }).map((_, i) => `q${i}`);
    expect(
      updateChecklistItemsSchema.safeParse({ role: "mechanic", items: tooMany })
        .success,
    ).toBe(false);
  });
});
