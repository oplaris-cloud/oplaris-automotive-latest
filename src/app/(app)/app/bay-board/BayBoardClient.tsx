"use client";

import { useMemo, useState, useTransition } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import Link from "next/link";
import { GripVertical } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stack } from "@/components/ui/stack";
import { StaffRoleIcons } from "@/components/ui/staff-role-icons";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import type { BayWithJobs } from "../jobs/actions";
import type { JobStatus } from "@/lib/validation/job-schemas";

import { applyPendingMoves, type PendingMoves } from "./bay-board-overlay";

interface BayBoardClientProps {
  initialBays: BayWithJobs[];
}

export function BayBoardClient({ initialBays }: BayBoardClientProps) {
  // P2.5 — render directly from the prop. The previous version stashed
  // `initialBays` in `useState`, so prop updates from `router.refresh()`
  // were dropped on the floor and a peer's bay move never reached this
  // session. The overlay below is the only local state that survives a
  // re-render, and it covers just the in-flight drag → server →
  // realtime window.
  //
  // Old entries don't need pruning: `applyPendingMoves` is a no-op
  // for any entry whose destination already matches the job's current
  // bay (i.e. realtime has caught up). Re-dragging the same job
  // overwrites by jobId. So the Map's effective size stays bounded
  // by the number of in-flight drags (typically 1-2).
  const [pendingMoves, setPendingMoves] = useState<PendingMoves>(
    () => new Map(),
  );
  const [isPending, startTransition] = useTransition();

  const bays = useMemo(
    () => applyPendingMoves(initialBays, pendingMoves),
    [initialBays, pendingMoves],
  );

  const handleDragEnd = (result: DropResult) => {
    const { source, destination, draggableId } = result;

    if (!destination) return;
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    ) {
      return;
    }

    const destBayId = destination.droppableId;

    setPendingMoves((prev) => {
      const next = new Map(prev);
      next.set(draggableId, destBayId);
      return next;
    });

    startTransition(async () => {
      const revert = () =>
        setPendingMoves((prev) => {
          const next = new Map(prev);
          next.delete(draggableId);
          return next;
        });
      try {
        const res = await fetch("/api/bay-board/move", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobId: draggableId,
            bayId: destBayId,
          }),
        });
        if (!res.ok) revert();
      } catch {
        revert();
      }
    });
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {bays.map((bay) => {
          const activeJobs = bay.jobs.filter(
            (j) => j.status !== "completed" && j.status !== "cancelled",
          );

          return (
            <Card key={bay.id} className="flex flex-col">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-base">
                  {bay.name}
                  <span className="text-xs font-normal text-muted-foreground">
                    {bay.capability.join(", ")}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1">
                <Droppable droppableId={bay.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`min-h-[80px] space-y-3 rounded-lg border-2 p-2 transition-colors ${
                        snapshot.isDraggingOver
                          ? "border-primary/40 bg-primary/5"
                          : "border-transparent"
                      } ${activeJobs.length === 0 ? "border-dashed border-muted-foreground/20" : ""}`}
                    >
                      {activeJobs.length === 0 && !snapshot.isDraggingOver && (
                        <div className="py-6 text-center text-sm text-muted-foreground">
                          Empty — drop a job here
                        </div>
                      )}
                      {activeJobs.map((job, index) => (
                        <Draggable
                          key={job.id}
                          draggableId={job.id}
                          index={index}
                        >
                          {(provided, snapshot) => (
                            <Card
                              size="sm"
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={cn(
                                "transition-all duration-150",
                                snapshot.isDragging
                                  ? "scale-[1.02] shadow-xl ring-2 ring-primary/40"
                                  : "hover:shadow-md",
                              )}
                            >
                              <CardContent>
                                <div className="flex items-start gap-2">
                                  <div
                                    {...provided.dragHandleProps}
                                    className="mt-1 cursor-grab text-muted-foreground active:cursor-grabbing"
                                  >
                                    <GripVertical className="h-4 w-4" />
                                  </div>
                                  <Link
                                    href={`/app/jobs/${job.id}`}
                                    className="flex-1 min-w-0"
                                  >
                                    {/* Identity row — job number + status */}
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="font-mono text-sm font-medium">
                                        {job.job_number}
                                      </span>
                                      <StatusBadge
                                        status={job.status as JobStatus}
                                      />
                                    </div>
                                    {/* Primary identity (reg + customer) — 8 px rhythm */}
                                    <Stack gap="sm" className="mt-2">
                                      {job.vehicle && (
                                        <div className="font-mono text-sm">
                                          {job.vehicle.registration}
                                          <span className="ml-2 font-sans text-muted-foreground">
                                            {[job.vehicle.make, job.vehicle.model]
                                              .filter(Boolean)
                                              .join(" ")}
                                          </span>
                                        </div>
                                      )}
                                      {job.customer && (
                                        <div className="text-sm text-muted-foreground">
                                          {job.customer.full_name}
                                        </div>
                                      )}
                                    </Stack>
                                    {/* Metadata group (12 px gap above — signals
                                        "different logical level than identity") */}
                                    {(job.assignments.length > 0 ||
                                      job.work_logs.some((wl) => !wl.ended_at)) && (
                                      <div className="mt-3 space-y-2">
                                        {job.assignments.length > 0 && (
                                          <div className="flex flex-wrap gap-1">
                                            {job.assignments.map((a, i) => (
                                              <span
                                                key={i}
                                                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs"
                                              >
                                                {a.staff.full_name}
                                                <StaffRoleIcons
                                                  roles={a.staff.roles}
                                                />
                                              </span>
                                            ))}
                                          </div>
                                        )}
                                        {job.work_logs.some(
                                          (wl) => !wl.ended_at,
                                        ) && (
                                          <div className="flex items-center gap-1 text-xs text-success">
                                            <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
                                            Work in progress
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </Link>
                                </div>
                              </CardContent>
                            </Card>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {isPending && (
        <div className="fixed bottom-4 right-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg">
          Saving...
        </div>
      )}
    </DragDropContext>
  );
}
