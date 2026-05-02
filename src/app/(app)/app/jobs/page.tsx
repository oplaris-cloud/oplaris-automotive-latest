import Link from "next/link";
import { Plus } from "lucide-react";

import { requireManager } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { CustomerNameLink } from "@/components/ui/customer-name-link";
import { RegPlate } from "@/components/ui/reg-plate";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { MissionAndVisionIllustration } from "@/components/illustrations";
import { PageContainer } from "@/components/app/page-container";
import { ListSearch } from "@/components/ui/list-search";
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
import {
  composeJobsSearchPredicate,
  searchJobs,
} from "@/lib/search/jobs";

interface JobsPageProps {
  searchParams: Promise<{
    status?: string;
    q?: string;
    from?: string;
    to?: string;
  }>;
}

export default async function JobsPage({ searchParams }: JobsPageProps) {
  const session = await requireManager();
  const { status, q, from, to } = await searchParams;
  const supabase = await createSupabaseServerClient();

  const predicate = composeJobsSearchPredicate({ q, from, to, status });
  const jobs = await searchJobs(supabase, predicate, 50);

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

      <div className="mt-4">
        <ListSearch
          placeholder="Search by reg, name, phone, email, make/model…"
          dateRange
        />
      </div>

      {/* Status filter pills */}
      <div className="mt-3 flex flex-wrap gap-2">
        {[
          { value: "", label: "All" },
          { value: "checked_in", label: "Checked In" },
          { value: "in_diagnosis", label: "Diagnosis" },
          { value: "in_repair", label: "In Repair" },
          { value: "awaiting_parts", label: "Awaiting Parts" },
          { value: "awaiting_customer_approval", label: "Awaiting Approval" },
          { value: "ready_for_collection", label: "Ready" },
          { value: "completed", label: "Completed" },
        ].map((f) => {
          // Preserve the active text/date filters when toggling status.
          const sp = new URLSearchParams();
          if (q) sp.set("q", q);
          if (from) sp.set("from", from);
          if (to) sp.set("to", to);
          if (f.value) sp.set("status", f.value);
          const qs = sp.toString();
          return (
            <Link
              key={f.value}
              href={qs ? `/app/jobs?${qs}` : "/app/jobs"}
            >
              <Button
                variant={status === f.value || (!status && !f.value) ? "default" : "outline"}
                size="sm"
              >
                {f.label}
              </Button>
            </Link>
          );
        })}
      </div>

      {!jobs || jobs.length === 0 ? (
        <EmptyState
          illustration={MissionAndVisionIllustration}
          title="No jobs found"
          description={
            q || from || to
              ? "No jobs match the current filters."
              : status
                ? "No jobs with this status."
                : "Create your first job."
          }
          actionLabel={status || q || from || to ? undefined : "New Job"}
          actionHref={status || q || from || to ? undefined : "/app/jobs/new"}
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
                const customer = j.customers;
                const vehicle = j.vehicles;
                return (
                  <TableRow key={j.id}>
                    <TableCell>
                      <Link href={`/app/jobs/${j.id}`} className="font-mono text-sm font-medium hover:underline">
                        {j.job_number}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      {customer?.full_name ? (
                        <CustomerNameLink
                          customerId={j.customer_id}
                          fullName={customer.full_name}
                          isTrader={customer.is_trader ?? false}
                        />
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {vehicle?.registration && (
                        <RegPlate
                          reg={vehicle.registration}
                          size="sm"
                          vehicleId={j.vehicle_id}
                        />
                      )}
                      <span className="ml-2 text-sm text-muted-foreground">
                        {[vehicle?.make, vehicle?.model].filter(Boolean).join(" ")}
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
