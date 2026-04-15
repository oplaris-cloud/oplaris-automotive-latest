# VISUAL_IMPLEMENTATION_PLAN.md — UI Polish & Branding Layer

> **STATUS (2026-04-14):** **Phase 3 — pre-launch, scheduled.** The original Thu 16 Apr M1 deadline is superseded. Hossein wants quality over speed. Phases run strictly in order: 1 (role testing) → 2 (feature improvements, Part F of MASTER_PLAN) → **3 (this document)** → 4 (deploy infra) → 5 (production data import). Do NOT start V1–V6 until Phase 2 is signed off. See `CLAUDE.md > Current priority order` and the Phase 3 kickstart in `MASTER_PLAN.md`.

> **Purpose:** Phased plan to transform the current functional-but-plain UI into a visually polished, garage-branded product — without breaking the existing clean UX.
>
> **Informed by:** UI Research (Docs/UiResearch), UX Audit Skill (Oplaris-Skills/ux-audit), Plan Generator Skill (Oplaris-Skills/plan-generator), DESIGN_SYSTEM.md
>
> **Constraint:** All visual work must be **themeable per garage** — Dudley gets their brand first, but nothing is hardcoded. The Oplaris resale product just swaps tokens.
>
> **Estimated total:** ~8–10 hours across 6 phases

---

## Architecture decision: Multi-garage theming

Before any visual work begins, the theming layer must be in place. Otherwise every visual enhancement becomes technical debt when garage #2 signs up.

### How it works

```
garages table (already exists)
  + brand_primary_hex     TEXT  -- e.g. "#D4232A" for Dudley (or whatever their colour is)
  + brand_logo_url        TEXT  -- uploaded to Supabase Storage
  + brand_name            TEXT  -- "Dudley Auto Service"
  + brand_accent_hex      TEXT  -- optional secondary colour
  + brand_font            TEXT  -- optional, defaults to Inter
```

At runtime, the app layout reads the current garage's brand config and injects CSS custom properties via a `<style>` tag in `<head>`. Every component already uses `var(--primary)` etc. via shadcn/ui — so the entire app rebrands itself by changing 3-4 token values.

**What stays constant across all garages:** the semantic colours (success green, warning amber, error red), the layout structure, the component library, the spacing scale, the accessibility rules. Only the brand identity layer changes.

**What changes per garage:** primary colour, logo, business name, optional accent colour, optional font override.

---

## Phase V1 — Theming infrastructure (~1.5 hours)

**Goal:** Build the runtime theming layer so all subsequent visual work is automatically garage-agnostic.

### V1.1 — Database: Add brand columns to `garages` table

**Migration:** `supabase/migrations/014_garage_branding.sql`

```sql
ALTER TABLE garages
  ADD COLUMN brand_primary_hex TEXT DEFAULT '#3b82f6',
  ADD COLUMN brand_accent_hex  TEXT,
  ADD COLUMN brand_logo_url    TEXT,
  ADD COLUMN brand_name        TEXT,
  ADD COLUMN brand_font        TEXT DEFAULT 'Inter';
```

Seed Dudley's row with their actual brand values (get these from Hossein — logo, primary colour from their signage/website).

### V1.2 — Server: Garage brand loader

**File:** `src/lib/garage-brand.ts`

Server-only function that fetches the current garage's brand config (cached in memory for the session). Returns a `GarageBrand` type with all token values + computed derived colours (hover, light, dark variants generated from the primary hex using `oklch` manipulation).

### V1.3 — Layout: Inject brand tokens

**File:** `src/app/(app)/layout.tsx` (modify)

In the app layout's server component, call `getGarageBrand()` and render a `<style>` block that overrides the CSS custom properties:

```css
:root {
  --brand-primary: {brand.primaryOklch};
  --brand-primary-foreground: {computed};
  --brand-accent: {brand.accentOklch};
}
```

Map `--primary` to `--brand-primary` so every shadcn/ui component picks it up automatically.

### V1.4 — Logo component

**File:** `src/components/ui/garage-logo.tsx`

Reusable component that renders the garage logo from `brand_logo_url` with appropriate fallback (text-only business name in brand colour). Used in sidebar header, kiosk welcome, status page, PDF headers.

### V1.5 — Settings: Brand management page

**File:** `src/app/(app)/app/settings/branding/page.tsx`

Manager-only page where Dudley can upload their logo and set their primary colour. Simple form with colour picker + file upload + preview card. Calls a `updateGarageBrand()` server action.

**Test checklist:**
- [x] V1.1 — Migration 039 applies cleanly local + remote; Dudley row has placeholder `#D4232A` + name "Dudley Auto Service". CHECK constraints validate hex shape.
- [x] V1.2 — `getGarageBrand()` in `src/lib/brand/garage-brand.ts` returns a typed bundle (primaryHex, logoUrl, font, plus ready-to-embed OKLCH tokens). Cached per RSC request via React `cache()`. Plus `getGarageBrandById()` for future multi-tenant resolution by subdomain.
- [x] V1.3 — `(app)/layout.tsx` injects a server-rendered `<style id="garage-brand-tokens">` block overriding `--primary / --primary-foreground / --accent / --accent-foreground / --ring` (both `:root` and `.dark` scopes). shadcn/ui components re-theme automatically.
- [x] V1.4 — `GarageLogo` component (`src/components/ui/garage-logo.tsx`) renders `<Image>` when `logoUrl` is set, falls back to bold wordmark in `var(--primary)` otherwise. Wired into the sidebar header + mobile Sheet drawer title.
- [x] V1.5 — `/app/settings/branding` manager-only page (page.tsx + BrandingForm.tsx + actions.ts) with colour picker (native `<input type="color">`) + hex input + live preview card + logo upload (SVG/PNG/JPEG/WebP, 2 MB cap, magic-byte validation for raster, XML-shape sniff for SVG). Revalidates the app layout on save.
- [ ] V1.6 — Dark mode behaviour: next-themes toggle not yet mounted in the app. Brand tokens mirror into `.dark` so they're ready — staging spot-check once a dark-mode toggle ships in V6.
- [ ] V1.7 — Kiosk + status page brand resolution is deferred to **V5** (those routes are in the public layout with no JWT; V5 wires `getGarageBrandById` via the subdomain or signed session).

**Infrastructure extras shipped with V1:**
- Migration 040 — new `garage-logos` Storage bucket + policies (public read, manager + same-garage write).
- Migration 041 — fixes a pre-existing silent bug: `garages` had no UPDATE RLS policy, so the billing settings action (shipped earlier) was no-op'ing without raising. Added `garages_update_manager` scoped to `id = private.current_garage() and private.has_role('manager')`.

**UX audit gates (from ux-audit skill):**
- [x] Colour contrast: `foregroundFor(hex)` in `src/lib/brand/oklch.ts` runs the WCAG AA contrast math (sRGB luminance → contrast with black & white, pick the higher) and emits `oklch(0.985 0 0)` or `oklch(0.145 0 0)` for the `--primary-foreground` token. Unit-tested against the Dudley placeholder + pale yellow + black/white corners.
- [x] Focus rings still visible: `--ring` is set to the brand primary, which is how shadcn's focus ring already works today (same token). Saturated primaries all produce AA-contrast rings against the `--background` neutral.
- [x] Status colours (success/warning/error) unchanged: the brand style block overrides **only** `--primary / --primary-foreground / --accent / --accent-foreground / --ring`. Semantic tokens in `globals.css` are untouched.

**Tests:** 18 unit (brand-oklch: parseHex, conversion, CSS format, luminance, foreground picker) + 4 RLS (garages_update_policy). Full suite 152/152 unit + 82/82 RLS green.

---

## Phase V2 — Icon system expansion (~45 min)

**Goal:** Add Phosphor Icons for automotive-specific icons that Lucide doesn't have, following consistent design language.

### V2.1 — Install Phosphor Icons

```bash
pnpm add @phosphor-icons/react
```

### V2.2 — Create icon mapping document

**File:** `src/components/ui/icons.ts`

Central export that maps semantic icon names to their source library. This prevents random imports scattered across the codebase and makes it easy to swap icons later.

```typescript
// Navigation & general UI → Lucide (existing)
export { Car, Wrench, Users, Calendar, ... } from 'lucide-react';

// Automotive-specific → Phosphor
export { Engine, CarBattery, GasPump, Gauge, SteeringWheel } from '@phosphor-icons/react';
```

### V2.3 — Replace hardcoded Lucide imports where Phosphor has better options

Audit all pages for places where a generic icon is used where an automotive-specific one would be clearer. Examples:
- Vehicle detail page: use `Engine` icon for engine-related jobs
- Parts section: use `GasPump` for fluids, `CarBattery` for electrical
- Tech task type picker (P6): use automotive icons for each task category

### V2.4 — Custom SVG icons for gaps

Create 4-5 custom SVGs following Lucide's 24×24 / 2px stroke / rounded cap design language:
- Brake disc (disc with caliper outline)
- Oil drop (single droplet)
- Tyre (circle with minimal tread lines)
- OBD port (rectangular plug shape)
- Spark plug (simple profile)

**File:** `src/components/ui/custom-icons.tsx` — React components matching Lucide's prop interface (`size`, `strokeWidth`, `className`).

**Test checklist:**
- [ ] V2.1 — `@phosphor-icons/react` installed, no bundle size regression > 20KB
- [ ] V2.2 — All icon imports go through `icons.ts` central mapping
- [ ] V2.3 — Tech task picker uses automotive icons
- [ ] V2.4 — Custom SVGs render at all sizes (16, 20, 24, 32) without distortion

**UX audit gates:**
- [ ] All icons have `aria-hidden="true"` when decorative, or `aria-label` when meaningful
- [ ] Icons always paired with text labels (no icon-only buttons except in tight table rows, and those get `title` + `aria-label`)
- [ ] Colour vision: icons use shape + text, never colour alone to convey meaning (ref: ux-audit/accessibility.md §1)
- [ ] Consistent stroke weight: 2px across both Lucide and Phosphor (use Phosphor "Regular" weight, not Bold or Thin)

---

## Phase V3 — Empty state illustrations (~1 hour)

**Goal:** Replace bare "No items" text with illustrated empty states that guide users to take action.

### V3.1 — Download and prepare Undraw SVGs

Download 8 illustrations from undraw.co, recoloured to the brand primary (initially #3b82f6, but the SVGs should use `currentColor` or a CSS variable so they adapt to per-garage branding).

**Files:** `public/illustrations/` directory

| # | Empty state | Undraw search term | Used on |
|---|------------|-------------------|---------|
| 1 | No jobs today | "void" or "blank canvas" | `/app` today view, `/app/tech` |
| 2 | No vehicles found | "not found" or "searching" | `/app/vehicles` search results |
| 3 | No customers yet | "people" or "community" | `/app/customers` empty list |
| 4 | No bookings | "calendar" or "schedule" | `/app/bookings` empty inbox |
| 5 | No parts on this job | "empty cart" | Job detail parts section |
| 6 | No MOT history | "file searching" | Vehicle detail MOT section |
| 7 | Connection error | "server down" | Global error boundary |
| 8 | Service complete | "completed" or "success" | Kiosk confirmation, job complete |

### V3.2 — Make SVGs theme-aware

Convert downloaded SVGs to React components that read `var(--primary)` for their accent colour. When Dudley changes their brand colour, every illustration updates automatically.

**File:** `src/components/illustrations/index.tsx` — barrel export of all illustration components.

Each illustration component accepts `className` and renders at max 200px width / 160px height for inline use, or 300px / 240px for full-page empty states.

### V3.3 — Update the EmptyState component

**File:** `src/components/ui/empty-state.tsx` (modify)

The existing `EmptyState` component takes an icon. Extend it to also accept an `illustration` prop (React component). When illustration is provided, render it above the headline instead of the icon. When neither is provided, fall back to a generic placeholder.

```tsx
interface EmptyStateProps {
  icon?: React.ReactNode;           // existing — small icon
  illustration?: React.ReactNode;   // new — larger SVG illustration
  title: string;
  description: string;
  action?: { label: string; href: string } | { label: string; onClick: () => void };
}
```

### V3.4 — Wire illustrations into all empty list states

Update every page that renders a list to use the appropriate illustration when the list is empty. Priority pages:

1. `/app` today view — "No jobs today" + "Create Job" CTA
2. `/app/tech` — "No jobs assigned" + contact manager prompt
3. `/app/vehicles` — "No vehicles found" + "Add Vehicle" CTA
4. `/app/customers` — "No customers yet" + "Add Customer" CTA
5. `/app/bookings` — "No bookings" + "Bookings come from the kiosk" explainer
6. Job detail → parts section — "No parts added" + "Add Part" button
7. Vehicle detail → MOT section — "No MOT history" + "Refresh from DVSA" button
8. Vehicle detail → jobs section — "No jobs recorded" + "Create Job" CTA

**Test checklist:**
- [ ] V3.1 — All 8 SVGs downloaded and render correctly
- [ ] V3.2 — Change `--primary` in dev tools → illustrations recolour
- [ ] V3.3 — EmptyState component renders with illustration OR icon
- [ ] V3.4 — Every list page shows illustration when empty (test by filtering to 0 results)
- [ ] V3.5 — Illustrations are lazy-loaded (not in initial JS bundle)

**UX audit gates (from ux-audit/content-and-copy.md + cognitive-load-and-information.md):**
- [ ] Every empty state has: illustration/icon + headline + 1-sentence description + primary CTA
- [ ] CTA uses action verbs ("Add Vehicle", not "Go to vehicles")
- [ ] Description explains WHY it's empty AND what to do, in ≤15 words
- [ ] Empty state is vertically centred in the available space (not stuck to top)
- [ ] Illustration doesn't push the CTA below the fold on mobile (max 160px height on phone)
- [ ] `prefers-reduced-motion`: illustrations don't animate (static SVGs only — this is already the case with Undraw)

---

## Phase V4 — Background textures & card polish (~1 hour)

**Goal:** Add subtle depth and texture to key surfaces without adding visual noise to data-heavy screens.

### V4.1 — Install Hero Patterns

```bash
pnpm add tailwindcss-hero-patterns
```

Configure in Tailwind config — register the plugin with Oplaris blue as the default pattern colour.

### V4.2 — Define where patterns are used (and where they're NOT)

**USE patterns (low opacity, 2-5%):**

| Surface | Pattern | Opacity | Why |
|---------|---------|---------|-----|
| Bay board background | Circuit Board | 3% | Tech-industrial feel behind job cards |
| Login page hero | gggrain gradient (fffuel) | 100% | Bold branded first impression |
| Kiosk welcome screen | Topography | 4% | Subtle texture behind the 3 service tiles |
| Settings pages background | Hexagons | 2% | Light differentiation from data pages |
| Dashboard header strip | Solid gradient (primary-600 → primary-700) | 100% | Behind KPI cards, white text |
| Empty state containers | Topography | 2% | Fills visual void behind illustrations |
| PDF job sheet header | Architect | 3% | Blueprint/engineering feel |

**DO NOT use patterns on:**

| Surface | Why (from UX audit skill) |
|---------|---------------------------|
| Data tables | Noise competes with data — cognitive load increases (ref: cognitive-load §2.1) |
| Job detail page | High information density — pattern becomes distraction |
| Tech mobile screens | Outdoor/sunlight readability needs clean white backgrounds (ref: accessibility.md §1.2) |
| Form backgrounds | Pattern behind input fields reduces form completion rate (ref: forms-and-data-entry.md) |
| Customer status page | Public-facing, needs maximum readability and trust |
| Any text-heavy area | F-pattern scanning is disrupted by background noise (ref: visual-hierarchy §1.1) |

### V4.3 — Card elevation system

Currently all cards are flat (border only). Add a subtle shadow system following the UX audit skill's elevation guidelines (visual-hierarchy-and-layout.md §4):

| Level | Shadow | Use case |
|-------|--------|----------|
| 0 | None (border only) | Inline cards within a page section |
| 1 | `shadow-sm` | Default card resting state |
| 2 | `shadow-md` | Card hover state (200ms ease-in-out transition) |
| 3 | `shadow-lg` | Dragged card (bay board DnD), focused card |
| 4 | `shadow-xl` | Dialogs, sheets, popovers |

Add to the bay board: dragged card gets level 3 shadow + slight scale (`scale-[1.02]`) for tactile drag feedback.

### V4.4 — KPI metric strip for manager dashboard

**File:** `src/app/(app)/app/page.tsx` (modify) or new `DashboardHeader.tsx`

Add a 4-card metric strip at the top of the manager Today view:
1. **Jobs Today** — count + vs yesterday trend
2. **Bay Utilisation** — percentage + bar indicator
3. **Revenue Today** — £ total from completed jobs
4. **Awaiting Action** — count of jobs needing manager attention

Cards use: solid white background, 1px border, no pattern. Primary number at 28px bold. Trend indicator (↑ green / ↓ red / → grey) at 14px. Optional sparkline if data exists.

Follow the Stripe dashboard pattern (ref: UI Research Phase 4 moodboard #5).

### V4.5 — Skeleton loading polish

Audit all pages and ensure every data-loading state uses the shadcn/ui `Skeleton` component matching the shape of the content it replaces (not generic rectangles). The UX audit skill's performance-perception.md confirms skeletons reduce perceived load time 26% vs spinners.

- Job card skeleton: status bar + title line + two short lines
- Vehicle card skeleton: image rectangle + title + subtitle
- KPI card skeleton: large number block + small label
- Table skeleton: alternating row heights matching column widths

**Test checklist:**
- [ ] V4.1 — Hero Patterns plugin active, patterns render
- [ ] V4.2 — Bay board has Circuit Board texture (barely visible, not distracting)
- [ ] V4.3 — Cards have hover shadow transition, DnD card elevates
- [ ] V4.4 — Dashboard shows 4 KPI cards with real data
- [ ] V4.5 — Every page has content-shaped skeleton loading states

**UX audit gates:**
- [ ] Pattern opacity test: screenshot the bay board → greyscale → pattern should be nearly invisible. If it's noticeable, reduce opacity
- [ ] Card shadows: test in dark mode — shadows should use `shadow-[0_1px_3px_rgba(0,0,0,0.3)]` not the light-mode defaults which disappear on dark backgrounds
- [ ] KPI cards: numbers are the largest element (pre-attentive processing via size — ref: visual-hierarchy §2.1)
- [ ] Skeleton shimmer respects `prefers-reduced-motion` (no animation, just static grey)
- [ ] No layout shift when skeleton → real content (CLS ≤ 0.1, ref: performance-perception.md §4)

---

## Phase V5 — Branded surfaces (~1 hour)

**Goal:** Apply the garage brand to the high-visibility surfaces that create identity.

### V5.1 — Login page

**File:** `src/app/(auth)/login/page.tsx` (modify)

Current state: plain form on white. Target: split layout — left half is a branded hero panel (garage logo, name, gradient or fffuel background, maybe a tagline), right half is the login form. On mobile, hero collapses to a small branded header above the form.

The hero panel uses the garage's `brand_primary_hex` for the gradient and renders their logo. For Dudley: this is where their identity lives. For the next garage: same layout, different colours and logo.

### V5.2 — Kiosk welcome screen

**File:** `src/app/(public)/kiosk/page.tsx` (modify step 0)

Current state: 3 service tiles on white. Target: garage logo prominently displayed at top, business name below, subtle Topography pattern background, the 3 tiles use brand primary colour. A "Powered by Oplaris" small footer at the bottom.

The welcome screen should feel like walking into Dudley's reception — their brand, their colours, their identity. Not generic software.

### V5.3 — Customer status page

**File:** `src/app/(public)/status/page.tsx` (modify)

Current state: functional form. Target: add garage logo + name at top of the page. Light, trustworthy, clean. The status page is public-facing — it must look professional and legitimate so customers trust the SMS link they clicked.

### V5.4 — Sidebar header

**File:** `src/components/app/sidebar.tsx` (modify)

Replace "Oplaris Workshop" text with the garage logo (from `GarageLogo` component, V1.4). Below the logo: a small "Powered by Oplaris" text in muted colour. This is important for the resale model — the product feels like theirs, but Oplaris gets brand credit.

### V5.5 — PDF job sheet header

**File:** `src/app/(app)/app/jobs/pdf/actions.ts` (modify)

Add garage logo and business name to the PDF header. Use the Architect pattern at 3% behind the header area. Include: garage name, address, phone, email, and a "Thank you for choosing [garage name]" footer.

**Test checklist:**
- [ ] V5.1 — Login shows garage brand hero; try with 3 different colour values
- [ ] V5.2 — Kiosk shows garage logo and name prominently
- [ ] V5.3 — Status page shows garage logo (builds customer trust)
- [ ] V5.4 — Sidebar shows garage logo, "Powered by Oplaris" underneath
- [ ] V5.5 — PDF job sheet has branded header with logo

**UX audit gates:**
- [ ] Login hero: text on gradient must meet WCAG AA (calculate contrast against the gradient midpoint)
- [ ] Kiosk: logo doesn't push service tiles below the fold on 10" tablet (max logo height 80px)
- [ ] Status page: logo loads fast (optimise to < 20KB, use WebP with PNG fallback)
- [ ] "Powered by Oplaris" is small and unobtrusive — never competes with the garage brand
- [ ] All branded surfaces look correct in both light and dark mode

---

## Phase V6 — Micro-interactions & loading states (~1 hour)

**Goal:** Add the small polish details that make the app feel responsive and alive.

### V6.1 — Button loading states

Every form submission button should use the `LoadingButton` component (already exists). Audit all forms and replace any raw `<Button>` that triggers a server action.

### V6.2 — Toast notifications with context

Replace generic "Saved" toasts with contextual messages:
- "Job moved to Bay 3" (not "Saved")
- "SMS sent to 07xxx" (not "Approval requested")
- "Vehicle updated" (not "Saved")

Use sonner's `toast.success()`, `toast.error()`, `toast.loading()` variants. Show loading toast during server actions, replace with success/error on completion.

### V6.3 — Page transitions

Add subtle fade-in for page content (200ms, ref: performance-perception.md §2.2 — the 150-250ms range feels instant but visible). Use Tailwind `animate-in fade-in` on the main content area. Not on navigation — the sidebar should feel instant.

### V6.4 — Bay board drag polish

When dragging a job card on the bay board:
- Card: elevation 3 + `scale-[1.02]` + slight rotation (`rotate-[1deg]`)
- Drop zone: highlight with brand-primary-light background + dashed border
- On drop: brief "settle" animation (scale back to 1.0, 120ms ease-out)

### V6.5 — Status badge pulse

For jobs in active states (`in_diagnosis`, `in_repair`), add a subtle pulse animation to the status badge dot — indicates "work is happening now." Use a 2s CSS animation on a small circle next to the badge.

Respect `prefers-reduced-motion`: no pulse, just static dot.

**Test checklist:**
- [ ] V6.1 — All form buttons show spinner during submission
- [ ] V6.2 — Toast messages are specific and helpful
- [ ] V6.3 — Page content fades in smoothly (no flash of unstyled content)
- [ ] V6.4 — Bay board drag feels tactile (elevation + scale + drop highlight)
- [ ] V6.5 — Active job badges pulse gently
- [ ] V6.6 — Set `prefers-reduced-motion: reduce` in browser → ALL animations disabled

**UX audit gates:**
- [ ] No animation exceeds 320ms (ref: performance-perception.md — longer feels sluggish)
- [ ] All motion uses `ease-out` or `ease-in-out` (never linear — ref: ux-audit/performance-perception.md §2.3)
- [ ] Toast notifications auto-dismiss in 4 seconds (success) or persist until dismissed (errors)
- [ ] Toast position: top-right on desktop, bottom-centre on mobile (thumb zone — ref: responsive-and-mobile.md §3)
- [ ] No animations on the tech mobile UI that could trigger motion sickness in workshop environment (vibration + screen motion = bad)

---

## Execution order & dependencies

```
V1 (Theming infrastructure)     ← DO THIS FIRST, everything else depends on it
  ↓
V2 (Icons) ──────────┐
V3 (Illustrations) ───┤── Can run in parallel after V1
V4 (Textures & cards) ┘
  ↓
V5 (Branded surfaces)           ← Needs V1 (theme) + V3 (illustrations) + V4 (patterns)
  ↓
V6 (Micro-interactions)         ← Final polish pass, depends on all above being stable
```

**Total estimate:** ~6.5 hours of implementation + ~1.5 hours of testing/audit = ~8 hours

**Critical path:** V1 → V5. The theming infrastructure unlocks everything. Branded surfaces (login, kiosk, status page, sidebar, PDFs) are where Dudley will immediately feel ownership of the product.

---

## Integration with MASTER_PLAN.md

This visual plan runs **in parallel** with the feature plan (P1–P15), not sequentially after it. Recommended interleaving:

| Day | Feature work (MASTER_PLAN) | Visual work (this plan) |
|-----|---------------------------|------------------------|
| 1 | P1–P5 testing | V1 (theming infrastructure) |
| 2 | P6 (tech job detail) | V2 (icons — use automotive icons in P6) |
| 3 | P7–P8 (approval + status) | V3 (illustrations — wire into empty states as you build) |
| 4 | P9–P10 (edit job + promote) | V4 (textures + cards + KPI strip) |
| 5 | P11–P15 (remaining features) | V5 (branded surfaces) |
| 6 | Testing + fixes | V6 (micro-interactions + final polish) |

This way, every new feature is built with the visual system already in place — no retrofit needed.

---

## Kickstart prompt (for Claude Code session)

```
You are implementing the visual polish layer for the Oplaris Automotive app (Dudley Auto Service). This runs IN PARALLEL with the feature work in MASTER_PLAN.md.

## Before you start

1. Read `CLAUDE.md` (project root) — architecture rules
2. Read `docs/redesign/VISUAL_IMPLEMENTATION_PLAN.md` — this is your execution plan
3. Read `docs/redesign/DESIGN_SYSTEM.md` — existing UI specs and tokens
4. Read `Docs/UiResearch/compass_artifact_*.md` — the UI research findings
5. Consult `Oplaris-Skills/ux-audit/references/` for every phase — especially:
   - `theming-and-design-tokens.md` for V1
   - `accessibility.md` for V2 and all phases
   - `content-and-copy.md` for V3 (empty states)
   - `visual-hierarchy-and-layout.md` for V4
   - `performance-perception.md` for V6

## Execution

Work through V1 → V6 in order. V1 (theming) is the foundation — nothing else works without it.

Key rules:
- Every colour must be a CSS custom property (no hardcoded hex values anywhere)
- The garage brand layer changes ONLY: primary colour, accent colour, logo, name, font
- Semantic colours (success/warning/error) NEVER change per garage
- Every visual enhancement must pass the UX audit gates listed in the plan
- Test with `prefers-reduced-motion: reduce` — all animations must degrade gracefully
- Test contrast: every text-on-brand-colour combination must meet WCAG AA 4.5:1
- Empty states: illustration + headline + description + CTA (never just "No items")
- Hero Patterns: if you can clearly see the pattern, the opacity is too high

## Dudley brand values (placeholder until confirmed)

Get Dudley's actual brand from Hossein. Until then, use:
- Primary: #D4232A (red — placeholder, common for UK garages)
- Name: "Dudley Auto Service"
- Logo: use text fallback until logo file provided
- Font: Inter (keep default)

Update the master tracker in VISUAL_IMPLEMENTATION_PLAN.md as you complete each phase.
```

---

## What to ask Dudley

Before V5 (branded surfaces), Hossein needs to get from Dudley:

1. **Their logo** — SVG or high-res PNG, ideally on transparent background
2. **Their primary brand colour** — from their signage, business cards, or website
3. **Their secondary colour** (if any)
4. **Business address + phone + email** — for PDF job sheet headers
5. **Any tagline or strapline** they use — for the login hero and kiosk welcome

Without these, V1–V4 can proceed with placeholder values, but V5 needs the real assets to look right.
