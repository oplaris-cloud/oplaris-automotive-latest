"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { updateJobStatus } from "../actions";
import { STATUS_TRANSITIONS, type JobStatus } from "@/lib/validation/job-schemas";
import { Button } from "@/components/ui/button";

const STATUS_LABELS: Record<JobStatus, string> = {
  draft: "Draft",
  booked: "Booked",
  in_diagnosis: "Start Diagnosis",
  in_repair: "Start Repair",
  awaiting_parts: "Awaiting Parts",
  awaiting_customer_approval: "Request Approval",
  ready_for_collection: "Ready for Collection",
  completed: "Complete",
  cancelled: "Cancel",
};

interface StatusActionsProps {
  jobId: string;
  currentStatus: JobStatus;
}

export function StatusActions({ jobId, currentStatus }: StatusActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<JobStatus | null>(null);

  const validNext = STATUS_TRANSITIONS[currentStatus] ?? [];
  if (validNext.length === 0) return null;

  const needsConfirm = (status: JobStatus) =>
    status === "cancelled" || status === "completed";

  const doTransition = (status: JobStatus) => {
    setError(null);
    setConfirmTarget(null);
    startTransition(async () => {
      const result = await updateJobStatus({ jobId, status });
      if (!result.ok) {
        setError(result.error ?? "Failed to update status");
        return;
      }
      router.refresh();
    });
  };

  const handleClick = (status: JobStatus) => {
    if (needsConfirm(status)) {
      setConfirmTarget(status);
    } else {
      doTransition(status);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {validNext.map((status) => {
          const isDestructive = status === "cancelled";
          return (
            <Button
              key={status}
              size="sm"
              variant={isDestructive ? "destructive" : status === "completed" ? "default" : "outline"}
              onClick={() => handleClick(status)}
              disabled={isPending}
            >
              {STATUS_LABELS[status]}
            </Button>
          );
        })}
      </div>

      {/* Confirmation dialog */}
      {confirmTarget && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
          <p className="text-sm font-medium">
            Are you sure you want to {confirmTarget === "cancelled" ? "cancel" : "complete"} this job?
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant={confirmTarget === "cancelled" ? "destructive" : "default"}
              onClick={() => doTransition(confirmTarget)}
              disabled={isPending}
            >
              {isPending ? "Updating..." : `Yes, ${confirmTarget === "cancelled" ? "cancel" : "complete"}`}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmTarget(null)}
            >
              No, go back
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
