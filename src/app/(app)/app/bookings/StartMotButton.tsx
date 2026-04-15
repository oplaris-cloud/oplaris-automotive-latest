"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { startMotFromCheckIn } from "./actions";

export function StartMotButton({
  bookingId,
  className,
}: {
  bookingId: string;
  /**
   * Optional override — callers pass `getCategoryStyles(...).button` so the
   * button picks up the row's category colour (MOT = info-blue by default,
   * amber when the row is urgent).
   */
  className?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await startMotFromCheckIn(bookingId);
      if (result.ok && result.id) {
        router.push(`/app/jobs/${result.id}`);
      } else {
        alert(result.error ?? "Failed to start MOT");
      }
    });
  }

  return (
    <Button
      size="sm"
      onClick={handleClick}
      disabled={isPending}
      className={cn("gap-1.5", className)}
    >
      <Play className="h-3.5 w-3.5" /> {isPending ? "Starting…" : "Start MOT"}
    </Button>
  );
}
