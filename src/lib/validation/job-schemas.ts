import { z } from "zod";

// ------------------------------------------------------------------
// Job status state machine
// ------------------------------------------------------------------
//
// `draft` and `booked` exist in the Postgres enum for historical reasons
// but are not part of the active flow (migration 029 retired them). Every
// new job enters at `checked_in`. Removing the enum values would require
// a disruptive rebuild, so we leave them in the DB and omit them here.

export const JOB_STATUSES = [
  "checked_in",
  "in_diagnosis",
  "in_repair",
  "awaiting_parts",
  "awaiting_customer_approval",
  "awaiting_mechanic",
  "ready_for_collection",
  "completed",
  "cancelled",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/**
 * Valid status transitions. Key = current status, value = allowed next
 * statuses. Any transition not listed here is rejected server-side.
 *
 * P52 / P51: `awaiting_mechanic` is NOT a legal forward target from
 * `in_diagnosis` or `in_repair`. The MOT tester hands a job to the
 * mechanic via the `pass_job_to_mechanic` RPC (P51) — which flips
 * `jobs.current_role`, not `jobs.status`. The old "Pass to Mechanic"
 * status button was a silent bypass that skipped the `job_passbacks`
 * audit row. It's gone.
 *
 * The reverse transitions (`awaiting_mechanic → in_diagnosis / in_repair /
 * cancelled`) are kept so legacy jobs still carrying the deprecated
 * status from the pre-P51 world can be resolved during the soak. The
 * `awaiting_mechanic` key is NOT dropped (migration 034 will do that
 * after soak-end).
 */
export const STATUS_TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  checked_in: ["in_diagnosis", "cancelled"],
  in_diagnosis: ["in_repair", "awaiting_parts", "awaiting_customer_approval", "cancelled"],
  in_repair: ["awaiting_parts", "awaiting_customer_approval", "ready_for_collection", "cancelled"],
  awaiting_parts: ["in_repair", "in_diagnosis", "cancelled"],
  awaiting_customer_approval: ["in_repair", "in_diagnosis", "cancelled"],
  awaiting_mechanic: ["in_diagnosis", "in_repair", "cancelled"],
  ready_for_collection: ["completed"],
  completed: [],
  cancelled: [],
};

export function isValidTransition(from: JobStatus, to: JobStatus): boolean {
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

// ------------------------------------------------------------------
// Zod schemas
// ------------------------------------------------------------------

export const createJobSchema = z.object({
  customerId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  description: z.string().max(2000).optional().or(z.literal("")),
  source: z.enum(["manager", "kiosk", "online", "phone", "walk_in"]).default("manager"),
  bayId: z.string().uuid().optional(),
  estimatedReadyAt: z.string().datetime().optional(),
});
export type CreateJobInput = z.infer<typeof createJobSchema>;

export const updateJobStatusSchema = z.object({
  jobId: z.string().uuid(),
  status: z.enum(JOB_STATUSES),
});
export type UpdateJobStatusInput = z.infer<typeof updateJobStatusSchema>;

export const assignBaySchema = z.object({
  jobId: z.string().uuid(),
  bayId: z.string().uuid().nullable(),
});

export const assignTechSchema = z.object({
  jobId: z.string().uuid(),
  staffId: z.string().uuid(),
});
