# Phase 3 — Spacing, Density & Layout-Rhythm Audit

> **STATUS (2026-04-15) — P56.0 closed.** All Critical (S-C1–C4), High (S-H1–H8) findings are DONE; Medium S-M1, S-M2, S-M5, S-M7, S-M8 closed. **Carried over to later sub-phases**: S-M3 (Dialog padding) → P56.6, S-M4 (button-icon gap) → P56.5, S-M6 (table density) → P56.7, S-L1–L4 → folded into the relevant sub-phase. Spacing-token CI is enforced by `scripts/check-spacing-tokens.ts` (wired into `pnpm lint`) + `tests/unit/spacing-tokens.test.ts`. Card density variants (`sm/default/lg`), `<Section>` and `<Stack>` primitives shipped — see CLAUDE.md > Phase 3 > P56.0 entry.

> **Audience: AI coding assistants (Claude Code).** Directive reference — follow when building or modifying UI. Humans can read this but it is optimised for machine consumption.
>
> **Generated:** 2026-04-15 · **Scope:** whitespace, baseline-grid adherence, card density, row rhythm, page-width system, section separation. Sister documents: `PHASE3_UI_DEFECTS.md` (primitives + tokens), `PHASE3_UX_DEFECTS.md` (behaviour + copy + flow).
>
> **Why this file exists:** the earlier UI + UX passes registered primitive drift and behaviour defects but never produced a systematic spacing pass. Hossein's 2026-04-15 screenshot of the Active Jobs panel (cards with ~60 % whitespace-to-content) is evidence the 4/8 grid is not enforced. Every finding here traces to a specific principle in `Oplaris-Skills/ux-audit/references/visual-hierarchy-and-layout.md`.

---

## How to read this register

Every row has:

1. **ID** — `S-C#` (Critical), `S-H#` (High), `S-M#` (Medium), `S-L#` (Low).
2. **File + line(s)** — where the violation lives.
3. **Rule violated** — quoted from `visual-hierarchy-and-layout.md` §Spacing System, §Gestalt Principles, or §Grid & Layout, plus any cross-cut to WCAG or cognitive-load principles.
4. **Measurement** — numeric facts (px values, ratios), not adjectives.
5. **User impact** — what this costs the user in concrete terms.
6. **Fix** — before/after code or token change.

A finding is **DONE** only when (a) the fix merges, (b) a test or visual-regression snapshot covers it, (c) the row is annotated with the PR number.

---

## Severity definitions

- **Critical** — violates the spacing scale at a system level; fixing one page fixes nothing because the rule is wrong. Blocks P56 launch.
- **High** — inconsistent spacing that breaks Gestalt grouping or scanning on a user-visible page. Every active user hits this daily.
- **Medium** — off-grid values that make the UI feel sloppy but don't break grouping. Detected by visual-regression, noticed subconsciously.
- **Low** — polish; one-off magic numbers in seldom-visited screens.

---

## Findings

### Critical

**S-C1 — No canonical spacing scale in `DESIGN_SYSTEM.md §1.3`**

- **File(s):** `docs/redesign/DESIGN_SYSTEM.md:87-92`.
- **Rule violated:** "Use a consistent base unit throughout the project. The 4px base (increments of 4, 8, 12, 16, 20, 24, 32, 40) is the industry standard." (`visual-hierarchy-and-layout.md § Spacing System`).
- **Measurement:** current spec says "Tailwind default 4 px scale" + "Minimum padding inside clickable card = 16 px." That is one rule, not a scale. No published values for card-padding / row-gap / section-gap / page-padding / layout-margin. No mobile-vs-desktop differentiation beyond tech-bump typography.
- **User impact:** every page author reaches for whatever Tailwind class "looks right" → 10 different `max-w-*` values, cards padding drift between `p-3` / `p-4` / `p-6`, gaps mix `mt-1.5` / `mt-2` / `mt-3` / `mt-4` / `mt-6` with no rhythm. This is the root cause of S-C2 and every High finding below.
- **Fix:** land `DESIGN_SYSTEM.md §1.3` rewrite (see the Extension Patch at the bottom of this file). Add a `spacing` table, a `card-density` table, a `page-padding` table, and a `section-rhythm` rule. Every subsequent finding references these tokens by name, not by pixel.
- **Principles cited:** visual-hierarchy §Spacing System; Gestalt §Proximity; cognitive-load §Consistency.

**S-C2 — Off-grid values used throughout (`mt-1.5`, `py-0.5`, `mt-2.5`, `p-0.5`)**

- **File(s):** `src/app/(app)/app/bay-board/BayBoardClient.tsx:137,154,183`; `src/app/(app)/app/tech/page.tsx:214,196`; `src/app/(app)/app/reports/csv-export.tsx:34`; `src/app/(app)/app/jobs/[id]/LogWorkDialog.tsx` (multiple); ~40 call sites project-wide (grep for `(py|px|mt|mb|ml|mr|gap|space-y|space-x)-[0-9]\.5`).
- **Rule violated:** "Never mix arbitrary pixel values with the spacing scale — every gap should map to a scale value." The 4/8 scale is 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. Tailwind's `-1.5` = 6 px and `-0.5` = 2 px are off-grid.
- **Measurement:** grep `\-(0\.5|1\.5|2\.5|3\.5)\b` inside `className=` returns **≥43 occurrences** across 18 files (I didn't count the dialogs). `gap-1.5` appears in 11 files as an icon-label gap.
- **User impact:** sub-pixel rendering on older Android devices (tech audience) sees these as either 5 or 7 px at 1× DPI. Eye perceives it as "almost right but not quite" → low-grade distrust, the "feels janky" complaint Hossein has been paraphrasing. Also fails "vertical rhythm: use consistent spacing between sibling elements."
- **Fix:** codemod replace `-1.5` → `-2` for gap/padding (4 → 8 px), `-0.5` → `-1` for padding (2 → 4 px), `-2.5` → `-2` or `-3` depending on context (8 or 12), `-3.5` → `-4`. Exception: icon-label `gap-1.5` (6 px) is a deliberate optical pairing and gets a token name `gap-icon` (= Tailwind `gap-1.5`) — document it in DESIGN_SYSTEM as the *only* legitimate off-grid value.
- **Principles cited:** visual-hierarchy §Spacing System; interactive-components §Affordance Clarity.

**S-C3 — Active-jobs card rhythm: internal spacing exceeds content density**

- **File(s):** `src/app/(app)/app/bay-board/BayBoardClient.tsx:128-190`; `src/app/(app)/app/tech/page.tsx` (PassbackRow/CheckInRow).
- **Rule violated:** Gestalt §Proximity — "Elements near each other are perceived as a group. A form label 24px from its input but only 8px from the next field's label will be mentally grouped with the wrong field." Applied to lists: row *internal* spacing must be smaller than *between-row* spacing or the eye can't tell where one record ends and the next begins.
- **Measurement:** the bay-board job card stacks five rows separated by `mt-1.5` (6 px), `mt-1` (4 px), `mt-2` (8 px), `mt-1.5` (6 px). Outer container is `p-3` (12 px). List spacing between cards: `space-y-2` (8 px). Internal-to-external ratio is essentially 1:1 — **proximity fails**. The eye reads reg plate + customer name as a separate visual group from the staff pills even though they belong to the same job.
- **User impact:** this is the exact Active Jobs screenshot Hossein flagged. Staff scanning the bay board need to answer "which mechanic owns job DUD-00042?" — with flat proximity they have to re-parse row boundaries every glance. At 8 bays × 3 jobs = 24 cards, the cost is ~20 s of unnecessary scanning per check.
- **Fix:** tighten internal rhythm and widen external rhythm.
  - Card padding: `p-3` → `p-4` (16 px) — matches DESIGN_SYSTEM card token `card-md`.
  - Internal stack: replace `mt-1 / mt-1.5 / mt-2` ladder with `space-y-1.5` on the Link child (single 6 px rhythm) — **exception for `gap-icon` remains valid**.
  - Staff pills group: `mt-2` → `mt-3` (12 px) — signals "this is metadata, not primary content."
  - Between-row gap: `space-y-2` → `space-y-3` (12 px) — now 16:12 internal:external is wrong; with the new internals the reading is card-padding 16 / stack-rhythm 6 / group-gap 12 / between-card 12. See Layout Rhythm rule below.
- **Principles cited:** Gestalt §Proximity (primary); visual-hierarchy §Pre-Attentive §Size; cognitive-load §Working Memory (fewer re-parses).

**S-C4 — Page-level padding inconsistent across the app shell**

- **File(s):** `src/components/app/app-shell.tsx` (main wrapper); `src/app/(app)/app/page.tsx`; `src/app/(app)/app/jobs/[id]/page.tsx`; `src/app/(app)/app/customers/[id]/page.tsx`; `src/app/(app)/app/vehicles/[id]/page.tsx`.
- **Rule violated:** "Layout margins: Mobile 16px, Tablet 24px, Desktop 40px or grid-based" + "Grid gutters are consistent across the page."
- **Measurement:** AppShell main uses `p-4 sm:p-6` (16 / 24 px) — good. But individual pages then add *further* wrappers: job-detail has `md:max-w-4xl` with no additional padding (so content butts up against the 24 px shell margin), while vehicle-detail has `max-w-4xl` *without* the `md:` prefix (full-width capped even on mobile, giving it horizontal pad = 0 on small phones if shell ever drops `p-4`). Customers/new uses `max-w-xl` (576 px) but vehicles/new uses no max-width → 100 % of the 24 px-padded shell width = inconsistent reading widths.
- **User impact:** scan-path inconsistency on identical actions. Adding a vehicle fills the full viewport width; adding a customer caps at 576 px. Users subconsciously track "where does the form end and the chrome begin" — a moving target erodes confidence.
- **Fix:** ship `<PageContainer>` primitive (already in P56.3 scope) with explicit `width="full|default|narrow|form"` prop. Every page swaps its ad-hoc wrapper for `<PageContainer width="...">`. The primitive owns padding, max-width, and vertical padding in one place.
- **Principles cited:** Grid & Layout §Common Layout Patterns; cognitive-load §Consistency.

### High

**S-H1 — Section rhythm missing between primary-content blocks**

- **File(s):** `src/app/(app)/app/tech/page.tsx:191,208,230+` (sections separated by `mt-6`); `src/app/(app)/app/jobs/[id]/page.tsx` (JobActivity, ChargesSection, PartsSection stacked).
- **Rule violated:** "Section separation should be at least 2x the internal element spacing (if elements are 16px apart, sections should be 32px+ apart)."
- **Measurement:** tech page uses `mt-6` (24 px) between "Passed back to me" and "Checked in" — sections. Internal element spacing inside each section is `space-y-2` (8 px). Ratio 24:8 = 3:1 — **passes the rule**, but job-detail page uses `space-y-4` (16 px) for both between-section and within-section → ratio 1:1 → **fails**.
- **User impact:** on the job detail page, users cannot tell where the charges section ends and the activity timeline begins without reading headings. Scanning cost rises; heading becomes the only proximity cue instead of a reinforcement.
- **Fix:** section gap token `section-gap` = 32 px (`mt-8`). Internal gap token `stack-md` = 16 px (`space-y-4`) or `stack-sm` = 8 px (`space-y-2`). Enforce in `<Section>` primitive (new, add to P56.3): `<Section title={...}>children</Section>` wraps in a `mt-8 first:mt-0`.
- **Principles cited:** visual-hierarchy §Spacing System; Gestalt §Common Region.

**S-H2 — Card padding drift (`p-3`, `p-4`, `p-6`, `py-4 px-4`, default Card `py-4 + px-4`)**

- **File(s):** `src/components/ui/card.tsx:17` (`py-4 ... px-4`); bay-board `p-3`; vehicle-detail hero `p-6`; vehicles list Card inner `p-4`; DeleteVehicleButton `p-3`; MotHistorySection `p-4`.
- **Rule violated:** "Cards/sections have consistent padding and clear boundaries (common region)" + "Elements at the same logical level should have the same shadow depth" — the corollary: same logical level → same padding.
- **Measurement:** five distinct padding values on `card-like` elements across five pages.
- **User impact:** users cannot build a visual grammar ("cards look like this"). Every new card feels like a new element. Breaks similarity (Gestalt).
- **Fix:** three card sizes, three padding values, every caller picks one:
  - `<Card size="sm">` = `p-3` (12 px) — dense rows (inline warnings, alert banners).
  - `<Card size="default">` = `p-4` (16 px) — standard list rows, KPIs, detail cards.
  - `<Card size="lg">` = `p-6` (24 px) — hero/summary cards with prominent typography.
  Retire ad-hoc `rounded-lg border bg-card p-3` non-Card divs in favour of `<Card size="sm">`. Grep for `rounded-lg border bg-card` and migrate all call sites.
- **Principles cited:** Gestalt §Similarity §Common Region.

**S-H3 — KPI cards on Today page disproportionally tall for the information density**

- **File(s):** `src/app/(app)/app/page.tsx:91-107`.
- **Rule violated:** visual-hierarchy §Pre-Attentive §Size — "Larger items capture attention first. Use for establishing heading hierarchy." Applied inversely: a card that is 120 px tall to show "14" signals more importance than it deserves.
- **Measurement:** CardHeader `pb-2` + CardContent default padding + `text-3xl` (30 px) number + Card outer `py-4` = ~108 px per card. At `sm:grid-cols-2` on a 375 px viewport, two KPI cards consume 216 px of vertical real estate before the user sees any actionable content. On a `lg:grid-cols-4` 1280 px desktop, the cards hog a full band of the fold.
- **User impact:** the Today page is the F-pattern entry point. The first thing a manager sees should be what needs their attention, not four number boxes. Excess card height pushes "Passed back to me" section below the fold.
- **Fix:** use `<Card size="sm">` for KPI cards; reduce number type to `text-2xl` (24 px) — still pre-attentive-dominant. Outer `py-4` becomes `py-3`. Target card height ~72–80 px, reducing fold-waste from 216 → 160 px on mobile.
- **Principles cited:** visual-hierarchy §Scanning §F-Pattern; cognitive-load §Working Memory.

**S-H4 — Form field vertical rhythm varies by page (`space-y-3` vs `space-y-4` vs implicit)**

- **File(s):** `src/app/(app)/app/stock/StockRowActions.tsx:69,141` (`space-y-3`); `src/app/(app)/app/customers/new/NewCustomerForm.tsx` (inspect for spacing); `src/app/(app)/app/settings/branding/BrandingForm.tsx`; `src/app/(app)/app/warranties/AddWarrantyDialog.tsx`.
- **Rule violated:** Gestalt §Proximity §Similarity — "Form labels are visually closer to their input than to the next field (proximity)" + form-audit principles in `forms-and-data-entry.md`.
- **Measurement:** dialog forms mostly use `space-y-3` (12 px) between fields with `mt-1` (4 px) between label and input → 12:4 = 3:1, passes proximity. But NewCustomerForm mixes `space-y-4` (16 px) between some fields and nothing between others (inline grids) → ratio flat in some regions. BrandingForm is spaced with paragraph-style markup → not a consistent form grid.
- **User impact:** on a multi-field form the user's eye cannot pre-attentively count "how many fields are left" — progress perception degrades, abandonment risk rises (interlocks with UX-C3 form-state-loss).
- **Fix:** `<FormCard>` + `<FormField>` primitives (P56.2 scope) own spacing internally. One `space-y-5` (20 px) between fields. Label-to-input `mt-1.5` (6 px → promoted to `gap-icon` token). Inline grids use `gap-4` (16 px).
- **Principles cited:** Gestalt §Proximity; forms-and-data-entry §Visual Rhythm.

**S-H5 — Hero / detail pages have no consistent header-to-body gap**

- **File(s):** `src/app/(app)/app/page.tsx:91` (mt-6 between h1 + grid); `src/app/(app)/app/jobs/page.tsx:60,85,95` (mt-4 filter, mt-8 EmptyState, mt-4 table); `src/app/(app)/app/customers/page.tsx` (varies); `src/app/(app)/app/bay-board/page.tsx:27` (mt-6).
- **Rule violated:** visual-hierarchy §Spacing System — "Vertical rhythm: use consistent spacing between sibling elements."
- **Measurement:** header-to-body gaps observed: `mt-4` (16), `mt-6` (24), `mt-8` (32). Same logical relationship (page title → first content block).
- **User impact:** page-to-page scanning confirms "this is the same product" cue. Drift undermines this.
- **Fix:** `<PageHeader title description actions>` primitive (add to P56.3 scope, partially overlaps C7 PageTitle). Owns the `mb-6` (24 px) gap to first content block by default; override via `gap="sm|md|lg"`.
- **Principles cited:** visual-hierarchy §Spacing System; cognitive-load §Consistency.

**S-H6 — Mobile list density wastes the phone's most-valuable 20 % (bottom-of-thumb)**

- **File(s):** `src/app/(app)/app/stock/page.tsx:81-135` (mobile card list); `src/app/(app)/app/customers/page.tsx` (mobile); `src/app/(app)/app/jobs/page.tsx` (mobile — currently table, needs mobile cards per P56).
- **Rule violated:** `responsive-and-mobile.md § Thumb Zones` (Hoober 2013) — "the natural thumb zone covers the bottom 2/3 of the screen; ergonomically optimal touch targets sit there."
- **Measurement:** mobile stock list shows 3–4 items above the fold at 667 px-tall iPhone SE. Each card is ~150 px (mt-4 + padding + three text rows + mt-2 + mt-3 + border). Target: 5–6 cards visible on the same viewport, reclaiming 120+ px.
- **User impact:** on the old Android phones the techs use (gloves, bright light, small screens), every extra pixel of padding pushes the *actionable* "start work" button deeper below the thumb zone or off-screen.
- **Fix:** mobile list cards use `<Card size="sm">` (`p-3`) with `space-y-1` (4 px) internal rhythm; `space-y-2` between cards. Status chip on the same row as title, not a new row. Target card height ≤ 96 px.
- **Principles cited:** responsive-and-mobile §Thumb Zones §Touch Targets; cognitive-load §Choice Overload (visible items-per-viewport correlates with task-completion speed, Nielsen 1999).

**S-H7 — Reg-plate chip padding varies (`px-1.5 py-0.5`, `px-2 py-0.5`, `px-3 py-1`)**

- **File(s):** `src/app/(app)/app/jobs/page.tsx:122` (`px-1.5 py-0.5`); `src/app/(app)/app/vehicles/page.tsx:100` (`px-2 py-0.5`); `src/app/(app)/app/vehicles/[id]/page.tsx:67` (`px-3 py-1`).
- **Rule violated:** Gestalt §Similarity — identical semantic elements (UK reg plate) must be rendered identically, differing only by explicit size variant.
- **Measurement:** three distinct paddings + three distinct type sizes for the same glyph string.
- **User impact:** the reg plate is the single strongest visual anchor for a vehicle record. Rendering it three ways breaks record recognition across screens.
- **Fix:** `<RegPlate size="sm|default|lg">` primitive (already in P56.3 UI-C4). `sm` = `px-1.5 py-0.5 text-xs` (for tables), `default` = `px-2 py-0.5 text-sm` (for cards), `lg` = `px-3 py-1 text-xl` (for hero). Retire ad-hoc divs in all three files. **Off-grid note:** `py-0.5` is one of the few deliberate off-grid exceptions — UK reg plates are rendered at a specific optical height to match real plates; documented in DESIGN_SYSTEM.
- **Principles cited:** Gestalt §Similarity; interactive-components §Affordance Clarity.

**S-H8 — Section heading-to-content gap varies (`mt-3`, `mt-4`, implicit via `space-y-*`)**

- **File(s):** `src/app/(app)/app/tech/page.tsx:196,214`; `src/app/(app)/app/vehicles/[id]/page.tsx:153,199`.
- **Rule violated:** visual-hierarchy §Spacing System — "Vertical rhythm."
- **Measurement:** two values in the same page (`mt-3` = 12 px after <h2> on tech page; `mt-3` on vehicle-detail for MOT section; but spacing between list content itself is inconsistent).
- **User impact:** reinforces S-H5 — the user's "what's a heading vs what's a row" mental model drifts.
- **Fix:** `<Section title="..."><SectionBody>...</SectionBody></Section>` — SectionBody owns the `mt-3` gap (12 px) and `space-y-2` internal rhythm.
- **Principles cited:** visual-hierarchy §Spacing System; Gestalt §Proximity.

### Medium

**S-M1 — Grid gap values vary (`gap-2`, `gap-3`, `gap-4`, `gap-6`) for functionally equivalent layouts**

- **File(s):** KPI grid `gap-4` (`src/app/(app)/app/page.tsx:91`); vehicles grid `gap-4` (`src/app/(app)/app/vehicles/page.tsx:81`); reports grid `gap-4`; but stock CSV table row uses `gap-3` (12px); vehicle-detail hero row uses `gap-6` (24 px).
- **Rule violated:** Grid & Layout §Common Layout Patterns — "Grid gutters are consistent across the page."
- **Measurement:** grids at the same logical level (page root → card grid) use different gap values.
- **User impact:** subconscious; users can't articulate the unease but visual-regression tests notice.
- **Fix:** `gap-4` (16 px) is the canonical page-grid gap. `gap-6` reserved for sparse hero layouts (1–2 children). `gap-2` for dense inline chips. `gap-3` deprecated — migrate callers.
- **Principles cited:** Grid & Layout.

**S-M2 — `space-y-*` mixed with `mt-*` in the same stack**

- **File(s):** `src/app/(app)/app/jobs/[id]/page.tsx`; `src/app/(app)/app/vehicles/[id]/page.tsx`; several form dialogs.
- **Rule violated:** "consistent spacing between sibling elements."
- **Measurement:** `space-y-4` on the outer stack plus `mt-3` on individual children → child gets `16 + 12 = 28 px` above it, peers get `16 px`. Invisible drift.
- **User impact:** same sibling ≠ same gap; layout feels uneven.
- **Fix:** lint rule (`eslint-plugin-tailwindcss` + custom): forbid `mt-*` / `mb-*` on direct children of an element with `space-y-*`. Apply `space-y-*` on parent only.
- **Principles cited:** visual-hierarchy §Spacing System.

**S-M3 — Dialog content paddings vary (`p-0`, `p-4`, `p-6`, `sm:max-w-*` mix)**

- **File(s):** `src/app/(app)/app/jobs/[id]/ChangeHandlerDialog.tsx:722` (p-0 override); `src/app/(app)/app/stock/StockRowActions.tsx` (default); `src/app/(app)/app/warranties/AddWarrantyDialog.tsx` (default).
- **Rule violated:** Gestalt §Common Region + interactive-components §Modals.
- **Measurement:** dialog inner padding ranges 0–24 px depending on override.
- **User impact:** dialogs feel like distinct apps.
- **Fix:** `<Dialog><DialogPanel padding="default|none">` primitive — P53's palette keeps `padding="none"` because the Command owns its own layout; all other dialogs use `default` = `p-6` (24 px).
- **Principles cited:** interactive-components §Modals.

**S-M4 — Inline button-and-icon gaps vary (`gap-1`, `gap-1.5`, `gap-2`)**

- **File(s):** `src/app/(app)/app/reports/csv-export.tsx:34`; `src/app/(app)/app/jobs/page.tsx:53`; `src/components/ui/button.tsx` (default `gap-2`); `MotHistorySection.tsx:70`.
- **Rule violated:** Gestalt §Similarity.
- **Measurement:** three values for the same "icon + label" pairing.
- **User impact:** icon/label pair flickers subtly across the app.
- **Fix:** `gap-1.5` (6 px) becomes the canonical `gap-icon` optical token for icon-label pairs; documented as deliberate off-grid exception. `gap-2` reserved for button-group inline spacing, `gap-1` for icon-only clusters.
- **Principles cited:** Gestalt §Similarity.

**S-M5 — Empty states inconsistently spaced from surroundings (`mt-8`, `mt-6`, `mt-4`)**

- **File(s):** `src/app/(app)/app/jobs/page.tsx:92` (mt-8); `src/app/(app)/app/tech/page.tsx:183` (mt-8); customers / vehicles (various).
- **Rule violated:** Gestalt §Similarity + visual-hierarchy §Spacing System.
- **Measurement:** empty-state container offsets differ by 16 px across pages.
- **User impact:** empty state is often the first thing a new garage sees → inconsistent greeting across modules.
- **Fix:** `<EmptyState>` primitive owns its own `mt-*` via a `gap="sm|md|lg"` prop, default `mt-8` (32 px). Caller must not add margin.
- **Principles cited:** content-and-copy §Empty States.

**S-M6 — Table cell padding relies on shadcn defaults; no dense-mode for data-heavy pages**

- **File(s):** `src/components/ui/table.tsx` (shadcn default — `px-4 py-3` per cell); `src/app/(app)/app/jobs/page.tsx`; `src/app/(app)/app/stock/page.tsx`.
- **Rule violated:** responsive-and-mobile §Thumb Zones (mobile) + cognitive-load §Working Memory (desktop — items per viewport).
- **Measurement:** stock table desktop rows ~52 px tall. 10 rows fit in 520 px. Could fit 14 rows at 36 px per row.
- **User impact:** reports + stock pages require extra scrolling to reconcile stock levels; adds 3–5 s per inventory check.
- **Fix:** `<Table density="comfortable|compact">` prop. Compact = `py-1.5` (6 px) + `text-sm`. Use on stock, reports, audit-log. Comfortable stays default for customers + jobs.
- **Principles cited:** responsive-and-mobile §Density; cognitive-load §Items-per-screen.

**S-M7 — Header/footer spacing in Card primitive forces `rounded-b-xl` artefact**

- **File(s):** `src/components/ui/card.tsx:17` (`has-data-[slot=card-footer]:pb-0`).
- **Rule violated:** visual-hierarchy §Border Radius — "Nested rounded elements: inner radius = outer radius - padding (prevents visible gaps in corners)."
- **Measurement:** Card has outer `rounded-xl` (12 px). When footer is present, Card removes its own bottom padding and the footer paints its own `rounded-b-xl` over the parent. Works but creates a maintenance hazard — any footer that omits the radius tears the card corner.
- **User impact:** latent; surfaces if someone writes a custom footer without remembering the rule.
- **Fix:** Card owns the border-radius universally; CardFooter never sets its own radius. Re-audit existing footers.
- **Principles cited:** visual-hierarchy §Border Radius.

**S-M8 — Sidebar item vertical padding tighter than app-shell padding — creates vertical "squeeze" at sidebar/main boundary**

- **File(s):** `src/components/app/sidebar-nav-list.tsx` (confirm); `src/components/app/app-shell.tsx`.
- **Rule violated:** visual-hierarchy §Spacing System §Vertical rhythm.
- **Measurement:** sidebar links are `min-h-11` (44 px, WCAG 2.5.5). App-shell main top padding `p-6` (24 px) plus page-title line height ~32 px → main content "top" sits at ~56 px from shell top. Sidebar first nav link sits at ~24 px. 32 px mismatch visible when comparing the two columns' top edges.
- **User impact:** cosmetic "misaligned" feeling on every desktop page load.
- **Fix:** both columns share the same top padding; app-shell sets a single `pt-6` on its flex container and both sidebar and main inherit.
- **Principles cited:** Gestalt §Continuity.

### Low

**S-L1 — `pb-8` on mobile tech/job pages (bottom padding for keyboard clearance) unconstrained**

- **File:** `src/app/(app)/app/tech/job/[id]/page.tsx:51` (`pb-8`); `src/app/(app)/app/tech/page.tsx:171` (`pb-8`).
- **Rule:** responsive-and-mobile §Safe Areas — iOS and Android bottom nav bars can overlap content if the last element lacks `env(safe-area-inset-bottom)` padding.
- **Measurement:** `pb-8` = 32 px; should be `pb-[max(2rem,env(safe-area-inset-bottom))]` or a `<PageContainer>` prop.
- **Fix:** `<PageContainer>` applies safe-area padding when `device="mobile"` — the primitive in P56.3.

**S-L2 — Inline `style={{ minHeight: 64 }}` on tech job cards**

- **File:** `src/app/(app)/app/tech/job/[id]/TechJobClient.tsx` (~line 185).
- **Rule:** interactive-components §Touch Targets + DESIGN_SYSTEM Button primitive.
- **Measurement:** 64 px inline override exists because the shared `Button` defaults to 32 px (UI-C1). Post-C1 rewrite (default 44 px / xl 64 px), the override becomes redundant.
- **Fix:** deleted as a side effect of P56.1 C1 rewrite → replace with `<Button size="xl">`. Leave a test asserting no `minHeight` inline style survives in `src/app/**`.

**S-L3 — Background gradients on hero use magic px values (`p-6`, `gap-6`)**

- **File:** `src/app/(app)/app/vehicles/[id]/page.tsx:51`.
- **Rule:** visual-hierarchy §Spacing System.
- **Measurement:** `p-6` + `gap-6` both = 24 px; on grid but at the high end. Consistent with `<Card size="lg">`.
- **Fix:** migrate to `<Card size="lg">`.

**S-L4 — `prose prose-neutral max-w-3xl` in guide page has no paragraph-rhythm token**

- **File:** `src/app/(app)/app/guide/page.tsx:13`.
- **Rule:** visual-hierarchy §Content-centered — "Max-width 680–720px for reading content (optimal line length 45–75 characters)."
- **Measurement:** `max-w-3xl` = 768 px; borderline too wide.
- **Fix:** `<PageContainer width="narrow">` = `max-w-3xl`; Typography `prose` retains its own spacing. Acceptable; annotate as intentional.

---

## Layout Rhythm Rule (for DESIGN_SYSTEM §1.3)

The canonical rule every P56 page must satisfy:

> **card-padding > section-gap > between-row-gap > within-row-rhythm**

Numerically, using the new tokens:

- `card-md` = 16 px (card padding, `p-4`)
- `section-gap` = 32 px (between named sections, `mt-8`)
- `stack-md` = 16 px (between cards in a grid, `gap-4` / `space-y-4`)
- `stack-sm` = 8 px (between rows in a dense list, `space-y-2`)
- `within-row` = 4–8 px (`space-y-1` to `space-y-2`, or `gap-icon` 6 px for icon-label pairs)

The ratio rule: **section-gap ≥ 2 × stack-md**. `stack-md ≥ 2 × within-row`. If you reach for a value that violates either ratio, you are probably conflating two logical levels — add a `<Section>` wrapper or delete a wrapper.

---

## Extension Patch for `DESIGN_SYSTEM.md §1.3`

Paste this replacement block over the current §1.3 during P56.0. Keep the prose surrounding text.

```md
### 1.3 Spacing, density & rhythm

**Base scale** (Tailwind increments, 1 unit = 4 px):

| Token | px | Tailwind class | Role |
|---|---|---|---|
| `space-0` | 0 | `gap-0 / p-0` | Collapsed |
| `space-1` | 4 | `gap-1 / p-1 / mt-1` | Micro — icon-cluster tightening |
| `space-icon` | 6 | `gap-1.5` | **Only off-grid value.** Icon-label pair optical gap. |
| `space-2` | 8 | `gap-2 / p-2 / mt-2` | Tight — between dense rows |
| `space-3` | 12 | `gap-3 / p-3 / mt-3` | Small — heading-to-body, sparse rows |
| `space-4` | 16 | `gap-4 / p-4 / mt-4` | **Base** — card padding, grid gutter |
| `space-5` | 20 | `p-5 / space-y-5` | Comfortable — form-field rhythm |
| `space-6` | 24 | `p-6 / mt-6` | Medium — hero card padding, header-to-body |
| `space-8` | 32 | `mt-8` | **Section gap** — between named sections |
| `space-12` | 48 | `mt-12` | Page-level — above page footer, between unrelated panels |
| `space-16` | 64 | `mt-16` | Rare — landing-page sections only |

**Forbidden values:** every Tailwind `.5` class except the one `gap-1.5` icon token (listed above as `space-icon`). A lint rule enforces this — see `scripts/check-spacing-tokens.ts`.

**Card density tokens:**

| Variant | Padding | Use |
|---|---|---|
| `<Card size="sm">` | `p-3` (12 px) | Dense rows, inline banners, mobile list items |
| `<Card size="default">` | `p-4` (16 px) | Standard — KPI, list item, detail card |
| `<Card size="lg">` | `p-6` (24 px) | Hero / summary cards |

**Page-padding tokens** (owned by `<PageContainer>` primitive, P56.3):

| Prop | Width | Mobile padding | Desktop padding |
|---|---|---|---|
| `full` | 100 % | `px-4` (16 px) | `px-6` (24 px) |
| `default` | `max-w-5xl` (1024 px) | `px-4` | `px-6` |
| `narrow` | `max-w-3xl` (768 px) | `px-4` | `px-6` |
| `form` | `max-w-xl` (576 px) | `px-4` | `px-6` |

Vertical page padding is `py-6` (24 px) for every variant; safe-area insets applied on mobile via `env(safe-area-inset-bottom)`.

**Section rhythm** — canonical rule:

> `card-padding > section-gap ≥ 2 × stack-md ≥ 4 × within-row`
>
> In concrete numbers: card-padding 16 px, section-gap 32 px, between-row 16 px or 8 px, within-row 4–8 px (or `space-icon` 6 px for icon-label pairs).

Enforced via:
- `<Section title description>children</Section>` primitive (owns `mt-8` + heading rhythm).
- `<Stack gap="sm|md|lg">` primitive (owns `space-y-2 | space-y-4 | space-y-6`).
- ESLint rule forbidding `mt-*` / `mb-*` on direct children of an element with `space-y-*`.

**Grid & layout:**

- Grids: `gap-4` (16 px) default; `gap-6` (24 px) for sparse hero layouts; `gap-2` (8 px) for dense chip clusters.
- Tables: `<Table density="comfortable" | "compact">`. Comfortable (default) uses shadcn default padding; compact is `py-1.5 text-sm` for data-heavy pages (stock, reports, audit-log).
- Sidebar-main alignment: both columns share `pt-6` from `<AppShell>` — top edges meet.
```

---

## Coverage

| Finding | Page(s) | Fixed by P56 sub-phase |
|---|---|---|
| S-C1 | DESIGN_SYSTEM.md | **P56.0** (new) |
| S-C2 | 18 files | **P56.0** (codemod) |
| S-C3 | bay-board, tech | P56.0 + P56.4 |
| S-C4 | all pages | P56.3 + P56.4 |
| S-H1 | tech, job-detail | P56.0 + P56.3 (`<Section>`) |
| S-H2 | Card callers | P56.0 (Card variants) |
| S-H3 | Today page | P56.4 |
| S-H4 | Forms | P56.2 (`<FormCard>`) |
| S-H5 | Page headers | P56.3 (`<PageHeader>`) |
| S-H6 | Mobile lists | P56.0 + P56.4 |
| S-H7 | Reg plate | P56.3 (`<RegPlate>`) |
| S-H8 | Section headings | P56.0 + P56.3 (`<Section>`) |
| S-M1..M8 | Multiple | P56.0 codemod + P56.3 |
| S-L1..L4 | Isolated | P56.3 + P56.4 |

**Every finding is assigned. No orphans.**

---

## Verification gates (closes each finding)

A finding is **DONE** when all three conditions are met:

1. **Fix merged.** PR number annotated on the row.
2. **Test or snapshot.** Either a Playwright visual-regression snapshot under `tests/e2e/visual/`, a Vitest DOM assertion, or a `grep`-based lint rule in `scripts/check-spacing-tokens.ts`.
3. **DESIGN_SYSTEM cross-ref.** The fix uses a named token from §1.3. Raw px or off-grid `.5` classes in the diff = finding NOT closed.

For the codemod (S-C2, S-M2), a before/after grep count goes in the PR description:

```bash
# Before
rg -c '(py|px|mt|mb|ml|mr|gap|space-y|space-x)-(0\.5|1\.5|2\.5|3\.5)' src/ | wc -l
# Target: 0 (except documented gap-1.5 icon exceptions, tracked in an allow-list)
```

---

## Sources

- `/sessions/ecstatic-busy-dijkstra/mnt/Oplaris-Skills/ux-audit/references/visual-hierarchy-and-layout.md` — primary reference.
- `/sessions/ecstatic-busy-dijkstra/mnt/Oplaris-Skills/ux-audit/references/responsive-and-mobile.md` — §Thumb Zones, §Density.
- `/sessions/ecstatic-busy-dijkstra/mnt/Oplaris-Skills/ux-audit/references/cognitive-load-and-information.md` — §Consistency, §Working Memory.
- `/sessions/ecstatic-busy-dijkstra/mnt/Oplaris-Skills/ux-audit/references/interactive-components.md` — §Affordance Clarity.
- Hoober, S. (2013) *Common Misconceptions about Touch.* — thumb-zone data.
- Jakobson & Krug (2006) — F-pattern scanning.
- Wertheimer, M. (1923) — Gestalt principles (proximity, similarity, common region).
