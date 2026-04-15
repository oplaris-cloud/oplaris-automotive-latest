"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireManager } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { ActionResult } from "../../customers/actions";

const updateBillingSchema = z.object({
  labourRatePounds: z.coerce.number().min(0).max(10_000),
  labourDefaultDescription: z.string().max(200).optional().or(z.literal("")),
});

export async function updateBillingSettings(
  input: z.infer<typeof updateBillingSchema>,
): Promise<ActionResult> {
  const session = await requireManager();
  const parsed = updateBillingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("garages")
    .update({
      labour_rate_pence: Math.round(parsed.data.labourRatePounds * 100),
      labour_default_description:
        parsed.data.labourDefaultDescription?.trim() || null,
    })
    .eq("id", session.garageId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/app/settings/billing");
  revalidatePath("/app/jobs");
  return { ok: true };
}
