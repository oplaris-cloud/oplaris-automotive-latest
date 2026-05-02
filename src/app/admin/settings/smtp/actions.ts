"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireSuperAdmin } from "@/lib/auth/session";
import { readImpersonationCookie } from "@/lib/auth/super-admin-cookie";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { sendEmail } from "@/lib/email/send";

const formSchema = z.object({
  host: z.string().min(1).max(255),
  port: z.coerce.number().int().positive().max(65535),
  username: z.string().min(1).max(255),
  password: z.string().max(512), // empty = keep existing
  from_email: z.string().email(),
  from_name: z.string().min(1).max(255),
  secure: z.union([z.literal("on"), z.literal("off"), z.null()]).optional(),
});

export async function saveSmtpSettings(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const impersonation = await readImpersonationCookie();
  if (!impersonation) {
    redirect("/admin?error=no_garage_selected");
  }

  const parsed = formSchema.safeParse({
    host: formData.get("host"),
    port: formData.get("port"),
    username: formData.get("username"),
    password: formData.get("password") ?? "",
    from_email: formData.get("from_email"),
    from_name: formData.get("from_name"),
    secure: formData.get("secure"),
  });
  if (!parsed.success) {
    redirect(
      `/admin/settings/smtp?error=${encodeURIComponent(parsed.error.message)}`,
    );
  }

  const env = serverEnv();
  const supabase = await createSupabaseServerClient();

  // If password is blank AND there's already a row, keep the existing
  // ciphertext. Easiest path: read meta to confirm existence; if so,
  // call a smaller no-password helper. For v1, simplest: skip the
  // upsert when password is blank + row exists.
  if (parsed.data.password.length === 0) {
    const { data: rows } = await supabase.rpc("get_smtp_settings_meta", {
      p_garage_id: impersonation.garageId,
    });
    const has = Array.isArray(rows) ? rows.length > 0 : Boolean(rows);
    if (!has) {
      redirect(
        "/admin/settings/smtp?error=" +
          encodeURIComponent("Password is required for the first save."),
      );
    }
    // Update everything except password. Use admin client (service_role)
    // so we can bypass the SECURITY DEFINER function's encryption-key
    // requirement.
    const admin = createSupabaseAdminClient();
    await admin.schema("private").from("smtp_settings").update({
      host: parsed.data.host,
      port: parsed.data.port,
      username: parsed.data.username,
      from_email: parsed.data.from_email,
      from_name: parsed.data.from_name,
      secure: parsed.data.secure === "on",
      updated_at: new Date().toISOString(),
    }).eq("garage_id", impersonation.garageId);
    revalidatePath("/admin/settings/smtp");
    redirect("/admin/settings/smtp?saved=1");
  }

  const { error } = await supabase.rpc("upsert_smtp_settings", {
    p_garage_id: impersonation.garageId,
    p_host: parsed.data.host,
    p_port: parsed.data.port,
    p_username: parsed.data.username,
    p_password: parsed.data.password,
    p_from_email: parsed.data.from_email,
    p_from_name: parsed.data.from_name,
    p_secure: parsed.data.secure === "on",
    p_encryption_key: env.SMTP_ENCRYPTION_KEY,
  });
  if (error) {
    redirect(
      `/admin/settings/smtp?error=${encodeURIComponent(error.message)}`,
    );
  }
  revalidatePath("/admin/settings/smtp");
  redirect("/admin/settings/smtp?saved=1");
}

export async function sendTestEmail(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const impersonation = await readImpersonationCookie();
  if (!impersonation) {
    redirect("/admin?error=no_garage_selected");
  }
  const to = String(formData.get("to") ?? "").trim();
  if (!to) {
    redirect(
      "/admin/settings/smtp?error=" +
        encodeURIComponent("Provide a destination email."),
    );
  }

  const result = await sendEmail({
    garageId: impersonation.garageId,
    to,
    subject: "Oplaris SMTP test",
    html:
      "<p>This is a test message from your Oplaris admin panel. " +
      "If you can read this, your SMTP relay is working.</p>",
    text:
      "This is a test message from your Oplaris admin panel. If you " +
      "can read this, your SMTP relay is working.",
  });

  if (!result.ok) {
    redirect(
      "/admin/settings/smtp?error=" +
        encodeURIComponent(`Send failed: ${result.error ?? "unknown"}`),
    );
  }
  redirect("/admin/settings/smtp?sent=1");
}
