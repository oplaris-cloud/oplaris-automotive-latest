"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormCard } from "@/components/ui/form-card";
import { FormActions } from "@/components/ui/form-actions";

import { updateBillingSettings } from "./actions";

export function BillingForm({
  initialRatePounds,
  initialDescription,
}: {
  initialRatePounds: number;
  initialDescription: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Controlled inputs — Base UI's FieldControl warns when an uncontrolled
  // input with `defaultValue` gets an initial value set after mount.
  // State-owned values avoid that.
  const [rate, setRate] = useState(String(initialRatePounds));
  const [description, setDescription] = useState(initialDescription);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    startTransition(async () => {
      const result = await updateBillingSettings({
        labourRatePounds: Number(rate),
        labourDefaultDescription: description,
      });
      if (!result.ok) {
        setError(result.error ?? "Failed to save");
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <FormCard variant="plain">
    <form onSubmit={handleSubmit}>
      <FormCard.Fields>
      <div>
        <Label htmlFor="labourRatePounds" required>
          Default labour rate (£ / hour)
        </Label>
        <Input
          id="labourRatePounds"
          name="labourRatePounds"
          type="number"
          step="0.01"
          min="0"
          required
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          className="mt-1"
        />
      </div>

      <div>
        <Label htmlFor="labourDefaultDescription" optional>
          Default description
        </Label>
        <Input
          id="labourDefaultDescription"
          name="labourDefaultDescription"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Workshop labour"
          className="mt-1"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Appears as the default description when you add a labour charge. Leave blank to auto-generate one from the work log.
        </p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {saved ? <p className="text-sm text-success">Saved.</p> : null}

      </FormCard.Fields>
      <FormActions>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
      </FormActions>
    </form>
    </FormCard>
  );
}
