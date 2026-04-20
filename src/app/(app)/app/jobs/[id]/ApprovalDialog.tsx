"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare } from "lucide-react";

import { requestApproval } from "../approvals/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormCard } from "@/components/ui/form-card";
import { FormActions } from "@/components/ui/form-actions";

interface ApprovalDialogProps {
  jobId: string;
}

export function ApprovalDialog({ jobId }: ApprovalDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!open) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5"
        onClick={() => { setOpen(true); setSuccess(false); setError(null); }}
      >
        <MessageSquare className="h-4 w-4" /> Request Customer Approval
      </Button>
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const form = new FormData(e.currentTarget);
    const description = (form.get("description") as string) ?? "";
    const amountStr = (form.get("amount") as string) ?? "0";
    const amountPence = Math.round(parseFloat(amountStr) * 100);

    if (!description.trim()) {
      setError("Description is required");
      return;
    }

    startTransition(async () => {
      const result = await requestApproval({
        jobId,
        description: description.trim(),
        amountPence,
      });
      if (!result.ok) {
        setError(result.error ?? "Failed to send approval request");
        return;
      }
      setSuccess(true);
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border p-4">
    <FormCard variant="plain">
    <form onSubmit={handleSubmit}>
      <h3 className="mb-4 text-sm font-semibold">Request Customer Approval</h3>

      <FormCard.Fields>
      <div>
        <Label htmlFor="approval-desc" required>Description of additional work</Label>
        <Textarea
          id="approval-desc"
          name="description"
          required
          rows={3}
          placeholder="e.g. Replace front brake pads and discs"
          className="mt-1"
        />
      </div>

      <div>
        <Label htmlFor="approval-amount" required>Amount (£)</Label>
        <Input
          id="approval-amount"
          name="amount"
          type="number"
          step="0.01"
          min="0"
          required
          placeholder="150.00"
          className="mt-1"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && (
        <p className="text-sm text-success">
          Approval request sent via SMS.
        </p>
      )}

      </FormCard.Fields>
      <FormActions>
        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Sending..." : "Send SMS to Customer"}
        </Button>
      </FormActions>
    </form>
    </FormCard>
    </div>
  );
}
