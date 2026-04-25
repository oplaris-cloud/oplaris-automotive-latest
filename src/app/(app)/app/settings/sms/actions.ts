"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireManager } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TEMPLATE_KEYS, type TemplateKey } from "@/lib/sms/templates";

import type { ActionResult } from "../../customers/actions";

const updateSchema = z.object({
  key: z.enum(TEMPLATE_KEYS),
  body: z
    .string()
    .min(1, "Template body cannot be empty")
    .max(1600, "Template is too long — keep it under 1600 characters"),
});

/**
 * Manager-only update of a single SMS template body. RLS gates this
 * server-side via `sms_templates_update_manager` (migration 055), but
 * we re-check the role at the action layer for the loud-failure
 * pattern the rest of the app uses.
 */
export async function updateSmsTemplate(
  input: z.infer<typeof updateSchema>,
): Promise<ActionResult> {
  const session = await requireManager();
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const k = issue.path[0];
      if (k) fieldErrors[String(k)] = issue.message;
    }
    return { ok: false, error: "Validation failed", fieldErrors };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("sms_templates")
    .update({ body: parsed.data.body })
    .eq("garage_id", session.garageId)
    .eq("template_key", parsed.data.key as TemplateKey);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/app/settings/sms");
  return { ok: true };
}
