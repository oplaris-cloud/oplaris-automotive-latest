"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  requireManager,
  requireRole,
  requireStaffSession,
} from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PASSBACK_ITEM_VALUES } from "@/lib/constants/passback-items";

import type { ActionResult } from "../../customers/actions";

const passbackItemSchema = z
  .object({
    item: z.enum(PASSBACK_ITEM_VALUES),
    detail: z.string().max(200).optional(),
  })
  .refine(
    (i) => {
      const requiresDetail = i.item === "light_bulb" || i.item === "other";
      if (!requiresDetail) return true;
      return !!i.detail && i.detail.trim().length > 0;
    },
    { message: "Detail is required for this item", path: ["detail"] },
  );

const passJobSchema = z.object({
  jobId: z.string().uuid(),
  items: z.array(passbackItemSchema).min(1),
  note: z.string().max(1000).optional(),
});

/**
 * P51 — MOT tester hands a job back to the mechanic queue as an EVENT on
 * the same job. No second booking, no second job. SECURITY DEFINER RPC
 * `pass_job_to_mechanic` does all the authorised work: role check,
 * multi-tenant check, state guard, work-log close, current_role flip,
 * job_passbacks insert.
 */
export async function passJobToMechanic(
  input: z.infer<typeof passJobSchema>,
): Promise<ActionResult> {
  await requireRole(["manager", "mot_tester"]);
  const parsed = passJobSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Validation failed" };
  }

  const supabase = await createSupabaseServerClient();
  const { data: passbackId, error } = await supabase.rpc(
    "pass_job_to_mechanic",
    {
      p_job_id: parsed.data.jobId,
      p_items: parsed.data.items,
      p_note: parsed.data.note?.trim() || null,
    },
  );

  if (error) return { ok: false, error: error.message };
  if (!passbackId) return { ok: false, error: "Failed to pass job to mechanic" };

  revalidatePath(`/app/jobs/${parsed.data.jobId}`);
  revalidatePath("/app/tech");
  revalidatePath("/app");
  return { ok: true, id: passbackId as string };
}

/**
 * P51 — Mechanic (or manager) returns the passed-back job to the MOT
 * tester once the mechanical work is done. Calls the companion SECURITY
 * DEFINER RPC `return_job_to_mot_tester` which flips current_role and
 * stamps the matching job_passbacks.returned_at.
 */
const returnSchema = z.object({ jobId: z.string().uuid() });

export async function returnJobToMotTester(
  input: z.infer<typeof returnSchema>,
): Promise<ActionResult> {
  await requireRole(["manager", "mechanic"]);
  const parsed = returnSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };

  const supabase = await createSupabaseServerClient();
  const { data: passbackId, error } = await supabase.rpc(
    "return_job_to_mot_tester",
    { p_job_id: parsed.data.jobId },
  );

  if (error) return { ok: false, error: error.message };
  if (!passbackId) return { ok: false, error: "Failed to return job" };

  revalidatePath(`/app/jobs/${parsed.data.jobId}`);
  revalidatePath("/app/tech");
  revalidatePath("/app");
  return { ok: true, id: passbackId as string };
}

/**
 * P51 — MOT tester button "Resume MOT" after a mechanic has returned the
 * job. With the new model, `return_job_to_mot_tester` has already flipped
 * `current_role` back to `mot_tester` — this action just resets the
 * legacy status enum for jobs that were created under the old flow
 * (soak-period safety net). No-ops for any job not currently with the
 * tester.
 */
const resumeSchema = z.object({ jobId: z.string().uuid() });

export async function resumeMotJob(
  input: z.infer<typeof resumeSchema>,
): Promise<ActionResult> {
  const session = await requireStaffSession();
  const parsed = resumeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };

  const allowed =
    session.roles.includes("manager") || session.roles.includes("mot_tester");
  if (!allowed) return { ok: false, error: "Forbidden" };

  const supabase = await createSupabaseServerClient();

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("id, service, status, current_role")
    .eq("id", parsed.data.jobId)
    .is("deleted_at", null)
    .single();

  if (jobErr || !job) return { ok: false, error: "Job not found" };
  if (job.service !== "mot") return { ok: false, error: "Not an MOT job" };

  if (job.current_role !== "mot_tester") {
    return {
      ok: false,
      error: "Mechanic is still working on this job",
    };
  }

  // Soak-only: a job that was flipped by the new RPC may still sit at the
  // deprecated 'awaiting_mechanic' status. Reset it so the UI state matches
  // reality. Jobs created under P51 never hit awaiting_mechanic.
  if (job.status === "awaiting_mechanic") {
    const { error: updErr } = await supabase
      .from("jobs")
      .update({ status: "in_diagnosis" })
      .eq("id", job.id);
    if (updErr) return { ok: false, error: updErr.message };
  }

  revalidatePath(`/app/jobs/${job.id}`);
  revalidatePath("/app/tech");
  return { ok: true };
}

/**
 * P53 — Manager command-palette handler override. Single atomic RPC call
 * mediating the full compound action: flip `current_role`, delete
 * off-going assignees (auto-stopping any running work_logs), optionally
 * insert a new assignee, close any open pass-back, append an event row
 * and an audit_log entry.
 *
 * Supersedes the P52 `overrideJobRole` direct-UPDATE action: that was
 * role-only and left `job_assignments` and open pass-backs stale, which
 * the palette UI would now expose.
 */
const overrideHandlerSchema = z.object({
  jobId: z.string().uuid(),
  targetRole: z.enum(["mot_tester", "mechanic", "manager"]),
  removeStaffIds: z.array(z.string().uuid()).default([]),
  assignStaffId: z.string().uuid().nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

export async function overrideJobHandler(
  input: z.infer<typeof overrideHandlerSchema>,
): Promise<ActionResult> {
  await requireManager();
  const parsed = overrideHandlerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("override_job_handler", {
    p_job_id: parsed.data.jobId,
    p_target_role: parsed.data.targetRole,
    p_remove_staff_ids: parsed.data.removeStaffIds,
    p_assign_staff_id: parsed.data.assignStaffId ?? null,
    p_note: parsed.data.note?.trim() || null,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/app/jobs/${parsed.data.jobId}`);
  revalidatePath("/app/tech");
  revalidatePath("/app");
  return { ok: true, id: (data as string | null) ?? parsed.data.jobId };
}
