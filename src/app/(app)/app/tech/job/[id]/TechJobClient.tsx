"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, Pause, CheckCircle2, Phone, Clock } from "lucide-react";

import { startWork, pauseWork, completeWork } from "../../../jobs/work-logs/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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

interface WorkLog {
  id: string;
  task_type: string;
  description: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  staff_name: string;
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
  activeWorkLog: { id: string; task_type: string; started_at: string } | null;
  workLogs: WorkLog[];
}

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDuration(secs: number | null): string {
  if (!secs) return "—";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
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
  workLogs,
}: TechJobClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [taskType, setTaskType] = useState<TaskType>("diagnosis");
  const [taskDesc, setTaskDesc] = useState("");
  const [elapsed, setElapsed] = useState(0);

  // Timer for active work log
  useEffect(() => {
    if (!activeWorkLog) {
      setElapsed(0);
      return;
    }
    const startTime = new Date(activeWorkLog.started_at).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - startTime) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [activeWorkLog]);

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
    <div className="mx-auto max-w-lg space-y-4">
      {/* Job header */}
      <div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xl font-bold">{jobNumber}</span>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium capitalize">
            {status.replace(/_/g, " ")}
          </span>
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
              <div className="inline-block rounded bg-yellow-400 px-2 py-0.5 font-mono text-lg font-bold text-black">
                {vehicleReg}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{vehicleMakeModel}</div>
            </CardContent>
          </Card>
        )}
        {customerName && (
          <Card>
            <CardContent className="p-3">
              <div className="text-sm font-medium">{customerName}</div>
              {customerPhone && (
                <a
                  href={`tel:${customerPhone}`}
                  className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                >
                  <Phone className="h-3.5 w-3.5" />
                  Call
                </a>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Timer display */}
      {isWorking && (
        <Card className="border-success/50 bg-success/5">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 animate-pulse rounded-full bg-success" />
              <span className="text-sm font-medium capitalize">
                {activeWorkLog.task_type.replace(/_/g, " ")}
              </span>
            </div>
            <div className="flex items-center gap-2 font-mono text-2xl font-bold tabular-nums">
              <Clock className="h-5 w-5 text-muted-foreground" />
              {formatElapsed(elapsed)}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action buttons */}
      {!isWorking ? (
        <div className="space-y-3">
          {/* Task type picker */}
          <div>
            <label className="text-sm font-medium">Task Type</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {TASK_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTaskType(t.value)}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                    taskType === t.value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input hover:bg-accent"
                  }`}
                  style={{ minHeight: 40 }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Optional description */}
          <div>
            <label htmlFor="taskDesc" className="text-sm font-medium">
              Notes (optional)
            </label>
            <input
              id="taskDesc"
              type="text"
              value={taskDesc}
              onChange={(e) => setTaskDesc(e.target.value)}
              placeholder="What are you working on?"
              className="mt-1 block w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Start button */}
          <Button
            onClick={handleStart}
            disabled={isPending}
            className="h-16 w-full gap-2 text-lg"
            style={{ minHeight: 64 }}
          >
            <Play className="h-6 w-6" />
            {isPending ? "Starting..." : "Start Work"}
          </Button>
        </div>
      ) : (
        <div className="flex gap-3">
          <Button
            onClick={handlePause}
            disabled={isPending}
            variant="outline"
            className="h-16 flex-1 gap-2 border-amber-400 text-lg text-amber-600 hover:bg-amber-50"
            style={{ minHeight: 64 }}
          >
            <Pause className="h-6 w-6" />
            {isPending ? "..." : "Pause"}
          </Button>
          <Button
            onClick={handleComplete}
            disabled={isPending}
            className="h-16 flex-1 gap-2 text-lg"
            style={{ minHeight: 64 }}
          >
            <CheckCircle2 className="h-6 w-6" />
            {isPending ? "..." : "Complete"}
          </Button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">{error}</p>
      )}

      {/* Work log history */}
      {workLogs.length > 0 && (
        <div>
          <h2 className="text-base font-semibold">Work History</h2>
          <div className="mt-2 space-y-1.5">
            {workLogs.map((wl) => (
              <div
                key={wl.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div>
                  <span className="text-sm font-medium capitalize">
                    {wl.task_type.replace(/_/g, " ")}
                  </span>
                  {wl.description && (
                    <span className="ml-2 text-sm text-muted-foreground">
                      {wl.description}
                    </span>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {wl.staff_name} ·{" "}
                    {new Date(wl.started_at).toLocaleTimeString("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
                <div className="text-right">
                  {wl.ended_at ? (
                    <span className="text-sm">{formatDuration(wl.duration_seconds)}</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-success">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
                      Active
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
