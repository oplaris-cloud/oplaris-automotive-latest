"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
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
  const [error, setError] = useState<string | null>(null);
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
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const payload = PASSBACK_ITEMS.filter((def) => items[def.value]!.checked).map(
      (def) => {
        const detail = items[def.value]!.detail.trim();
        if (def.requiresDetail && !detail) {
          return { item: def.value, detail: "" };
        }
        return detail ? { item: def.value, detail } : { item: def.value };
      },
    );

    const missingDetail = PASSBACK_ITEMS.some(
      (def) =>
        def.requiresDetail &&
        items[def.value]!.checked &&
        !items[def.value]!.detail.trim(),
    );
    if (missingDetail) {
      setError("Detail is required for Light bulb and Other.");
      return;
    }

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
        render={<Button size="sm" variant={variant} className="gap-1.5" />}
      >
        <ArrowRightLeft className="h-4 w-4" /> Pass to mechanic
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
          <div className="grid grid-cols-2 gap-2">
            {PASSBACK_ITEMS.map((def) => {
              const state = items[def.value]!;
              return (
                <div key={def.value} className="space-y-1">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={state.checked}
                      onChange={() => toggle(def.value)}
                    />
                    {def.label}
                  </label>
                  {def.requiresDetail && state.checked ? (
                    <Input
                      value={state.detail}
                      onChange={(e) => setDetail(def.value, e.target.value)}
                      placeholder={
                        def.value === "light_bulb" ? "Which bulb?" : "Describe"
                      }
                      aria-label={`${def.label} detail`}
                    />
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
              {isPending ? "Passing…" : "Pass to Mechanic"}
            </Button>
          </FormActions>
        </form>
        </FormCard>
      </DialogContent>
    </Dialog>
  );
}
