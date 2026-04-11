import { requireManagerOrTester } from "@/lib/auth/session";
import { getBayBoard } from "../jobs/actions";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { JobStatus } from "@/lib/validation/job-schemas";
import Link from "next/link";

export default async function BayBoardPage() {
  await requireManagerOrTester();
  const { bays, error } = await getBayBoard();

  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Bay Board</h1>
        <p className="mt-2 text-sm text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Bay Board</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Live view of all bays and active jobs.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {bays.map((bay) => (
          <Card key={bay.id}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-base">
                {bay.name}
                <span className="text-xs font-normal text-muted-foreground">
                  {bay.capability.join(", ")}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {bay.jobs.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Empty
                </div>
              ) : (
                <div className="space-y-3">
                  {bay.jobs
                    .filter((j) => j.status !== "completed" && j.status !== "cancelled")
                    .map((job) => (
                      <Link key={job.id} href={`/app/jobs/${job.id}`}>
                        <div className="rounded-lg border p-3 transition-shadow hover:shadow-md">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-sm font-medium">
                              {job.job_number}
                            </span>
                            <StatusBadge status={job.status as JobStatus} />
                          </div>
                          {job.vehicle && (
                            <div className="mt-1.5 font-mono text-sm">
                              {job.vehicle.registration}
                              <span className="ml-2 font-sans text-muted-foreground">
                                {[job.vehicle.make, job.vehicle.model].filter(Boolean).join(" ")}
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
                          {job.work_logs.some((wl) => !wl.ended_at) && (
                            <div className="mt-1.5 flex items-center gap-1 text-xs text-success">
                              <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
                              Work in progress
                            </div>
                          )}
                        </div>
                      </Link>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
