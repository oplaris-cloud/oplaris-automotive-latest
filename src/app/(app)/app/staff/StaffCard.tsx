"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { RegPlate } from "@/components/ui/reg-plate";
import { StaffAvatar } from "@/components/ui/staff-avatar";
import { formatRunningTimer } from "@/lib/format";
import { workedSeconds, isPaused } from "@/app/(app)/app/tech/job/[id]/work-log-timer";
import { cn } from "@/lib/utils";

import type {
  ActiveWorkLogSummary,
  StaffRow,
  StaffWithLiveStatus,
} from "./actions";

const ROLE_LABELS: Record<string, string> = {
  manager: "Manager",
  mot_tester: "MOT Tester",
  mechanic: "Mechanic",
};

const ROLE_COLOURS: Record<string, string> = {
  manager: "bg-primary/10 text-primary",
  mot_tester: "bg-info/10 text-info",
  mechanic: "bg-success/10 text-success",
};

interface StaffCardProps {
  data: StaffWithLiveStatus;
}

/** P3.1 — One row per active staff member.
 *
 *  Visual hierarchy: the avatar's border colour is the primary status
 *  cue (red border = busy, green border = free). The whole card is a
 *  Link to the detail page; the active panel inside the card reveals
 *  the in-flight vehicle reg + a ticking HH:MM:SS timer when the staff
 *  is working. Free staff get a muted "Free now · N done today" line
 *  so the manager can scan availability + throughput at a glance.
 */
export function StaffCard({ data }: StaffCardProps) {
  const { staff, status, activeWorkLog, jobsCompletedToday } = data;
  const busy = status === "busy";

  return (
    <Link
      href={`/app/staff/${staff.id}`}
      className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`${staff.full_name} — ${busy ? "busy" : "free"}`}
    >
      <Card
        size="sm"
        className={cn(
          "transition-shadow group-hover:shadow-md",
          busy && "ring-destructive/40",
        )}
      >
        <CardContent>
          <div className="flex items-start gap-3">
            <StaffAvatarBorder
              src={staff.avatar_url}
              name={staff.full_name}
              roles={staff.roles}
              busy={busy}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <StatusDot busy={busy} />
                <span className="truncate font-medium">{staff.full_name}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {staff.roles.map((role) => (
                  <Badge
                    key={role}
                    variant="secondary"
                    className={cn("text-xs", ROLE_COLOURS[role] ?? "")}
                  >
                    {ROLE_LABELS[role] ?? role}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          {activeWorkLog ? (
            <ActiveWorkPanel log={activeWorkLog} />
          ) : (
            <div className="mt-3 text-xs text-muted-foreground">
              Free now · {jobsCompletedToday}{" "}
              {jobsCompletedToday === 1 ? "job" : "jobs"} done today
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

function StaffAvatarBorder({
  src,
  name,
  roles,
  busy,
}: {
  src: StaffRow["avatar_url"];
  name: string;
  roles: string[];
  busy: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border-2",
        busy
          ? "border-destructive bg-destructive/10 text-destructive"
          : "border-success bg-success/10 text-success",
      )}
    >
      <StaffAvatar src={src} name={name} size={44} roles={roles} />
    </div>
  );
}

function StatusDot({ busy }: { busy: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block h-2 w-2 rounded-full",
        busy ? "bg-destructive" : "bg-success",
      )}
    />
  );
}

function ActiveWorkPanel({ log }: { log: ActiveWorkLogSummary }) {
  const paused = isPaused({
    started_at: log.startedAt,
    paused_at: log.pausedAt,
    paused_seconds_total: log.pausedSecondsTotal,
  });

  return (
    <div
      data-slot="active-work-panel"
      className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-destructive/5 p-2 ring-1 ring-destructive/20"
    >
      <div className="flex items-center gap-2">
        {/* B3.3: deliberately omitting `vehicleId` — the entire
            StaffCard is wrapped in a Link to /app/staff/[id], so a
            nested anchor here would be invalid HTML. The card
            already gives a one-tap path to staff detail; vehicle
            navigation is available from the staff detail page +
            from the bay-board / job pages. */}
        {log.vehicleReg ? (
          <RegPlate reg={log.vehicleReg} size="sm" />
        ) : (
          <span className="text-xs text-muted-foreground">No reg</span>
        )}
        {log.jobNumber ? (
          <span className="text-xs text-muted-foreground">{log.jobNumber}</span>
        ) : null}
      </div>
      <LiveTimer log={log} paused={paused} />
    </div>
  );
}

function LiveTimer({
  log,
  paused,
}: {
  log: ActiveWorkLogSummary;
  paused: boolean;
}) {
  const [elapsed, setElapsed] = useState(() =>
    workedSeconds({
      started_at: log.startedAt,
      paused_at: log.pausedAt,
      paused_seconds_total: log.pausedSecondsTotal,
    }),
  );

  // Same tick pattern as TechJobClient — freeze when paused, otherwise
  // re-render every second. The effect re-runs whenever the active log
  // changes (router.refresh() after a realtime ping), so a resume +
  // re-pause cycle picks up the new frozen number without a full reload.
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
    <span
      data-slot="live-timer"
      className={cn(
        "font-mono text-sm font-semibold tabular-nums",
        paused ? "text-warning" : "text-destructive",
      )}
      aria-label={paused ? "Timer paused" : "Timer running"}
    >
      {formatRunningTimer(elapsed)}
      {paused ? <span className="ml-1 text-[10px] uppercase">paused</span> : null}
    </span>
  );
}
