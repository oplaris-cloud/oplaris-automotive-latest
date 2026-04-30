"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { RegPlate } from "@/components/ui/reg-plate";
import { Button } from "@/components/ui/button";
import { formatRunningTimer } from "@/lib/format";
import { isPaused, workedSeconds } from "@/app/(app)/app/tech/job/[id]/work-log-timer";
import { cn } from "@/lib/utils";

import type { ActiveWorkLogSummary } from "../actions";

interface StaffActiveHeroProps {
  log: ActiveWorkLogSummary;
}

/** P3.1 — Detail-page hero panel for a staff member who is currently
 *  working. Larger timer than the list card; same pause/resume math.
 *  Acts as the entry point to the live job — clicking the CTA lands on
 *  the manager's job-detail view so the next decision is one tap away.
 */
export function StaffActiveHero({ log }: StaffActiveHeroProps) {
  const paused = isPaused({
    started_at: log.startedAt,
    paused_at: log.pausedAt,
    paused_seconds_total: log.pausedSecondsTotal,
  });

  const [elapsed, setElapsed] = useState(() =>
    workedSeconds({
      started_at: log.startedAt,
      paused_at: log.pausedAt,
      paused_seconds_total: log.pausedSecondsTotal,
    }),
  );

  useEffect(() => {
    const tick = () =>
      setElapsed(
        workedSeconds({
          started_at: log.startedAt,
          paused_at: log.pausedAt,
          paused_seconds_total: log.pausedSecondsTotal,
        }),
      );
    tick();
    if (paused) return;
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [log.startedAt, log.pausedAt, log.pausedSecondsTotal, paused]);

  return (
    <div
      data-slot="staff-active-hero"
      className="rounded-xl bg-destructive/5 p-4 ring-1 ring-destructive/30 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {log.vehicleReg ? (
            <RegPlate
              reg={log.vehicleReg}
              size="lg"
              vehicleId={log.vehicleId}
            />
          ) : null}
          {log.jobNumber ? (
            <span className="text-sm font-medium text-muted-foreground">
              {log.jobNumber}
            </span>
          ) : null}
        </div>
        <span
          className={cn(
            "font-mono text-3xl font-bold tabular-nums sm:text-4xl",
            paused ? "text-warning" : "text-destructive",
          )}
          aria-label={paused ? "Timer paused" : "Timer running"}
        >
          {formatRunningTimer(elapsed)}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">
          {paused ? "Paused" : "Currently working"}
        </span>
        <Button asChild size="sm" variant="outline">
          <Link href={`/app/jobs/${log.jobId}`}>Open job</Link>
        </Button>
      </div>
    </div>
  );
}
