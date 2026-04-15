# P56 Kickoff Prompt — Phase 3 UI/UX remediation

> Paste this into Claude Code at the start of the P56 session. Assumes `CLAUDE.md` auto-loads. Run order inside Phase 3: **P56 (this doc)** → V2 icon system → V3 empty-state illustrations → V4 background textures → V5 branded public surfaces → V6 micro-interactions. P56 comes before V2–V6 because every one of them depends on the primitives, token migration, and page-width system that P56 lands.
>
> **Scope:** ship a single comprehensive UI + UX remediation of the existing staff app, tech surface, kiosk, and public status page, driven by three defect registers (`docs/redesign/PHASE3_UI_DEFECTS.md`, `docs/redesign/PHASE3_UX_DEFECTS.md`, `docs/redesign/PHASE3_SPACING_AUDIT.md`). **78 defects total** — 6 Critical + 14 High + 12 Medium + 6 Low on the UI side, 3 Critical + 5 High + 8 Medium + 4 Low on the UX side, and **4 Critical + 8 High + 8 Medium + 4 Low** on the spacing side (added 2026-04-15 after Hossein flagged excessive whitespace on the Active Jobs screenshot — the plan-generator pass that was missing earlier). No migrations. No realtime changes. No feature additions. Pure UI/UX layer.

---

## Context

Hossein reviewed the app on 2026-04-15 and flagged three user-visible problems:
1. "Buttons are different" — primitive defaults violate the CLAUDE.md 44×44 rule, so callers escape with inline `style={{ minHeight: 64 }}`.
2. "Labels look like buttons, buttons look like labels" — status pills and interactive filter pills share the same visual treatment on the tech surface.
3. "Full width in some areas (good) and fixed size in others (bad)" — 10 different `max-w-*` values across 14 page roots with no system.

Two audit passes were run against the ux-audit skill at `/sessions/ecstatic-busy-dijkstra/mnt/Oplaris-Skills/ux-audit/`, one UI-focused and one UX-focused. Every finding cites a specific principle (WCAG 2.2 AA criterion number, Hick's Law, Cowan 4±1, Fitts's Law, Nielsen heuristics 1–10, Doherty threshold, Gestalt principles, Hoober thumb-zone 2013, etc.). **Don't reopen the audit calls — they are settled and approved.**

Decisions Hossein already made on 2026-04-15 (do not re-ask):

1. **Button sizing:** `default = 44 px`, `sm = 36 px` opt-in for dense tables. Ban anything below 36 px. Mobile-first product — the manager desktop is secondary.
2. **Page-width system:** four sizes — `full | default (max-w-5xl / 1024) | narrow (max-w-3xl / 768) | form (max-w-xl / 576)`.
3. **Dark mode:** ship a light/dark/**system** toggle in P56 (do not defer to V6). Persist preference per-user. Respect `prefers-color-scheme` when set to system.
4. **Combobox:** reuse the existing cmdk-based `<Command>` palette primitive from P53 for searchable pickers. Do not introduce a second combobox library.
5. **UX-C3 promoted:** form-state loss on Cancel is promoted to the top Critical — fix it immediately after C1 (Button primitive). Workshop reality: phones ring mid-form, typed data must survive.
6. **`<FormCard>` + `<FormActions>` wrapper** added to P56 scope (not in the original register) to bake beforeunload guard + thumb-zone button ordering + `aria-live` error region into every form in one place.

**Read first, in this order:**
1. `CLAUDE.md > Phase 3` — you are extending the V1 theming work; don't touch V1 tokens or the OKLCH helper.
2. `docs/redesign/PHASE3_UI_DEFECTS.md` — 38 UI defects.
3. `docs/redesign/PHASE3_UX_DEFECTS.md` — 20 UX defects, every one cites a principle.
4. `docs/redesign/PHASE3_SPACING_AUDIT.md` — 24 spacing / density / rhythm defects. **Consumed by P56.0, which blocks P56.1.**
5. `docs/redesign/DESIGN_SYSTEM.md` — authoritative for the 4 UIs. Update it as you go; don't let it go stale. §1.3 is rewritten as part of P56.0.
6. `Oplaris-Skills/ux-audit/references/` — the nine reference files. Load whichever matches the sub-phase you're working on. Every PR description must cite the references that justify the changes.
7. `Oplaris-Skills/vibe-security/references/` — relevant for C5 (dark-mode tokens) and UX-H3 (confirm-on-leave uses `beforeunload` which can be weaponised — read the defensive pattern before wiring).

---

## Non-negotiable principles

- **No migrations.** Every P56 change is in `src/**` and `docs/**`. Schema, RLS, realtime publication, and RPCs stay as-is.
- **No feature additions.** If a finding tempts you into adding a real new capability (e.g. "while we're in here, let's add customer notes"), log it for a later phase and move on.
- **No CLAUDE.md rule relaxation.** 44×44 touch targets, RLS-on-every-table, multi-tenant-first, never-trust-the-client — all still apply. If a fix looks like it needs to break one of these rules, stop and flag it.
- **Every finding must be traced through to a closed PR.** A finding is not "done" until (a) the fix is merged, (b) a test covers it, and (c) the defect register row is annotated DONE with the PR number.
- **Every new primitive has a DESIGN_SYSTEM.md entry.** Primitive without documentation = future drift.

---

## Sub-phases — execute strictly in order

Dependency chain matters: doing P56.5 before P56.1 means redoing P56.5. **Do not parallelise across sub-phases unless a sub-phase explicitly says so.**

### P56.0 — Spacing scale, density primitives & codemod (S-C1, S-C2, S-C3, S-C4, S-H1–H8, S-M1–M8) — **BLOCKING**

> Runs before P56.1. Every later sub-phase consumes the tokens, primitives, and codemod output this phase lands. Reference: `docs/redesign/PHASE3_SPACING_AUDIT.md` + `DESIGN_SYSTEM.md §1.3` (rewritten as part of this sub-phase).
>
> Why first: S-C1 (no canonical scale) is the root cause of most primitive drift in `PHASE3_UI_DEFECTS.md`. Rewriting `<Button>` (P56.1) or `<FormCard>` (P56.2) before the scale is codified would bake in the old drift for a second time.

1. **Rewrite `DESIGN_SYSTEM.md §1.3`** per the spec at the bottom of `PHASE3_SPACING_AUDIT.md > Extension Patch`. Preserve the surrounding §1.1 / §1.2 content. Add a new §1.4 (Radius & shadow) and renumber the existing Motion section to §1.5.

2. **Add the spacing lint script** `scripts/check-spacing-tokens.ts`:
   - Scans `src/**/*.{ts,tsx}` for off-grid Tailwind classes matching `(py|px|pt|pb|pl|pr|p|mt|mb|ml|mr|m|gap|space-y|space-x)-(0\.5|1\.5|2\.5|3\.5)\b` inside `className="..."` / `className={\`...\`}` / `cn("...", ...)` string literals.
   - Allow-list: `gap-1.5` as the `space-icon` token (icon-label optical pairing) and `py-0.5` only inside `src/components/ui/reg-plate.tsx` (intentional, matches real UK plate aspect).
   - Wire into `package.json > scripts.lint:spacing` and call it from `pnpm lint`. CI fails if count > allow-list.

3. **Codemod off-grid call-sites** (S-C2). Write `scripts/codemod-off-grid.ts` (tsx) — a single-pass string replacement driven by the same regex the lint uses. Policy:
   - `gap-1.5` → keep (icon-label exception) **unless** it's not adjacent to an icon in the same element; in that case `gap-2`.
   - `py-0.5` → `py-1` (4 px) except inside `<RegPlate>`.
   - `px-0.5` → `px-1`, `mt-0.5` → `mt-1`, `mb-0.5` → `mb-1`, `pl-0.5` → `pl-1`, `pr-0.5` → `pr-1`.
   - `-1.5` (non-gap) → `-2` (8 px) for padding/margin.
   - `-2.5` → `-2` or `-3` — manual review required; the script flags occurrences and a human picks per call-site.
   - `-3.5` → `-4`.
   PR description shows before/after grep counts. Target: allow-list only.

4. **Card primitive density variants** (S-H2). Extend `src/components/ui/card.tsx`:
   ```tsx
   size?: "sm" | "default" | "lg"
   // sm: py-3 px-3 gap-3
   // default: py-4 px-4 gap-4 (current)
   // lg: py-6 px-6 gap-6
   ```
   Update the class string to switch via `data-size` + `group-data-[size=sm]/card:` variants (same pattern it already uses for "sm"). Add a `size="lg"` variant, fix the existing ambiguity where `CardContent` / `CardHeader` padding wasn't tied to the size. Add DESIGN_SYSTEM entry.

5. **Spacing primitives** (S-H1, S-H5, S-H8):
   - `src/components/ui/section.tsx` — `<Section title description actions gap="sm|md|lg">children</Section>`. Renders `<section className="mt-8 first:mt-0">` with an optional `<PageSectionHeader>` row (title + description + right-aligned actions slot) and a `<div className="mt-3">` (gap="md") for the body.
   - `src/components/ui/stack.tsx` — `<Stack gap="sm|md|lg" as?="div" | "ul">children</Stack>`. Renders `space-y-2 | space-y-4 | space-y-6`.
   - Both receive DESIGN_SYSTEM entries.

6. **ESLint rule: ban `mt-*` / `mb-*` on direct children of `space-y-*`** (S-M2). Add a custom `no-margin-inside-space-stack` rule under `eslint-plugin-oplaris/` (local plugin — create it if it doesn't exist). Runs in CI. False-positives suppressed with `// eslint-disable-next-line oplaris/no-margin-inside-space-stack` and a justification comment.

7. **Bay-board + tech-queue density rewrite** (S-C3, S-H6). Apply the new rules to the two surfaces that Hossein screenshotted:
   - `src/app/(app)/app/bay-board/BayBoardClient.tsx:128-190` — replace ad-hoc `rounded-lg border bg-card p-3` wrapper with `<Card size="sm">`; replace `mt-1 / mt-1.5 / mt-2` ladder with `<Stack gap="sm">`; grouping `mt-3` between primary identity and staff pills.
   - `src/app/(app)/app/tech/page.tsx` Passback + Checked-in + In-progress sections — wrap each in `<Section>`; replace `<div className="mt-3 space-y-2">` with `<Stack gap="sm">`; list items use `<Card size="sm">`.

8. **Today page KPI rebuild** (S-H3). `src/app/(app)/app/page.tsx:91-107`: use `<Card size="sm">`; reduce number typography to `text-2xl`; set grid gap to `gap-4`; target card height ≤ 80 px on mobile.

9. **Sidebar-main top alignment** (S-M8). In `src/components/app/app-shell.tsx`, ensure sidebar rail and main flex-child both inherit `pt-6` from the shared flex parent rather than each setting their own. Visual-regression snapshot to confirm the two columns' top edges meet.

10. **Tests.**
   - `tests/unit/spacing-tokens.test.ts` — runs the lint script as a CLI, asserts exit-code 0 against the allow-list.
   - `tests/unit/card-density.test.ts` — `<Card size="sm">` has `p-3`, `default` has `p-4`, `lg` has `p-6` (assertion on rendered classes).
   - Playwright `tests/e2e/visual/spacing.spec.ts` snapshots:
     - Today page desktop + mobile
     - Bay-board with 2 bays × 3 jobs
     - My Work with Passback + Checked-in + In-progress
     - Form dialog (stock add / warranty add)
   - Baseline snapshots committed as part of this PR.

11. **Close-out.** In `PHASE3_SPACING_AUDIT.md`, annotate every row with PR number. `MASTER_PLAN.md > Phase 3` gains a P56.0 DONE line referencing the three deliverables (scale + primitives + codemod).

**Done when:** `pnpm lint:spacing` returns 0, visual-regression snapshots match, every S-C / S-H finding closed with test coverage, and the bay-board + tech-queue screenshots (before/after) are in the PR description. **Only then proceed to P56.1.**

---

### P56.1 — Foundation primitives + dark-mode tokens (UI-C1, UI-C5, UI-M1)

1. **Rewrite `src/components/ui/button.tsx`** per UI-C1. New size scale:
   ```tsx
   size: {
     default: "h-11 gap-2 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
     sm:      "h-9 gap-1.5 px-3 text-sm has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
     lg:      "h-12 gap-2 px-5 text-base has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
     xl:      "h-16 gap-2.5 px-6 text-lg has-data-[icon=inline-end]:pr-5 has-data-[icon=inline-start]:pl-5",
     icon:    "size-11",
     "icon-sm": "size-9",
     "icon-lg": "size-12",
   }
   ```
   Retire `xs` + `icon-xs` (24 px — below WCAG 2.5.8). Grep every caller of `size="xs"` and `size="icon-xs"` first; fail the migration if any call-site still uses them. Add `asChild` support via `@base-ui/react` Slot if not already present — C2 needs it.

2. **Add dark-mode semantic tokens** (UI-C5) to `src/app/globals.css` `.dark` scope:
   ```css
   --success: oklch(0.65 0.17 155);
   --success-foreground: oklch(0.12 0 0);
   --warning: oklch(0.80 0.17 75);
   --warning-foreground: oklch(0.12 0 0);
   --info: oklch(0.70 0.14 245);
   --info-foreground: oklch(0.12 0 0);
   ```
   Verify every value against WCAG 4.5:1 minimum on both `--card` backgrounds with the `oklch.ts` helper from V1.

3. **Wire `font-heading`** (UI-M1). Currently `--font-heading` maps to `--font-sans` and nothing uses it. Apply `font-heading` to `CardTitle`, `h1`, `h2`, `h3` via a new `<PageTitle>` (from P56.3) and `CardTitle` class update. Don't add a Google Font yet — V2 handles the typography upgrade; just make sure the rail exists.

4. **Dark-mode toggle.** Light / dark / **system**. Use `next-themes` (zero-deps, SSR-safe). Inject the `ThemeProvider` at the root `src/app/layout.tsx`. FOUC prevention per `theming-and-design-tokens.md` — use the blocking inline `<script>` in `<head>` pattern that `next-themes` provides. Toggle UI lives in the top-bar user menu (manager + tech views). Kiosk + status are locked to light for P56; V5 handles their brand.

5. **Tests:** 
   - Button primitive variants × sizes snapshot test; assert `data-slot=button` height is 44 / 36 / 48 / 64 per size.
   - Dark-mode contrast test: programmatically parse `.dark` CSS variables, run through `oklch.ts` WCAG AA helper, fail if any `--foreground` × `--background` pair is below 4.5:1.
   - Theme-toggle test: Playwright visits root, toggles to dark, reloads, assert `.dark` class persists; toggles to system, assert `prefers-color-scheme` matches.

**Done when:** grep shows no `size="xs"` / `size="icon-xs"` usage, dark mode looks correct by eye on the Today dashboard + job detail + tech surface, theme preference survives a hard reload.

---

### P56.2 — UX-C3 + `<FormCard>` + `<FormActions>` (UX-C3, UX-M2, UX-H3, UX-M4, UX-M5, UX-M6)

Per Hossein 2026-04-15 — form-state loss is the second thing fixed, not later. Workshop reality: a half-filled customer record must not evaporate because the front desk phone rang.

1. **New primitive `src/components/forms/FormCard.tsx`**. Props: `{ title, description?, children, onSubmit, onCancel?, isDirty, isPending, submitLabel, cancelLabel?, destructive?, error? }`. Responsibilities:
   - Mounts a `beforeunload` listener whenever `isDirty && !isPending`. Cleans up on unmount + on successful submit.
   - Renders `<form onSubmit>` + `<FormActions>` slot.
   - `aria-live="polite"` region at the bottom for submit-level errors (WCAG 4.1.3 per `accessibility.md`).
   - **Security note** (vibe-security): the `beforeunload` prompt cannot be customised (browser locks the message). Do not log form values to localStorage by default — only when the user opts in via a "Save draft" affordance (deferred out of P56). Keep state in React.

2. **New primitive `src/components/forms/FormActions.tsx`**. Props: `{ onCancel?, submitLabel, cancelLabel?, destructive?, isPending }`. Responsibilities:
   - Desktop (≥640 px): Cancel left, Submit right — matches Windows/macOS convention.
   - Mobile (<640 px): Submit **on top** (thumb zone, Hoober 2013 per `responsive-and-mobile.md`), Cancel below.
   - `type="button"` on Cancel (so it doesn't submit), `type="submit"` on Submit.
   - If `destructive`, Submit gets `variant="destructive"`.
   - If `isPending`, Submit shows a spinner + `aria-busy="true"`.

3. **Migrate three forms:**
   - `src/app/(app)/app/customers/new/NewCustomerForm.tsx`
   - `src/app/(app)/app/jobs/new/NewJobForm.tsx`
   - `src/app/(app)/app/customers/[id]/AddVehicleForm.tsx`

   Delete every `router.push` on Cancel that bypasses the dirty check. Delete every `flex flex-col-reverse gap-3 sm:flex-row` Cancel/Submit stack — `<FormActions>` owns it.

4. **Label + htmlFor audit.** Grep for `<label ` and `<Label ` across `src/app/(app)/**/*.tsx` + `src/app/(public)/**/*.tsx`. Every label must have `htmlFor` pointing to its input's `id`. Fail the build on missing associations (UX-M4).

5. **`autocomplete` + `inputmode` audit.** Every text input that represents a known semantic field gets the appropriate HTML attribute (UX-M5, forms-and-data-entry.md):
   - Customer full name → `autocomplete="name"`
   - Phone → `autocomplete="tel"` + `inputmode="tel"`
   - Email → `autocomplete="email"` + `inputmode="email"`
   - Postcode → `autocomplete="postal-code"`
   - Reg plate → `autocapitalize="characters"` + `inputmode="text"`

6. **Tests:**
   - `tests/unit/form-card.test.tsx`: beforeunload handler is attached when dirty, removed on submit, removed on unmount.
   - `tests/unit/form-actions.test.tsx`: renders Submit below Cancel at narrow viewport, reversed at wide viewport (Testing Library + matchMedia mock).
   - `tests/e2e/form-state-preservation.spec.ts` (Playwright):
     - Fill half the New Customer form, click browser-back, confirm the dialog, assert URL unchanged + fields still filled.
     - Fill half, click Cancel, confirm, assert navigated away + original state on new customers page.
   - `tests/a11y/form-labels.test.tsx`: axe-core sweep of every form page; zero label-missing violations.

**Done when:** every text field on three forms has `htmlFor` + `autocomplete` + `inputmode` (where applicable). Partial forms survive browser-back. Kick the tyres on an iPhone with autofill.

---

### P56.3 — New primitives batch (UI-C4, UI-H2, UI-H3, UI-H5, UI-H1, UI-M6, UI-M7, UX-H4)

Land all seven in one shippable slice; no page migrations yet. Callers migrate in P56.4 onward.

1. **`src/components/ui/reg-plate.tsx`** (UI-C4) — yellow UK plate primitive with five sizes, CSS-variable-backed colours for future Ireland/EU plate variants.
2. **`src/components/ui/passback-badge.tsx`** (UI-H2) — amber-toned badge using `--warning` tokens; optional `items?: string[]` prop renders a tooltip list of the 11-item pass-back checklist.
3. **`src/components/ui/confirm-dialog.tsx`** (UI-H3) — wrapper around shadcn `AlertDialog` with props `{ trigger, title, description, confirmLabel, cancelLabel?, destructive?, onConfirm }`. `onConfirm` can return a promise; the dialog shows a spinner until it resolves.
4. **`src/components/ui/page-title.tsx`** (UI-H5, UI-M1) — `<h1>` with `text-2xl font-heading font-semibold`. Optional `description` slot. Optional `actions` slot for right-aligned CTAs.
5. **`src/components/app/page-container.tsx`** (UI-H1) — four widths (`full | default | narrow | form`); renders a `<div className="mx-auto w-full px-0 ${width}">`. Document each width's intent in the component JSDoc.
6. **`src/components/ui/empty-state.tsx`** (UI-M6) — props `{ icon, title, description, action? }`. This is a shell; V3 will swap the `icon` prop for illustrations. For P56 it takes a `lucide-react` icon.
7. **`src/components/ui/loading-state.tsx`** (UI-M7) — `<Skeleton>` grid + `<Spinner>` + `aria-busy`. Three sub-components: `<LoadingState.Page>`, `<LoadingState.Grid rows?>`, `<LoadingState.Inline>`. Each exposes a matching `<aria-live="polite">` label for screen readers.
8. **Toast wiring (UX-H4)** — `sonner` toast provider at the root layout; helper `src/lib/toast.ts` exposing `toast.success / toast.error / toast.info / toast.promise`. Used by P56.6 to replace every `alert()`.

**Tests:** one snapshot + one props-permutation test per primitive, plus an axe-core scan of the storybook-style `src/app/(dev)/primitives/page.tsx` render-all page (delete before commit; it's just for the audit gate).

**Done when:** all seven primitives shipped with tests + DESIGN_SYSTEM.md entries. No caller migrations yet.

---

### P56.4 — Page-width migration (UI-H1, UI-H10, UI-H13)

Migrate every page under `src/app/(app)/**/page.tsx` to `<PageContainer>`. Table below prescribes which width to use — follow it exactly:

| Page | `width=` |
|---|---|
| `/app` (Today) | `default` |
| `/app/jobs` (list) | `full` |
| `/app/jobs/[id]` (detail) | `default` |
| `/app/jobs/new` | `form` |
| `/app/bookings` | `full` |
| `/app/customers` (list) | `full` |
| `/app/customers/[id]` | `default` |
| `/app/customers/new` | `form` |
| `/app/vehicles` (list) | `full` |
| `/app/vehicles/[id]` | `default` |
| `/app/stock` | `full` |
| `/app/bay-board` | `full` |
| `/app/tech` | `narrow` |
| `/app/tech/job/[id]` | `narrow` |
| `/app/settings` | `default` |
| `/app/settings/profile` | `form` |
| `/app/settings/billing` | `form` |
| `/app/settings/branding` | `narrow` |
| `/app/settings/staff` | `default` |
| `/app/settings/audit-log` | `full` |
| `/app/guide` | `narrow` |
| `/app/reports` | `full` |

Delete every page-level `max-w-*` class. Delete the `md:max-w-4xl` on job detail (UI-H13 — the only page that scaled responsively).

**Tests:** Playwright visual regression at three widths (375 / 768 / 1440) against every page above. Commit the baselines. This becomes the Phase 3 gate from here on — any future PR that shifts a pixel must accept + re-commit the baseline.

**Done when:** `grep -rn "max-w-" src/app/\(app\)/**/page.tsx` returns zero (excluding primitives). All 22 pages render inside `<PageContainer>`.

---

### P56.5 — Tech surface polish (UI-C2, UI-C3, UI-H8, UI-H9, UI-H14, UI-M12, UX-C2, UX-H2, UX-M3, UX-L1)

This is the surface Hossein was probably staring at when he wrote the complaint. Highest user-visible impact per line of code.

1. **`TechJobClient.tsx:185-192`** (UI-C2) — replace the fake-button anchor with `<Button asChild size="lg"><a href={tel:...}>…</a></Button>`.
2. **`TechJobClient.tsx:159`** (UI-C3) — replace the raw status pill with `<StatusBadge status={status} />`.
3. **`TechJobClient.tsx:237-252`** (UI-H8) — replace the raw `<button>` task-type pills with shadcn `<ToggleGroup type="single">` + `<ToggleGroupItem>`.
4. **`TechJobClient.tsx:261-268`** (UI-H9) — replace the raw `<input>` with `<Input>` + `<Label htmlFor>`.
5. **Delete every `style={{ minHeight: 64 }}` and `style={{ minHeight: 40 }}`** (UI-M12). After P56.1's primitive change the `h-16` / `min-h-10` Tailwind classes subsume them.
6. **`TechAssignmentModal.tsx:40-45`** (UX-C2) — replace the text-only "Loading technicians…" with `<LoadingState.Grid rows={2}>` mimicking the Available / Busy sections. `aria-busy="true"` on the wrapper.
7. **Tech "My Work" page (UX-H2, UX-M3)** — restructure `src/app/(app)/app/tech/page.tsx` so the three queues (My Claimed Jobs / Passed Back to Me / Available to Claim) are separated by:
   - Section `<h2>` heading at `text-xl font-heading font-semibold` (PageTitle sibling).
   - 32 px vertical gap between sections (`mt-8`).
   - Distinct empty states per section (EmptyState primitive from P56.3) with CTAs pointing users to the right next action.
   Gestalt proximity and Cowan 4±1 — techs must not have to re-parse which section a card lives in.
8. **`role-badge.tsx:24`** (UI-H14) — mot_tester role uses `--warning` tokens instead of hardcoded amber.

**Tests:**
- `tests/e2e/tech-journey.spec.ts`: a mechanic signs in, sees three clear sections, claims a pass-back, starts work, pauses, resumes, stops. Assert every CTA is ≥44 px via Playwright viewport hit-box API.
- `tests/a11y/tech-surface.spec.ts`: axe-core on `/app/tech` + `/app/tech/job/[id]` at mobile viewport (375 px). Zero serious violations.

**Done when:** `grep -rn "minHeight: 6" src/` returns zero. `grep -rn "<input type" src/app/\(app\)/app/tech/` returns zero. A mechanic using the page on a 375 px phone can, in under 5 seconds, tell which action to take next in each of the three sections.

---

### P56.6 — Confirm + alert sweep (UI-H3, UI-H4, UI-L4, UX-H1 in part)

1. **Replace every `confirm()`** (UI-H3) with `<ConfirmDialog>`:
   - `app/jobs/[id]/JobActionsRow.tsx:238` — "Cancel this job?"
   - `app/jobs/[id]/JobActionsRow.tsx:319` — "Mark this job complete?"
   - `app/settings/branding/BrandingForm.tsx:129` — "Remove the current logo?"
   
   Title + description + destructive variant per the spec. All three must keyboard-trap focus (shadcn AlertDialog handles this).

2. **Replace every `alert()`** (UI-H3) with `toast.error(...)`:
   - `app/tech/ClaimPassbackButton.tsx:31`
   - `app/bookings/StartWorkButton.tsx:28`
   - `app/bookings/StartMotButton.tsx:32`
   - `app/jobs/[id]/ReturnToMotTesterButton.tsx:27`
   - `app/jobs/[id]/JobActionsRow.tsx:184, 246, 289`
   - `app/jobs/[id]/ResumeMotButton.tsx:24`

3. **`JobActionsRow.tsx` size audit** (UI-H4) — every CTA gets `size="default"` (44 px) or `size="lg"` (48 px for primaries). Only the ⋯ Overflow icon trigger keeps `size="icon-sm"`.

4. **`LoginForm.tsx:47`** (UI-L4) — `text-red-600` → `text-destructive`.

5. **Kiosk booking confirmation** (UX-H1) — after the kiosk POST succeeds, render a dedicated confirmation screen for 8 s (not 5 s) showing: the reg plate (via `<RegPlate>` primitive from P56.3), the customer name, the chosen booking type, the arrival time, and a large "Thank you — we'll come find you" message. Auto-return to home only after the 8 s timer or a "Done" tap. Nielsen #1 (visibility of system status) + Nielsen #6 (recognition over recall).

**Tests:**
- `tests/e2e/confirm-dialogs.spec.ts`: every destructive action shows the dialog, Escape closes, clicking outside closes, confirm button is right-aligned, keyboard Enter on confirm triggers the action.
- `tests/e2e/kiosk-confirmation.spec.ts`: booking succeeds, confirmation screen stays 8 s, back button to home works before timeout.
- `grep -rn "confirm(\|alert(" src/` returns zero (excluding the magic-byte `.arrayBuffer()` calls).

**Done when:** no native dialogs left, kiosk customers know their booking succeeded without asking staff.

---

### P56.7 — Token migration + status badge sweep (UI-C6, UI-H6, UI-H7, UI-M8, UI-M9, UI-M2, UI-M3, UI-M4, UI-M5, UI-M10, UI-M11, UI-L2, UI-L3, UI-L5, UI-L6)

The big find-and-replace pass.

1. **Hardcoded `amber-*` / `emerald-*` / `green-*` / `red-*` / `yellow-*`** (UI-C6 and its instances) — grep and replace systematically. Use the mapping table in `PHASE3_UI_DEFECTS.md > C6`. Every replacement is a `<Badge tone="warning|success|info|destructive">` or a direct `--success`/`--warning`/`--info`/`--destructive` token in the class string.

2. **Status badge sweep** (UI-H6) — grep for every status-rendering location, migrate to `<StatusBadge>`. The five inline implementations die.

3. **Native `<select>` in dialogs** (UI-H7) — migrate `WarrantyRowActions.tsx:125` and `StockRowActions.tsx:144` to shadcn `<Select>`.

4. **`ChangeHandlerDialog.tsx:94-113`** (UI-M8) — availability pills use `<Badge tone="warning|success">`.

5. **`app/settings/staff/page.tsx:22`** (UI-M9) — delete the role-color map; delegate to `<RoleBadge>` primitive.

6. **`CardHeader` `pb-2` normalization** (UI-M2) — pick `pb-3` as default, delete every per-site override.

7. **`text-xs` on interactive elements** (UI-M3) — audit; promote to `text-sm` except for timestamps/metadata.

8. **`bg-muted/*` translucency** (UI-M4) — standardise on `/50` dim + `/30` hover; delete `/60` and `/70` uses.

9. **Detail-page h2 drift** (UI-M5) — standardise on `text-lg font-semibold font-heading`. Tech page opts into `<SectionTitle size="sm">` (new variant — add to `page-title.tsx`).

10. **Customer-row click affordance** (UI-M10) — wrap rows in `<Link>` or remove the hover state. Decide per-page; don't leave hover-without-click.

11. **Card footer alignment** (UI-M11) — multi-card grids gain explicit `h-full` on Card + equal-height CardFooter padding so rag-bottom disappears.

12. **Trivial colour fixes** (UI-L2, UI-L3) — `AddVehicleForm.tsx:215-226`, `status/page.tsx:265` — use tokens.

13. **Sidebar badge `99+` cap** (UI-L5).

14. **`car-image.tsx:36` inline minHeight** (UI-L6) — Tailwind `min-h-20`.

15. **Add ESLint rule** (UI-C6 follow-up) — custom `no-restricted-syntax` or `eslint-plugin-tailwindcss` `no-arbitrary-value` ban on:
    - `amber-*`, `emerald-*`, `green-*` (except in primitives — allowlist by file path).
    - `red-*` except for plate contrast shim.
    - `yellow-*` except in `reg-plate.tsx`.
    CI fails on new violations.

**Tests:**
- `tests/unit/status-badge-coverage.test.ts`: every `JobStatus` enum value has a matching tone in `<StatusBadge>`.
- `tests/lint/tailwind-deny.test.ts`: runs the lint rule, asserts zero violations in current tree (install is the gate for future PRs).

**Done when:** `grep -rn "amber-\|emerald-\|yellow-400" src/ --include="*.tsx" | grep -v "components/ui/"` returns only the allowlisted primitive files.

---

### P56.8 — Combobox + remaining UX batch (UX-C1, UX-H5, UX-H6, UX-H7, UX-H8, UX-M1, UX-M7, UX-M8, UX-L2, UX-L3, UX-L4)

1. **`<CustomerPicker>` + `<VehiclePicker>`** (UX-C1) — new components wrapping the existing cmdk `<Command>` palette from P53. Props: `{ value, onSelect, customers, placeholder, emptyLabel }`. Search across `full_name`, `phone`, and the reg plates of their vehicles. Keyboard navigation free.
   - Migrate `NewJobForm.tsx:91-127`, any other `<select>` over >10 options. ≤10 options stays `<Select>`. ≤5 options + mutually exclusive becomes `<RadioGroup>` (forms-and-data-entry.md).

2. **Nielsen heuristics batch** — fold the remaining UX findings in here:
   - UX-H5 (skip-to-main-content link) — add `<SkipLink>` at root layout.
   - UX-H6 (`<main id="main-content" role="main">` already exists; verify + add `<nav aria-label="Primary">` to sidebar).
   - UX-H7 (`aria-live="polite"` region for toast announcements — sonner supports this; verify config).
   - UX-H8 (reduced-motion — wrap every `animate-*` utility in a `motion-safe:` prefix; add a `@media (prefers-reduced-motion)` rule that zeros transitions on nav/dialog/sheet).
   - UX-M1 (breadcrumbs on detail pages — new `<Breadcrumbs>` primitive; wire on job / customer / vehicle detail).
   - UX-M7 (inline validation triggered on blur not submit — `FormCard` prop `validateOn="blur"` becomes default).
   - UX-M8 (required-field marking — `<Label required>` variant renders a red asterisk + `aria-required`).
   - UX-L2 (`Cancel` vs `Close` vs `Back` — standardise on Cancel for forms, Close for dialogs, Back for wizards).
   - UX-L3 (apology-tone error microcopy — `ux-copy` skill gate, see P56.10).
   - UX-L4 (focus-return-after-dialog-close — verify shadcn/Base UI handles; if any custom dialog doesn't, fix).

**Tests:**
- `tests/e2e/customer-picker.spec.ts`: opens palette, types `smith`, sees matches, Enter selects, closes.
- `tests/a11y/nav-landmarks.test.ts`: axe-core asserts exactly one `<main>`, one primary `<nav>`, skip-link is the first focusable element.
- `tests/a11y/reduced-motion.spec.ts`: Playwright with `forcedColors`/`reducedMotion: 'reduce'` — every animated element has `animation-duration: 0s`.

**Done when:** a manager can find a customer in <3 seconds across a 200-customer dataset. Keyboard-only user can tab from login → job completion without touching the mouse.

---

### P56.9 — Visual regression gate + design critique

1. **Playwright snapshot suite** covering every page in the P56.4 table at three widths (375 / 768 / 1440) in both light and dark mode — **132 snapshots**. Commit baselines. This is the Phase 3 gate forever.

2. **Run `design:design-critique` skill** over the top 6 pages:
   - Today dashboard
   - Job detail (staff)
   - Tech My Work
   - Tech job detail
   - Kiosk home
   - Customer status page

   Fix any P1/P2 issues from the critique before closing P56. Paste output into PR description.

3. **Run `design:accessibility-review` skill** over the same 6 pages. Zero Critical, ≤3 Serious violations. Document + fix each.

4. **Manual pass** — one run through each of the four UIs on:
   - iPhone SE (375 px, Safari) — kiosk + status + tech
   - iPad (768 px, Safari) — kiosk
   - Desktop Chrome 1440 px — manager dashboard
   - Dark mode on all of the above

**Done when:** baselines committed, critique output in PR, a11y sweep zero-critical.

---

### P56.10 — DESIGN_SYSTEM.md + MASTER_PLAN.md + lint rule

1. **DESIGN_SYSTEM.md update** — document every new primitive: `Button` (new size table), `RegPlate`, `PassbackBadge`, `ConfirmDialog`, `PageTitle`, `PageContainer`, `EmptyState`, `LoadingState`, `FormCard`, `FormActions`, `CustomerPicker`, `VehiclePicker`, `Breadcrumbs`, `SkipLink`. Each entry: purpose, when to use, when NOT to use, variants, a11y notes, minimal code example.

2. **MASTER_PLAN.md** — add the P56 DONE block following the P53/P54/P55 format. Strike-through every superseded finding. Annotate every row in `PHASE3_UI_DEFECTS.md` and `PHASE3_UX_DEFECTS.md` with `DONE (commit SHA / PR #)`.

3. **CLAUDE.md > Phase 3** — replace the V1-DONE paragraph with a P56-DONE paragraph + note that V2 now follows. Update the "Remaining in Phase 3 order" list.

4. **Commit the lint rule** from P56.7.

5. **Run the `ux-copy` skill gate** on every string changed during P56 (button labels, empty-state copy, dialog titles, error microcopy). Fix apology-tone and jargon per `content-and-copy.md`.

**Done when:** docs reflect reality, CI enforces the rule, the VISUAL_IMPLEMENTATION_PLAN.md V2 section can start without any P56 loose ends.

---

## Do-not-do list

- ❌ Don't run migrations. Schema is frozen for P56.
- ❌ Don't touch realtime (`supabase.channel(`), the ALLOWED_TABLES whitelist, or the `job_timeline_events` view. P50 stays as-is.
- ❌ Don't introduce a second combobox library. Reuse the P53 cmdk `<Command>` palette.
- ❌ Don't add a global CSS reset or change `--radius` — brand tokens from V1 are locked.
- ❌ Don't promote V2 icon work into P56. Icons that exist today stay; V2 replaces the whole system wholesale.
- ❌ Don't add V3 illustrations into `EmptyState` — the primitive takes a lucide `icon` prop for P56; V3 swaps it.
- ❌ Don't remove `xs` / `icon-xs` button variants by commenting them out. Delete them, and fix every caller that used them.
- ❌ Don't localStorage-persist form drafts yet — `beforeunload` only. Draft-save is a deliberate follow-up decision.
- ❌ Don't skip the Playwright baseline commit. Without it, P56.9 becomes a one-shot review and future PRs drift again.
- ❌ Don't let dark mode ship with any WCAG AA contrast failure — fail CI instead.

---

## Done when

- All 58 defects (38 UI + 20 UX) annotated `DONE` with a PR number in their respective registers.
- P56.1 through P56.10 all green, in strict order.
- `grep -rn 'confirm(\|alert(\|minHeight:\|amber-\|emerald-\|bg-yellow-400' src/` returns zero outside allowlisted primitives.
- Playwright visual-regression baselines committed for 22 pages × 3 widths × 2 themes.
- `design:design-critique` and `design:accessibility-review` clean on the top 6 pages.
- Manual 4-device × dark-mode pass signed off.
- DESIGN_SYSTEM.md, MASTER_PLAN.md, CLAUDE.md all updated.
- Hossein eyeballs Today dashboard + tech job detail + kiosk + dark mode; says "ship".

Report back with: migration-free diff summary, before/after screenshots of the top 6 pages, the design-critique + a11y-review output, and the Playwright baseline commit SHA.
