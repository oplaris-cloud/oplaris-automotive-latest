"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  type AnswerValue,
  type ChecklistAnswer,
} from "@/lib/validation/checklist-schemas";

import { submitCompletionCheck } from "../../../jobs/completion/actions";

// P3.3 — Blocking end-of-job checklist modal.
//
// ux-audit reference applied:
//   * forms-and-data-entry: every question rendered with a visible
//     fieldset, segmented Yes/No control, error states inline.
//   * accessibility: 44px+ touch targets on every answer button (gloves
//     usable, WCAG 2.5.5), aria-pressed signalling selection state,
//     dialog dismiss disabled so techs can't skip.
//   * responsive-and-mobile: stacks on small viewports; primary submit
//     pinned to the bottom of the dialog footer where the thumb is.

interface ChecklistDialogProps {
  jobId: string;
  role: "mechanic" | "mot_tester";
  items: string[];
  open: boolean;
  /** Closes the dialog (Cancel button or post-submit chain). The parent
   *  is responsible for keeping the work session running on cancel. */
  onCancel: () => void;
  /** Fires after a successful submission, before the parent runs the
   *  actual `completeWork()` chain. */
  onSubmitted: () => void;
}

export function ChecklistDialog({
  jobId,
  role,
  items,
  open,
  onCancel,
  onSubmitted,
}: ChecklistDialogProps) {
  const [answers, setAnswers] = useState<(AnswerValue | null)[]>(
    () => items.map(() => null),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const allAnswered = answers.every((a) => a !== null);

  const setAnswer = (idx: number, value: AnswerValue) => {
    setAnswers((prev) => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
  };

  const handleSubmit = () => {
    if (!allAnswered) return;
    setError(null);
    const payload: ChecklistAnswer[] = items.map((q, i) => ({
      question: q,
      answer: answers[i] as AnswerValue,
    }));
    startTransition(async () => {
      const result = await submitCompletionCheck({
        jobId,
        answers: payload,
      });
      if (!result.ok) {
        setError(result.error ?? "Couldn't submit — try again");
        return;
      }
      onSubmitted();
    });
  };

  return (
    <Dialog
      open={open}
      // Controlled open state owned by the parent. Escape / focus
      // shifts call this with `next=false` but we ignore them — only
      // the Cancel / Submit buttons close the dialog. Combined with
      // `disablePointerDismissal` this gives the spec's "blocking,
      // dismiss-disabled" guarantee.
      onOpenChange={() => {}}
      disablePointerDismissal
    >
      <DialogContent className="max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Before you complete this job</DialogTitle>
          <DialogDescription>
            Answer each question to confirm the bay is clean and tools are
            put away. {role === "mot_tester" ? "MOT testers" : "Mechanics"}{" "}
            in this garage do this every job.
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-4">
          {items.map((q, idx) => {
            const value = answers[idx];
            return (
              <li key={`${idx}-${q}`}>
                <fieldset>
                  <legend className="text-sm font-medium leading-snug">
                    {idx + 1}. {q}
                  </legend>
                  <div
                    role="radiogroup"
                    aria-label={`Answer for question ${idx + 1}`}
                    className="mt-2 flex gap-2"
                  >
                    <AnswerButton
                      label="Yes"
                      active={value === "yes"}
                      onClick={() => setAnswer(idx, "yes")}
                      disabled={isPending}
                    />
                    <AnswerButton
                      label="No"
                      active={value === "no"}
                      onClick={() => setAnswer(idx, "no")}
                      disabled={isPending}
                      destructive
                    />
                  </div>
                </fieldset>
              </li>
            );
          })}
        </ol>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="-mx-4 -mb-4 flex flex-col gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row-reverse sm:justify-start">
          <Button
            type="button"
            size="xl"
            onClick={handleSubmit}
            disabled={!allAnswered || isPending}
            className="w-full sm:w-auto"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Submitting…
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                Submit &amp; Complete
              </>
            )}
          </Button>
          <Button
            type="button"
            size="xl"
            variant="outline"
            onClick={onCancel}
            disabled={isPending}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AnswerButton({
  label,
  active,
  onClick,
  disabled,
  destructive,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  disabled: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      disabled={disabled}
      // 44px minimum height (WCAG 2.5.5) — phone-primary, gloves usable.
      // Filled style on selection draws the eye to what's still missing.
      className={cn(
        "flex h-12 flex-1 items-center justify-center rounded-lg border-2 px-4 text-base font-semibold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        active
          ? destructive
            ? "border-destructive bg-destructive text-destructive-foreground"
            : "border-success bg-success text-success-foreground"
          : "border-border bg-background hover:bg-muted",
      )}
    >
      {label}
    </button>
  );
}
