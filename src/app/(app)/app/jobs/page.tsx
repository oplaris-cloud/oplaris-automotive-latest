import Link from "next/link";
import { Plus, Wrench } from "lucide-react";

import { requireManager } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { CustomerNameLink } from "@/components/ui/customer-name-link";
import { RegPlate } from "@/components/ui/reg-plate";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { MissionAndVisionIllustration } from "@/components/illustrations";
import { PageContainer } from "@/components/app/page-container";
import { JobsListRealtime } from "@/lib/realtime/shims";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { JobStatus } from "@/lib/validation/job-schemas";

interface JobsPageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function JobsPage({ searchParams }: JobsPageProps) {
  const session = await requireManager();
  const { status } = await searchParams;
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("jobs")
    .select(`
      id, job_number, status, description, created_at, estimated_ready_at,
      customer_id, vehicle_id,
      customers!customer_id ( full_name ),
      vehicles!vehicle_id ( registration, make, model )
    `)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);

  if (status) {
    query = query.eq("status", status);
  }

  const { data: jobs } = await query;

  return (
    <PageContainer width="full">
      <JobsListRealtime garageId={session.garageId} />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Jobs</h1>
        <Link href="/app/jobs/new">
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" />
            New Job
          </Button>
        </Link>
      </div>

      {/* Status filter pills */}
      <div className="mt-4 flex flex-wrap gap-2">
        {[
          { value: "", label: "All" },
          { value: "checked_in", label: "Checked In" },
          { value: "in_diagnosis", label: "Diagnosis" },
          { value: "in_repair", label: "In Repair" },
          { value: "awaiting_parts", label: "Awaiting Parts" },
          { value: "awaiting_customer_approval", label: "Awaiting Approval" },
          { value: "ready_for_collection", label: "Ready" },
          { value: "completed", label: "Completed" },
        ].map((f) => (
          <Link
            key={f.value}
            href={f.value ? `/app/jobs?status=${f.value}` : "/app/jobs"}
          >
            <Button
              variant={status === f.value || (!status && !f.value) ? "default" : "outline"}
              size="sm"
            >
              {f.label}
            </Button>
          </Link>
        ))}
      </div>

      {!jobs || jobs.length === 0 ? (
        <EmptyState
          illustration={MissionAndVisionIllustration}
          title="No jobs found"
          description={status ? "No jobs with this status." : "Create your first job."}
          actionLabel={status ? undefined : "New Job"}
          actionHref={status ? undefined : "/app/jobs/new"}
          className="mt-8"
        />
      ) : (
        <div className="mt-4 rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="hidden sm:table-cell">Vehicle</TableHead>
                <TableHead className="hidden md:table-cell">Description</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((j) => {
                const customer = Array.isArray(j.customers) ? j.customers[0] : j.customers;
                const vehicle = Array.isArray(j.vehicles) ? j.vehicles[0] : j.vehicles;
                return (
                  <TableRow key={j.id}>
                    <TableCell>
                      <Link href={`/app/jobs/${j.id}`} className="font-mono text-sm font-medium hover:underline">
                        {j.job_number}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      {(customer as { full_name: string } | null)?.full_name ? (
                        <CustomerNameLink
                          customerId={
                            (j as unknown as { customer_id: string | null })
                              .customer_id
                          }
                          fullName={
                            (customer as { full_name: string }).full_name
                          }
                        />
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {(vehicle as { registration: string } | null)?.registration && (
                        <RegPlate
                          reg={(vehicle as { registration: string }).registration}
                          size="sm"
                          vehicleId={
                            (j as unknown as { vehicle_id: string | null })
                              .vehicle_id
                          }
                        />
                      )}
                      <span className="ml-2 text-sm text-muted-foreground">
                        {[(vehicle as { make?: string } | null)?.make, (vehicle as { model?: string } | null)?.model].filter(Boolean).join(" ")}
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground md:table-cell max-w-[200px] truncate">
                      {j.description ?? "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={j.status as JobStatus} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </PageContainer>
  );
}
