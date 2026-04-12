"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { XCircle } from "lucide-react";

import { voidWarranty } from "../jobs/warranties/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function VoidWarrantyButton({ warrantyId }: { warrantyId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="gap-1 text-destructive hover:bg-destructive/10"
        onClick={() => setOpen(true)}
      >
        <XCircle className="h-3.5 w-3.5" /> Void
      </Button>
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const reason = (form.get("reason") as string) ?? "";
    if (!reason.trim()) {
      setError("Reason is required");
      return;
    }

    startTransition(async () => {
      const result = await voidWarranty({ warrantyId, reason: reason.trim() });
      if (!result.ok) {
        setError(result.error ?? "Failed to void warranty");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 space-y-2 rounded border border-destructive/20 bg-destructive/5 p-3">
      <Label htmlFor={`void-${warrantyId}`} className="text-sm">Reason for voiding</Label>
      <Textarea id={`void-${warrantyId}`} name="reason" required rows={2} placeholder="e.g. Customer misuse" className="text-sm" />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="destructive" disabled={isPending}>
          {isPending ? "Voiding..." : "Confirm Void"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
