"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireStaffSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { ActionResult } from "../../customers/actions";

const WORK_TASK_TYPES = [
  "diagnosis",
  "engine",
  "brakes",
  "electrical",
  "suspension",
  "tyres",
  "mot_test",
  "testing",
  "other",
] as const;

const startWorkSchema = z.object({
  jobId: z.string().uuid(),
  taskType: z.enum(WORK_TASK_TYPES),
  description: z.string().max(2000).optional().or(z.literal("")),
});

const workLogIdSchema = z.object({
  workLogId: z.string().uuid(),
});

// ------------------------------------------------------------------
// Start work — server timestamp, one active log per staff enforced by DB
// ------------------------------------------------------------------

export async function startWork(
  input: z.infer<typeof startWorkSchema>,
): Promise<ActionResult> {
  const session = await requireStaffSession();
  const parsed = startWorkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };

  const supabase = await createSupabaseServerClient();

  // Server-side timestamp — client can't tamper with started_at
  const { data, error } = await supabase
    .from("work_logs")
    .insert({
      garage_id: session.garageId,
      job_id: parsed.data.jobId,
      staff_id: session.userId,
      task_type: parsed.data.taskType,
      description: parsed.data.description || null,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    // 23505 = unique_violation from `one_running_log_per_staff` partial unique index
    if (error.code === "23505") {
      return { ok: false, error: "You already have work running. Pause or complete it first." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/app/jobs");
  revalidatePath("/app/tech");
  revalidatePath("/app/bay-board");
  return { ok: true, id: data.id };
}

// ------------------------------------------------------------------
// Pause work — sets ended_at, frees the one-active-per-staff slot
// ------------------------------------------------------------------

export async function pauseWork(
  input: z.infer<typeof workLogIdSchema>,
): Promise<ActionResult> {
  const session = await requireStaffSession();
  const parsed = workLogIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };

  const supabase = await createSupabaseServerClient();

  // Only allow pausing YOUR OWN running log (ended_at IS NULL).
  // RLS already scopes to staff_id = auth.uid() but being explicit
  // prevents confusion if the policy changes.
  const { error, count } = await supabase
    .from("work_logs")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", parsed.data.workLogId)
    .eq("staff_id", session.userId)
    .is("ended_at", null);

  if (error) return { ok: false, error: error.message };
  if (count === 0) return { ok: false, error: "No running work log found" };

  revalidatePath("/app/jobs");
  revalidatePath("/app/tech");
  revalidatePath("/app/bay-board");
  return { ok: true, id: parsed.data.workLogId };
}

// ------------------------------------------------------------------
// Complete work — same as pause mechanically, different semantically.
// The UI may prompt for a summary; the DB doesn't distinguish yet.
// ------------------------------------------------------------------

export async function completeWork(
  input: z.infer<typeof workLogIdSchema>,
): Promise<ActionResult> {
  // Identical to pauseWork; split so the UI can attach different
  // post-completion hooks (e.g. auto-advancing job status) later.
  return pauseWork(input);
}
