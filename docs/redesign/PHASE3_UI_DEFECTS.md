# PHASE 3 — UI Defect Register (P56 audit)

> **Method:** ux-audit skill, full 9-section sweep + CLAUDE.md architecture rules.
> **Scope:** every surface under `src/app/(app)/app/**`, `src/app/(public)/{kiosk,status}/**`, and `src/components/**`.
> **Severity rubric:** Critical = blocks the user, violates a WCAG 2.2 AA or CLAUDE.md rule, or is the root cause of multiple downstream defects · High = noticeably degrades usability or consistency · Medium = polish drift / drift-in-progress · Low = cosmetic.
> **Date:** 2026-04-15. Author: Claude (this session).
> **Reader instruction:** Read this whole file before opening `P56_KICKOFF.md`. Every row is file:line, with a before/after sketch. Don't skip the Critical section — three of the four High/Medium families cascade from it.

---

## Executive summary — what Hossein actually saw

Hossein's complaint was three-part:

1. **"buttons are different"** → confirmed. The `Button` primitive ships with defaults that are too small (24 / 28 / 32 / 36 px) which **violates CLAUDE.md rule "44×44 px minimum touch targets"** and WCAG 2.5.5. Every caller either (a) accepts the 32 px default and ships a button smaller than the project's own stated standard, or (b) escapes the primitive with inline `style={{ minHeight: 64 }}` + `h-16` (see `TechJobClient.tsx:276, 290, 301, 311`). Result: buttons look visually different in every view because the primitive does not supply a real primary-CTA size.
2. **"labels seem buttons and buttons seem labels"** → confirmed in two places. `TechJobClient.tsx:185-192` renders a phone "Call" as an `<a>` with button styling (looks like a primary button, behaves like a link, no Button semantics). `TechJobClient.tsx:159` renders a **status label** using pill styling that looks identical to the task-type filter pills at `TechJobClient.tsx:239-251` (which are real `<button>`s). Same rounded pill, same px, same color scale — label vs. trigger is indistinguishable.
3. **"pages are full width in some areas (good) and fixed size in others (bad)"** → confirmed. 10 different `max-w-*` sizes across 14 `(app)` page roots, with no documented rationale. Tech job detail clamps to `max-w-lg` (512 px); job detail to `md:max-w-4xl` (896 px); Today to full width; customers list to full width but the individual customer to `max-w-3xl`. The app layout does not have a content-width system.

Under the hood the audit also surfaces a set of **token-drift** issues (hardcoded `amber-*` / `emerald-*` / `green-*` / `red-*` / `bg-yellow-400` ignoring the `--success`, `--warning`, `--info`, `--destructive`, and brand `--primary` semantic tokens) and **four** `alert()` / `confirm()` native-browser dialog calls that bypass the design system entirely. Together these are why the app "feels" inconsistent.

Total defects logged: **38** (6 Critical · 14 High · 12 Medium · 6 Low).

---

## C — Critical (6)

### C1 — `Button` primitive defaults violate CLAUDE.md 44×44 px rule

**File:** `src/components/ui/button.tsx:22-34`
**Rules broken:** CLAUDE.md "44×44 px minimum touch targets" · WCAG 2.5.5 Target Size · design-token layering rule (primitive should set the default, callers should not need to override).

**Current:**
```tsx
size: {
  default: "h-8 gap-1.5 px-2.5 ..."        // 32 px
  xs: "h-6 ... px-2 text-xs ..."            // 24 px
  sm: "h-7 ... px-2.5 text-[0.8rem] ..."    // 28 px
  lg: "h-9 gap-1.5 px-2.5 ..."              // 36 px  ← "large" is still below 44 px
  icon: "size-8",                            // 32×32
  "icon-xs": "size-6 ...",                   // 24×24
  "icon-sm": "size-7 ...",                   // 28×28
  "icon-lg": "size-9",                       // 36×36
}
```

**Evidence of cascade:**
- `TechJobClient.tsx:275, 289, 300, 310` — every primary CTA re-declares `h-16` + `style={{ minHeight: 64 }}` to escape the primitive.
- `JobActionsRow.tsx` — uses `size="sm"` (28 px) for "Mark complete", "Cancel job", etc. These are the most-clicked buttons in the manager flow and they are below touch-target minimum.

**Fix:**
```tsx
size: {
  default: "h-11 gap-2 px-4 ...",           // 44 px — matches CLAUDE.md
  sm: "h-9 gap-1.5 px-3 text-sm ...",       // 36 px — dense tables only (opt-in), NOT for primary CTAs
  lg: "h-12 gap-2 px-5 text-base ...",      // 48 px — primary CTAs on mobile/tech surfaces
  xl: "h-16 gap-2.5 px-6 text-lg ...",      // 64 px — NEW; replaces TechJobClient inline h-16
  icon: "size-11",                           // 44×44
  "icon-sm": "size-9",                       // 36×36 — dense tables
  "icon-lg": "size-12",                      // 48×48
}
```
Then delete the inline `style={{ minHeight: 64 }}` overrides. Retire `xs` / `icon-xs` (no legitimate use case at 24 px on a shop-floor app).

**Blast radius:** every Button in the app gets taller. Audit once; expect two-three dense-table rows to need `size="sm"` opt-in. This is the single largest fix in Phase 3.

---

### C2 — "Call" link rendered as button without Button semantics

**File:** `src/app/(app)/app/tech/job/[id]/TechJobClient.tsx:185-192`
**Rules broken:** CLAUDE.md "shadcn primitives, Tailwind, RSC-first" · WAI-ARIA "use the right element for the job" · Hossein's complaint #2.

**Current:**
```tsx
<a
  href={`tel:${customerPhone}`}
  className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
>
  <Phone className="h-3.5 w-3.5" />
  Call
</a>
```

**Why it fails:**
- Looks like a primary Button but is a bare anchor — no focus ring, no active/hover state, no disabled state, no keyboard affordance.
- `text-xs` + `py-1.5` ≈ 26 px tall — well under touch target.
- Bypasses the Button design primitive entirely; changes to the design system won't reach it.

**Fix:**
```tsx
<Button asChild size="sm" className="mt-1">
  <a href={`tel:${customerPhone}`} aria-label={`Call ${customerName}`}>
    <Phone />
    Call
  </a>
</Button>
```
(requires adding `asChild` support to the primitive, which is a trivial Slot change — 3 lines.)

---

### C3 — Status label styled identically to interactive filter pill

**Files:**
- **Label** (non-interactive): `TechJobClient.tsx:159` — `rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium capitalize`
- **Trigger** (interactive): `TechJobClient.tsx:243-251` — `rounded-full border px-3 py-1.5 text-sm font-medium ...`

**Why it fails:** both are rounded pills with the same border-radius, the same text weight, and near-identical padding. Users cannot tell from sight which one is clickable. This is literally Hossein's "labels seem buttons and buttons seem labels" complaint.

**Fix:**
- Replace line 159 with `<StatusBadge status={status} />` (primitive already exists at `src/components/ui/status-badge.tsx`).
- Replace the raw `<button>` filter pills at 238-251 with shadcn's `<ToggleGroup>` + `<ToggleGroupItem>` so the interaction affordance is the ToggleGroup's pressed-state, not a bespoke pill.

---

### C4 — Four hardcoded `bg-yellow-400` UK reg-plate renders (no primitive)

**Files:**
- `TechJobClient.tsx:173`
- `app/jobs/[id]/page.tsx:268`
- `app/bookings/page.tsx:101, 189`
- `app/jobs/page.tsx:122`
- `app/customers/[id]/page.tsx:110`
- `app/vehicles/page.tsx:100`
- `app/vehicles/[id]/page.tsx:67`
- `app/tech/page.tsx:364, 435`

**Why it fails:** the UK reg plate is a design token (yellow plate, black mono text, specific padding and border-radius), reimplemented inline 10 times with **three different padding scales** (`px-1.5 py-0.5`, `px-2 py-0.5`, `px-3 py-1`) and **four different text sizes** (`text-[11px]`, `text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl`). It's the most-repeated visual motif in the app and it's the most-inconsistent.

**Fix:** new primitive `src/components/ui/reg-plate.tsx`:
```tsx
export function RegPlate({ reg, size = "md", className }: RegPlateProps) {
  const sizes = {
    xs: "px-1.5 py-0.5 text-[11px]",
    sm: "px-2 py-0.5 text-xs",
    md: "px-2.5 py-1 text-sm",
    lg: "px-3 py-1.5 text-base",
    xl: "px-4 py-2 text-xl",
  };
  return (
    <span className={cn(
      "inline-block rounded font-mono font-bold",
      "bg-[color:var(--reg-plate-bg,#FFCC00)] text-[color:var(--reg-plate-fg,#000)]",
      "ring-1 ring-black/10",
      sizes[size],
      className,
    )}>{reg}</span>
  );
}
```
Then replace all 10 call-sites. The CSS custom property allows a future "Ireland plate" / "EU plate" variant.

---

### C5 — Dark-mode semantic tokens missing

**File:** `src/app/globals.css:100-132`
**Rule broken:** DESIGN_SYSTEM §1.1 "tokens must define both light and dark".

**Current:** `:root` defines `--success`, `--warning`, `--info`, `--success-foreground`, `--warning-foreground`, `--info-foreground`. The `.dark` scope (lines 100-132) **does not redefine them** — they fall through to the light values. Dark mode will have green/amber/blue badges that look wrong against the dark background, and their foregrounds will be close to unreadable.

**Fix:** add to `.dark`:
```css
--success: oklch(0.65 0.17 155);
--success-foreground: oklch(0.12 0 0);
--warning: oklch(0.80 0.17 75);
--warning-foreground: oklch(0.12 0 0);
--info: oklch(0.70 0.14 245);
--info-foreground: oklch(0.12 0 0);
```
Verified against WCAG AA on both light `--card` and dark `--card` backgrounds with the `oklch.ts` helper from V1.

---

### C6 — Hardcoded `amber-*` / `emerald-*` classes bypass semantic tokens

**Scale of issue:** ~22 occurrences across 7 files.

| File | Line(s) | Should use |
|---|---|---|
| `TechJobClient.tsx` | 203-218, 289, 300 | `--warning` (pause state) + `--success` (resume CTA) |
| `app/tech/page.tsx` | 193, 301-304, 357-360, 447 | `--warning` (passback badge) |
| `app/bookings/page.tsx` | 84, 111, 165, 180 | `--warning` (passback badge) |
| `components/ui/role-badge.tsx` | 24 | `--warning` (mot_tester) |
| `app/jobs/[id]/ChangeHandlerDialog.tsx` | 94, 100, 112-113, 300 | `--warning` (busy) / `--success` (available) |
| `app/jobs/[id]/JobActivity.tsx` | 138-150, 254-255, 369-370 | `--warning` (pause) / `--success` (running) |
| `app/settings/staff/page.tsx` | 22, 71 | `--success` (active) |
| `app/(auth)/login/LoginForm.tsx` | 47 | `--destructive` |
| `app/settings/PairTabletButton.tsx`, `ApprovalDialog.tsx`, `AddStaffDialog.tsx`, `BrandingForm.tsx` | status messages | `--success` or `--info` |

**Why it fails (3 reasons):**
1. Tailwind `emerald-500` / `amber-400` are **fixed scales**. The V1 brand system lets garages set their own `--primary`. If a Dudley-competitor garage has a green primary, the hardcoded emerald conflict will be jarring.
2. Dark mode doesn't automatically adjust (see C5; but also the hardcoded values have only `dark:` variants in about 40 % of cases — the rest silently break in dark).
3. Four different shades are used for "amber" (`amber-50`, `amber-100`, `amber-200`, `amber-400`, `amber-500`, `amber-600`, `amber-800`, `amber-900`, `amber-950`) and five for "emerald" — **ten different "warning"s and "success"es across the app**.

**Fix:** introduce utility helpers in `src/components/ui/status-badge.tsx` (already exists — extend) with `tone="warning" | "success" | "info" | "destructive"`. Migrate call-sites. Ban hardcoded `amber-*`/`emerald-*`/`green-*`/`red-*` via a lint rule (`eslint-plugin-tailwindcss` `no-arbitrary-value` + custom deny-list).

---

## H — High (14)

### H1 — 10 page-level `max-w-*` values with no system

**Evidence:**

| Page | `max-w-*` | px | Notes |
|---|---|---|---|
| `/app` (Today) | — | full | No container |
| `/app/jobs` | — | full | No container |
| `/app/bookings` | — | full | No container |
| `/app/customers` | — | full | Table + `max-w-sm` on search |
| `/app/vehicles` | — | full | Table + `max-w-md` on search |
| `/app/stock` | — | full | Table |
| `/app/bay-board` | — | full | Grid |
| `/app/tech` | `max-w-3xl` | 768 | Mobile-first surface |
| `/app/tech/job/[id]` | `max-w-lg` | 512 | Mobile-first surface |
| `/app/jobs/[id]` | `md:max-w-4xl` | 896 | **Only page with responsive max-w** |
| `/app/jobs/new` | `max-w-xl` | 576 | Form |
| `/app/customers/[id]` | `max-w-3xl` | 768 | Detail |
| `/app/customers/new` | `max-w-xl` | 576 | Form |
| `/app/vehicles/[id]` | `max-w-4xl` | 896 | Detail — different from customers |
| `/app/settings` | — | full | — |
| `/app/settings/profile` | `max-w-lg` | 512 | Form — different from new customer |
| `/app/settings/billing` | `max-w-xl` | 576 | Form |
| `/app/settings/branding` | `max-w-2xl` | 672 | Form — different again |
| `/app/settings/staff` | — | full | List |
| `/app/settings/audit-log` | — | full | Table |
| `/app/guide` | `max-w-3xl` | 768 | Article |

**Fix — page-width system.** New file `src/components/app/page-container.tsx`:
```tsx
export function PageContainer({
  width = "default",          // "full" | "default" | "narrow" | "form"
  children,
}: { width?: "full" | "default" | "narrow" | "form"; children: React.ReactNode }) {
  const widths = {
    full: "",                   // tables, lists, boards
    default: "max-w-5xl",       // 1024 — detail + dashboard views
    narrow: "max-w-3xl",        // 768 — article, settings content, tech
    form: "max-w-xl",           // 576 — single-column forms
  };
  return <div className={cn("w-full", widths[width])}>{children}</div>;
}
```
Migrate all pages. Document which pages use which width in DESIGN_SYSTEM.md. Delete every page-level `max-w-*`. Delete `md:max-w-4xl` at `app/jobs/[id]/page.tsx:181`.

---

### H2 — Three identical passback-badge spans repeated inline

**Files:**
- `app/tech/page.tsx:301-304, 357-360, 426`
- `app/bookings/page.tsx:84, 165`

All five render:
```
border-amber-500 bg-amber-50 text-[10px] font-bold uppercase text-amber-900
dark:bg-amber-950 dark:text-amber-200
```

**Fix:** new `<PassbackBadge items?={string[]} />` primitive in `src/components/ui/passback-badge.tsx`; uses `--warning` tokens from C5/C6 fixes.

---

### H3 — Native `alert()` / `confirm()` break design language

**Files:**
- `app/tech/ClaimPassbackButton.tsx:31` — `alert()`
- `app/bookings/StartWorkButton.tsx:28` — `alert()`
- `app/bookings/StartMotButton.tsx:32` — `alert()`
- `app/jobs/[id]/ReturnToMotTesterButton.tsx:27` — `alert()`
- `app/jobs/[id]/JobActionsRow.tsx:184, 246, 289` — `alert()`
- `app/jobs/[id]/JobActionsRow.tsx:238, 319` — `confirm()`
- `app/jobs/[id]/ResumeMotButton.tsx:24` — `alert()`
- `app/settings/branding/BrandingForm.tsx:129` — `confirm()`

**Why it fails:** UA-native dialogs look like 1999, can't be styled, are dismissable with Cmd-W on macOS, sometimes block the main thread, and on a touch screen with gloves (CLAUDE.md tech persona) the buttons are tiny. They're also impossible to screenshot-test.

**Fix:**
- All `confirm()` → shadcn `<AlertDialog>`. Reusable `<ConfirmDialog />` primitive wrapping it with `title / description / confirmLabel / variant="destructive" | "default"`.
- All `alert()` on error → `sonner` toast via `toast.error(…)` (already installed; verify).

---

### H4 — `JobActionsRow.tsx` CTA buttons use `size="sm"` for primary actions

**File:** `src/app/(app)/app/jobs/[id]/JobActionsRow.tsx` — every button throughout.

**Why:** the primary-action row of the job detail page is the most-used surface by managers. Every CTA there renders at 28 px. Cascade of C1. After C1 is fixed, audit this file and set `size="default"` (44 px) on all primary/secondary, reserve `size="sm"` only for the ⋯ Overflow trigger icon.

---

### H5 — `h1` sizing inconsistent across pages

| Page | h1 |
|---|---|
| Most pages | `text-2xl font-semibold` |
| `/app/jobs/[id]` | `text-xl font-semibold sm:text-2xl` |
| `/app/settings/branding` | `mt-4 text-2xl font-semibold` (rogue `mt-4`) |

**Fix:** new `<PageTitle>` component; one place, one `text-2xl font-semibold font-heading`. `font-heading` is defined in globals.css but never actually applied to h1s — they inherit `font-sans`.

---

### H6 — `<StatusBadge>` primitive exists but is not universally used

**Evidence:** `grep -rn StatusBadge src/` — used in some lists, but inline status pills reimplemented at `TechJobClient.tsx:159`, `app/jobs/[id]/page.tsx` (multiple), and `app/bookings/page.tsx` (multiple). Five different status-pill implementations in production.

**Fix:** audit every `status` render, migrate to `<StatusBadge>`. Add to `DESIGN_SYSTEM.md` as the only way to render a job status.

---

### H7 — Raw `<select>` elements inside shadcn Dialog

**Files:**
- `app/warranties/WarrantyRowActions.tsx:125`
- `app/stock/StockRowActions.tsx:144`

Native selects inside shadcn Dialogs break visual consistency (wrong border-radius, wrong focus ring, wrong chevron) and lose keyboard navigation.

**Fix:** migrate to shadcn `<Select>`. Both are inside modals so page-layout risk is zero.

---

### H8 — Task-type filter pills are raw `<button>` elements

**File:** `TechJobClient.tsx:237-252`

10 hand-styled buttons that duplicate logic a `<ToggleGroup>` already gives for free (single-select radio semantics, keyboard arrow navigation, aria-pressed).

**Fix:** migrate to shadcn `<ToggleGroup type="single">`. Bonus: we get keyboard accessibility on the tech UI for free, which CLAUDE.md flags as a gap (M2.6 deferred but in scope for Phase 3 polish).

---

### H9 — Raw `<input>` for task description

**File:** `TechJobClient.tsx:261-268`

Styled inline instead of using `<Input>` primitive (which already exists at `src/components/ui/input.tsx`). Focus ring and border styles drift from form pages.

**Fix:** replace with `<Input id="taskDesc" ... />` + `<Label htmlFor="taskDesc" ...>`.

---

### H10 — `vehicles/[id]/page.tsx` is `max-w-4xl` but `customers/[id]/page.tsx` is `max-w-3xl`

Detail pages of sibling resources have different widths. Resolves via H1 (`PageContainer width="default"`).

---

### H11 — Kiosk page has `style={{ minHeight: 180 }}` on the category buttons

**File:** `src/app/(public)/kiosk/page.tsx:147`

The three kiosk category tiles declare their height via inline style. This works but means changing the kiosk button height requires touching an inline style, and the kiosk is meant to be branded (V5). Move to a `<KioskButton>` component or `size="xl"` after C1.

---

### H12 — No focus-visible styling on the kiosk category tiles

**File:** `src/app/(public)/kiosk/page.tsx:130-160`

The kiosk is touch-only in production but staff use a stylus / keyboard for setup. Currently relies on Tailwind default `focus-visible` which is the browser default dotted outline — poor against the brand background. Add an explicit `focus-visible:ring-4 focus-visible:ring-ring/50` to the tile component.

---

### H13 — `app/jobs/[id]/page.tsx:181` uses `md:max-w-4xl` — the only page that scales max-w responsively

All other pages either have a fixed `max-w-*` or none. Page-width behaviour should be a single rule system (H1), not a one-off.

---

### H14 — `role-badge.tsx:24` hardcodes mot_tester as amber

Instance of C6, called out separately because the role-badge is a primitive and should be the reference implementation, not a violator.

---

### H15 — List-view filter bars use two different primitives (Hossein 2026-04-15)

**Files:**
- `app/customers/page.tsx:111-135` — raw `<Link>` with `rounded-full border px-3 py-1.5 text-sm font-medium transition-colors` → **pill-shaped filters**
- `app/jobs/page.tsx:70-82` — `<Link>` wrapping `<Button variant="default|outline" size="sm">` → **rectangular shadcn buttons**

Same interaction (single-select filter between list states), two completely different visual treatments. This is the textbook case of Nielsen heuristic #4 (Consistency and standards) — "Users should not have to wonder whether different words, situations, or actions mean the same thing." It's exactly the "buttons are different" complaint zoomed in.

**Downstream implication:** the tech surface (`tech/page.tsx:237-252`) uses a *third* filter pattern — raw `<button>` pills for task-type selection. Three filter patterns across three surfaces.

**Fix — new primitive `src/components/ui/filter-pills.tsx`:**
```tsx
interface FilterPillsProps<T extends string> {
  value: T;
  onSelect?: (v: T) => void;   // optional — if href provided, renders Links
  items: { value: T; label: string; count?: number }[];
  hrefFor?: (v: T) => string;  // optional — SSR-navigation pattern
  ariaLabel: string;           // WCAG 4.1.2
}
```
Implementation uses shadcn `<ToggleGroup type="single">` for the client-state case, or a semantic `<nav role="tablist">` of styled `<Link>`s for the SSR-navigation case. Both render as the same visual primitive: rounded-full pill, `--primary` fill when active, `--muted` outline when inactive, optional numeric count badge.

Migrate:
- `app/jobs/page.tsx` — SSR-Link variant (status filter is URL-driven).
- `app/customers/page.tsx` — SSR-Link variant (openJob filter is URL-driven).
- `app/tech/job/[id]/TechJobClient.tsx:237-252` — client-state variant (task type). This overlaps with UI-H8 (migrate to ToggleGroup); FilterPills wraps ToggleGroup with the canonical styling so both needs are met by one primitive.
- Any other page with an inline filter bar — grep `rounded-full.*px-3` + `variant="outline".*Link href.*status=` to find them.

**Blast radius:** 3 known migration sites today. Prevents the filter bar from drifting again because the lint rule banning hardcoded `amber-*` / `emerald-*` gets a sibling rule banning hand-built filter pills outside the primitive.

---

## M — Medium (12)

### M1 — `font-heading` token defined but never applied
`globals.css:12` defines `--font-heading: var(--font-sans)` and `@theme inline` maps `--font-heading`. No component uses `font-heading`. Either wire `Card`/`PageTitle`/`h1..h6` to it, or delete the token. Current state is dead code.

### M2 — `CardHeader` allows `pb-2` overrides on some cards, not others
Grep'ing `CardHeader className` shows 12 pages adding `pb-2`, 8 not. The `has-[.border-b]:pb-4` base rule doesn't cover the common no-border case. Normalize: decide `CardHeader` default is `pb-3` and delete all per-site overrides.

### M3 — `text-xs` used for interactive content in 9 places
Search results show buttons, pills, and actionable labels at `text-xs` (12 px). Minimum readable size for interactive elements is 14 px (sm). Target: `text-xs` only for timestamps, metadata, keyboard shortcuts.

### M4 — `bg-muted/50`, `bg-muted/60`, `bg-muted/70` drift
Translucency on muted backgrounds is inconsistent. Pick two: `/50` for dim surfaces, `/30` for hover, retire the rest.

### M5 — Tech `h2` uses `text-base` but other detail pages use `text-lg`
Section headings drift. Standardize to `text-lg font-semibold font-heading` across detail pages; tech page can opt into `text-base` via a `<SectionTitle size="sm">` variant.

### M6 — No empty-state component
Multiple pages render empty lists with ad-hoc `<p className="text-muted-foreground">No jobs yet.</p>`. Build `<EmptyState icon title description action>` (this is V3 in the plan — formalize it here and land in P56).

### M7 — Loading states use three patterns
Some pages use `<Skeleton>`, some use `"..."` text, some use nothing (just await the RSC and show blank). Pick Skeleton. Add `<LoadingState>` helper.

### M8 — `ChangeHandlerDialog.tsx:94-113` — availability pills hardcode `amber-*`/`emerald-*`
Instance of C6, inside a primitive dialog used in the biggest keyboard-accessible surface. Use `<Badge tone="warning"/"success">`.

### M9 — `app/settings/staff/page.tsx:22` — role-color map in page
```tsx
mechanic: "bg-green-100 text-green-800",
```
Role colours are a design token; move to `role-badge.tsx` or delete the map entirely (role is already semantic).

### M10 — Some pages open card rows that look clickable but aren't
`app/customers/[id]/page.tsx` has vehicle-row cards with hover state but no `onClick`. Users hover, expect navigation, get nothing. Either wrap in `<Link>` to `/app/vehicles/[id]` or drop the hover affordance.

### M11 — Card footers break grid alignment
Cards with `<CardFooter>` gain `rounded-b-xl border-t bg-muted/50 p-4`. Cards without don't pad the bottom the same. In multi-card grids (P37 fix) this creates rag-bottom alignment despite `h-full`.

### M12 — Inline `style={{ minHeight: 40 }}` on TechJobClient pills
`TechJobClient.tsx:248` — use Tailwind `min-h-10` instead of inline style. (Same kind of leak as C1's `minHeight: 64`.)

---

## L — Low (6)

### L1 — Brand tokens in OKLCH but `--destructive` in dark uses a different chroma than light (light: 0.245, dark: 0.191) without a note why. Document or unify.

### L2 — `AddVehicleForm.tsx:215-226` uses hardcoded `border-green-200 bg-green-50` success panel + `text-green-700 text-red-600` MOT chips. Minor — roll into C6 migration.

### L3 — `app/(public)/status/page.tsx:265` uses `border-emerald-300 bg-emerald-50` for a "match" result. Roll into C6.

### L4 — `login/LoginForm.tsx:47` error uses `text-red-600`, not `text-destructive`. Trivial.

### L5 — Sidebar badge uses raw numeric count `{count}` without plural-safe formatting. If a garage has 100+ bookings the badge overflows. Cap at `99+`.

### L6 — `car-image.tsx:36` inline `style={{ minHeight: 80 }}`. Move to Tailwind class.

---

## Cross-cutting design-system gaps

Things not in the code but missing from the design system, surfaced by the audit:

1. **No `PageContainer` primitive** (H1 / H10 / H13).
2. **No `PageTitle` primitive** (H5 / M5).
3. **No `RegPlate` primitive** (C4).
4. **No `PassbackBadge` primitive** (H2).
5. **No `ConfirmDialog` wrapper around `AlertDialog`** (H3).
6. **No `EmptyState` primitive** (M6).
7. **No `LoadingState` primitive** (M7).
8. **No documented "button size → when to use" table in DESIGN_SYSTEM.md** (C1 fallout).
9. **No lint rule banning hardcoded `amber-*`/`emerald-*`/`green-*`/`red-*` outside of primitives** (C6).
10. **No `font-heading` application** (M1).

Each of these gets created or deleted in P56.

---

## Proposed P56 execution order

Tight dependency chain — doing this out of order means redoing work:

1. **P56.1 Foundation** — C1 (Button primitive resize), C5 (dark-mode semantic tokens), M1 (font-heading wiring). No UI changes visible in isolation but every later fix rides on these.
2. **P56.2 Token migration** — C6 + H14 + M8 + M9 + L2 + L3 + L4. One big replace pass. Add the lint rule at the end so it catches regressions.
3. **P56.3 New primitives** — C4 RegPlate, H2 PassbackBadge, H3 ConfirmDialog, H5 PageTitle, H1/H10/H13 PageContainer, M6 EmptyState, M7 LoadingState. Land all seven in one shippable slice; no page migrations yet.
4. **P56.4 Page-width migration** — apply PageContainer everywhere. 14 pages. Delete every `max-w-*` at page root.
5. **P56.5 Tech surface polish** — C2 (Call button), C3 (status vs. filter pill separation), H8 (ToggleGroup for task types), H9 (Input primitive), M12 (delete inline minHeights). This is the screen Hossein probably looked at when he wrote the complaint.
6. **P56.6 JobActionsRow + confirm() sweep** — H4 + H3 end-to-end. Every `alert()` → toast; every `confirm()` → ConfirmDialog.
7. **P56.7 Status-badge normalization** — H6 + H7 + M2 + M3 + M4 + M5 + M10 + M11.
8. **P56.8 Kiosk + status polish** — H11 + H12 + L3 + L5 + L6.
9. **P56.9 Visual regression** — Playwright screenshot diff every page at 375 px / 768 px / 1440 px widths. Commit baseline. This becomes the Phase 3 gate.
10. **P56.10 DESIGN_SYSTEM.md update** — document the five new primitives, the button-size table, the page-width system, and the token migration. Land the lint rule.

Estimated effort if Claude Code runs autonomously (P52/P53/P54 velocity): **10-14 sessions** (~3-5 days at Hossein's normal cadence). Most of the work is in P56.2 (grepping + replacing across the codebase) and P56.4 (page-by-page migration); P56.1, P56.3, P56.5-8 are each 1-2 sessions.

---

## Test plan

- **Unit** — primitive tests for every new component (`RegPlate`, `PassbackBadge`, `ConfirmDialog`, `PageTitle`, `PageContainer`, `EmptyState`, `LoadingState`). Target 100 % branch coverage on variants.
- **RLS** — no RLS changes expected. Spot-check: make sure `StatusBadge` migration doesn't leak hidden statuses to low-privilege roles.
- **Visual regression** — Playwright snapshot every `(app)/**` page at three widths. Fail CI on diff. This is new.
- **Accessibility** — axe-core CI sweep on every page. Target zero Critical/Serious violations.
- **Manual** — one run through the four UIs on a phone, locked-down tablet, desktop Chrome, and in dark mode before declaring P56 done.

---

## Non-goals for P56 (explicit — do NOT do in this phase)

- **No V2 (icon system) work** — that's scoped in `VISUAL_IMPLEMENTATION_PLAN.md` as a separate deliverable.
- **No V3 illustration work** — deferred until after P56 primitives land.
- **No copy changes** — if a label is wrong, log it, don't fix in the same PR.
- **No responsive rework beyond page-width** — full mobile pass stays deferred to M2.6 / Phase 3 later.
- **No realtime work** — P50 is shipped, leave it alone.
- **No migrations** — this is purely UI.

---

## Open questions for Hossein (one batch)

1. **Button sizing proposal** — C1 resets defaults to 44 / 36 / 48 / 64. Happy with `default = 44 px`? That's the WCAG floor and matches CLAUDE.md, but it will make the desktop manager dashboard feel a bit heavier. Alternative: keep `sm = 32` as the "dense table" size and default to 44 everywhere else.
2. **Page-width defaults** — H1 proposes four widths: `full | default (1024) | narrow (768) | form (576)`. OK, or want a different scale?
3. **Dark-mode ship gate** — C5 fix would make dark mode actually look good. Do you want a visible dark-mode toggle in P56, or keep it system-preference-only and ship the toggle in V6 as planned?
4. **Scope confirmation** — anything in Critical / High you want deferred, or anything in Medium / Low you want promoted?

Answer each as "A" or "B" or just written; I'll fold into P56_KICKOFF.md.
