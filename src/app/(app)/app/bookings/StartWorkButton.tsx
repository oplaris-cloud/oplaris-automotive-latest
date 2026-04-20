"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import type { StaffRole } from "@/lib/auth/session";
import { pickStartDestination } from "@/lib/tech/self-start-routing";
import { startWorkFromCheckIn } from "./actions";

export function StartWorkButton({
  bookingId,
  roles,
  className,
}: {
  bookingId: string;
  /** See StartMotButton — drives F1 post-action redirect. */
  roles: readonly StaffRole[];
  /** See StartMotButton — category-coloured when passed from a row. */
  className?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await startWorkFromCheckIn(bookingId);
      if (result.ok && result.id) {
        router.push(pickStartDestination(roles, result.id));
      } else {
        toast.error(result.error ?? "Failed to start work");
      }
    });
  }

  return (
    <Button
      size="lg"
      onClick={handleClick}
      disabled={isPending}
      className={className}
    >
      <Play className="h-5 w-5" /> {isPending ? "Starting…" : "Start work"}
    </Button>
  );
}
