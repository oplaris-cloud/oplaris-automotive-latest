"use server";

import { revalidatePath } from "next/cache";

import { requireStaffSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validateUpload, FileValidationError } from "@/lib/security/file-validation";

import type { ActionResult } from "../../customers/actions";

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 2 * 1024 * 1024; // 2MB

export async function uploadAvatar(formData: FormData): Promise<ActionResult> {
  const session = await requireStaffSession();
  const file = formData.get("avatar") as File | null;

  if (!file || file.size === 0) {
    return { ok: false, error: "No file provided" };
  }

  if (file.size > MAX_SIZE) {
    return { ok: false, error: "File too large (max 2MB)" };
  }

  // Validate file type via magic bytes
  let validated;
  try {
    validated = await validateUpload(file);
  } catch (err) {
    if (err instanceof FileValidationError) {
      return { ok: false, error: err.message };
    }
    throw err;
  }

  if (!ALLOWED_MIME.includes(validated.mime)) {
    return { ok: false, error: "Only JPEG, PNG, and WebP images are allowed" };
  }

  const supabase = await createSupabaseServerClient();

  // Upload to avatars bucket: {staff_id}/avatar.{ext}
  const storagePath = `${session.userId}/avatar${validated.extension}`;

  const { error: uploadErr } = await supabase.storage
    .from("avatars")
    .upload(storagePath, validated.buffer, {
      contentType: validated.mime,
      upsert: true, // overwrite previous avatar
    });

  if (uploadErr) {
    return { ok: false, error: `Upload failed: ${uploadErr.message}` };
  }

  // Get the public URL
  const { data: urlData } = supabase.storage
    .from("avatars")
    .getPublicUrl(storagePath);

  // Update staff record with avatar URL
  const { error: updateErr } = await supabase
    .from("staff")
    .update({ avatar_url: urlData.publicUrl })
    .eq("id", session.userId);

  if (updateErr) {
    return { ok: false, error: updateErr.message };
  }

  revalidatePath("/app");
  return { ok: true };
}

export async function removeAvatar(): Promise<ActionResult> {
  const session = await requireStaffSession();
  const supabase = await createSupabaseServerClient();

  // Remove from storage (try common extensions)
  for (const ext of [".jpg", ".jpeg", ".png", ".webp"]) {
    await supabase.storage.from("avatars").remove([`${session.userId}/avatar${ext}`]);
  }

  // Clear avatar_url
  const { error } = await supabase
    .from("staff")
    .update({ avatar_url: null })
    .eq("id", session.userId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/app");
  return { ok: true };
}
