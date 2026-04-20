# VISUAL_IMPLEMENTATION_PLAN.md — UI Polish & Branding Layer

> **STATUS (2026-04-18):** **Phase 3 — DONE.** V1 through V6 all shipped, plus P56.0–P56.10 + STAGING_SMS_BYPASS. See `STANDUP.md 2026-04-18` and the per-V close-out notes below. Layered on top in the same push: migrations 045 (invoice revisions) + 046 (invoice payments with Mark as Paid / Receivables / PAID watermark) — outside V1-V6 scope, documented in `CLAUDE.md > Invoice lifecycle`.

> **Historical status (2026-04-14):** Phase 3 pre-launch, scheduled. The original Thu 16 Apr M1 deadline was superseded by the 2026-04-14 quality-over-deadline decision. Phases ran strictly in order: 1 (role testing) → 2 (feature improvements, Part F of MASTER_PLAN) → 3 (this document) → 4 (deploy infra) → 5 (production data import).

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
- [x] V1.6 — Dark mode shipped in P56.1 — `next-themes` ThemeProvider wired in root layout, toggle in top-bar user dropdown (light / dark / system). Brand tokens mirror into `.dark` scope.
- [x] V1.7 — Public-surface brand resolution shipped in V5.7 — new `getPublicGarageBrand()` service-role helper + `(public)/layout.tsx` + `(auth)/layout.tsx` inject tokens on kiosk + status + login. Kiosk + status split into server-component wrappers passing brand props to their client component.

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
- [x] V2.1 — `@phosphor-icons/react` installed (2026-04-17).
- [x] V2.2 — Central mapping lives in `src/components/icons/index.tsx` as typed React wrappers (EngineIcon, CarBatteryIcon, FuelPumpIcon, PhosphorWrenchIcon, VehicleIcon, ElectricalIcon, TyrePressureIcon). Existing Lucide usage left untouched — additive, not a mass replacement.
- [x] V2.4 — 5 custom SVGs shipped (BrakeDisc, OilDrop, Tyre, ObdPort, SparkPlug), all `viewBox="0 0 24 24"` + `strokeWidth=1.75` + `currentColor`, scalable via Tailwind `h-*/w-*`.
- [ ] V2.3 — Tech task picker still uses text pills. Migration deferred (low-value churn vs risk of tech surface regression).

**UX audit gates:**
- [x] All custom icons set `aria-hidden` on decorative use + `aria-label` when `title` prop is supplied.
- [x] Every icon in new components is paired with text (icon-only usage limited to AddStockDialog, ConfirmDialog trigger, which are tightly-labelled surroundings).
- [x] Colour-vision gates hold — icons inherit `currentColor` and sit alongside labels; no colour-only semantics.
- [x] Stroke weight consistent — Phosphor default ≈ Lucide 2px at 24 px. Custom SVGs use 1.75 px (matches Phosphor Regular).

---

## Phase V3 — Empty state illustrations (~1 hour)

**Goal:** Replace bare "No items" text with illustrated empty states that guide users to take action.

### V3.1 — Illustration library (DONE 2026-04-17)

> Updated 2026-04-18 — Undraw approach replaced with curated Envato pack.
> ~20 illustrations already imported and themed via the 3-colour CSS var
> swap (see `VISUAL_ASSETS.md` for the full alias table).

**Source:** Envato hand-drawn SVG packs in `public/*-utc/SVG/`.
**Import script:** `node scripts/import-illustrations.mjs` — rewrites
colours, converts to JSX, generates barrel export.
**Output:** `src/components/illustrations/` — typed React components
accepting `className`, `title`, `size` props.
**Aliases:** `src/components/illustrations/aliases.ts` — friendly names
mapped to the best illustration for each app surface.

### V3.2 — Theme-aware (DONE 2026-04-17)

All illustrations already use CSS vars (`currentColor`, `var(--accent)`,
`var(--card)`). Changing the garage brand in Settings → Branding
automatically reskins every illustration. Verified in the preview page
(`oplaris-illustrations-preview.html`) across 6 presets + dark mode.

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
- [x] V3.1 — 20 curated, male-only-figure-scrubbed SVGs imported as themed React components (2026-04-17, re-scrubbed 2026-04-18 per Hossein cultural preference).
- [x] V3.2 — `currentColor` + `var(--accent)` + `var(--card)` swap verified against 6 brand presets in the preview HTML.
- [x] V3.3 — `<EmptyState>` accepts `illustration` prop (component reference) and falls back to `icon`. `src/components/ui/empty-state.tsx`.
- [x] V3.4 — 8 list pages wired: customers, vehicles, jobs, bookings, stock items, stock warranties, customers/[id] no-jobs, tech "Nothing on your plate".
- [ ] V3.5 — Lazy-loading deferred. SVGs are small + the visible ones are per-route so the cost is minimal; Phase 4 bundle-analyser audit will tell us if it's worth it.

**UX audit gates (from ux-audit/content-and-copy.md + cognitive-load-and-information.md):**
- [x] Every wired empty state has: illustration + title + 1-sentence description + primary CTA (customers, vehicles, jobs, bookings, stock ×2, customers/[id] no-jobs, tech).
- [x] CTAs use action verbs ("Add Customer", "New Job", "Add Vehicle").
- [x] Description phrasing kept under 15 words per case.
- [x] EmptyState primitive centres the block via `flex flex-col items-center justify-center`.
- [x] Illustration capped at `h-40 w-40` on mobile (`h-60 w-60` on `sm+`).
- [x] All illustrations are static SVG — no animation. Reduced-motion rule covers any future motion.

---

## Phase V4 — Background textures & card polish (~1 hour)

**Goal:** Add subtle depth and texture to key surfaces without adding visual noise to data-heavy screens.

### V4.1 — Car part seamless pattern (replaces Hero Patterns)

> Updated 2026-04-18 — Hossein sourced a hand-drawn car part seamless
> pattern from Envato (same artist style as the illustrations). This
> replaces the generic Hero Patterns approach with a bespoke automotive
> texture that matches the illustration kit perfectly.

**Source files:** `public/pattern/pattern.svg` (vector, 1829×1489),
`public/pattern/pattern.png` (raster fallback).

**Approach:** Black line art at very low opacity. The pattern is pure
monochrome, so it stays completely neutral regardless of which garage's
brand colours are applied. Use as `background-image: url(/pattern/pattern.svg)`
with `opacity` on the containing element.

**Implementation:** Create a `<PatternBackground />` utility component
(`src/components/ui/pattern-background.tsx`) that wraps a surface with
the car part pattern at a configurable opacity. Respects dark mode
(inverts to white lines on dark backgrounds). Single source of truth
for the opacity token.

```tsx
<PatternBackground opacity={0.04} className="rounded-xl p-8">
  {children}
</PatternBackground>
```

### V4.2 — Define where patterns are used (and where they're NOT)

**USE the car part pattern (low opacity, 2-5%):**

| Surface | Opacity | Why |
|---------|---------|-----|
| Login page hero / split panel | 4% | Automotive identity on first impression |
| Kiosk welcome screen | 4% | Subtle texture behind the 3 service tiles |
| Status page background | 3% | Branded trust signal behind job cards |
| Empty state containers | 3% | Fills visual void behind illustrations |
| Bay board background | 3% | Workshop feel behind job cards |
| PDF job sheet header | 2% | Blueprint/engineering watermark |

**Also use (non-pattern):**
| Surface | Treatment | Why |
|---------|-----------|-----|
| Dashboard header strip | Solid gradient (primary-600 → primary-700) | Behind KPI cards, white text |
| Settings pages background | Subtle `var(--muted)` tint | Light differentiation from data pages |

**DO NOT use patterns on:**

| Surface | Why (from UX audit skill) |
|---------|---------------------------|
| Data tables | Noise competes with data — cognitive load increases (ref: cognitive-load §2.1) |
| Job detail page | High information density — pattern becomes distraction |
| Tech mobile screens | Outdoor/sunlight readability needs clean white backgrounds (ref: accessibility.md §1.2) |
| Form backgrounds | Pattern behind input fields reduces form completion rate (ref: forms-and-data-entry.md) |
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
- [x] V4.1 — `<PatternBackground>` primitive shipped in `src/components/ui/pattern-background.tsx` — configurable opacity + size, `pointer-events-none` overlay, `dark:invert` for dark-mode line polarity.
- [x] V4.2 — Car-part texture applied at UX-audit-capped opacities: login 4%, bay-board 3%, kiosk welcome 4%, kiosk done 3%, status page 3% full bg.
- [x] V4.3 — Cards already have `hover:shadow-md` transition; bay-board drag polish lands in V6 with `scale-[1.02] shadow-xl ring-2 ring-primary/40`.
- [x] V4.4 — KPI strip on Today dashboard (already shipped under P56.0): Jobs in Progress / Awaiting Approval / Ready for Collection / New Check-ins, 4-column strip at `<sm>` grid / `<lg>` grid-cols-4.
- [ ] V4.5 — Skeleton audit deferred. Current pages use a mix of skeletons + default SSR; `<LoadingState.Page>` + `<LoadingState.Grid>` primitives shipped in P56.3 but not yet wired as Suspense boundaries on every page. Phase 4 deploy polish will complete this.

**UX audit gates:**
- [x] Pattern opacity at UX-audit caps (3-4% max). Pattern strokes inherit `currentColor` + `dark:invert` so dark-mode contrast preserved.
- [ ] Card shadows in dark mode — default Tailwind shadow behaves acceptably; formal dark-mode audit pending Phase 4 staging.
- [x] KPI numbers are `text-2xl font-bold tabular-nums` — largest element in the card.
- [x] Skeleton shimmer uses `animate-pulse` which the global reduced-motion rule zeros.
- [ ] CLS measurement deferred to Phase 4 performance pass.

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

### V5.3 — Customer status page (major redesign)

> Updated 2026-04-18 — expanded from a light branding pass to a proper
> redesign. Decided with Hossein: the status page needs to be a useful
> customer portal, not just a job tracker.

**Files:** `src/app/(public)/status/StatusClient.tsx`, `/api/status/state/route.ts`

**Current state:** Oversimplified — single job view, manual form layout,
no branding, no invoices, no MOT info. Uses `.limit(1)` so only the
newest job is visible even when a vehicle has multiple active jobs.

**Target — what the customer sees:**

1. **Garage branding** — logo + name at top (trust signal for SMS link
   clicks). Resolved via `getGarageBrandById()` from the signed session.
2. **All active jobs** — summary card per job (number, type, status,
   estimated ready). Tap into each for the full timeline. Fix: remove
   `.limit(1).maybeSingle()` from the state endpoint, return array.
3. **Invoices and quotes** — quoted/invoiced/paid charges with
   tap-to-download PDF link. Cuts "WhatsApp me the invoice" calls.
4. **MOT expiry date** — from cached DVSA data (no live API calls).
   If MOT done at this garage, show result. Otherwise link to GOV.UK.
5. **Garage contact info** — phone, address, hours (from `garages` table).
6. **Car part pattern** — `pattern.svg` at `opacity: 0.03` behind main
   content area for subtle automotive identity.

**Visual treatment:**
- Migrate lookup form to `FormCard` + `FormActions`
- Brand tokens via V1 resolution for public routes
- Empty-state illustrations if no active jobs / no invoices
- Mobile-first (customers click SMS links on their phones)

**Data model:**
- One car, one owner, transferable by manager reassignment
- Phone check on `vehicles.customer_id` → customer phone gates access
- All jobs on the vehicle visible to the verified owner
- No write access from the status page (bookings + approvals have own flows)

### V5.4 — Sidebar header

**File:** `src/components/app/sidebar.tsx` (modify)

Replace "Oplaris Workshop" text with the garage logo (from `GarageLogo` component, V1.4). Below the logo: a small "Powered by Oplaris" text in muted colour. This is important for the resale model — the product feels like theirs, but Oplaris gets brand credit.

### V5.5 — PDF job sheet header

**File:** `src/app/(app)/app/jobs/pdf/actions.ts` (modify)

Add garage logo and business name to the PDF header. Use the Architect pattern at 3% behind the header area. Include: garage name, address, phone, email, and a "Thank you for choosing [garage name]" footer.

**Test checklist:**
- [x] V5.1 — Login wrapped in `PatternBackground` + `GarageLogo`; consumes brand tokens from `(auth)/layout.tsx`. Form migrated to shadcn Button + Input + Label so brand tokens apply everywhere.
- [x] V5.2 — Kiosk welcome: `GarageLogo` rendered above the 3 service tiles, full-bleed `PatternBackground` at 4% opacity.
- [x] V5.3a — Status header: `GarageLogo` + "Vehicle Status" subtitle, server-resolved brand.
- [x] V5.3b — `/api/status/state` returns `jobs[]` array (no more `.limit(1).maybeSingle()`). StatusClient renders one `<JobCard>` per job.
- [x] V5.3c — Invoice rows on status page with amount + "Download PDF" button. New `/api/status/invoice/[jobId]` route — HMAC-cookie-gated public download, re-verifies vehicle ownership.
- [x] V5.3d — MOT band reads from `mot_history_cache`. Shows expiry date + last test result + GOV.UK link.
- [x] V5.3e — Garage contact card at bottom: phone as `tel:` link, email as `mailto:`, address, website.
- [x] V5.3f — Full-page `PatternBackground` at 3% (UX-audit cap for surfaces under data).
- [x] V5.3g — Lookup + verify-code forms migrated to `<FormCard>` + `<FormActions fullWidth>`.
- [x] V5.4 — Sidebar gained a muted "Powered by Oplaris" resale credit pinned to its bottom edge via `mt-auto` on the flex column.
- [x] V5.5 — PDF job sheet branded header — full-bleed brand-primary bar + accent stripe + brand-coloured section underlines + accent-coloured totals row (via `brand_primary_hex` / `brand_accent_hex` on `garages`).

**UX audit gates:**
- [x] Login: text on `PatternBackground` + `bg-card/95` card sits on a solid card background → WCAG AA preserved regardless of pattern underneath.
- [x] Kiosk logo sized via `GarageLogo size="lg"` (72 px cap) — leaves room for the 3 service tiles.
- [x] Status page logo loads via Next/Image when `logoUrl` is set; wordmark fallback otherwise.
- [x] "Powered by Oplaris" renders at 11 px muted — never competes.
- [x] Brand tokens mirror into `.dark` scope via migration 039 — dark mode covered.

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
- [x] V6.1 — Every new form path (charges, login, NewJob, payment dialog) uses `useTransition` + disables the Button while pending + toast success/error. Older pages that already had this pattern are unchanged.
- [x] V6.2 — `lib/toast.ts` facade over sonner gives callers `toast.success / .error / .info / .warning / .promise`. Charges section fires contextual strings ("Quote sent to customer", "Payment recorded — Cash"). Old generic "Saved" strings culled in P56.6.
- [x] V6.3 — `.page-fade-in` keyframe on AppShell `<main>` with `key={pathname}` for soft-nav re-trigger. 200 ms duration.
- [x] V6.4 — Bay-board drag: `scale-[1.02] shadow-xl ring-2 ring-primary/40` + 150 ms transition. Drop zone already highlights via `snapshot.isDraggingOver`.
- [x] V6.5 — Active work log pulse via `animate-pulse` on the success-token dot in TechJobClient timer (shipped earlier).
- [x] V6.6 — Global `@media (prefers-reduced-motion: reduce)` rule in `globals.css` zeroes every animation + transition (shipped in P56.8).

**UX audit gates:**
- [x] No animation exceeds 320ms — page-fade 200 ms, drag 150 ms, pulse 2 s (loop, not one-shot).
- [x] All motion uses `ease-out` (Tailwind default for `transition-all`).
- [x] Toasts auto-dismiss per sonner defaults (4 s success, 6 s error via `toast.error`'s override in `lib/toast.ts`).
- [x] Toast position: `top-right` on desktop via Toaster prop; sonner auto-places for mobile.
- [x] Tech mobile UI: no gratuitous animation. Timer uses `tabular-nums` tick not animation. Pulse is on the status dot only.

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
