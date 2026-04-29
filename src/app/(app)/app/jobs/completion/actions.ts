"use server";

import { z } from "zod";

import { requireStaffSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  CHECKLIST_ROLES,
  submitCompletionCheckSchema,
  type ChecklistRole,
} from "@/lib/validation/checklist-schemas";

import type { ActionResult } from "../../customers/actions";

// P3.3 — Tech-side actions for the end-of-job completion checklist.
//
// `getActiveChecklist()` is what the tech UI calls right before
// completing a job: it picks the tech's effective role + returns the
// live items only when the manager has enabled it. If nothing is
// returned, the dialog is skipped entirely and the existing
// `completeWork()` action runs straight through.
//
// `submitCompletionCheck()` thinly wraps the SECURITY DEFINER RPC so
// the action signature stays in the same flavour as the rest of the
// codebase. The RPC re-validates assignment + answer shape server-side,
// so a stale dialog can't smuggle answers for a different role's items.

const taskTypeSchema = z
  .enum([
    "diagnosis",
    "engine",
    "brakes",
    "electrical",
    "suspension",
    "tyres",
    "mot_test",
    "testing",
    "other",
  ])
  .optional();

interface ActiveChecklist {
  role: ChecklistRole;
  items: string[];
}

export async function getActiveChecklist(input: {
  jobId: string;
  taskType?: string | null;
}): Promise<ActiveChecklist | null> {
  const session = await requireStaffSession();

  const taskType = taskTypeSchema.safeParse(input.taskType ?? undefined);
  const isMotTask = taskType.success && taskType.data === "mot_test";

  // Pick the tech's effective role: an MOT task done by an MOT-tester
  // gets the MOT-tester checklist; otherwise prefer 'mechanic' (most
  // jobs are mechanic-led). Manager-only sessions never see the dialog.
  let role: ChecklistRole | null = null;
  if (isMotTask && session.roles.includes("mot_tester")) {
    role = "mot_tester";
  } else if (session.roles.includes("mechanic")) {
    role = "mechanic";
  } else if (session.roles.includes("mot_tester")) {
    role = "mot_tester";
  }
  if (!role) return null;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("job_completion_checklists")
    .select("role, items, enabled")
    .eq("garage_id", session.garageId)
    .eq("role", role)
    .maybeSingle();

  if (error) {
    console.error("[completion-checklist] load error:", error.message);
    return null;
  }
  if (!data || !data.enabled) return null;
  const items = Array.isArray(data.items) ? (data.items as string[]) : [];
  if (items.length === 0) return null;
  if (!CHECKLIST_ROLES.includes(role)) return null;

  return { role, items };
}

export async function submitCompletionCheck(
  input: z.infer<typeof submitCompletionCheckSchema>,
): Promise<ActionResult> {
  await requireStaffSession();
  const parsed = submitCompletionCheckSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("submit_completion_check", {
    p_job_id: parsed.data.jobId,
    p_answers: parsed.data.answers,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data as string };
}
