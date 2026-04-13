import { notFound } from "next/navigation";
import Link from "next/link";

import { requireStaffSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import type { JobStatus } from "@/lib/validation/job-schemas";
import { StatusActions } from "./StatusActions";
import { ApprovalDialog } from "./ApprovalDialog";
import { EditJobDialog } from "./EditJobDialog";
import { TeamManager } from "./TeamManager";
import { AddPartForm } from "./AddPartForm";
import { PartRow } from "./PartRow";

interface JobDetailProps {
  params: Promise<{ id: string }>;
}

function pence(p: number): string {
  return `£${(p / 100).toFixed(2)}`;
}

function duration(seconds: number | null): string {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default async function JobDetailPage({ params }: JobDetailProps) {
  const session = await requireStaffSession();
  const isManager = session.role === "manager";
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: job } = await supabase
    .from("jobs")
    .select(`
      id, job_number, status, description, created_at, updated_at,
      completed_at, estimated_ready_at, source, bay_id,
      customers!customer_id ( id, full_name, phone, email ),
      vehicles!vehicle_id ( id, registration, make, model, year, mileage ),
      bays!bay_id ( id, name )
    `)
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!job) notFound();

  const customer = Array.isArray(job.customers) ? job.customers[0] : job.customers;
  const vehicle = Array.isArray(job.vehicles) ? job.vehicles[0] : job.vehicles;
  const bay = Array.isArray(job.bays) ? job.bays[0] : job.bays;

  // Fetch assignments, work logs, parts, approvals, bays, staff in parallel
  const [assignments, workLogs, parts, approvals, allBays, allStaff] = await Promise.all([
    supabase
      .from("job_assignments")
      .select("staff:staff!staff_id ( id, full_name )")
      .eq("job_id", id),
    supabase
      .from("work_logs")
      .select("id, task_type, description, started_at, ended_at, duration_seconds, staff:staff!staff_id ( full_name )")
      .eq("job_id", id)
      .order("started_at", { ascending: false }),
    supabase
      .from("job_parts")
      .select("id, description, supplier, quantity, unit_price_pence, total_pence, payment_method, invoice_file_path")
      .eq("job_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("approval_requests")
      .select("id, description, amount_pence, status, created_at, responded_at")
      .eq("job_id", id)
      .order("created_at", { ascending: false }),
    isManager
      ? supabase.from("bays").select("id, name").order("position")
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    isManager
      ? supabase.from("staff").select("id, full_name").order("full_name")
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
  ]);

  const assignedStaff = (assignments.data ?? []).map((a) => {
    const s = Array.isArray(a.staff) ? a.staff[0] : a.staff;
    return s as { id: string; full_name: string };
  }).filter(Boolean);

  const partsTotalPence = (parts.data ?? []).reduce((sum, p) => sum + (p.total_pence ?? 0), 0);

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="flex items-center gap-3 text-2xl font-semibold">
              <span className="font-mono">{job.job_number}</span>
              <StatusBadge status={job.status as JobStatus} />
            </h1>
            {isManager && (
              <EditJobDialog
                jobId={job.id}
                description={job.description}
                estimatedReadyAt={job.estimated_ready_at}
              />
            )}
          </div>
          {job.description && (
            <p className="mt-1 text-muted-foreground">{job.description}</p>
          )}
        </div>
        <div className="text-right text-sm text-muted-foreground">
          <div>Created {new Date(job.created_at).toLocaleDateString("en-GB")}</div>
          {job.estimated_ready_at && (
            <div>
              ETA{" "}
              {new Date(job.estimated_ready_at).toLocaleDateString("en-GB", {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
            </div>
          )}
          <div className="capitalize">Source: {job.source.replace("_", " ")}</div>
        </div>
      </div>

      {/* Status actions */}
      <div className="mt-4">
        <StatusActions jobId={job.id} currentStatus={job.status as JobStatus} />
      </div>

      {/* Customer + Vehicle + Bay & Team */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {customer && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Customer</CardTitle>
            </CardHeader>
            <CardContent>
              <Link href={`/app/customers/${(customer as { id: string }).id}`} className="font-medium hover:underline">
                {(customer as { full_name: string }).full_name}
              </Link>
              <div className="mt-1 text-sm text-muted-foreground">{(customer as { phone: string }).phone}</div>
            </CardContent>
          </Card>
        )}
        {vehicle && (
          <Link href={`/app/vehicles/${(vehicle as { id: string }).id}`}>
            <Card className="transition-shadow hover:shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Vehicle</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="inline-block rounded bg-yellow-400 px-2 py-0.5 font-mono text-base font-bold text-black">
                  {(vehicle as { registration: string }).registration}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {[(vehicle as { make?: string }).make, (vehicle as { model?: string }).model, (vehicle as { year?: number }).year].filter(Boolean).join(" ")}
                  {(vehicle as { mileage?: number }).mileage != null && ` · ${((vehicle as { mileage: number }).mileage).toLocaleString()} mi`}
                </div>
              </CardContent>
            </Card>
          </Link>
        )}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Bay & Team</CardTitle>
          </CardHeader>
          <CardContent>
            {isManager ? (
              <TeamManager
                jobId={job.id}
                currentBayId={job.bay_id ?? null}
                bays={(allBays.data ?? []) as { id: string; name: string }[]}
                assignedStaff={assignedStaff}
                allStaff={(allStaff.data ?? []) as { id: string; full_name: string }[]}
              />
            ) : (
              <>
                <div className="font-medium">{(bay as { name: string } | null)?.name ?? "Unassigned"}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {assignedStaff.map((s) => (
                    <Badge key={s.id} variant="secondary" className="text-xs">
                      {s.full_name}
                    </Badge>
                  ))}
                  {assignedStaff.length === 0 && (
                    <span className="text-sm text-muted-foreground">No techs assigned</span>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Separator className="my-6" />

      {/* Work logs */}
      <h2 className="text-lg font-semibold">Work Log</h2>
      {(workLogs.data ?? []).length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No work logged yet.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {workLogs.data!.map((wl) => {
            const staff = Array.isArray(wl.staff) ? wl.staff[0] : wl.staff;
            return (
              <div key={wl.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <span className="text-sm font-medium capitalize">{wl.task_type.replace(/_/g, " ")}</span>
                  {wl.description && <span className="ml-2 text-sm text-muted-foreground">{wl.description}</span>}
                  <div className="text-xs text-muted-foreground">
                    {(staff as { full_name: string } | null)?.full_name} · {new Date(wl.started_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
                <div className="text-right">
                  {wl.ended_at ? (
                    <span className="text-sm">{duration(wl.duration_seconds)}</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-success">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
                      Active
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Separator className="my-6" />

      {/* Parts */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Parts</h2>
      </div>
      {(parts.data ?? []).length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No parts added yet.</p>
      ) : (
        <div className="mt-3 rounded-lg border">
          <div className="divide-y">
            {parts.data!.map((p) => (
              <PartRow key={p.id} part={p} isManager={isManager} />
            ))}
          </div>
          <div className="flex justify-between border-t bg-muted/50 p-3">
            <span className="text-sm font-medium">Parts Total</span>
            <span className="font-mono font-bold">{pence(partsTotalPence)}</span>
          </div>
        </div>
      )}
      <div className="mt-3">
        <AddPartForm jobId={job.id} />
      </div>

      {/* Approval request */}
      {(job.status === "in_diagnosis" || job.status === "in_repair") && (
        <>
          <Separator className="my-6" />
          <ApprovalDialog jobId={job.id} />
        </>
      )}

      {/* Approvals */}
      {(approvals.data ?? []).length > 0 && (
        <>
          <Separator className="my-6" />
          <h2 className="text-lg font-semibold">Approval Requests</h2>
          <div className="mt-3 space-y-2">
            {approvals.data!.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <div className="text-sm">{a.description}</div>
                  <div className="text-xs text-muted-foreground">
                    {pence(a.amount_pence)} · {new Date(a.created_at).toLocaleDateString("en-GB")}
                  </div>
                </div>
                <Badge
                  variant={
                    a.status === "approved"
                      ? "default"
                      : a.status === "declined"
                        ? "destructive"
                        : "secondary"
                  }
                  className="capitalize"
                >
                  {a.status}
                </Badge>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
