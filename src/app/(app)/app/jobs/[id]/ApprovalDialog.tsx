"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare } from "lucide-react";

import { requestApproval } from "../approvals/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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
    <form onSubmit={handleSubmit} className="rounded-lg border p-4 space-y-4">
      <h3 className="text-sm font-semibold">Request Customer Approval</h3>

      <div>
        <Label htmlFor="approval-desc">Description of additional work</Label>
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
        <Label htmlFor="approval-amount">Amount (£)</Label>
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
        <p className="text-sm text-green-600">
          Approval request sent via SMS.
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Sending..." : "Send SMS to Customer"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
