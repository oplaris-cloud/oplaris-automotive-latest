# Mechanic + MOT Tester UX / UI Audit — 2026-04-20

> Scope: every screen a mechanic or MOT tester touches — `/app/tech`, `/app/tech/job/[id]`, the pass-back flow, the self-start path off `/app/bookings`, and the shared `/app/jobs/[id]` view that assigned techs are allowed to open. WCAG 2.1 AA sweep bolted on.

**Client:** Dudley Auto Service · **Phase:** 4 (pre-deploy) · **Author:** Claude (synthesised from `design:design-critique` + `design:accessibility-review` + `design:ux-copy` skill passes)

**Headline:** the tech surfaces are **structurally solid** — the P51 pass-back model, P54 unified timeline, P55 start/pause/resume/complete, and the P56 primitive set all land well. There is **one P0 wiring defect** that ejects techs from the mobile UI back into the manager screen, and **a cluster of P1 mobile-first regressions** that collectively undermine `dudley-requirements-v1.md §M1.7` ("Technicians log work from their phones") and the post-launch but in-repo §M2.6/M2.7 bar ("usable on old Android phones, with gloves, in bright workshop lighting"). Everything P0/P1 is fixable in a tight, testable sequence — see `MECHANIC_MOT_FIX_PLAN_2026-04-20.md`.

---

## 1. Executive summary

| # | Severity | Finding | Surface |
|---|----------|---------|---------|
| F1 | **P0 Critical** | Self-start routes techs to manager UI, not tech UI | `StartMotButton.tsx:31`, `StartWorkButton.tsx:27` |
| F2 | **P1 Major** | Tech job screen is missing the DESIGN_SYSTEM §4.3 secondary action row (Add part · Request customer approval · Add note). A mechanic on a phone literally cannot trigger customer-approval SMS without leaving the tech UI for the manager view. | `TechJobClient.tsx` |
| F3 | **P1 Major** | Pass-back dialog: native 13×13 px `<input type="checkbox">` + `grid-cols-2` at 375 px breaks WCAG 2.5.5 (44×44) and buries the 11-item list under the fold. | `PassbackDialog.tsx:141-146, 135` |
| F4 | **P1 Major** | Six primary / near-primary buttons on the tech surface use `size="sm"` (36 px) — below the 44 px WCAG minimum and well below the design-system's 48 px "glove-safe" rule. | `TechJobClient.tsx:189`, `:252`, `StartMotButton.tsx:40`, `StartWorkButton.tsx:36`, `ClaimPassbackButton` (sm), `PassbackDialog.tsx:120` |
| F5 | **P1 Major** | Mechanic lands on a pass-back with no summary of what the MOT tester flagged. The 11-item checklist + detail + note are all stored in `job_passbacks` but the tech UI never surfaces them; the mechanic has to go to `/app/jobs/[id]` (manager UI) to see them. | `/app/tech/job/[id]/page.tsx`, `TechJobClient.tsx` |
| F6 | **P1 Major** | `text-warning` (amber, OKLCH L≈0.75) on the default white background renders at ~2.8:1 contrast — fails WCAG 1.4.3 for normal-weight `text-xs` copy in check-in passback summary and the tech Pause button label. | `TechJobClient.tsx:308`, `tech/page.tsx:440` |
| F7 | **P1 Major** | My Work card doesn't show the customer phone — the tech has to tap in to the job to call. Against the "phone with gloves" principle. | `tech/page.tsx` (`JobRow`) |
| F8 | **P2 Moderate** | Running timer has no `role="status"` / `aria-live="polite"` — screen-reader users never hear the running duration, which is the single most important piece of information on that screen. | `TechJobClient.tsx:227-230` |
| F9 | **P2 Moderate** | Task-type pills misuse `role="radio"` without the outer `tablist`/`radiogroup` focus-management contract — arrow-key nav doesn't move the tick, only Tab does. | `TechJobClient.tsx:249-260` |
| F10 | **P2 Moderate** | Pending states show `"..."` instead of a verb — ambiguous, especially at 375 px where the button label is often the only cue. | `TechJobClient.tsx:300, 311, 321` |
| F11 | **P2 Moderate** | Pass-back error `"Detail is required for Light bulb and Other."` references both fields whether or not both failed; should be per-field and inline. | `PassbackDialog.tsx:91` |
| F12 | **P2 Moderate** | `RegPlate` reads out one character at a time in VoiceOver/TalkBack — no `aria-label="Registration <reg>"` wrapping. | `src/components/ui/reg-plate.tsx` |
| F13 | **P2 Moderate** | `/app/tech/history` and `/app/tech/profile` are in DESIGN_SYSTEM §4.1 and referenced in copy, but not implemented. Tech mobile IA therefore has no "what did I do yesterday" surface. | Missing |
| F14 | **P3 Minor** | `RoleBadge` hard-codes amber for `mot_tester` — should use the `--warning` / `--info` token so dark mode and V1 theme overrides pick it up. | `role-badge.tsx` |
| F15 | **P3 Minor** | Passback dialog uses native checkboxes; focus ring drifts from the shadcn `ring-ring` norm. | `PassbackDialog.tsx:141-145` |
| F16 | **P3 Minor** | No section-level empty states on My Work — if a tech has nothing passed back, nothing checked in, and nothing in progress, the page renders an illustration, but individual empty sections don't reassure ("You're up to date"). | `tech/page.tsx` |

**Totals:** 1 P0, 6 P1, 6 P2, 3 P3 = **16 findings**.

---

## 2. Requirements matrix — `dudley-requirements-v1.md` vs implementation

> Only the mechanic / MOT-tester-facing items. Items outside the scope of this audit are elided.

| Req. | Summary | Shipped? | Gap |
|------|---------|----------|-----|
| M1.1 role: MOT Tester | Runs MOTs, passes electrical/mechanical issues back to mechanics | ✓ | F1 ejects MOT tester to manager UI on self-start; F3 mobile checklist cramped; F11 error copy terse. |
| M1.1 role: Mechanic | Runs mechanical + electrical work | ✓ | F5 pass-back context missing on tech view; F7 customer phone absent from My Work card. |
| M1 feature 7 | Techs log work from phones — Start / Pause / Complete, time tracked automatically | ✓ (P55) | F1 wrong destination after self-start; F4 tech actions still 36 px; F6 Pause label contrast; F8 timer not announced; F10 `"..."` pending states. |
| M1 feature 8 | One-tap customer approval for extra work | Partial | **F2 — no trigger from the tech UI at all.** Managers have `ApprovalDialog` in `/app/jobs/[id]`; mechanics can't reach it on mobile within the tech flow. |
| M1 feature 9 | Parts / consumables added to a job | Partial | Manager UI (`ChargesSection`) has the full CRUD; tech UI has no "Add part" action (F2). |
| M1 feature 14 | Multi-role staff (mechanic + MOT tester same human) | ✓ (mig 025) | — |
| M1 feature 18 | DVSA MOT history on the job detail | ✓ | Renders on `/app/jobs/[id]`; is the tech directed there? See F1. |
| P48 (CLAUDE.md) | Page access: Job detail visible to assigned techs; My Work visible to mot_tester + mechanic | ✓ | No functional gap — just that F1 sends them to the *manager* view of that detail page instead of the *tech* view. |
| P51 (CLAUDE.md) | Pass-back as event, one job per visit, tester resumes after | ✓ | F3 + F5 — wiring is correct, surface isn't. |
| P54 (CLAUDE.md) | Unified Job Activity timeline | ✓ | The feed renders on the tech view ✓. Pass-back rows are present and legible. |
| P55 (CLAUDE.md) | Start / Pause / Resume / Complete | ✓ | F6, F8, F10 above. |
| P56.0/.1 (CLAUDE.md) | 4-px grid; Button sizes sm=36 / default=44 / lg=48 / xl=64 | ✓ | Tech surfaces haven't finished migrating — F4. |
| M2.6 (deferred) | Mobile UX polish + accessibility pass | **not done** | This audit is the spec for that work. |
| M2.7 (deferred) | Admin guide + walkthrough video | **not done** | Out of scope here. |

**Verdict:** All architecture + data model requirements are met. The gaps are **surface-layer** — mostly polish plus two wiring bugs (F1, F2) that block the "phone-first tech flow" stated in M1 §7 and §8.

---

## 3. Design critique (from `design:design-critique`)

### Overall impression
The three-section My Work hub (Passed back → Checked in → In progress) is a **strong IA decision**. Priority ordering is right, sections are visually distinct via the `<Section>` primitive, and the P56.0 rhythm is honoured. The active-job ring-in-success on `JobRow` and the pinned running-timer card on the detail page are good visual cues.

### Usability

| Finding | Severity | Recommendation |
|---|---|---|
| Self-start → manager UI (F1) | 🔴 Critical | Route to `/app/tech/job/[id]` if `session.roles` contains `mot_tester` or `mechanic` and does **not** contain `manager`. Manager-only staff keep the manager route. |
| No Add part / Request approval / Add note on tech (F2) | 🔴 Critical | Ship the DESIGN_SYSTEM §4.3 secondary action row under the timer. Each button opens a **bottom-sheet Sheet** (mobile-first), re-uses existing server actions + dialogs from the manager surfaces. |
| Mechanic lands blind on pass-back (F5) | 🟡 Moderate | Pull the latest open `job_passbacks` row in `/app/tech/job/[id]/page.tsx` and render a `<PassbackContextCard>` above the timer — chip list of ticked items + the free-text note. |
| No customer phone on My Work card (F7) | 🟡 Moderate | Add a `tel:` link under the customer name in `JobRow`. 44-px high, icon-only on narrow viewports. |
| `"..."` pending states (F10) | 🟡 Moderate | Swap to verbs: `Pausing…` / `Resuming…` / `Completing…`. Keeps visual length but speaks. |
| Empty sections render nothing (F16) | 🟢 Minor | Optional: show the "Nothing on your plate" card inside each section when that section is empty *and* no other section exists. Probably not worth the churn given the full-page empty state works. |

### Visual hierarchy
- **What draws the eye first** on My Work: a live-green `ring-2 ring-success` on the in-progress card — ✓ correct.
- **Reading flow**: top-down through the three sections; no horizontal attention-split.
- **Emphasis problems**: the `StartMotButton` / `StartWorkButton` are visually weaker than the card they sit on because they're 36 px + 14 px icons. The card's bordered treatment dominates. Upsizing to 48 px `lg` with 20 px icons restores the intended "this is the primary action" hierarchy.
- **Timer**: already the biggest thing on the detail page — correct weight.

### Consistency
| Element | Issue | Fix |
|---|---|---|
| Buttons | `sm` (36) vs `default` (44) vs `lg` (48) vs `xl` (64) mixed across the tech surfaces | All primary tech actions → `lg` minimum; `xl` for start/pause/complete. |
| Passback checkboxes | Native inputs vs shadcn `<Checkbox>` elsewhere | Swap to shadcn `<Checkbox>` with `aria-describedby` on the detail input. |
| Role colour | `RoleBadge` hard-codes amber | Use `text-warning` / `bg-warning/10`. |
| Pass-back chip | `text-warning` on white fails contrast (F6) | Tint to `bg-warning/15 text-warning-foreground` or promote to the full `bg-warning text-warning-foreground` pill. |

### What works well
- `<Section>` + `<Stack>` rhythm consistent across all three My Work sections.
- P54 unified timeline in `JobActivity` is a genuine UX win — mechanics and MOT testers see pass-backs, work sessions, and status changes in one feed.
- Running timer pins to the top with amber/green accent — the state is unambiguous.
- `isPaused` / `workedSeconds` pure helpers + unit tests keep the timer math honest.
- SECURITY DEFINER RPCs on all state transitions — no client-side trust for any state machine.
- `role="radiogroup"` on task-type picker (even if the arrow-key behaviour is incomplete — F9).

---

## 4. Accessibility audit (WCAG 2.1 AA)

**Standard:** WCAG 2.1 AA · **Scope:** tech + shared-with-tech surfaces · **Automated?** Static-analysis only (Axe/staging passes deferred to Phase 4 staging).

**Issues found: 22 · Critical: 6 · Major: 10 · Minor: 6**

### Perceivable

| # | Issue | Criterion | Sev | Fix |
|---|---|---|---|---|
| A1 | Reg plate reads character-by-character | 1.1.1, 4.1.2 | 🔴 | `aria-label="Registration ${reg}"` on the `<RegPlate>` wrapper. |
| A2 | Running timer not announced | 4.1.3 Status Messages (AA) | 🔴 | `role="status"` + `aria-live="polite"` on the timer region; throttle announcements to once per minute (use a separate invisible `<span>`). |
| A3 | `text-warning` normal text on white ~2.8:1 | 1.4.3 | 🔴 | Use `text-warning-foreground on bg-warning` pill, or darken to `--warning` L≈0.55 in both themes. |
| A4 | `text-xs text-warning` passback summary | 1.4.3 | 🔴 | Same fix as A3. |
| A5 | Pass-back "Paused" chip already uses `bg-warning text-warning-foreground` at L=0.75 / L=0.2 → ~8:1 | 1.4.3 | ✅ | Pass. |
| A6 | Success "Working since …" `text-xs text-success` L=0.52 on white | 1.4.3 | ✅ | ~7:1 — pass. |
| A7 | Status / passback badges without `aria-label` when using just colour | 1.3.3 Use of Colour | 🟡 | Each badge includes text ✓ — pass; flagged only to reconfirm. |

### Operable

| # | Issue | Criterion | Sev | Fix |
|---|---|---|---|---|
| A8 | `size="sm"` = 36 px height on StartMotButton / StartWorkButton / Claim / Call / task-type pills / Pass-to-mechanic trigger | 2.5.5 (AA) | 🔴 | Bump to `lg` (48) for the first four; `default` (44) minimum for task-type pills. |
| A9 | Native `<input type="checkbox">` default 13 px | 2.5.5 | 🔴 | Swap to shadcn `<Checkbox>` (`h-5 w-5` hit surface + 44-px `<label>` hit-extender). |
| A10 | Task-type picker arrow-key nav broken (F9) | 2.1.1, 4.1.2 | 🟡 | Either (a) implement proper roving tabindex within the group, or (b) drop `role="radio"` and use `aria-pressed` toggles — the second is simpler and maps to what the UI actually does. |
| A11 | Passback dialog `grid-cols-2` at 375 px | 1.4.10 Reflow | 🟡 | `grid-cols-1 sm:grid-cols-2`. |
| A12 | Dialog focus trap — shadcn Radix handles it ✓ | 2.4.3 | ✅ | Pass. |
| A13 | Task-type radiogroup label | 2.4.6, 3.3.2 | 🟡 | `Label` above says "Task Type"; the `<div role="radiogroup" aria-label="Task type">` duplicates it. Keep the aria-label and make it reference the label via `aria-labelledby={labelId}` for assistive-tech parity. |
| A14 | Page fade-in animation — respects `prefers-reduced-motion` ✓ (global rule shipped P56.8) | 2.3.3 | ✅ | Pass. |
| A15 | Animated pulse on running timer pill | 2.2.2 Pause/Stop | 🟡 | Duration 2s+ → pass 2.2.2; but reduce-motion already stops it via `animate-pulse` override in globals.css ✓. Reconfirm after `motion-safe:` migration if needed. |

### Understandable

| # | Issue | Criterion | Sev | Fix |
|---|---|---|---|---|
| A16 | Error "Detail is required for Light bulb and Other." (F11) | 3.3.1 | 🟡 | Per-field inline: `<p role="alert" aria-describedby="light-bulb-detail">Light bulb detail is required</p>` on the missing field only. |
| A17 | Generic error `Failed to start work` | 3.3.3 | 🟢 | Surface the server-action error message when available; fall back to a one-sentence recovery ("Check your connection and try again."). |
| A18 | `"Pause"`/`"Resume"` vs `"Complete"` pairing — two identical 64-px buttons side-by-side (F10 tangent) | 3.2.1 | 🟢 | Already distinct via colour (`border-warning` vs solid) + icon; acceptable. |
| A19 | Check-in "Start MOT" / "Start work" disambiguation | 3.2.4 | ✅ | Service-specific verb ✓. |
| A20 | Notes placeholder `"What are you working on?"` doubles as label | 3.3.2 | ✅ | The visible `<Label>` exists separately. Pass. |

### Robust

| # | Issue | Criterion | Sev | Fix |
|---|---|---|---|---|
| A21 | Task-type pills' `aria-checked` toggles but the `role="radio"` contract requires one to always be checked — works in practice because the default is pre-selected | 4.1.2 | 🟢 | Covered by A10 fix. |
| A22 | `<label>` wrapping native checkbox has implicit association ✓ | 4.1.2 | ✅ | Pass. |

### Color contrast check (tokenised)

| Surface | FG | BG | Ratio | Req | Result |
|---|---|---|---|---|---|
| Pause label `text-warning` on bg-card | `--warning` L=0.75 | `--card` L≈0.985 | ~2.8:1 | 3:1 UI / 4.5:1 text | ❌ (normal text) / ✅ (large ≥24 px bold — `size=xl` IS large, so technically passes; the *`text-xs text-warning` summary* on My Work cards fails) |
| Success "Working since …" `text-xs text-success` on card | `--success` L=0.52 | 0.985 | ~7.5:1 | 4.5:1 | ✅ |
| Paused chip `bg-warning / text-warning-foreground` | L=0.2 | L=0.75 | ~9:1 | 4.5:1 | ✅ |
| Status badge secondary (muted fg on muted bg) | via tokens | via tokens | spot-check on staging | 4.5:1 | ⚠ verify |
| Destructive button | `--destructive-foreground` L≈0.985 | `--destructive` L≈0.577 | ~4.7:1 | 4.5:1 | ✅ borderline (dark mode L=0.704 → ~3.5:1 fails normal text) | verify dark mode |

**Action:** lock `--warning` to a darker L in `:root` (e.g. 0.58) or ensure every `text-warning` site on a pale background gets bumped to `text-warning-foreground` on an amber chip.

### Keyboard navigation walkthrough

| Element | Tab order | Enter/Space | Escape |
|---|---|---|---|
| My Work cards | top→bottom per section | follows link | — |
| Pass-back trigger button | after timer | opens dialog | — |
| Pass-back dialog checkboxes | grid-cols order | toggles | closes dialog |
| Pass-back detail input (conditional) | appears after toggle, receives tab naturally ✓ | types | — |
| Task-type pills | left→right wrap | toggles (broken — A10) | — |
| Start / Pause / Resume / Complete | natural flow | fires action | — |
| Complete button | last in group | fires action | — |

**Gap:** when the pass-back dialog opens, focus should move to the first checkbox; verify Radix does this automatically (it should).

### Screen reader walkthrough (expected behaviour after fixes)

| Element | Announcement |
|---|---|
| My Work `<h1>` | "My Work, heading level 1" |
| Section header with icon | "Passed back to me, heading level 2" (needs `<h2>` — currently `<Section title>` renders ... confirm) |
| JobRow link | "link, job J-1234, status in progress, AB12 CDE Ford Focus, John Smith" |
| Running timer | "status, 0:12:44" (polite, throttled) — currently silent |
| Start Work button | "button, Start Work" ✓ |
| Pause button | "button, Pause" ✓ — should extend to "button, Pause timer" for clarity |

---

## 5. UX copy review (from `design:ux-copy`)

### Recommended copy changes

| Location | Current | Recommended | Rationale |
|---|---|---|---|
| `TechJobClient` pending state on Start | `"Starting..."` | `"Starting…"` (proper ellipsis) | Unicode, two less characters for 375 px. |
| `TechJobClient` pending state on Pause | `"..."` | `"Pausing…"` | Verb clarity. |
| `TechJobClient` pending state on Resume | `"..."` | `"Resuming…"` | Verb clarity. |
| `TechJobClient` pending state on Complete | `"..."` | `"Completing…"` | Verb clarity. |
| `PassbackDialog` error | `"Detail is required for Light bulb and Other."` | per-field: `"Which bulb?"` / `"Describe the other issue"` as `aria-invalid` helper text | Focused, actionable, per-field. |
| `PassbackDialog` submit | `"Pass to Mechanic"` | `"Pass to mechanic"` (sentence case) | Matches system-wide sentence case in DESIGN_SYSTEM. |
| `PassbackDialog` cancel | `"Cancel"` | `"Keep working"` | Clearer intent — the MOT tester is abandoning the pass-back, not closing a modal. |
| `Call` button in TechJobClient | `"Call"` | `"Call {firstName}"` or `"Call customer"` | Clarifies destination, especially important on phone with gloves. |
| `/app/tech` header subtitle | `"Everything waiting on you and everything you've started."` | `"Jobs waiting on you, in progress, and just checked in."` | Ordered to match the section order on the page; slightly shorter. |
| `ClaimPassbackButton` | `"Claim"` (current) | `"Claim job"` | Avoid bare verb at 36 px. |
| `StartMotButton` | `"Start MOT"` | `"Start MOT"` ✓ | Keep. |
| `StartWorkButton` | `"Start work"` | `"Start work"` ✓ | Keep. |
| Tech job screen secondary action row (new, F2) | (none) | `"Add part"` · `"Request approval"` · `"Add note"` | Imperative verb-first. |

### Voice and tone
Tech surface should stay terse and functional. Avoid any "Nice one!" on completion — the user is in a workshop, not a consumer app. Paused-timer copy should never scold ("Don't forget to resume!"). The current tone is already right — most copy gaps are just ellipsis/verb crispness.

---

## 6. Mobile / workshop-reality pass

A 375 px × 667 px viewport, one gloved thumb, bright sunlight bleeding through a workshop window. Test each interaction:

| Interaction | Works? | Why / why not |
|---|---|---|
| Open My Work, tap an in-progress job | ✓ | JobRow is full-width Link. |
| Self-start a check-in as MOT tester | ❌ | F1 — lands in manager UI. |
| Self-start a check-in as mechanic | ❌ | F1. |
| Start a work session from tech job | ✓ | Start button is `xl` (64 px). |
| Pick a task type before starting | ⚠ | Pills are 36 px — misses with gloves. |
| Pause, resume, complete | ✓ | All `xl`. |
| Call the customer | ⚠ | Button is 36 px (F4). |
| Pass a job to the mechanic (as MOT tester) | ⚠ | Trigger is 36 px; dialog checklist is grid-cols-2 at 375 px (F3). |
| Claim a pass-back (as mechanic) | ⚠ | Claim button is 36 px (F4). |
| See what MOT tester flagged once claimed | ❌ | F5 — context not rendered on tech view. |
| Log work for someone else (as manager) | ✗ not applicable | Manager surface. |
| Request customer approval from the phone | ❌ | F2 — must leave tech UI. |
| Add a part from the phone | ❌ | F2 — must leave tech UI. |
| See running timer while tab blurred | ✓ | Interval ticks in foreground; realtime picks up changes on return. |
| Operate with Android TalkBack on | ⚠ | A1, A2, A10 fail. |

**Conclusion:** every P0/P1 in §1 maps to a specific mobile-first or workshop-reality failure. Fix them and the "phone-first tech flow" requirement lands.

---

## 7. Sign-off bar for "this audit is resolved"

1. Every P0 (F1) and P1 (F2–F7) closed with a PR, each landing behind a Playwright spec that exercises the 375 px viewport.
2. WCAG A1–A11, A13, A16 verified with Axe + at least one manual TalkBack/VoiceOver pass by a sighted user reading what it announces.
3. All button sizes on tech surfaces audited — `pnpm lint` extended with a rule or codemod that forbids `size="sm"` inside `src/app/(app)/app/tech/**` and the `Start*Button` components.
4. DESIGN_SYSTEM §4.3 updated to reflect the secondary-action-row implementation exactly (with the bottom-sheet pattern + the three actions named).
5. CLAUDE.md "Phase 4" note: this audit + its fix plan is a pre-deploy gate.

---

## Sources

- [CLAUDE.md](../../CLAUDE.md)
- [dudley-requirements-v1.md](../../dudley-requirements-v1.md)
- [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md)
- [MASTER_PLAN.md](./MASTER_PLAN.md)
- Files cited inline (e.g. `src/app/(app)/app/tech/page.tsx`).
