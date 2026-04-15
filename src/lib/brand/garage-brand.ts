import "server-only";

import { cache } from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { foregroundFor, hexToOklch, oklchCss } from "./oklch";

/** Phase 3 > V1 — Server-resolved garage brand tokens.
 *
 *  Read once per RSC request (React `cache()` makes this automatic),
 *  returned as a strict set of CSS custom property values. The layout
 *  renders them inside a `<style>` block so every consumer — shadcn
 *  components, bespoke components, PDFs, kiosks — picks up the brand
 *  colours through the existing `--primary / --accent / --ring`
 *  tokens with no per-call wiring. */

export interface GarageBrand {
  /** Garage id the brand belongs to — used as a sanity key on consumers. */
  garageId: string;
  name: string;
  logoUrl: string | null;
  /** Raw hex kept so the settings page can round-trip without drift. */
  primaryHex: string;
  accentHex: string | null;
  /** Optional manager override for the button text colour. `null`
   *  means "auto-pick" — the loader runs `foregroundFor(primaryHex)`. */
  primaryForegroundHex: string | null;
  /** Whether the business name renders next to the logo. When false,
   *  the logo takes the full sidebar/header slot (useful when the
   *  uploaded logo is already a wordmark). */
  showName: boolean;
  font: string;
  /** CSS values ready to drop into a `--primary: …` style block. */
  tokens: {
    primary: string;
    primaryForeground: string;
    accent: string;
    accentForeground: string;
    ring: string;
  };
}

const DEFAULT_PRIMARY = "#3b82f6";
const DEFAULT_FONT = "Inter";

function toTokens(
  primaryHex: string,
  accentHex: string | null,
  primaryForegroundOverrideHex: string | null,
) {
  const primaryOklch = hexToOklch(primaryHex);
  const accentOklch = accentHex ? hexToOklch(accentHex) : null;

  const primary = primaryOklch
    ? oklchCss(primaryOklch)
    : "oklch(0.5930 0.2385 26.12)"; // the #D4232A placeholder, in case parsing ever fails

  const accent = accentOklch ? oklchCss(accentOklch) : primary;

  // Prefer the manager override when set; otherwise auto-pick against
  // the primary's OKLCH L.
  let primaryForeground = foregroundFor(primaryHex);
  if (primaryForegroundOverrideHex) {
    const overrideOklch = hexToOklch(primaryForegroundOverrideHex);
    if (overrideOklch) primaryForeground = oklchCss(overrideOklch);
  }

  return {
    primary,
    primaryForeground,
    accent,
    accentForeground: accentHex ? foregroundFor(accentHex) : primaryForeground,
    // Ring reuses primary — visually consistent focus ring that matches
    // the brand across forms, buttons, and the command palette.
    ring: primary,
  };
}

/** Cached per RSC request. Safe to call from any server component or
 *  server action; a null return means no garage could be resolved
 *  (unauthenticated path). */
export const getGarageBrand = cache(async (): Promise<GarageBrand | null> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Pull the garage via the JWT's garage_id claim (already trusted —
  // injected by the `custom_access_token_hook` SECURITY DEFINER
  // function in migration 025). One round-trip, RLS-scoped.
  const { data, error } = await supabase
    .from("garages")
    .select(
      "id, name, slug, brand_primary_hex, brand_accent_hex, brand_primary_foreground_hex, brand_show_name, brand_name, brand_font, logo_url",
    )
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const primaryHex = data.brand_primary_hex || DEFAULT_PRIMARY;
  const accentHex = data.brand_accent_hex || null;
  const primaryForegroundHex =
    (data.brand_primary_foreground_hex as string | null) || null;
  const showName =
    (data.brand_show_name as boolean | null) ?? true;

  return {
    garageId: data.id as string,
    name: (data.brand_name as string | null) || (data.name as string),
    logoUrl: (data.logo_url as string | null) || null,
    primaryHex,
    accentHex,
    primaryForegroundHex,
    showName,
    font: (data.brand_font as string | null) || DEFAULT_FONT,
    tokens: toTokens(primaryHex, accentHex, primaryForegroundHex),
  };
});

/** Same signature as getGarageBrand but resolves via a garage id.
 *  Used by the public kiosk + status pages which don't carry a JWT —
 *  they look up the garage by subdomain or a signed session. */
export const getGarageBrandById = cache(
  async (garageId: string): Promise<GarageBrand | null> => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("garages")
      .select(
        "id, name, slug, brand_primary_hex, brand_accent_hex, brand_primary_foreground_hex, brand_show_name, brand_name, brand_font, logo_url",
      )
      .eq("id", garageId)
      .maybeSingle();
    if (error || !data) return null;
    const primaryHex = data.brand_primary_hex || DEFAULT_PRIMARY;
    const accentHex = data.brand_accent_hex || null;
    const primaryForegroundHex =
      (data.brand_primary_foreground_hex as string | null) || null;
    const showName =
      (data.brand_show_name as boolean | null) ?? true;
    return {
      garageId: data.id as string,
      name: (data.brand_name as string | null) || (data.name as string),
      logoUrl: (data.logo_url as string | null) || null,
      primaryHex,
      accentHex,
      primaryForegroundHex,
      showName,
      font: (data.brand_font as string | null) || DEFAULT_FONT,
      tokens: toTokens(primaryHex, accentHex, primaryForegroundHex),
    };
  },
);

/** Render the CSS custom property block for a brand. Pure, string-
 *  returning — the layout embeds it verbatim inside `<style>`. */
export function brandStyleBlock(brand: GarageBrand): string {
  const t = brand.tokens;
  return `:root {
  --primary: ${t.primary};
  --primary-foreground: ${t.primaryForeground};
  --accent: ${t.accent};
  --accent-foreground: ${t.accentForeground};
  --ring: ${t.ring};
}
.dark {
  --primary: ${t.primary};
  --primary-foreground: ${t.primaryForeground};
  --accent: ${t.accent};
  --accent-foreground: ${t.accentForeground};
  --ring: ${t.ring};
}`;
}
