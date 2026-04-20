"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { FormCard } from "@/components/ui/form-card";
import { FormActions } from "@/components/ui/form-actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

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
];

interface LogWorkDialogProps {
  jobId: string;
  garageId: string;
  staff: { id: string; full_name: string }[];
}

// P36.1 — wrapped in a real Dialog so opening doesn't push surrounding
// content. `garageId` is unused in the form itself but kept for callers.
export function LogWorkDialog({ jobId, garageId: _garageId, staff }: LogWorkDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = new FormData(e.currentTarget);
    const staffId = form.get("staffId") as string;
    const taskType = form.get("taskType") as string;
    const description = (form.get("description") as string) || null;
    const startedAt = form.get("startedAt") as string;
    const endedAt = (form.get("endedAt") as string) || null;

    if (!staffId || !taskType || !startedAt) {
      setError("Staff, task type, and start time are required");
      return;
    }

    startTransition(async () => {
      const { managerLogWork } = await import("../../jobs/work-logs/actions");
      const result = await managerLogWork({
        jobId,
        staffId,
        taskType: taskType as "diagnosis" | "engine" | "brakes" | "electrical" | "suspension" | "tyres" | "mot_test" | "testing" | "other",
        description,
        startedAt: new Date(startedAt).toISOString(),
        endedAt: endedAt ? new Date(endedAt).toISOString() : null,
      });
      if (!result.ok) {
        setError(result.error ?? "Failed to log work");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  // Default to 1 hour ago → now
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 3600000);
  const defaultStart = hourAgo.toISOString().slice(0, 16);
  const defaultEnd = now.toISOString().slice(0, 16);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline" className="gap-1.5" />
        }
      >
        <Clock className="h-4 w-4" /> Log Work
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4" /> Log Work (Retroactive)
          </DialogTitle>
        </DialogHeader>
        <FormCard variant="plain">
        <form onSubmit={handleSubmit}>
          <FormCard.Fields>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="log-staff" required>Staff Member</Label>
              <select
                id="log-staff"
                name="staffId"
                required
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:ring-2 focus:ring-primary/30 focus:outline-none"
              >
                <option value="">Select...</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="log-task" required>Task Type</Label>
              <select
                id="log-task"
                name="taskType"
                required
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:ring-2 focus:ring-primary/30 focus:outline-none"
              >
                {TASK_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="log-start" required>Start Time</Label>
              <Input id="log-start" name="startedAt" type="datetime-local" required defaultValue={defaultStart} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="log-end" optional>End Time (leave empty if still active)</Label>
              <Input id="log-end" name="endedAt" type="datetime-local" defaultValue={defaultEnd} className="mt-1" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="log-desc" optional>Description</Label>
              <Input id="log-desc" name="description" placeholder="What was done?" className="mt-1" />
            </div>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          </FormCard.Fields>
          <FormActions>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Logging…" : "Log Work"}
            </Button>
          </FormActions>
        </form>
        </FormCard>
      </DialogContent>
    </Dialog>
  );
}
