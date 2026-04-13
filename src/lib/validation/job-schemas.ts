import { z } from "zod";

// ------------------------------------------------------------------
// Job status state machine
// ------------------------------------------------------------------

export const JOB_STATUSES = [
  "draft",
  "checked_in",
  "booked",
  "in_diagnosis",
  "in_repair",
  "awaiting_parts",
  "awaiting_customer_approval",
  "ready_for_collection",
  "completed",
  "cancelled",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/**
 * Valid status transitions. Key = current status, value = allowed next
 * statuses. Any transition not listed here is rejected server-side.
 */
export const STATUS_TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  draft: ["booked", "in_diagnosis", "cancelled"],
  checked_in: ["in_diagnosis", "cancelled"],
  booked: ["in_diagnosis", "cancelled"],
  in_diagnosis: ["in_repair", "awaiting_parts", "awaiting_customer_approval", "cancelled"],
  in_repair: ["awaiting_parts", "awaiting_customer_approval", "ready_for_collection", "cancelled"],
  awaiting_parts: ["in_repair", "in_diagnosis", "cancelled"],
  awaiting_customer_approval: ["in_repair", "in_diagnosis", "cancelled"],
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
