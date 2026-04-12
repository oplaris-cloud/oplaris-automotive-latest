"use client";

import { useState, useTransition } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import Link from "next/link";
import { GripVertical } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import type { BayWithJobs, BayJob } from "../jobs/actions";
import type { JobStatus } from "@/lib/validation/job-schemas";

interface BayBoardClientProps {
  initialBays: BayWithJobs[];
}

export function BayBoardClient({ initialBays }: BayBoardClientProps) {
  const [bays, setBays] = useState(initialBays);
  const [isPending, startTransition] = useTransition();

  const handleDragEnd = (result: DropResult) => {
    const { source, destination, draggableId } = result;

    if (!destination) return;
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    ) {
      return;
    }

    const sourceBayId = source.droppableId;
    const destBayId = destination.droppableId;

    // Optimistic update
    setBays((prev) => {
      const next = prev.map((bay) => ({
        ...bay,
        jobs: [...bay.jobs],
      }));

      const sourceBay = next.find((b) => b.id === sourceBayId);
      const destBay = next.find((b) => b.id === destBayId);
      if (!sourceBay || !destBay) return prev;

      const jobIndex = sourceBay.jobs.findIndex((j) => j.id === draggableId);
      if (jobIndex === -1) return prev;

      const removed = sourceBay.jobs.splice(jobIndex, 1);
      if (!removed[0]) return prev;
      destBay.jobs.splice(destination.index, 0, removed[0]);

      return next;
    });

    // Server action to persist
    startTransition(async () => {
      try {
        const res = await fetch("/api/bay-board/move", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobId: draggableId,
            bayId: destBayId,
          }),
        });

        if (!res.ok) {
          // Revert on failure
          setBays(initialBays);
        }
      } catch {
        setBays(initialBays);
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
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`rounded-lg border bg-card p-3 transition-shadow ${
                                snapshot.isDragging
                                  ? "shadow-lg ring-2 ring-primary/30"
                                  : "hover:shadow-md"
                              }`}
                            >
                              <div className="flex items-start gap-2">
                                <div
                                  {...provided.dragHandleProps}
                                  className="mt-0.5 cursor-grab text-muted-foreground active:cursor-grabbing"
                                >
                                  <GripVertical className="h-4 w-4" />
                                </div>
                                <Link
                                  href={`/app/jobs/${job.id}`}
                                  className="flex-1"
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="font-mono text-sm font-medium">
                                      {job.job_number}
                                    </span>
                                    <StatusBadge
                                      status={job.status as JobStatus}
                                    />
                                  </div>
                                  {job.vehicle && (
                                    <div className="mt-1.5 font-mono text-sm">
                                      {job.vehicle.registration}
                                      <span className="ml-2 font-sans text-muted-foreground">
                                        {[job.vehicle.make, job.vehicle.model]
                                          .filter(Boolean)
                                          .join(" ")}
                                      </span>
                                    </div>
                                  )}
                                  {job.customer && (
                                    <div className="mt-1 text-sm text-muted-foreground">
                                      {job.customer.full_name}
                                    </div>
                                  )}
                                  {job.assignments.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1">
                                      {job.assignments.map((a, i) => (
                                        <span
                                          key={i}
                                          className="rounded-full bg-muted px-2 py-0.5 text-xs"
                                        >
                                          {a.staff.full_name}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  {job.work_logs.some(
                                    (wl) => !wl.ended_at,
                                  ) && (
                                    <div className="mt-1.5 flex items-center gap-1 text-xs text-success">
                                      <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
                                      Work in progress
                                    </div>
                                  )}
                                </Link>
                              </div>
                            </div>
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
