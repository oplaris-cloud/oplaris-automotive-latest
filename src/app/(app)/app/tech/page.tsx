import Link from "next/link";
import { ArrowRightLeft, Phone, UserCheck, Wrench } from "lucide-react";

import { requireStaffSession, type StaffRole } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MilestoneAchievementIllustration } from "@/components/illustrations";
import { PageContainer } from "@/components/app/page-container";
import { PassbackBadge } from "@/components/ui/passback-badge";
import { RegPlate } from "@/components/ui/reg-plate";
import { Section } from "@/components/ui/section";
import { Stack } from "@/components/ui/stack";
import { StatusBadge } from "@/components/ui/status-badge";
import type { JobStatus } from "@/lib/validation/job-schemas";
import {
  summarisePassback,
  type PassbackItem,
} from "@/lib/constants/passback-items";
import {
  getCategoryStyles,
  type ServiceKind,
} from "@/lib/constants/service-categories";
import { formatPhone, formatWorkLogTime } from "@/lib/format";

import { listOpenCheckIns, type OpenCheckIn } from "../bookings/actions";
import { StartMotButton } from "../bookings/StartMotButton";
import { StartWorkButton } from "../bookings/StartWorkButton";
import { ClaimPassbackButton } from "./ClaimPassbackButton";
import { MyWorkRealtime } from "@/lib/realtime/shims";

interface AssignedJob {
  id: string;
  job_number: string;
  status: JobStatus;
  description: string | null;
  service: string | null;
  awaiting_passback: boolean;
  vehicle: { registration: string; make: string | null; model: string | null } | null;
  customer: { full_name: string; phone: string | null } | null;
  activeSince: string | null;
}

const IN_PROGRESS_STATUSES: JobStatus[] = [
  "in_diagnosis",
  "in_repair",
  "awaiting_parts",
  "awaiting_customer_approval",
  "awaiting_mechanic",
  "ready_for_collection",
];

export default async function MyWorkPage() {
  const session = await requireStaffSession();
  const isManager = session.roles.includes("manager");
  const supabase = await createSupabaseServerClient();

  // 1. Assigned jobs (any status except terminal) for the current user.
  const { data: assignments } = await supabase
    .from("job_assignments")
    .select(
      `job_id,
       jobs!job_id (
         id, job_number, status, description, service, awaiting_passback,
         vehicles!vehicle_id ( registration, make, model ),
         customers!customer_id ( full_name, phone )
       )`,
    )
    .eq("staff_id", session.userId);

  // 2. Active work log for this user — drives the "started HH:MM:SS" stamp.
  const { data: activeLog } = await supabase
    .from("work_logs")
    .select("id, job_id, started_at")
    .eq("staff_id", session.userId)
    .is("ended_at", null)
    .maybeSingle();

  const activeJobId = activeLog?.job_id ?? null;
  const activeStartedAt = activeLog?.started_at ?? null;

  const myJobs: AssignedJob[] = (assignments ?? [])
    .map((a) => (Array.isArray(a.jobs) ? a.jobs[0] : a.jobs))
    .filter(Boolean)
    .filter((j) => j!.status !== "completed" && j!.status !== "cancelled")
    .map((j) => {
      const job = j!;
      const vehicle = Array.isArray(job.vehicles) ? job.vehicles[0] : job.vehicles;
      const customer = Array.isArray(job.customers) ? job.customers[0] : job.customers;
      return {
        id: job.id,
        job_number: job.job_number,
        status: job.status as JobStatus,
        description: job.description,
        service: (job as { service: string | null }).service ?? null,
        awaiting_passback:
          (job as { awaiting_passback?: boolean }).awaiting_passback ?? false,
        vehicle: vehicle as AssignedJob["vehicle"],
        customer: customer as AssignedJob["customer"],
        activeSince: job.id === activeJobId ? activeStartedAt : null,
      };
    });

  const checkedInJobs = myJobs.filter((j) => j.status === "checked_in");
  // Paused MOTs (passed back to a mechanic) sort before freshly-started
  // jobs so the tester returns to the original before picking up newer
  // work — the mechanic's passback fix is typically quick and the
  // original MOT finishes sooner this way.
  const inProgressJobs = myJobs
    .filter((j) => IN_PROGRESS_STATUSES.includes(j.status))
    .sort((a, b) => {
      if (a.awaiting_passback !== b.awaiting_passback) {
        return a.awaiting_passback ? -1 : 1;
      }
      return 0;
    });

  // 3. Open check-ins (pre-job) the viewer can action. RLS filters by role.
  const checkIns = await listOpenCheckIns();

  // 4. P51 — "Passed back to me": unassigned jobs sitting in the mechanic
  //    queue (current_role='mechanic', no mechanic yet on job_assignments).
  //    The tester might be assigned; that's fine — we check mechanic
  //    assignment specifically via the unnested staff roles.
  const canSeePassbacks =
    session.roles.includes("mechanic") || isManager;

  let passbackRows: AssignedJob[] = [];
  if (canSeePassbacks) {
    const { data: pbJobs } = await supabase
      .from("jobs")
      .select(
        `id, job_number, status, description, service, awaiting_passback,
         updated_at,
         vehicles!vehicle_id ( registration, make, model ),
         customers!customer_id ( full_name, phone ),
         job_assignments ( staff_id, staff:staff!staff_id ( roles ) )`,
      )
      .eq("current_role", "mechanic")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });

    passbackRows = (pbJobs ?? [])
      .filter((j) => {
        const assns = (j as { job_assignments?: { staff?: { roles?: string[] | null }[] | { roles?: string[] | null } | null }[] }).job_assignments ?? [];
        const mechanicAlreadyOn = assns.some((a) => {
          const s = Array.isArray(a.staff) ? a.staff[0] : a.staff;
          return (s?.roles ?? []).includes("mechanic");
        });
        return !mechanicAlreadyOn;
      })
      .map((j) => {
        const vehicle = Array.isArray(j.vehicles) ? j.vehicles[0] : j.vehicles;
        const customer = Array.isArray(j.customers) ? j.customers[0] : j.customers;
        return {
          id: j.id,
          job_number: j.job_number,
          status: j.status as JobStatus,
          description: j.description,
          service: (j as { service: string | null }).service ?? null,
          awaiting_passback: true,
          vehicle: vehicle as AssignedJob["vehicle"],
          customer: customer as AssignedJob["customer"],
          activeSince: null,
        };
      });
  }

  const hasNothing =
    checkedInJobs.length === 0 &&
    inProgressJobs.length === 0 &&
    checkIns.length === 0 &&
    passbackRows.length === 0;

  return (
    <PageContainer width="narrow" className="pb-8">
      <MyWorkRealtime garageId={session.garageId} />
      <h1 className="text-2xl font-semibold">My Work</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Everything waiting on you and everything you&apos;ve started.
      </p>

      {hasNothing ? (
        <EmptyState
          illustration={MilestoneAchievementIllustration}
          title="Nothing on your plate"
          description="New check-ins and assigned jobs will appear here."
          className="mt-8"
        />
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* P51 — Passed back to me (mechanic pull queue)                      */}
      {/* P56.0 (S-H1) — Sections now use the <Section> primitive so the    */}
      {/*   32 px section-rhythm is enforced centrally; rows use <Stack>.   */}
      {/* ------------------------------------------------------------------ */}
      {passbackRows.length > 0 && (
        <Section
          title={
            <span className="flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4 text-warning" />
              Passed back to me
            </span>
          }
        >
          <Stack gap="sm">
            {passbackRows.map((j) => (
              <PassbackRow key={j.id} job={j} />
            ))}
          </Stack>
        </Section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Checked in                                                         */}
      {/* ------------------------------------------------------------------ */}
      {(checkIns.length > 0 || checkedInJobs.length > 0) && (
        <Section
          title={
            <span className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-muted-foreground" />
              Checked in
            </span>
          }
        >
          <Stack gap="sm">
            {/* Pre-job check-ins — one-click self-start per role. */}
            {checkIns.map((c) => (
              <CheckInRow
                key={`b-${c.id}`}
                checkIn={c}
                roles={session.roles}
                canStartMot={
                  c.service === "mot" &&
                  (isManager || session.roles.includes("mot_tester"))
                }
                canStartWork={
                  c.service !== "mot" &&
                  (isManager || session.roles.includes("mechanic"))
                }
              />
            ))}

            {/* Already-created jobs still sitting at checked_in */}
            {checkedInJobs.map((j) => (
              <JobRow key={`j-${j.id}`} job={j} href={techJobHref(j.id)} />
            ))}
          </Stack>
        </Section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* In progress                                                        */}
      {/* ------------------------------------------------------------------ */}
      {inProgressJobs.length > 0 && (
        <Section
          title={
            <span className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-muted-foreground" />
              In progress
            </span>
          }
        >
          <Stack gap="sm">
            {inProgressJobs.map((j) => (
              <JobRow key={j.id} job={j} href={techJobHref(j.id)} />
            ))}
          </Stack>
        </Section>
      )}
    </PageContainer>
  );
}

function techJobHref(jobId: string): string {
  // Tech mobile UI first; manager can still hit /app/jobs/[id] from
  // anywhere else, but from My Work we want the phone-optimised screen.
  return `/app/tech/job/${jobId}`;
}

function JobRow({ job, href }: { job: AssignedJob; href: string }) {
  const isActive = !!job.activeSince;
  // awaiting_passback is severity-equivalent to a passback check-in; route
  // it through the same "urgent" styling for consistency across pages.
  const styles = getCategoryStyles(
    (job.service as ServiceKind) ?? "maintenance",
    { isPassback: job.awaiting_passback },
  );
  return (
    <Link href={href}>
      <Card
        className={`transition-shadow hover:shadow-md ${styles.border} ${
          isActive ? "ring-2 ring-success" : ""
        }`}
      >
        <CardContent className="p-4">
          {/* Line 1 — identifier + status (visual hierarchy: job number left, status right) */}
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-sm font-bold">{job.job_number}</span>
            <StatusBadge status={job.status} />
          </div>

          {/* Line 2 — category + paused chip */}
          {job.service || job.awaiting_passback ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {job.service ? (
                <Badge
                  variant="outline"
                  className={`capitalize ${styles.badge}`}
                >
                  {job.service}
                </Badge>
              ) : null}
              {job.awaiting_passback ? <PassbackBadge /> : null}
            </div>
          ) : null}

          {/* Line 3 — vehicle */}
          {job.vehicle ? (
            <div className="mt-2 font-mono text-base font-bold">
              {job.vehicle.registration}
              <span className="ml-2 font-sans text-sm font-normal text-muted-foreground">
                {[job.vehicle.make, job.vehicle.model].filter(Boolean).join(" ")}
              </span>
            </div>
          ) : null}

          {/* Line 4 — customer */}
          {job.customer ? (
            <div className="mt-1 text-sm text-muted-foreground">
              {job.customer.full_name}
            </div>
          ) : null}

          {/* Line 4b — tap-to-call (audit F7). stopPropagation prevents
              the tap from activating the outer Link to the job detail. */}
          {job.customer?.phone ? (
            <a
              href={`tel:${job.customer.phone}`}
              onClick={(e) => e.stopPropagation()}
              className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm text-primary underline-offset-4 hover:underline"
              aria-label={`Call ${job.customer.full_name}`}
            >
              <Phone className="h-4 w-4" /> {formatPhone(job.customer.phone)}
            </a>
          ) : null}

          {/* Line 5 — description */}
          {job.description ? (
            <div className="mt-2 text-sm">{job.description.slice(0, 120)}</div>
          ) : null}

          {/* Live footer */}
          {isActive && job.activeSince ? (
            <div className="mt-2 text-xs text-success">
              Working since {formatWorkLogTime(job.activeSince)}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </Link>
  );
}

function PassbackRow({ job }: { job: AssignedJob }) {
  const styles = getCategoryStyles(
    (job.service as ServiceKind) ?? "maintenance",
    { isPassback: true },
  );
  return (
    <Card className={styles.border}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold">{job.job_number}</span>
              <PassbackBadge />
            </div>
            {job.vehicle ? (
              <div className="mt-2 font-mono text-sm">
                <RegPlate reg={job.vehicle.registration} size="sm" />
                <span className="ml-2 font-sans text-xs text-muted-foreground">
                  {[job.vehicle.make, job.vehicle.model].filter(Boolean).join(" ")}
                </span>
              </div>
            ) : null}
            {job.customer ? (
              <div className="mt-1 text-sm text-muted-foreground">
                {job.customer.full_name}
              </div>
            ) : null}
            {job.description ? (
              <div className="mt-1 text-xs">{job.description.slice(0, 120)}</div>
            ) : null}
          </div>
          <div className="shrink-0">
            <ClaimPassbackButton jobId={job.id} className={`gap-1.5 ${styles.button}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CheckInRow({
  checkIn,
  roles,
  canStartMot,
  canStartWork,
}: {
  checkIn: OpenCheckIn;
  roles: readonly StaffRole[];
  canStartMot: boolean;
  canStartWork: boolean;
}) {
  const isPassback = !!checkIn.passed_from_job_id;
  const styles = getCategoryStyles(checkIn.service as ServiceKind, {
    isPassback,
    priority: checkIn.priority ?? 0,
  });
  const summary = summarisePassback(
    checkIn.passback_items as PassbackItem[] | null,
  );
  return (
    <Card className={styles.border}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {/* Line 1 — customer name is the identifier */}
            <div className="font-medium">{checkIn.customer_name}</div>

            {/* Line 1b — tap-to-call (audit F7). Check-in cards aren't
                wrapped in an outer Link, so stopPropagation is belt-only;
                kept for symmetry with JobRow's anchor. */}
            {checkIn.customer_phone ? (
              <a
                href={`tel:${checkIn.customer_phone}`}
                onClick={(e) => e.stopPropagation()}
                className="mt-1 inline-flex min-h-11 items-center gap-2 text-sm text-primary underline-offset-4 hover:underline"
                aria-label={`Call ${checkIn.customer_name}`}
              >
                <Phone className="h-4 w-4" /> {formatPhone(checkIn.customer_phone)}
              </a>
            ) : null}

            {/* Line 2 — category chips */}
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge
                variant="outline"
                className={`capitalize ${styles.badge}`}
              >
                {checkIn.service}
              </Badge>
              {isPassback ? <PassbackBadge /> : null}
            </div>

            {/* Line 3 — vehicle */}
            <div className="mt-2 text-sm text-muted-foreground">
              <RegPlate reg={checkIn.registration} size="sm" />
              {checkIn.make ? (
                <span className="ml-2">
                  {checkIn.make} {checkIn.model ?? ""}
                </span>
              ) : null}
            </div>

            {/* Line 4 — checklist summary / free-form notes */}
            {summary ? (
              <div className="mt-1 inline-block rounded-md bg-warning/15 px-2 py-1 text-xs text-foreground">
                {summary}
                {checkIn.passback_note ? ` — ${checkIn.passback_note}` : ""}
              </div>
            ) : null}
            {checkIn.notes && !summary ? (
              <div className="mt-1 text-xs text-muted-foreground">
                {checkIn.notes}
              </div>
            ) : null}
          </div>

          {/* Category-coloured primary action on the right */}
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {canStartMot ? (
              <StartMotButton
                bookingId={checkIn.id}
                roles={roles}
                className={styles.button}
              />
            ) : null}
            {canStartWork ? (
              <StartWorkButton
                bookingId={checkIn.id}
                roles={roles}
                className={styles.button}
              />
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
