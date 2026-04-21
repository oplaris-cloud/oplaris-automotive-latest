"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormCard } from "@/components/ui/form-card";
import { FormActions } from "@/components/ui/form-actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PASSBACK_ITEMS } from "@/lib/constants/passback-items";
import { passJobToMechanic } from "../passback/actions";

interface PassbackDialogProps {
  jobId: string;
  /** P52: lets the actions row promote this to the filled primary CTA. */
  variant?: "default" | "outline";
}

interface Ticked {
  [value: string]: { checked: boolean; detail: string };
}

function initial(): Ticked {
  return Object.fromEntries(
    PASSBACK_ITEMS.map((i) => [i.value, { checked: false, detail: "" }]),
  );
}

export function PassbackDialog({ jobId, variant = "outline" }: PassbackDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Ticked>(initial);
  const [note, setNote] = useState("");
  // Server-side error surface only (network / RPC reject). Per-field
  // detail-required errors are inline via `attempted` + the field's
  // `<p role="alert">`.
  const [error, setError] = useState<string | null>(null);
  // Audit F11 — `attempted` flips to true on the first submit click.
  // Until then, the dialog stays "clean" — no red errors greet the
  // user before they've tried to submit. Reset to false when the
  // dialog closes (see `onOpenChange`).
  const [attempted, setAttempted] = useState(false);
  const [isPending, startTransition] = useTransition();

  const tickedValues = Object.entries(items)
    .filter(([, v]) => v.checked)
    .map(([k]) => k);
  const canSubmit = tickedValues.length > 0 && !isPending;

  function toggle(value: string) {
    setItems((prev) => ({
      ...prev,
      [value]: { ...prev[value]!, checked: !prev[value]!.checked },
    }));
  }

  function setDetail(value: string, detail: string) {
    setItems((prev) => ({ ...prev, [value]: { ...prev[value]!, detail } }));
  }

  function reset() {
    setItems(initial());
    setNote("");
    setError(null);
    setAttempted(false);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setAttempted(true);

    const missingDetail = PASSBACK_ITEMS.some(
      (def) =>
        def.requiresDetail &&
        items[def.value]!.checked &&
        !items[def.value]!.detail.trim(),
    );
    if (missingDetail) {
      // Per-field inline errors are now driven by `attempted` — we
      // intentionally do NOT setError() at the dialog level for this
      // case. The user sees red exactly where the missing detail is.
      return;
    }

    const payload = PASSBACK_ITEMS.filter((def) => items[def.value]!.checked).map(
      (def) => {
        const detail = items[def.value]!.detail.trim();
        return detail ? { item: def.value, detail } : { item: def.value };
      },
    );

    startTransition(async () => {
      const result = await passJobToMechanic({
        jobId,
        items: payload,
        note: note.trim() || undefined,
      });
      if (!result.ok) {
        setError(result.error ?? "Failed to pass job to mechanic");
        return;
      }
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger
        render={<Button size="lg" variant={variant} />}
      >
        <ArrowRightLeft className="h-5 w-5" /> Pass to mechanic
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>What needs mechanic attention?</DialogTitle>
          <DialogDescription>
            The MOT pauses; the mechanic queue picks this up at high priority.
          </DialogDescription>
        </DialogHeader>

        <FormCard variant="plain">
        <form onSubmit={handleSubmit}>
          <FormCard.Fields>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {PASSBACK_ITEMS.map((def) => {
              const state = items[def.value]!;
              const detailId = `pb-detail-${def.value}`;
              const errorId = `pb-error-${def.value}`;
              const hasDetailError =
                def.requiresDetail &&
                state.checked &&
                !state.detail.trim() &&
                attempted;
              return (
                <div key={def.value} className="space-y-2">
                  <label className="flex min-h-11 cursor-pointer items-center gap-3">
                    <Checkbox
                      checked={state.checked}
                      onCheckedChange={() => toggle(def.value)}
                      className="h-5 w-5"
                    />
                    <span className="text-sm">{def.label}</span>
                  </label>
                  {def.requiresDetail && state.checked ? (
                    <>
                      <Input
                        id={detailId}
                        value={state.detail}
                        onChange={(e) => setDetail(def.value, e.target.value)}
                        placeholder={
                          def.value === "light_bulb"
                            ? "Which bulb?"
                            : "Describe the issue"
                        }
                        aria-label={`${def.label} detail`}
                        aria-invalid={hasDetailError}
                        aria-describedby={hasDetailError ? errorId : undefined}
                      />
                      {hasDetailError ? (
                        <p
                          id={errorId}
                          role="alert"
                          className="text-xs text-destructive"
                        >
                          Detail is required.
                        </p>
                      ) : null}
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="space-y-1">
            <Label htmlFor="passback-note">Note to mechanic (optional)</Label>
            <Textarea
              id="passback-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. strange rattle from the front left on sharp turns"
              rows={3}
            />
          </div>

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          </FormCard.Fields>
          <FormActions>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {isPending ? "Passing…" : "Pass to mechanic"}
            </Button>
          </FormActions>
        </form>
        </FormCard>
      </DialogContent>
    </Dialog>
  );
}
