import { notFound, redirect } from "next/navigation";
import Link from "next/link";

import { requireStaffSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/status-badge";
import { RoleBadge, type CurrentRole } from "@/components/ui/role-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { RegPlate } from "@/components/ui/reg-plate";
import { PageContainer } from "@/components/app/page-container";
import type { JobStatus } from "@/lib/validation/job-schemas";
import { ApprovalDialog } from "./ApprovalDialog";
import { EditJobDialog } from "./EditJobDialog";
import { TeamManager } from "./TeamManager";
import { AddPartForm } from "./AddPartForm";
import { PartRow } from "./PartRow";
import { ManualApproveButton } from "./ManualApproveButton";
import { ChargesSection } from "./ChargesSection";
import { JobActionsRow } from "./JobActionsRow";
import type {
  AssigneeInfo,
  EligibleStaffInfo,
} from "./change-handler-logic";
import { JobActivity } from "./JobActivity";
import { getStaffAvailability } from "../../bookings/actions";
import { JobDetailRealtime } from "@/lib/realtime/shims";

interface JobDetailProps {
  params: Promise<{ id: string }>;
}

function pence(p: number): string {
  return `£${(p / 100).toFixed(2)}`;
}

// Work-log time / duration formatters live in src/lib/format.ts (P44).

export default async function JobDetailPage({ params }: JobDetailProps) {
  const session = await requireStaffSession();
  const isManager = session.roles.includes("manager");
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: job } = await supabase
    .from("jobs")
    .select(`
      id, job_number, status, description, created_at, updated_at,
      completed_at, estimated_ready_at, source, bay_id, service,
      awaiting_passback, current_role,
      customers!customer_id ( id, full_name, phone, email ),
      vehicles!vehicle_id ( id, registration, make, model, year, mileage ),
      bays!bay_id ( id, name )
    `)
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!job) notFound();

  // P48 access gate (CLAUDE.md "Page access policy"):
  //   - manager: any job
  //   - mot_tester: assigned job (the "MOT-typed" branch lands with P47's service column)
  //   - mechanic: assigned job only
  if (!isManager) {
    const { data: myAssignment } = await supabase
      .from("job_assignments")
      .select("staff_id")
      .eq("job_id", id)
      .eq("staff_id", session.userId)
      .maybeSingle();
    if (!myAssignment) redirect("/403");
  }

  const customer = Array.isArray(job.customers) ? job.customers[0] : job.customers;
  const vehicle = Array.isArray(job.vehicles) ? job.vehicles[0] : job.vehicles;
  const bay = Array.isArray(job.bays) ? job.bays[0] : job.bays;

  // Fetch assignments, work logs, parts, approvals, bays, staff, charges,
  // invoice in parallel. P54 — the old passbacks fetch is gone; the new
  // JobActivity component reads from `job_timeline_events` directly,
  // which unions pass-backs + work logs + status events through RLS.
  // We still need `workLogs` here to derive the `hasActiveTimer` flag
  // for the P53 Change Handler palette — JobActivity doesn't expose
  // that slice to the caller.
  const [assignments, workLogs, parts, approvals, allBays, allStaff, chargesResult, invoiceResult] = await Promise.all([
    supabase
      .from("job_assignments")
      .select("staff:staff!staff_id ( id, full_name, roles )")
      .eq("job_id", id),
    supabase
      .from("work_logs")
      .select("id, ended_at, staff:staff!staff_id ( id )")
      .eq("job_id", id)
      .is("ended_at", null),
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
      ? supabase.from("staff").select("id, full_name, roles").order("full_name")
      : Promise.resolve({
          data: [] as { id: string; full_name: string; roles: string[] | null }[],
        }),
    isManager
      ? supabase
          .from("job_charges")
          .select("id, charge_type, description, quantity, unit_price_pence")
          .eq("job_id", id)
          .order("created_at")
      : Promise.resolve({ data: [] as { id: string; charge_type: string; description: string; quantity: number; unit_price_pence: number }[] }),
    isManager
      ? supabase
          .from("invoices")
          .select("id, invoice_number, quote_status, subtotal_pence, vat_pence, total_pence, revision, updated_at, paid_at, payment_method")
          .eq("job_id", id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const assignedStaff = (assignments.data ?? []).map((a) => {
    const s = Array.isArray(a.staff) ? a.staff[0] : a.staff;
    return s as { id: string; full_name: string; roles: string[] | null };
  }).filter(Boolean);

  const partsTotalPence = (parts.data ?? []).reduce((sum, p) => sum + (p.total_pence ?? 0), 0);

  const currentRole = (job as { current_role: CurrentRole | null })
    .current_role;
  const viewerIsAssignedMechanic = assignedStaff.some(
    (s) => s.id === session.userId,
  );

  // P53 — Change Handler palette data (managers only).
  //
  // `eligibleStaff` pulls the same availability shape used by the booking
  // assignment modal so the "on DUD-XXXX" pill + current-job link both
  // work. `assigneeInfos` enriches job_assignments with the running-timer
  // flag from the work logs we already loaded, so the override dialog can
  // warn the manager before auto-stopping a timer.
  const eligibleStaff: EligibleStaffInfo[] = isManager
    ? (await getStaffAvailability()).map((s) => ({
        id: s.id,
        full_name: s.full_name,
        roles: s.roles,
        isBusy: s.isBusy,
        currentJobNumber: s.currentJobNumber,
        currentJobId: s.currentJobId,
      }))
    : [];

  const activeStaffIds = new Set(
    (workLogs.data ?? [])
      .filter((wl) => wl.ended_at === null)
      .map((wl) => {
        const s = Array.isArray(wl.staff) ? wl.staff[0] : wl.staff;
        // The select above joins via `staff:staff!staff_id`, so the only
        // id we can recover from this row is the nested staff.id — we
        // didn't fetch the scalar staff_id column. Fall back to a lookup
        // against assignedStaff via name for the edge case where the
        // work log's joined staff row is missing.
        return (s as { id?: string } | null)?.id ?? null;
      })
      .filter((id): id is string => !!id),
  );

  const assigneeInfos: AssigneeInfo[] = assignedStaff.map((s) => ({
    id: s.id,
    full_name: s.full_name,
    roles: s.roles ?? [],
    hasActiveTimer: activeStaffIds.has(s.id),
  }));

  return (
    <PageContainer width="default">
      <JobDetailRealtime jobId={job.id} />
      {/* P52 — Identity row: who/what/where, no actions.
          P38 — stack the identity + metadata blocks on mobile, side-by-side at sm. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="flex items-center gap-2 text-xl font-semibold sm:text-2xl">
              <span className="font-mono">{job.job_number}</span>
            </h1>
            <StatusBadge status={job.status as JobStatus} />
            <RoleBadge role={currentRole} />
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
        <div className="text-sm text-muted-foreground sm:text-right">
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

      {/* P52 — Action row: Primary / Secondary / Overflow. Single source.
          P53 — Passes jobNumber + assignees + eligibleStaff so the manager
          "Change handler…" palette/dialog can render without client-side
          refetches. Props are optional — non-manager viewers never mount
          the dialog, so the defaults are fine there. */}
      <div className="mt-4">
        <JobActionsRow
          job={{
            id: job.id,
            status: job.status as JobStatus,
            service: job.service ?? null,
            current_role: currentRole,
          }}
          viewer={{
            roles: session.roles,
            isAssignedMechanic: viewerIsAssignedMechanic,
          }}
          jobNumber={job.job_number}
          assignees={assigneeInfos}
          eligibleStaff={eligibleStaff}
        />
      </div>

      {/* Charges section (visible to managers) */}

      {/* Customer + Vehicle + Bay & Team — single column on mobile, 3-col at sm+ */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
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
                <RegPlate
                  reg={(vehicle as { registration: string }).registration}
                  size="default"
                />
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
                allStaff={(allStaff.data ?? []) as {
                  id: string;
                  full_name: string;
                  roles: string[] | null;
                }[]}
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

      {/* P54 — Unified Job Activity feed: pass-backs + work sessions +
          status transitions, one chronological source. Replaces the old
          "Pass-back timeline", "Work Log", and "Currently working" panels. */}
      <Separator className="my-6" />
      <JobActivity
        jobId={job.id}
        audience="staff"
        logWorkContext={
          isManager
            ? {
                garageId: session.garageId,
                staff: (allStaff.data ?? []) as {
                  id: string;
                  full_name: string;
                  roles: string[] | null;
                }[],
              }
            : null
        }
      />

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

      {/* Approval request — render only for statuses that legally
       *  transition to `awaiting_customer_approval` per
       *  STATUS_TRANSITIONS in src/lib/validation/job-schemas.ts.
       *  awaiting_parts → awaiting_customer_approval is NOT a legal
       *  transition (see audit 2026-04-28); rendering the dialog
       *  there would just produce a server-action rejection on
       *  submit. If the workflow needs to expand, add the transition
       *  to STATUS_TRANSITIONS first. */}
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
                <div className="flex items-center gap-2">
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
                  {a.status === "pending" && isManager && (
                    <ManualApproveButton approvalId={a.id} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Charges / Quote / Invoice */}
      {isManager && (
        <>
          <Separator className="my-6" />
          <ChargesSection
            jobId={job.id}
            charges={(chargesResult.data ?? []) as { id: string; charge_type: string; description: string; quantity: number; unit_price_pence: number }[]}
            invoice={
              invoiceResult.data
                ? {
                    quoteStatus: (invoiceResult.data as { quote_status: string }).quote_status,
                    subtotalPence: (invoiceResult.data as { subtotal_pence: number }).subtotal_pence,
                    vatPence: (invoiceResult.data as { vat_pence: number }).vat_pence,
                    totalPence: (invoiceResult.data as { total_pence: number }).total_pence,
                    revision: (invoiceResult.data as { revision: number }).revision ?? 1,
                    updatedAt:
                      (invoiceResult.data as { updated_at: string | null }).updated_at ?? null,
                    paidAt:
                      (invoiceResult.data as { paid_at: string | null }).paid_at ?? null,
                    paymentMethod:
                      ((invoiceResult.data as { payment_method: string | null }).payment_method ??
                        null) as "cash" | "card" | "bank_transfer" | "other" | null,
                  }
                : null
            }
          />
        </>
      )}
    </PageContainer>
  );
}
