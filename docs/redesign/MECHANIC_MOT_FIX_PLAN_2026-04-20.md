# Mechanic + MOT Tester — Implementation Plan

> Companion to `MECHANIC_MOT_UX_AUDIT_2026-04-20.md`. Each step is **self-contained for a Claude Code terminal agent** — prerequisites, files, diff outline, skill hooks, tests, acceptance. Work strictly in order unless marked "parallelisable".

**Convention:** every step ends with "Definition of done" — treat it as a hard gate. Do not mark a task closed until all bullets are ticked.

**Sequencing:** Step 0 (setup) → P0 → P1 → P2 → P3 → consolidation. Steps 7, 8, 10, 13 are parallelisable with anything after the P0 gate closes.

---

## Step 0 — Setup and ground rules

**Skill:** none — just bookkeeping.

**Do:**
1. `git checkout -b feat/mechanic-mot-ux-2026-04-20`
2. Read:
   - `docs/redesign/MECHANIC_MOT_UX_AUDIT_2026-04-20.md` end-to-end
   - `docs/redesign/DESIGN_SYSTEM.md` §4 (tech) + §2.1 (primitives)
   - `CLAUDE.md` §"Page access policy" + §"Phase tracker"
3. Confirm `pnpm install` clean + `pnpm typecheck` + `pnpm lint` + `pnpm test` all pass **before** starting.
4. Note current test counts (e.g. "180/180 unit · 82/82 RLS") to compare after.

**Definition of done:** new branch is ready; baseline suite is green.

---

## Step 1 — [P0 · F1] Fix self-start redirect for techs

**Goal:** a mot_tester who hits "Start MOT" on a check-in lands on `/app/tech/job/[id]`. A mechanic who hits "Start work" does the same. Manager-only staff keep the manager view.

**Skill to consult:** `design:design-critique` (already applied — see audit §3 usability row F1).

**Files:**
- `src/app/(app)/app/bookings/StartMotButton.tsx`
- `src/app/(app)/app/bookings/StartWorkButton.tsx`
- `src/app/(app)/app/bookings/actions.ts` — re-read; we want to keep the action signature — route decision is client-side based on the viewer's role.
- `src/lib/auth/session.ts` — expose a helper if needed.

**Diff outline:**
1. Both button components accept a new optional prop `viewerRoles: StaffRole[]` passed from the RSC parent (`src/app/(app)/app/tech/page.tsx` already has `session.roles` in scope; `src/app/(app)/app/bookings/page.tsx` uses it for its manager-only sections).
2. Compute destination client-side:
   ```ts
   const isManagerOnly =
     viewerRoles.includes("manager") &&
     !viewerRoles.includes("mot_tester") &&
     !viewerRoles.includes("mechanic");
   const dest = isManagerOnly ? `/app/jobs/${id}` : `/app/tech/job/${id}`;
   router.push(dest);
   ```
3. Update call sites:
   - `tech/page.tsx` → `<StartMotButton viewerRoles={session.roles} … />` + same for StartWorkButton (two call sites, both in `CheckInRow`).
   - `bookings/page.tsx` (manager) → `<StartMotButton viewerRoles={session.roles} …>` — passes manager-only roles, stays on manager route.
4. Fix touch-target regression while here (F4): bump both buttons to `size="lg"` and icons to `h-5 w-5`. Remove `className="gap-1.5"` (Button already handles icon gap with `default`; double-check after).

**Tests:**
- Unit: add `tests/unit/tech-self-start-routing.test.ts` exercising the helper (or inline the prop logic if kept in the component). Cover: manager-only → `/app/jobs/id`; mechanic → `/app/tech/job/id`; both roles → `/app/tech/job/id`.
- E2E: extend `tests/e2e/tech-job-start-complete.spec.ts` with a "mot tester self-starts from My Work and lands on tech view" path (skipped `E2E_STAGING_READY`-gated if the existing file is).
- Visual spot-check on 375 px (mobile Chrome devtools) post-deploy.

**Vibe-security check:** no new RPC / RLS surface — purely client-side routing. `startMotFromCheckIn` already enforces role+garage server-side, so the client choosing the URL is a render concern only. Document this reasoning in the PR description.

**Definition of done:**
- Baseline suite +1 unit, +1 e2e (or skipped) — all green
- `pnpm lint:spacing` green
- PR description includes before/after screenshots of the redirect on 375 px
- Audit F1 marked resolved in §1 of the audit doc

---

## Step 2 — [P1 · F2 + §4.3 gap] Ship the tech secondary-action row

**Goal:** on `/app/tech/job/[id]`, render the three secondary actions called for in `DESIGN_SYSTEM §4.3`: **Add part · Request approval · Add note**. Each opens a bottom-sheet `<Sheet>` on <640 px and a `<Dialog>` on larger viewports, reusing existing server actions + state machines.

**Skill to consult:** `design:design-handoff` (use it on the three new sheet specs); `design:ux-copy` (verb-first labels).

**Prerequisites:** Step 1 done.

**Files:**
- `src/app/(app)/app/tech/job/[id]/page.tsx` — pass existing customer/job refs + charge + approval contexts down.
- `src/app/(app)/app/tech/job/[id]/TechJobClient.tsx` — new `<TechSecondaryActions>` child.
- **New:** `src/app/(app)/app/tech/job/[id]/AddPartSheet.tsx` — wraps existing `addCharge` server action from `src/app/(app)/app/jobs/charges/actions.ts`, mobile-first fields (part name, qty, unit price, supplier combobox, warranty months).
- **New:** `src/app/(app)/app/tech/job/[id]/RequestApprovalSheet.tsx` — wraps existing `createApprovalRequest` from `src/app/(app)/app/jobs/approvals/actions.ts` (if exists; otherwise locate the manager ApprovalDialog and hoist the action).
- **New:** `src/app/(app)/app/tech/job/[id]/AddNoteSheet.tsx` — writes to `job_notes` (or reuses the unified status/note trail). If `addJobNote` doesn't yet exist as a server action, add it behind a SECURITY DEFINER RPC with the standard garage+assignee gate.
- `src/components/ui/sheet.tsx` — already wired (shadcn); use `side="bottom"` for mobile and `side="right"` for md+ via `useMediaQuery`.

**Diff outline:**
```tsx
// TechJobClient.tsx — below the timer card, above the big action buttons:
{isWorking && (
  <div className="grid grid-cols-3 gap-2">
    <AddPartSheet jobId={jobId} />
    <RequestApprovalSheet jobId={jobId} customerPhone={customerPhone} />
    <AddNoteSheet jobId={jobId} />
  </div>
)}
```
Each button:
- `size="lg"` (48 px) — glove-safe
- icon + label, `text-xs sm:text-sm` so "Request approval" fits on 375 px
- `variant="outline"` — they are secondary to the xl Pause/Complete pair

Sheet body uses the `<FormCard>` + `<FormActions>` primitive. "Submit on top" per P56.2 mobile convention. Error state via `toast.error`.

**Tests:**
- Unit for each sheet component: input validation + submit calls the right server action.
- RLS: **reuse** existing `tests/rls/charges.test.ts` / `approvals.test.ts`. No new policies.
- E2E: extend tech spec with "mechanic adds a part and requests approval from the tech view".

**Vibe-security:** new `AddNoteSheet` writes must go through a SECURITY DEFINER RPC if it's a new table or a new role permission. Add a row to the security references in `Oplaris-Skills/vibe-security/references/server-actions.md` if a new RPC is introduced.

**Definition of done:**
- Three sheets render, submit, revalidate the timeline (P54 picks it up automatically).
- All three buttons are ≥48 px tall with visible focus ring.
- Tests +3 unit minimum, existing suite green.
- DESIGN_SYSTEM §4.3 updated to match the shipped implementation exactly.

---

## Step 3 — [P1 · F5] Surface pass-back context on tech view

**Goal:** when a mechanic opens `/app/tech/job/[id]` and that job has an unreturned `job_passbacks` row, render the ticked items + free-text note above the timer so the mechanic immediately sees what's wrong.

**Skill to consult:** `design:design-critique` (emphasis rule).

**Prerequisites:** Step 1.

**Files:**
- `src/app/(app)/app/tech/job/[id]/page.tsx` — fetch the latest open pass-back row.
- **New:** `src/app/(app)/app/tech/job/[id]/PassbackContextCard.tsx` — display-only.
- `src/lib/constants/passback-items.ts` — already has label map.
- `src/components/ui/passback-badge.tsx` — reuse.

**Diff outline:**
```ts
// page.tsx server side
const { data: pb } = await supabase
  .from("job_passbacks")
  .select("items, note, created_at, from_role, to_role")
  .eq("job_id", jobId)
  .is("returned_at", null)
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();
```
Render only when `pb && session.roles.includes("mechanic")` — the MOT tester who created it doesn't need to see it echoed back.

Card content:
- Header: `<PassbackBadge>` + "Passed back by MOT tester" · time (via `formatWorkLogTime`).
- Ticked items as shadcn chips (reuse `Badge variant="secondary"` with amber tint).
- Free-text note in `<blockquote>` styling.

**Tests:**
- Unit: snapshot render with a 3-item pass-back.
- RLS: already covered by `tests/rls/job_passbacks.test.ts` — verify a mechanic assigned to the job can read the row; confirm existing test covers this and add if not.

**Definition of done:**
- The mechanic lands on the job and sees the checklist without having to leave the tech UI.
- Screen-reader: the section has an `<h2>` (via `<Section title>` primitive).
- Tests green.

---

## Step 4 — [P1 · F3, F4] Mobile-optimise PassbackDialog

**Goal:** the 11-item checklist is finger-friendly at 375 px, each checkbox is ≥44 px tap surface, the trigger is ≥48 px, and per-field validation is inline.

**Skill:** `design:accessibility-review` (A8, A9, A11, A16).

**Files:**
- `src/app/(app)/app/jobs/[id]/PassbackDialog.tsx`
- `src/components/ui/checkbox.tsx` — already exists (shadcn). Use it.

**Diff outline:**
1. Trigger button: `size="lg"` (was `sm`), icon `h-5 w-5` (was `h-4 w-4`).
2. Replace the checklist block:
   ```tsx
   <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
     {PASSBACK_ITEMS.map((def) => {
       const state = items[def.value]!;
       const detailId = `pb-detail-${def.value}`;
       const errorId = `pb-error-${def.value}`;
       const hasDetailError =
         def.requiresDetail && state.checked && !state.detail.trim() && attempted;
       return (
         <div key={def.value} className="space-y-2">
           <label className="flex min-h-11 cursor-pointer items-center gap-3">
             <Checkbox
               checked={state.checked}
               onCheckedChange={() => toggle(def.value)}
               className="h-5 w-5"
             />
             <span className="text-sm">{def.label}</span>
           </label>
           {def.requiresDetail && state.checked ? (
             <>
               <Input
                 id={detailId}
                 value={state.detail}
                 onChange={(e) => setDetail(def.value, e.target.value)}
                 placeholder={def.value === "light_bulb" ? "Which bulb?" : "Describe the issue"}
                 aria-label={`${def.label} detail`}
                 aria-invalid={hasDetailError}
                 aria-describedby={hasDetailError ? errorId : undefined}
               />
               {hasDetailError ? (
                 <p id={errorId} role="alert" className="text-xs text-destructive">
                   Detail is required.
                 </p>
               ) : null}
             </>
           ) : null}
         </div>
       );
     })}
   </div>
   ```
3. Remove the top-level `error` for missing-detail; keep it only for server-side errors.
4. Track `attempted` state: set `true` on submit click; that's what gates the inline error visibility.

**Tests:**
- Extend `tests/unit/passback-dialog.test.tsx` (create if missing): submission blocked until both Light bulb + Other details filled; only the failing fields show errors.
- E2E: 375 px viewport, TalkBack / VoiceOver read-out verified manually.

**Definition of done:**
- `pnpm test` + `pnpm typecheck` green.
- 44×44 minimum tap surface on every checkbox row (verified by `h-11` on the wrapping `<label>`).
- Axe-cli audit on the open dialog returns 0 violations (run locally: `pnpm dlx @axe-core/cli http://localhost:3000/app/jobs/<id>`).

---

## Step 5 — [P1 · F4] Size sweep across tech surfaces

**Goal:** no `size="sm"` button on any primary tech action. Add a lint rule so regressions can't land.

**Skill:** none — mechanical.

**Files:** every tech surface. Expect ~8 button sites to flip `sm` → `lg`.

**Diff outline:** run this Grep in-context (not in bash) and hand-tune each:
```
ripgrep  'size="sm"' --glob 'src/app/(app)/app/tech/**'
ripgrep  'size="sm"' --glob 'src/app/(app)/app/bookings/Start*.tsx'
ripgrep  'size="sm"' --glob 'src/app/(app)/app/tech/ClaimPassbackButton.tsx'
ripgrep  'size="sm"' --glob 'src/app/(app)/app/jobs/[id]/PassbackDialog.tsx'
```
Replace each `size="sm"` with `size="lg"` **except** for the task-type radio pills — those go `size="default"` (44 px) to keep the wrap-friendly footprint.

Add lint check: in `scripts/check-spacing-tokens.ts`, add a new lint mode `check-tech-button-sizes` that greps for `size="sm"` inside the allow-listed paths and errors out. Wire into `pnpm lint`.

**Tests:** update whichever tests snapshot the buttons.

**Definition of done:**
- `pnpm lint` catches a deliberately-reverted `sm` in a test file.
- Manual audit against a 10-surface checklist (below in §9).

---

## Step 6 — [P1 · F6] Fix `text-warning` contrast regression

**Goal:** every `text-warning` site renders at ≥4.5:1 contrast on its background, in both light and dark themes.

**Skill:** `design:accessibility-review` (A3, A4).

**Files:**
- `src/app/globals.css`
- `src/app/(app)/app/tech/job/[id]/TechJobClient.tsx:308`
- `src/app/(app)/app/tech/page.tsx:440`
- Any other `text-warning` site on a non-warning background: grep `ripgrep 'text-warning' src/`.

**Pick one of two approaches.** Either works; approach B is lower risk.

**Approach A (token retune):** darken `--warning` in `:root` to OKLCH ~0.58 lightness, keep `--warning-foreground` white. Regenerates contrast for all `text-warning` on white to ~4.6:1. Downside: repaints the whole design; risks breaking something else.

**Approach B (component-level):** leave the token, change specific sites:
1. `TechJobClient.tsx:308` — Pause button: `border-warning text-warning` → change text to `text-foreground` (≥12:1 on white, `size=xl` keeps icon amber via colour on the `<Pause>` icon).
2. `tech/page.tsx:440` — summary line: wrap in a `Badge variant="secondary"` pill with `bg-warning/15 text-warning-foreground` instead of freestanding text.
3. Audit any other `text-warning` site found by grep — either pill-it or switch to `text-foreground`.

**Recommended:** Approach B — scoped, low blast radius, ships in this PR. Defer Approach A to a design-system epic.

**Tests:**
- Manual contrast check against WebAIM's contrast checker for the top 3 sites.
- Add a `tests/unit/warning-contrast.test.ts` that asserts the relevant OKLCH token pair passes a computed 4.5:1 for body text / 3:1 for UI components. (Use `src/lib/brand/oklch.ts` — already in-repo.)

**Definition of done:**
- Light + dark theme both pass AA on the three sites.
- `pnpm test` green.

---

## Step 7 — [P1 · F7] Show customer phone on My Work cards

**Goal:** the tech can call the customer without tapping into the job first.

**Skill:** `design:ux-copy` for the button label.

**Parallelisable after Step 1.**

**Files:**
- `src/app/(app)/app/tech/page.tsx` — `JobRow` component.
- `listOpenCheckIns` already returns phone; the assigned-jobs query (lines 60–70) needs to include `phone` from `customers`.

**Diff outline:**
1. Extend the select: `customers!customer_id ( full_name, phone )`.
2. Thread `customer.phone` into `AssignedJob` shape.
3. In `JobRow`, below the customer name, render:
   ```tsx
   {job.customer?.phone ? (
     <a
       href={`tel:${job.customer.phone}`}
       onClick={(e) => e.stopPropagation()}
       className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm text-primary underline-offset-4 hover:underline"
       aria-label={`Call ${job.customer.full_name}`}
     >
       <Phone className="h-4 w-4" /> {formatPhone(job.customer.phone)}
     </a>
   ) : null}
   ```
4. Key detail: `stopPropagation` stops the tap from activating the outer `<Link>` to the job.

**Tests:**
- Update snapshot tests on `tech/page.tsx` fixture.

**Definition of done:**
- Tapping the number triggers `tel:` on Android; tapping outside the number opens the job.
- Focus ring visible on keyboard tab.

---

## Step 8 — [P2 · F8] Announce the running timer

**Goal:** screen readers hear the elapsed time as it changes (throttled).

**Skill:** `design:accessibility-review` (A2).

**Parallelisable with 9–13.**

**Files:** `src/app/(app)/app/tech/job/[id]/TechJobClient.tsx`.

**Diff outline:**
1. Split the visual timer from the live region:
   ```tsx
   <span aria-hidden>{formatRunningTimer(elapsed)}</span>
   <span
     role="status"
     aria-live="polite"
     aria-atomic="true"
     className="sr-only"
   >
     {minuteBucket(elapsed)}
   </span>
   ```
2. `minuteBucket(s)` returns a string only when the minute rolls over — avoids over-announcing. E.g. `"12 minutes"` or `"1 hour 3 minutes"`.
3. Pure helper in `work-log-timer.ts`. Unit tests for boundary values (0, 59, 60, 3599, 3600, 7261).

**Tests:** `tests/unit/work-log-timer.test.ts` — extend.

**Definition of done:**
- TalkBack manually verified on Android reading once per minute.
- No visual regression.

---

## Step 9 — [P2 · F9] Fix task-type pill a11y

**Goal:** task-type selector behaves consistently with its ARIA role.

**Skill:** `design:accessibility-review` (A10, A13).

**Files:** `src/app/(app)/app/tech/job/[id]/TechJobClient.tsx`.

**Diff outline:** swap from `role="radio"` + `aria-checked` to `aria-pressed` toggles (the UI is really a single-select chip group, not a radiogroup):
```tsx
<Button
  role="button"
  aria-pressed={active}
  ...
>
```
Add arrow-key handler on the container: ← / → move selection. Keep default size.

**Tests:**
- RTL keyboard simulation in a component test.

**Definition of done:**
- Keyboard users can change task type with arrows.
- Screen reader says "button, Diagnosis, pressed" / "button, Diagnosis, not pressed".

---

## Step 10 — [P2 · F10] Verb-first pending states

**Skill:** `design:ux-copy`.

**Parallelisable.**

**Files:** `src/app/(app)/app/tech/job/[id]/TechJobClient.tsx` lines 286, 300, 311, 321; any other `"..."` inside button labels across the tech surface.

**Diff outline:** `"..."` → `"Pausing…"` / `"Resuming…"` / `"Completing…"` / `"Starting…"`. Already have `"Starting..."` — change to the Unicode ellipsis.

**Tests:** snapshot update.

---

## Step 11 — [P2 · F11] Per-field pass-back error

Already folded into Step 4. Marking resolved there.

---

## Step 12 — [P2 · F12] `<RegPlate>` accessible label

**Skill:** `design:accessibility-review`.

**Files:** `src/components/ui/reg-plate.tsx`.

**Diff outline:**
```tsx
<span
  role="img"
  aria-label={`Registration ${reg}`}
  // ...
>
```
Keep the existing typography. Use `aria-hidden` on inner character spans if any (likely not — it's plain text).

**Tests:** one unit test asserting the `aria-label`.

**Definition of done:** screen reader reads "Registration AB12 CDE" instead of "A B 1 2 C D E".

---

## Step 13 — [P2 · F13] Tech history + profile pages

**Goal:** match DESIGN_SYSTEM §4.1.

**Scope decision:** if the Phase-4 deadline is tight, **deferring with a tracking issue is acceptable**. Surface it to Hossein. Otherwise:

**Files:**
- `src/app/(app)/app/tech/history/page.tsx` (new) — RSC that reads `work_logs` for the session user, groups by day, shows total worked time + jobs touched.
- `src/app/(app)/app/tech/profile/page.tsx` (new) — read-only profile: name, roles, phone. Deep link to password change.
- Sidebar: `/app/tech/history` appears for mot_tester + mechanic (not manager).

**Skill:** `design:design-handoff` for the specs.

**Definition of done:** both pages are reachable from My Work via a bottom-tab navigation (or a simple header link if bottom tabs are out of scope) + listed in DESIGN_SYSTEM §4.1 as shipped.

---

## Step 14 — [P3 · F14] Role badge → semantic tokens

**Files:** `src/components/ui/role-badge.tsx`.

**Diff outline:** replace hardcoded amber with the `--warning` token map. Check dark mode.

**Definition of done:** `role-badge` stops appearing in the `scripts/check-hardcoded-colors.ts` diff (if that lint exists; otherwise just eyeball).

---

## Step 15 — [P3 · F15] Pass-back checkbox → shadcn

Already folded into Step 4.

---

## Step 16 — [P3 · F16] Optional section empty states

**Decision:** skip unless Hossein asks — the full-page empty state already handles "completely empty" and per-section noise hurts density.

---

## Step 17 — Consolidation pass

**Skill:** `consolidate-memory` (optional, for `CLAUDE.md` upkeep).

**Do:**
1. Update `CLAUDE.md` Phase tracker with "Mechanic/MOT UX audit — DONE 2026-04-XX" under the current phase.
2. Update `DESIGN_SYSTEM.md` §4.3 to reflect the secondary-action row exactly.
3. Update `MASTER_PLAN.md` Phase-4 row with the fixes shipped.
4. Write a `STANDUP.md` entry describing the work.
5. Run the full suite: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:rls`. All green.
6. Open a PR titled `feat(tech): mechanic/MOT mobile UX pass (audit 2026-04-20)`. Link both audit and plan.

**Definition of done:** main thread on the PR references every F# from the audit as "closed" or "deferred with reason".

---

## Parallelisation matrix

```
Step 0 (setup)
 │
 ├─ Step 1  ── (P0 gate) ─┬─ Step 2  (tech secondary actions) [biggest]
 │                        ├─ Step 3  (passback context card)
 │                        ├─ Step 4  (passback dialog mobile)
 │                        ├─ Step 5  (button-size sweep)
 │                        ├─ Step 6  (contrast fix)
 │                        ├─ Step 7  (customer phone) ──────────┐
 │                        ├─ Step 8  (timer a11y)               │
 │                        ├─ Step 9  (task-type pill)           │
 │                        ├─ Step 10 (verb pending states)      │
 │                        ├─ Step 12 (reg plate label)          │
 │                        ├─ Step 13 (history/profile — maybe defer)
 │                        └─ Step 14 (role badge)               │
 │                                                              │
 └─ Step 17 (consolidate) ◄────────────────────────────────────┘
```

Steps 2, 3, 4, 6 are the longest. Everything else is ≤30 min of focused work.

---

## §9 — Surface-by-surface review checklist (for post-fix QA)

Run through this at 375 px with Android Chrome devtools + VoiceOver/TalkBack:

**/app/tech (My Work)**
- [ ] Passed-back section visible with 48-px claim button
- [ ] Check-in row "Start MOT / Start work" is 48 px
- [ ] In-progress card shows customer phone, tappable
- [ ] Empty state: renders the illustration
- [ ] Realtime: new passback appears within 2 s

**/app/tech/job/[id]**
- [ ] Pass-back context card visible if applicable
- [ ] Secondary action row visible while working: Add part · Request approval · Add note
- [ ] Timer announced to screen reader ~once per minute
- [ ] Pause button contrast passes AA
- [ ] Pending states read "Pausing…" etc.
- [ ] Task-type pills at 44 px, arrow-key navigable
- [ ] Reg plate reads as "Registration AB12 CDE"

**/app/jobs/[id] (shared detail, tech assigned)**
- [ ] Pass-to-mechanic trigger is 48 px
- [ ] Dialog checklist `grid-cols-1` on mobile
- [ ] Inline per-field errors
- [ ] Log Work button NOT shown for techs
- [ ] Change Handler NOT shown for non-managers

**Cross-cutting**
- [ ] `pnpm lint:spacing` green
- [ ] No `size="sm"` in tech surfaces
- [ ] No bare `text-warning` on white
- [ ] `pnpm test` + `pnpm test:rls` green
- [ ] Axe-cli 0 violations on 5 sampled tech URLs
