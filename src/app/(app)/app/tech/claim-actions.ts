"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { ActionResult } from "../customers/actions";

const claimSchema = z.object({ jobId: z.string().uuid() });

/**
 * P51 — Mechanic claims a job that an MOT tester has passed back. Calls
 * the SECURITY DEFINER RPC that inserts the job_assignments row
 * (INSERT on job_assignments is manager-only at the RLS layer).
 */
export async function claimPassback(
  input: z.infer<typeof claimSchema>,
): Promise<ActionResult> {
  await requireRole(["manager", "mechanic"]);
  const parsed = claimSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("claim_passback", {
    p_job_id: parsed.data.jobId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/app/tech");
  revalidatePath(`/app/tech/job/${parsed.data.jobId}`);
  return { ok: true, id: parsed.data.jobId };
}
