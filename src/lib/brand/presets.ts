/** Phase 3 > V1 — brand preset catalogue.
 *
 *  A tiny registry of named brand looks managers can pick from on
 *  the Settings > Branding page (one-click "start from preset X,
 *  then tweak"). The app itself is fully dynamic: any hex pair flows
 *  through `hexToOklch` → CSS custom properties → every shadcn
 *  component, SVG illustration, and pattern.
 *
 *  Adding a preset: just push a new entry. The Settings page's
 *  picker enumerates this array.
 */

export interface BrandPreset {
  /** Stable id, URL/DB-safe. */
  id: string;
  /** Display name shown in the picker. */
  label: string;
  /** One-line positioning line for the picker card. */
  description: string;
  primaryHex: string;
  accentHex: string;
  /** Optional manager override for button text colour. null = auto-pick
   *  from primary luminance (WCAG AA). */
  primaryForegroundHex: string | null;
  /** Google Font family name (loaded in (app)/layout.tsx). */
  font: string;
  /** Two words that capture the mood — used as chips in the picker. */
  mood: [string, string];
}

/** Oplaris house default — clean corporate blue with a warm gold
 *  accent. What every new garage inherits before they customise. */
export const OPLARIS_DEFAULT: BrandPreset = {
  id: "oplaris",
  label: "Oplaris (default)",
  description:
    "Clean corporate blue with a warm gold accent. The house look for every new garage.",
  primaryHex: "#276DB0",
  accentHex: "#E69514",
  primaryForegroundHex: null,
  font: "Inter",
  mood: ["professional", "trustworthy"],
};

/** Dudley Auto Service — matches dudleyautoservice.co.uk exactly:
 *  vibrant golden-orange on near-black, Bebas Neue display. */
export const DUDLEY_PRESET: BrandPreset = {
  id: "dudley",
  label: "Dudley Auto Service",
  description:
    "Vibrant golden-orange on workshop charcoal. Bebas Neue display, bold and mechanical.",
  primaryHex: "#F0A500",
  accentHex: "#1B1A17",
  primaryForegroundHex: "#1B1A17",
  font: "Bebas Neue",
  mood: ["bold", "workshop"],
};

export const BRAND_PRESETS: readonly BrandPreset[] = [
  OPLARIS_DEFAULT,
  DUDLEY_PRESET,
  {
    id: "forest",
    label: "Forest Green",
    description: "Independent, environmentally-minded garage look.",
    primaryHex: "#2E7D4F",
    accentHex: "#E8B84D",
    primaryForegroundHex: null,
    font: "Inter",
    mood: ["calm", "honest"],
  },
  {
    id: "speedshop",
    label: "Speedshop Red",
    description: "Performance / motorsport tuner shop. High-contrast red + black.",
    primaryHex: "#D4232A",
    accentHex: "#111111",
    primaryForegroundHex: null,
    font: "Oswald",
    mood: ["aggressive", "fast"],
  },
  {
    id: "classic",
    label: "Classic Garage",
    description: "Vintage British racing green + cream. Heritage feel.",
    primaryHex: "#0E4D2B",
    accentHex: "#C8A25B",
    primaryForegroundHex: "#FFF7E8",
    font: "Merriweather",
    mood: ["heritage", "premium"],
  },
  {
    id: "ev",
    label: "Electric Blue",
    description: "EV / hybrid specialist look. Cool cyan with charcoal.",
    primaryHex: "#1AA3D6",
    accentHex: "#222933",
    primaryForegroundHex: null,
    font: "Inter",
    mood: ["modern", "technical"],
  },
] as const;

export function findPreset(id: string): BrandPreset | undefined {
  return BRAND_PRESETS.find((p) => p.id === id);
}
