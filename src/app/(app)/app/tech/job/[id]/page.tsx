import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { requireStaffSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TechJobClient } from "./TechJobClient";

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
      customers!customer_id ( full_name, phone ),
      vehicles!vehicle_id ( registration, make, model )
    `)
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!job) notFound();

  const customer = Array.isArray(job.customers) ? job.customers[0] : job.customers;
  const vehicle = Array.isArray(job.vehicles) ? job.vehicles[0] : job.vehicles;

  // Get active work log for this user
  const { data: activeLog } = await supabase
    .from("work_logs")
    .select("id, task_type, started_at")
    .eq("staff_id", session.userId)
    .eq("job_id", id)
    .is("ended_at", null)
    .maybeSingle();

  // Get all work logs for this job
  const { data: workLogsRaw } = await supabase
    .from("work_logs")
    .select("id, task_type, description, started_at, ended_at, duration_seconds, staff:staff!staff_id ( full_name )")
    .eq("job_id", id)
    .order("started_at", { ascending: false });

  const workLogs = (workLogsRaw ?? []).map((wl) => {
    const staff = Array.isArray(wl.staff) ? wl.staff[0] : wl.staff;
    return {
      id: wl.id,
      task_type: wl.task_type,
      description: wl.description,
      started_at: wl.started_at,
      ended_at: wl.ended_at,
      duration_seconds: wl.duration_seconds,
      staff_name: (staff as { full_name: string } | null)?.full_name ?? "Unknown",
    };
  });

  return (
    <div className="mx-auto max-w-lg pb-8">
      <Link
        href="/app/tech"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to My Work
      </Link>

      <TechJobClient
        jobId={job.id}
        jobNumber={job.job_number}
        status={job.status}
        description={job.description}
        vehicleReg={(vehicle as { registration: string } | null)?.registration ?? null}
        vehicleMakeModel={
          [(vehicle as { make?: string } | null)?.make, (vehicle as { model?: string } | null)?.model]
            .filter(Boolean)
            .join(" ") || "Unknown vehicle"
        }
        customerName={(customer as { full_name: string } | null)?.full_name ?? null}
        customerPhone={(customer as { phone: string } | null)?.phone ?? null}
        activeWorkLog={activeLog}
        workLogs={workLogs}
      />
    </div>
  );
}
