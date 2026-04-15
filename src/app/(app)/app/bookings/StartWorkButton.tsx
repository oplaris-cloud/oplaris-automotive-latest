"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { startWorkFromCheckIn } from "./actions";

export function StartWorkButton({
  bookingId,
  className,
}: {
  bookingId: string;
  /** See StartMotButton — category-coloured when passed from a row. */
  className?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await startWorkFromCheckIn(bookingId);
      if (result.ok && result.id) {
        router.push(`/app/jobs/${result.id}`);
      } else {
        alert(result.error ?? "Failed to start work");
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
      <Play className="h-3.5 w-3.5" /> {isPending ? "Starting…" : "Start work"}
    </Button>
  );
}
