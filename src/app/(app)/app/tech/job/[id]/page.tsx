import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { requireStaffSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/app/page-container";
import { TechJobClient } from "./TechJobClient";
import { PassbackContextCard } from "./PassbackContextCard";
import { JobActivity } from "@/app/(app)/app/jobs/[id]/JobActivity";
import { JobDetailRealtime } from "@/lib/realtime/shims";
import type { PassbackItem } from "@/lib/constants/passback-items";

interface TechJobDetailProps {
  params: Promise<{ id: string }>;
}

export default async function TechJobDetailPage({ params }: TechJobDetailProps) {
  const session = await requireStaffSession();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: job } = await supabase
    .from("jobs")
    .select(`
      id, job_number, status, description,
      customers!customer_id ( id, full_name, phone ),
      vehicles!vehicle_id ( id, registration, make, model )
    `)
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!job) notFound();

  const customer = Array.isArray(job.customers) ? job.customers[0] : job.customers;
  const vehicle = Array.isArray(job.vehicles) ? job.vehicles[0] : job.vehicles;

  // Only the viewer's own active log — drives the tech UI's
  // start/pause/resume/complete flow. P55 adds paused_at (non-null iff
  // the log is paused RIGHT NOW) + paused_seconds_total (accumulated
  // over prior pauses) so the timer can freeze + show the right button
  // set without another round-trip. Everyone else's activity comes
  // from JobActivity's unified feed.
  const { data: activeLog } = await supabase
    .from("work_logs")
    .select("id, task_type, started_at, paused_at, paused_seconds_total")
    .eq("staff_id", session.userId)
    .eq("job_id", id)
    .is("ended_at", null)
    .maybeSingle();

  // Audit F5 — Pass-back context for the mechanic. Skip the query
  // entirely if the viewer has no mechanic role; mot_testers don't
  // need to see their own pass-back echoed back, and managers use
  // /app/jobs/[id] for oversight. Cross-garage isolation is enforced
  // by the job_passbacks_select RLS policy, not by this gate.
  const showPassback = session.roles.includes("mechanic");
  const { data: openPassback } = showPassback
    ? await supabase
        .from("job_passbacks")
        .select("items, note, created_at, from_role")
        .eq("job_id", id)
        .is("returned_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  return (
    <PageContainer width="narrow" className="pb-8">
      <JobDetailRealtime jobId={job.id} />
      <Link
        href="/app/tech"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to My Work
      </Link>

      {openPassback ? (
        <PassbackContextCard
          items={openPassback.items as PassbackItem[] | null}
          note={openPassback.note}
          createdAt={openPassback.created_at}
          fromRole={openPassback.from_role}
        />
      ) : null}

      <TechJobClient
        jobId={job.id}
        jobNumber={job.job_number}
        status={job.status}
        description={job.description}
        vehicleId={(vehicle as { id: string } | null)?.id ?? null}
        vehicleReg={(vehicle as { registration: string } | null)?.registration ?? null}
        vehicleMakeModel={
          [(vehicle as { make?: string } | null)?.make, (vehicle as { model?: string } | null)?.model]
            .filter(Boolean)
            .join(" ") || "Unknown vehicle"
        }
        customerId={(customer as { id: string } | null)?.id ?? null}
        customerName={(customer as { full_name: string } | null)?.full_name ?? null}
        customerPhone={(customer as { phone: string } | null)?.phone ?? null}
        activeWorkLog={activeLog}
      />

      {/* P54 — Unified activity feed. Absorbs the P49 "currently working"
          panel (running sessions pin to the top) and the tech UI's old
          Work History block. */}
      <div className="mt-6">
        <JobActivity jobId={job.id} audience="staff" />
      </div>
    </PageContainer>
  );
}
