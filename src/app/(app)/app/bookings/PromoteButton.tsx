"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { promoteBookingToJob } from "./actions";
import { Button } from "@/components/ui/button";

export function PromoteButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handlePromote = () => {
    setError(null);
    startTransition(async () => {
      const result = await promoteBookingToJob({ bookingId });
      if (!result.ok) {
        setError(result.error ?? "Failed to create job");
        return;
      }
      router.push(`/app/jobs/${result.id}`);
    });
  };

  return (
    <div>
      <Button size="sm" onClick={handlePromote} disabled={isPending} className="gap-1.5">
        <Plus className="h-4 w-4" />
        {isPending ? "Creating..." : "Create Job"}
      </Button>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
