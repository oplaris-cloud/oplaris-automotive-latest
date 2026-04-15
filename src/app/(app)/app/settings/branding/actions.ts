"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireManager } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  FileValidationError,
  validateUpload,
} from "@/lib/security/file-validation";

import type { ActionResult } from "../../customers/actions";

// Phase 3 > V1.5 — Manager self-serve brand configuration.

const HEX_RE = /^#[0-9a-fA-F]{3,8}$/;

const brandSchema = z.object({
  brandName: z.string().trim().min(1).max(120),
  primaryHex: z.string().regex(HEX_RE, "Must be a valid hex colour (e.g. #D4232A)"),
  accentHex: z
    .string()
    .regex(HEX_RE, "Must be a valid hex colour")
    .optional()
    .or(z.literal("")),
  /** Manager override for button text colour. Empty string means
   *  "auto-pick" — the loader computes it from the primary hex. */
  primaryForegroundHex: z
    .string()
    .regex(HEX_RE, "Must be a valid hex colour")
    .optional()
    .or(z.literal("")),
  /** When false, the sidebar header renders only the uploaded logo —
   *  useful when the logo is already a wordmark and repeating the
   *  name is visual noise. */
  showName: z.boolean().default(true),
  font: z.string().trim().max(60).optional().or(z.literal("")),
});

export type UpdateGarageBrandInput = z.infer<typeof brandSchema>;

/** Update the brand row for the caller's garage. Manager-only. The
 *  SELECT policy on garages scopes this to the current garage via
 *  `private.current_garage()`, so no extra garage_id filter is
 *  needed — RLS enforces it. */
export async function updateGarageBrand(
  input: UpdateGarageBrandInput,
): Promise<ActionResult> {
  const session = await requireManager();
  const parsed = brandSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key) fieldErrors[String(key)] = issue.message;
    }
    return { ok: false, error: "Validation failed", fieldErrors };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("garages")
    .update({
      brand_name: parsed.data.brandName,
      brand_primary_hex: parsed.data.primaryHex,
      brand_accent_hex: parsed.data.accentHex?.trim() || null,
      brand_primary_foreground_hex:
        parsed.data.primaryForegroundHex?.trim() || null,
      brand_show_name: parsed.data.showName,
      brand_font: parsed.data.font?.trim() || "Inter",
    })
    .eq("id", session.garageId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/app", "layout");
  return { ok: true, id: session.garageId };
}

const LOGO_MIME = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"];
const LOGO_MAX_SIZE = 2 * 1024 * 1024; // 2 MB

/** Upload a new brand logo. SVG is allowed here in addition to raster
 *  — garage signage usually has vector art available and the kiosk +
 *  PDF look crisper for it. The storage policy + magic-byte check
 *  keep the bucket safe from executable uploads. */
export async function uploadGarageLogo(
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireManager();
  const file = formData.get("logo") as File | null;

  if (!file || file.size === 0) {
    return { ok: false, error: "No file provided" };
  }
  if (file.size > LOGO_MAX_SIZE) {
    return { ok: false, error: "File too large (max 2MB)" };
  }

  // SVG bypasses magic-byte validation (it's XML), but we still sniff
  // the first bytes to reject any attempt to smuggle a non-image
  // payload through the SVG mime type.
  let mime: string;
  let buffer: Uint8Array;
  let extension: string;

  if (file.type === "image/svg+xml") {
    buffer = new Uint8Array(await file.arrayBuffer());
    const head = new TextDecoder("utf-8")
      .decode(buffer.slice(0, 200))
      .trimStart()
      .toLowerCase();
    if (!head.startsWith("<?xml") && !head.startsWith("<svg")) {
      return { ok: false, error: "File does not look like an SVG image" };
    }
    mime = "image/svg+xml";
    extension = ".svg";
  } else {
    try {
      const validated = await validateUpload(file);
      if (!LOGO_MIME.includes(validated.mime)) {
        return {
          ok: false,
          error: "Only SVG, PNG, JPEG, and WebP images are allowed",
        };
      }
      mime = validated.mime;
      buffer = validated.buffer;
      extension = validated.extension;
    } catch (err) {
      if (err instanceof FileValidationError) {
        return { ok: false, error: err.message };
      }
      throw err;
    }
  }

  const supabase = await createSupabaseServerClient();
  const storagePath = `${session.garageId}/logo${extension}`;

  const { error: uploadErr } = await supabase.storage
    .from("garage-logos")
    .upload(storagePath, buffer, { contentType: mime, upsert: true });
  if (uploadErr) {
    return { ok: false, error: `Upload failed: ${uploadErr.message}` };
  }

  const { data: urlData } = supabase.storage
    .from("garage-logos")
    .getPublicUrl(storagePath);

  // `garages.logo_url` already exists (migration 019 — business details).
  const { error: updateErr } = await supabase
    .from("garages")
    .update({ logo_url: urlData.publicUrl })
    .eq("id", session.garageId);
  if (updateErr) return { ok: false, error: updateErr.message };

  revalidatePath("/app", "layout");
  return { ok: true, id: session.garageId };
}

export async function removeGarageLogo(): Promise<ActionResult> {
  const session = await requireManager();
  const supabase = await createSupabaseServerClient();

  for (const ext of [".svg", ".png", ".jpg", ".jpeg", ".webp"]) {
    await supabase.storage
      .from("garage-logos")
      .remove([`${session.garageId}/logo${ext}`]);
  }

  const { error } = await supabase
    .from("garages")
    .update({ logo_url: null })
    .eq("id", session.garageId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/app", "layout");
  return { ok: true, id: session.garageId };
}
