"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Play,
  Pause,
  PlayCircle,
  CheckCircle2,
  Phone,
  Clock,
} from "lucide-react";

import {
  startWork,
  pauseWork,
  resumeWork,
  completeWork,
} from "../../../jobs/work-logs/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RegPlate } from "@/components/ui/reg-plate";
import { StatusBadge } from "@/components/ui/status-badge";
import type { JobStatus } from "@/lib/validation/job-schemas";
import { cn } from "@/lib/utils";
import { formatRunningTimer } from "@/lib/format";
import {
  isPaused,
  workedSeconds,
  type ActiveWorkLogForTimer,
} from "./work-log-timer";
import { TechSecondaryActions } from "./TechSecondaryActions";

const TASK_TYPES = [
  { value: "diagnosis", label: "Diagnosis" },
  { value: "engine", label: "Engine" },
  { value: "brakes", label: "Brakes" },
  { value: "electrical", label: "Electrical" },
  { value: "suspension", label: "Suspension" },
  { value: "tyres", label: "Tyres" },
  { value: "mot_test", label: "MOT Test" },
  { value: "testing", label: "Testing" },
  { value: "other", label: "Other" },
] as const;

type TaskType = (typeof TASK_TYPES)[number]["value"];

interface ActiveWorkLog extends ActiveWorkLogForTimer {
  id: string;
  task_type: string;
}

interface TechJobClientProps {
  jobId: string;
  jobNumber: string;
  status: string;
  description: string | null;
  vehicleReg: string | null;
  vehicleMakeModel: string;
  customerName: string | null;
  customerPhone: string | null;
  activeWorkLog: ActiveWorkLog | null;
}

export function TechJobClient({
  jobId,
  jobNumber,
  status,
  description,
  vehicleReg,
  vehicleMakeModel,
  customerName,
  customerPhone,
  activeWorkLog,
}: TechJobClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [taskType, setTaskType] = useState<TaskType>("diagnosis");
  const [taskDesc, setTaskDesc] = useState("");
  const [elapsed, setElapsed] = useState(0);

  const paused = isPaused(activeWorkLog);

  // Ticking timer. While running, update every second. While paused,
  // freeze at the pre-computed worked-seconds value — still re-run the
  // effect on paused-at change so a resume→re-pause cycle shows the
  // right frozen number without a page reload.
  useEffect(() => {
    if (!activeWorkLog) {
      setElapsed(0);
      return;
    }
    const tick = () => setElapsed(workedSeconds(activeWorkLog));
    tick();
    if (paused) return; // no interval — frozen
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [activeWorkLog, paused]);

  const handleStart = () => {
    setError(null);
    startTransition(async () => {
      const result = await startWork({
        jobId,
        taskType,
        description: taskDesc || undefined,
      });
      if (!result.ok) {
        setError(result.error ?? "Failed to start work");
        return;
      }
      router.refresh();
    });
  };

  const handlePause = () => {
    if (!activeWorkLog) return;
    setError(null);
    startTransition(async () => {
      const result = await pauseWork({ workLogId: activeWorkLog.id });
      if (!result.ok) {
        setError(result.error ?? "Failed to pause");
        return;
      }
      router.refresh();
    });
  };

  const handleResume = () => {
    if (!activeWorkLog) return;
    setError(null);
    startTransition(async () => {
      const result = await resumeWork({ workLogId: activeWorkLog.id });
      if (!result.ok) {
        setError(result.error ?? "Failed to resume");
        return;
      }
      router.refresh();
    });
  };

  const handleComplete = () => {
    if (!activeWorkLog) return;
    setError(null);
    startTransition(async () => {
      const result = await completeWork({ workLogId: activeWorkLog.id });
      if (!result.ok) {
        setError(result.error ?? "Failed to complete");
        return;
      }
      router.refresh();
    });
  };

  const isWorking = !!activeWorkLog;

  return (
    <div className="space-y-4">
      {/* Job header */}
      <div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xl font-bold">{jobNumber}</span>
          <StatusBadge status={status as JobStatus} />
        </div>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>

      {/* Vehicle + Customer */}
      <div className="grid grid-cols-2 gap-3">
        {vehicleReg && (
          <Card>
            <CardContent className="p-3">
              <RegPlate reg={vehicleReg} size="lg" />
              <div className="mt-1 text-xs text-muted-foreground">{vehicleMakeModel}</div>
            </CardContent>
          </Card>
        )}
        {customerName && (
          <Card>
            <CardContent className="p-3">
              <div className="text-sm font-medium">{customerName}</div>
              {customerPhone && (
                <Button
                  asChild
                  size="lg"
                  className="mt-2 w-full"
                >
                  <a href={`tel:${customerPhone}`}>
                    <Phone className="h-5 w-5" />
                    Call
                  </a>
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Timer display — green while running, warning (amber token) while paused. */}
      {isWorking && (
        <Card
          className={cn(
            paused ? "border-warning/60 bg-warning/10" : "border-success/50 bg-success/5",
          )}
        >
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "h-3 w-3 rounded-full",
                  paused ? "bg-warning" : "animate-pulse bg-success",
                )}
              />
              <span className="text-sm font-medium capitalize">
                {activeWorkLog.task_type.replace(/_/g, " ")}
              </span>
              {paused ? (
                <span className="rounded bg-warning px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-warning-foreground">
                  Paused
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-2 font-mono text-2xl font-bold tabular-nums">
              <Clock className="h-5 w-5 text-muted-foreground" />
              {formatRunningTimer(elapsed)}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Secondary actions (F2 / DESIGN_SYSTEM §4.3) — only while a
          work_log is active. Add note ships disabled in 2a; 2b lands
          the real migration-050 path. */}
      {isWorking ? <TechSecondaryActions jobId={jobId} /> : null}

      {/* Action buttons */}
      {!isWorking ? (
        <div className="space-y-3">
          {/* Task type picker — aria-pressed toggles drive the variant */}
          <div>
            <Label className="text-sm font-medium">Task Type</Label>
            <div
              role="radiogroup"
              aria-label="Task type"
              className="mt-2 flex flex-wrap gap-2"
            >
              {TASK_TYPES.map((t) => {
                const active = taskType === t.value;
                return (
                  <Button
                    key={t.value}
                    type="button"
                    size="default"
                    variant={active ? "default" : "outline"}
                    role="radio"
                    aria-checked={active}
                    onClick={() => setTaskType(t.value)}
                  >
                    {t.label}
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Optional description */}
          <div>
            <Label htmlFor="taskDesc">Notes (optional)</Label>
            <Input
              id="taskDesc"
              type="text"
              value={taskDesc}
              onChange={(e) => setTaskDesc(e.target.value)}
              placeholder="What are you working on?"
              className="mt-1"
            />
          </div>

          {/* Start button */}
          <Button
            size="xl"
            onClick={handleStart}
            disabled={isPending}
            className="w-full"
          >
            <Play />
            {isPending ? "Starting..." : "Start Work"}
          </Button>
        </div>
      ) : (
        <div className="flex gap-3">
          {paused ? (
            <Button
              size="xl"
              onClick={handleResume}
              disabled={isPending}
              variant="outline"
              className="flex-1 border-success text-success"
            >
              <PlayCircle />
              {isPending ? "..." : "Resume"}
            </Button>
          ) : (
            <Button
              size="xl"
              onClick={handlePause}
              disabled={isPending}
              variant="outline"
              className="flex-1 border-warning text-warning"
            >
              <Pause />
              {isPending ? "..." : "Pause"}
            </Button>
          )}
          <Button
            size="xl"
            onClick={handleComplete}
            disabled={isPending}
            className="flex-1"
          >
            <CheckCircle2 />
            {isPending ? "..." : "Complete"}
          </Button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
