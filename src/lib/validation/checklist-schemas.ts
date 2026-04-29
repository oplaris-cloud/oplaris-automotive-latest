// P3.3 — Shared zod schemas for the end-of-job completion checklist.
//
// The DB-side `submit_completion_check` RPC already validates the
// shape; these schemas mirror it so the client + server actions can
// reject bad input before we burn a round-trip.

import { z } from "zod";

export const CHECKLIST_ROLES = ["mechanic", "mot_tester"] as const;
export type ChecklistRole = (typeof CHECKLIST_ROLES)[number];

/** A single item in the manager-edited list of questions. Trimmed so a
 *  pasted-in entry with surrounding whitespace doesn't drift between
 *  the editor and the dialog. */
export const checklistItemSchema = z
  .string()
  .trim()
  .min(1, "Question text required")
  .max(200, "Keep questions short — under 200 characters");

export const checklistItemsSchema = z
  .array(checklistItemSchema)
  .max(20, "20 items is enough — split the list across roles if you need more");

/** Manager actions on the settings page. */
export const setChecklistEnabledSchema = z.object({
  role: z.enum(CHECKLIST_ROLES),
  enabled: z.boolean(),
});

export const updateChecklistItemsSchema = z.object({
  role: z.enum(CHECKLIST_ROLES),
  items: checklistItemsSchema,
});

/** Tech's submitted answer for one question. The UI surfaces yes / no
 *  in v1; "n/a" is accepted now so a future "skip" affordance won't
 *  need a schema bump. */
export const ANSWER_VALUES = ["yes", "no", "n/a"] as const;
export type AnswerValue = (typeof ANSWER_VALUES)[number];

export const checklistAnswerSchema = z
  .object({
    question: z.string().min(1).max(200),
    answer: z.enum(ANSWER_VALUES),
  })
  .strict();

export const checklistAnswersSchema = z
  .array(checklistAnswerSchema)
  .min(1, "Provide at least one answer")
  .max(20, "Too many answers");

export const submitCompletionCheckSchema = z.object({
  jobId: z.string().uuid(),
  answers: checklistAnswersSchema,
});

export type ChecklistAnswer = z.infer<typeof checklistAnswerSchema>;
export type ChecklistAnswers = z.infer<typeof checklistAnswersSchema>;
