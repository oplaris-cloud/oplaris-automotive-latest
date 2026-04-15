"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { claimPassback } from "./claim-actions";

interface ClaimPassbackButtonProps {
  jobId: string;
  className?: string;
}

export function ClaimPassbackButton({
  jobId,
  className,
}: ClaimPassbackButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      const result = await claimPassback({ jobId });
      if (result.ok) {
        router.push(`/app/tech/job/${jobId}`);
        router.refresh();
      } else {
        alert(result.error ?? "Failed to claim job");
      }
    });
  }

  return (
    <Button
      size="sm"
      onClick={handleClick}
      disabled={isPending}
      className={className}
    >
      <ArrowRightLeft className="h-4 w-4" />
      {isPending ? "Claiming…" : "Claim"}
    </Button>
  );
}
