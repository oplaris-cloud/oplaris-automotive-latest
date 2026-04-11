import { Wrench } from "lucide-react";

import { requireStaffSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import type { JobStatus } from "@/lib/validation/job-schemas";
import Link from "next/link";

export default async function TechPage() {
  const session = await requireStaffSession();
  const supabase = await createSupabaseServerClient();

  // Get jobs assigned to this tech
  const { data: assignments } = await supabase
    .from("job_assignments")
    .select(`
      job_id,
      jobs!job_id (
        id, job_number, status, description,
        vehicles!vehicle_id ( registration, make, model ),
        customers!customer_id ( full_name )
      )
    `)
    .eq("staff_id", session.userId);

  const jobs = (assignments ?? [])
    .map((a) => (Array.isArray(a.jobs) ? a.jobs[0] : a.jobs))
    .filter(Boolean)
    .filter((j) => j!.status !== "completed" && j!.status !== "cancelled");

  // Get active work log
  const { data: activeLog } = await supabase
    .from("work_logs")
    .select("id, job_id, task_type, started_at")
    .eq("staff_id", session.userId)
    .is("ended_at", null)
    .maybeSingle();

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-semibold">My Work</h1>

      {activeLog && (
        <Card className="mt-4 border-success/50 bg-success/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 animate-pulse rounded-full bg-success" />
              <span className="text-sm font-medium">
                Working: {activeLog.task_type.replace(/_/g, " ")}
              </span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Started {new Date(activeLog.started_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
            </div>
          </CardContent>
        </Card>
      )}

      {jobs.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="No assigned jobs"
          description="Ask your manager to assign you to a job."
          className="mt-8"
        />
      ) : (
        <div className="mt-6 space-y-3">
          {jobs.map((job) => {
            const j = job!;
            const vehicle = Array.isArray(j.vehicles) ? j.vehicles[0] : j.vehicles;
            const customer = Array.isArray(j.customers) ? j.customers[0] : j.customers;
            const isActive = activeLog?.job_id === j.id;
            return (
              <Link key={j.id} href={`/app/tech/job/${j.id}`}>
                <Card className={`transition-shadow hover:shadow-md ${isActive ? "ring-2 ring-success" : ""}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm font-bold">{j.job_number}</span>
                      <StatusBadge status={j.status as JobStatus} />
                    </div>
                    {vehicle && (
                      <div className="mt-2 font-mono text-lg font-bold">
                        {(vehicle as { registration: string }).registration}
                        <span className="ml-2 font-sans text-sm font-normal text-muted-foreground">
                          {[(vehicle as { make?: string }).make, (vehicle as { model?: string }).model].filter(Boolean).join(" ")}
                        </span>
                      </div>
                    )}
                    {customer && (
                      <div className="mt-1 text-sm text-muted-foreground">
                        {(customer as { full_name: string }).full_name}
                      </div>
                    )}
                    {j.description && (
                      <div className="mt-2 text-sm">{j.description.slice(0, 80)}</div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
