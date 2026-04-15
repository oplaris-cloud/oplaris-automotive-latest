"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { resumeMotJob } from "../passback/actions";

interface ResumeMotButtonProps {
  jobId: string;
  /** P52: lets the actions row render this as the filled primary CTA. */
  variant?: "default" | "outline";
}

export function ResumeMotButton({ jobId, variant = "default" }: ResumeMotButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await resumeMotJob({ jobId });
      if (result.ok) router.refresh();
      else alert(result.error ?? "Failed to resume MOT");
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
      <Play className="h-4 w-4" /> {isPending ? "Resuming…" : "Resume MOT"}
    </Button>
  );
}
