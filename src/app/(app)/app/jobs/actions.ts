"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  requireManager,
  requireManagerOrTester,
  requireStaffSession,
} from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  assignBaySchema,
  assignTechSchema,
  createJobSchema,
  isValidTransition,
  updateJobStatusSchema,
  type CreateJobInput,
  type JobStatus,
  type UpdateJobStatusInput,
} from "@/lib/validation/job-schemas";

import type { ActionResult } from "../customers/actions";

// ------------------------------------------------------------------
// Create job (uses SECURITY DEFINER RPC for atomic job number)
// ------------------------------------------------------------------

export async function createJob(input: CreateJobInput): Promise<ActionResult> {
  await requireManager();
  const parsed = createJobSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key) fieldErrors[String(key)] = issue.message;
    }
    return { ok: false, error: "Validation failed", fieldErrors };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_job", {
    p_customer_id: parsed.data.customerId,
    p_vehicle_id: parsed.data.vehicleId,
    p_description: parsed.data.description || null,
    p_source: parsed.data.source,
    p_bay_id: parsed.data.bayId ?? null,
    p_estimated_ready_at: parsed.data.estimatedReadyAt ?? null,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/app/jobs");
  revalidatePath("/app/bay-board");
  return { ok: true, id: data as string };
}

// ------------------------------------------------------------------
// Update job status (state machine enforced)
// ------------------------------------------------------------------

export async function updateJobStatus(
  input: UpdateJobStatusInput,
): Promise<ActionResult> {
  await requireManagerOrTester();
  const parsed = updateJobStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };

  const supabase = await createSupabaseServerClient();

  // Read current status
  const { data: job, error: readErr } = await supabase
    .from("jobs")
    .select("status")
    .eq("id", parsed.data.jobId)
    .single();

  if (readErr || !job) return { ok: false, error: "Job not found" };

  const currentStatus = job.status as JobStatus;
  if (!isValidTransition(currentStatus, parsed.data.status)) {
    return {
      ok: false,
      error: `Cannot transition from "${currentStatus}" to "${parsed.data.status}"`,
    };
  }

  const updates: Record<string, unknown> = { status: parsed.data.status };
  if (parsed.data.status === "completed") {
    updates.completed_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("jobs")
    .update(updates)
    .eq("id", parsed.data.jobId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/app/jobs");
  revalidatePath("/app/bay-board");
  return { ok: true, id: parsed.data.jobId };
}

// ------------------------------------------------------------------
// Update job details (description, ETA)
// ------------------------------------------------------------------

const updateJobDetailsSchema = z.object({
  jobId: z.string().uuid(),
  description: z.string().max(2000).optional(),
  estimatedReadyAt: z.string().optional().or(z.literal("")),
});

export async function updateJobDetails(
  input: z.infer<typeof updateJobDetailsSchema>,
): Promise<ActionResult> {
  await requireManager();
  const parsed = updateJobDetailsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };

  const updates: Record<string, unknown> = {};
  if (parsed.data.description !== undefined) updates.description = parsed.data.description || null;
  if (parsed.data.estimatedReadyAt !== undefined) {
    updates.estimated_ready_at = parsed.data.estimatedReadyAt
      ? new Date(parsed.data.estimatedReadyAt).toISOString()
      : null;
  }

  if (Object.keys(updates).length === 0) return { ok: true, id: parsed.data.jobId };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("jobs")
    .update(updates)
    .eq("id", parsed.data.jobId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/app/jobs");
  return { ok: true, id: parsed.data.jobId };
}

// ------------------------------------------------------------------
// Assign / unassign bay
// ------------------------------------------------------------------

export async function assignBay(
  input: { jobId: string; bayId: string | null },
): Promise<ActionResult> {
  await requireManager();
  const parsed = assignBaySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("jobs")
    .update({ bay_id: parsed.data.bayId })
    .eq("id", parsed.data.jobId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/app/bay-board");
  return { ok: true, id: parsed.data.jobId };
}

// ------------------------------------------------------------------
// Assign / unassign technician
// ------------------------------------------------------------------

export async function assignTech(
  input: { jobId: string; staffId: string },
): Promise<ActionResult> {
  const session = await requireManager();
  const parsed = assignTechSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("job_assignments").insert({
    job_id: parsed.data.jobId,
    staff_id: parsed.data.staffId,
    garage_id: session.garageId,
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Technician is already assigned to this job" };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/app/jobs");
  revalidatePath("/app/bay-board");
  return { ok: true };
}

export async function unassignTech(
  input: { jobId: string; staffId: string },
): Promise<ActionResult> {
  await requireManager();
  const parsed = assignTechSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("job_assignments")
    .delete()
    .eq("job_id", parsed.data.jobId)
    .eq("staff_id", parsed.data.staffId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/app/jobs");
  revalidatePath("/app/bay-board");
  return { ok: true };
}

// ------------------------------------------------------------------
// Bay board query — single SQL, nested JSON
// ------------------------------------------------------------------

export async function getBayBoard(): Promise<{
  bays: BayWithJobs[];
  error?: string;
}> {
  await requireStaffSession();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("bays")
    .select(
      `
      id, name, position, capability,
      jobs:jobs!bay_id (
        id, job_number, status, description, estimated_ready_at,
        customer:customers!customer_id ( id, full_name, phone ),
        vehicle:vehicles!vehicle_id ( id, registration, make, model ),
        assignments:job_assignments ( staff:staff!staff_id ( id, full_name ) ),
        work_logs:work_logs ( id, staff_id, task_type, started_at, ended_at )
      )
    `,
    )
    .order("position", { ascending: true });

  if (error) return { bays: [], error: error.message };

  return { bays: (data ?? []) as unknown as BayWithJobs[] };
}

export interface BayWithJobs {
  id: string;
  name: string;
  position: number;
  capability: string[];
  jobs: BayJob[];
}

export interface BayJob {
  id: string;
  job_number: string;
  status: JobStatus;
  description: string | null;
  estimated_ready_at: string | null;
  customer: { id: string; full_name: string; phone: string } | null;
  vehicle: {
    id: string;
    registration: string;
    make: string | null;
    model: string | null;
  } | null;
  assignments: { staff: { id: string; full_name: string } }[];
  work_logs: {
    id: string;
    staff_id: string;
    task_type: string;
    started_at: string;
    ended_at: string | null;
  }[];
}
