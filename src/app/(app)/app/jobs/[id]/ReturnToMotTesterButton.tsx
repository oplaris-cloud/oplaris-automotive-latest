"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { returnJobToMotTester } from "../passback/actions";

interface ReturnToMotTesterButtonProps {
  jobId: string;
  /** P52: lets the actions row render this as the filled primary CTA. */
  variant?: "default" | "outline";
}

export function ReturnToMotTesterButton({
  jobId,
  variant = "outline",
}: ReturnToMotTesterButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await returnJobToMotTester({ jobId });
      if (result.ok) router.refresh();
      else alert(result.error ?? "Failed to return job to MOT tester");
    });
  }

  return (
    <Button
      size="sm"
      variant={variant}
      onClick={handleClick}
      disabled={isPending}
      className="gap-1.5"
    >
      <ArrowLeftRight className="h-4 w-4" />
      {isPending ? "Returning…" : "Return to MOT tester"}
    </Button>
  );
}
