"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

import { manuallyApproveRequest } from "../approvals/actions";
import { Button } from "@/components/ui/button";

export function ManualApproveButton({ approvalId }: { approvalId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!confirm) {
    return (
      <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setConfirm(true)}>
        <CheckCircle2 className="h-3.5 w-3.5" /> Mark Approved
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await manuallyApproveRequest({ approvalId });
            if (!result.ok) { setError(result.error ?? "Failed"); return; }
            router.refresh();
          });
        }}
      >
        {isPending ? "..." : "Confirm"}
      </Button>
      <Button size="sm" variant="outline" onClick={() => setConfirm(false)}>Cancel</Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
