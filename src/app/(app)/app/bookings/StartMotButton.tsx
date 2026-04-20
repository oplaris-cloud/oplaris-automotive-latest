"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import type { StaffRole } from "@/lib/auth/session";
import { pickStartDestination } from "@/lib/tech/self-start-routing";
import { startMotFromCheckIn } from "./actions";

export function StartMotButton({
  bookingId,
  roles,
  className,
}: {
  bookingId: string;
  /**
   * The viewer's StaffRole array. Drives the post-action redirect:
   * mot_tester / mechanic land on `/app/tech/job/[id]`; manager-only
   * staff land on `/app/jobs/[id]`. See `pickStartDestination` and
   * audit finding F1.
   */
  roles: readonly StaffRole[];
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
        router.push(pickStartDestination(roles, result.id));
      } else {
        toast.error(result.error ?? "Failed to start MOT");
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
      <Play className="h-5 w-5" /> {isPending ? "Starting…" : "Start MOT"}
    </Button>
  );
}
