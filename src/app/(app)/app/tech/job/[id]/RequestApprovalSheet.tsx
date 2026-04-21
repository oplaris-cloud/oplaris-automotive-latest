"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare } from "lucide-react";

import { requestApproval } from "../../../jobs/approvals/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormCard } from "@/components/ui/form-card";
import { FormActions } from "@/components/ui/form-actions";
import { toast } from "@/lib/toast";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function RequestApprovalSheet({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const isMobile = useMediaQuery("(max-width: 639px)");
  const side = isMobile ? "bottom" : "right";

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = new FormData(e.currentTarget);
    const description = ((form.get("description") as string) ?? "").trim();
    const amountStr = (form.get("amount") as string) ?? "0";
    const amountPence = Math.round(Number.parseFloat(amountStr) * 100);

    if (!description) {
      setError("Description is required");
      return;
    }
    if (!Number.isFinite(amountPence) || amountPence < 0) {
      setError("Enter a valid amount");
      return;
    }

    startTransition(async () => {
      const result = await requestApproval({
        jobId,
        description,
        amountPence,
      });
      if (result.ok) {
        toast.success("Approval SMS sent to customer");
        formRef.current?.reset();
        setOpen(false);
        router.refresh();
      } else {
        setError(result.error ?? "Failed to send approval request");
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            size="lg"
            variant="outline"
            className="h-auto min-h-11 flex-col gap-1 text-xs sm:text-sm"
          />
        }
      >
        <MessageSquare className="h-5 w-5" />
        Request approval
      </SheetTrigger>
      <SheetContent
        side={side}
        className="flex flex-col gap-0 p-0 sm:max-w-lg"
      >
        <SheetHeader className="border-b">
          <SheetTitle>Request customer approval</SheetTitle>
          <SheetDescription>
            Send a signed SMS link. The customer taps to approve the extra work.
          </SheetDescription>
        </SheetHeader>
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-4"
        >
          <FormCard>
            <div className="space-y-2">
              <Label htmlFor="approval-desc">
                What needs approval? <span aria-hidden>*</span>
              </Label>
              <Textarea
                id="approval-desc"
                name="description"
                required
                rows={4}
                placeholder="e.g. Brake discs need replacing alongside the pads"
                aria-invalid={!!error && error.includes("Description")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="approval-amount">
                Amount (£) <span aria-hidden>*</span>
              </Label>
              <Input
                id="approval-amount"
                name="amount"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                required
                placeholder="180.00"
                aria-invalid={!!error && error.includes("amount")}
              />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </FormCard>
          <FormActions>
            <Button type="submit" size="lg" disabled={isPending}>
              {isPending ? "Sending…" : "Send SMS"}
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
          </FormActions>
        </form>
      </SheetContent>
    </Sheet>
  );
}
