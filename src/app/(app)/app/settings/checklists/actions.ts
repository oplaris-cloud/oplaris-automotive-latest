"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireManager } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  setChecklistEnabledSchema,
  updateChecklistItemsSchema,
  type ChecklistRole,
} from "@/lib/validation/checklist-schemas";

import type { ActionResult } from "../../customers/actions";

// P3.3 — Manager actions behind /app/settings/checklists.
//
// Both writes go through the table's UPDATE RLS policy
// (`job_completion_checklists_update_manager`) which gates on garage_id
// + manager role. We re-check the role at the action layer for the
// loud-failure pattern the rest of the app uses.

async function ensureChecklistRow(
  garageId: string,
  role: ChecklistRole,
): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();

  // The seed in migration 059 inserts a row per (garage, role) at apply
  // time. New garages added later miss that seed, so we self-heal with
  // an upsert. INSERT goes through the manager-only WITH CHECK policy.
  const { error } = await supabase
    .from("job_completion_checklists")
    .upsert(
      {
        garage_id: garageId,
        role,
        items: [],
        enabled: false,
      },
      { onConflict: "garage_id,role", ignoreDuplicates: true },
    );

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function setChecklistEnabled(
  input: z.infer<typeof setChecklistEnabledSchema>,
): Promise<ActionResult> {
  const session = await requireManager();
  const parsed = setChecklistEnabledSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };

  const seed = await ensureChecklistRow(session.garageId, parsed.data.role);
  if (!seed.ok) return seed;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("job_completion_checklists")
    .update({ enabled: parsed.data.enabled })
    .eq("garage_id", session.garageId)
    .eq("role", parsed.data.role);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/app/settings/checklists");
  return { ok: true };
}

export async function updateChecklistItems(
  input: z.infer<typeof updateChecklistItemsSchema>,
): Promise<ActionResult> {
  const session = await requireManager();
  const parsed = updateChecklistItemsSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const k = issue.path[0];
      if (k) fieldErrors[String(k)] = issue.message;
    }
    return { ok: false, error: "Validation failed", fieldErrors };
  }

  const seed = await ensureChecklistRow(session.garageId, parsed.data.role);
  if (!seed.ok) return seed;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("job_completion_checklists")
    .update({ items: parsed.data.items })
    .eq("garage_id", session.garageId)
    .eq("role", parsed.data.role);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/app/settings/checklists");
  return { ok: true };
}
