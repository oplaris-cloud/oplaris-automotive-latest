# P52 Kickoff Prompt — Job-detail header reorg + P51 soak-bug fix

> Paste this into Claude Code at the start of the P52 session. Assumes CLAUDE.md auto-loads and P50 (realtime) is already shipped. Run order: P50 → **P52** → P46 → P47.8 → P51.6 → P38 → P51.10.

---

## Context

Found during post-P51 UI walk-through on `DUD-2026-00009` (2026-04-14). Two real problems stacked on the job-detail header action row:

1. **Duplicate "Pass to Mechanic" button — this is a silent P51 bypass bug.** `StatusActions.tsx` renders a plain `Pass to Mechanic` whenever the current status is `in_diagnosis` or `in_repair`, because `STATUS_TRANSITIONS.in_diagnosis` / `in_repair` still list `awaiting_mechanic` as a valid next status in `src/lib/validation/job-schemas.ts`. Clicking it calls `updateJobStatus` and writes `jobs.status='awaiting_mechanic'` **without** inserting a `job_passbacks` row or flipping `current_role`. That violates the core P51 invariant (every pass-back is a `job_passbacks` event, written only by the `pass_job_to_mechanic` RPC) and the CLAUDE.md rule: *"No new code may write to `jobs.status='awaiting_mechanic'` — use the P51 RPCs."* The correct button is the `PassbackDialog` one with the ⇄ icon.
2. **Cluttered, ungrouped action row.** Five categories crammed side-by-side with no hierarchy: state transitions, customer comms, role handoff, destructive (mid-row), and an info chip pretending to be a button.

Full spec in `docs/redesign/MASTER_PLAN.md > P52` — acceptance criteria P52.1 through P52.12. Your job is to execute it, not redesign it.

**Read first, in this order:**
1. `CLAUDE.md > Phase 2` — P52 slots between P50 and P46.
2. `docs/redesign/MASTER_PLAN.md > P52` — full spec, acceptance criteria.
3. `docs/redesign/MASTER_PLAN.md > P51` — pass-back data-model context (so you understand which transitions are legal).
4. `Oplaris-Skills/ux-audit/references/*.md` — design-system / action-hierarchy notes before wiring the new header.

---

## What to build (in order — do not skip steps)

### Step 1 — Kill the duplicate button (bug fix first, visuals after)

File: `src/lib/validation/job-schemas.ts`

- In `STATUS_TRANSITIONS`, remove `"awaiting_mechanic"` from the target arrays of `in_diagnosis` and `in_repair`. Keep the `awaiting_mechanic` key itself (its reverse transitions — `in_diagnosis`, `in_repair`, `cancelled` — are still valid for legacy jobs during the soak).
- No other change in this file.

File: `src/app/(app)/app/jobs/actions.ts` (or wherever `updateJobStatus` lives — grep for it)

- Add a guard at the top of `updateJobStatus`: if `parsed.data.status === "awaiting_mechanic"`, return `{ ok: false, error: "Use the Pass to Mechanic dialog — status transitions no longer flip to awaiting_mechanic (P51)." }`. Belt-and-braces.

Verification:

```bash
# Zero UI surfaces offer awaiting_mechanic as a forward transition
grep -rn "awaiting_mechanic" src/ | grep -v "^src/lib/validation/job-schemas.ts"
# Review output — should be type defs, the Resume MOT soak guard, and legacy-reverse transitions only.
```

Manually test: on `DUD-2026-00009` (or any MOT job in `in_diagnosis`), reload the job page — the old plain "Pass to Mechanic" button is gone. Only the new ⇄ "Pass to mechanic" from `PassbackDialog` renders.

### Step 2 — Regroup the header into three zones

File: `src/app/(app)/app/jobs/[id]/page.tsx`

Refactor the top of the page into three visually separated zones (use `border-b` or vertical spacing, not just a single flex-wrap):

**Zone 1 — Identity row.** Job number + status chip + `current_role` chip (the "With MOT tester" / "With mechanic" chip — move it out of the action row; it is informational, not actionable). Edit pencil. Right-aligned: Created date, Source.

**Zone 2 — Currently-working panel.** Unchanged.

**Zone 3 — Actions row.** Three slots in a single row:
- **Primary (left, `variant="default"`):** ONE context-aware button based on `(current_role, status, viewer_role)`:
  - `mot_tester` viewing a job with `current_role='mot_tester'` + `status='in_diagnosis'` → `Pass to mechanic` (opens `PassbackDialog`)
  - `mechanic` viewing a job with `current_role='mechanic'` (passed-back path) → `Return to MOT tester` (`ReturnToMotTesterButton`)
  - `mot_tester` on a job where `current_role='mot_tester'` but status is legacy `awaiting_mechanic` → `Resume MOT` (`ResumeMotButton`)
  - Otherwise fall through to the first legal `STATUS_TRANSITIONS[status]` transition (`Start Repair` when diagnosing, `Ready for Collection` when in repair).
- **Secondary (middle, `variant="outline"`):** the other legal non-destructive transitions — typically `Awaiting Parts`, `Request Approval`. Max 3. Anything beyond the max pushes into overflow.
- **Overflow (right):** shadcn `DropdownMenu` triggered by a `⋯` icon button. Contains `Cancel` (destructive — keep the existing confirmation dialog), `Mark Complete` if reachable, and a manager-only `Override role` item (direct UPDATE via manager RLS — no RPC).

Create a new component `src/app/(app)/app/jobs/[id]/JobActionsRow.tsx` that takes `{ job, viewerRoles }` and returns the three slots. Keep `StatusActions.tsx` as an internal detail it uses for the secondary slot. Delete any leftover top-level rendering of individual action components from `page.tsx` — everything flows through `JobActionsRow`.

For the `current_role` chip, extend `src/components/ui/status-badge.tsx` (or make a sibling `role-badge.tsx`) that renders `With MOT tester` / `With mechanic` as a small chip with a subtle fill — **no button styling, no onClick** unless the viewer is a manager (then it can be a subtle affordance that opens the override menu; judgement call).

### Step 3 — Mobile collapse

On screens `< sm` (640 px), the primary stays visible, secondaries wrap, and the overflow menu opens as a bottom sheet rather than a top-anchored dropdown. shadcn's `DropdownMenu` doesn't auto-swap — wire it manually: render `Drawer` on mobile, `DropdownMenu` on desktop, driven by a `useMediaQuery` hook. Keep the trigger (the `⋯` button) identical.

### Step 4 — Tests

- `tests/unit/job-status-transitions.test.ts` — assert that `STATUS_TRANSITIONS.in_diagnosis` and `STATUS_TRANSITIONS.in_repair` do NOT include `"awaiting_mechanic"`. Assert `updateJobStatus({ status: 'awaiting_mechanic' })` returns the error message from Step 1.
- `tests/e2e/job-action-row.spec.ts` (Playwright) — for each of the three role viewpoints (mot_tester / mechanic / manager), load a seeded job at the relevant state, assert the primary button text, assert the secondary buttons, assert the overflow menu contents. Assert `Cancel` is NOT in the primary or secondary rows.
- Manually re-run R-T.8 / R-C.4 / R-M.7 from `ROLE_TEST_PLAN.md` — no regression in pass-back flow.

### Step 5 — Design critique gate

Run `design:design-critique` skill on a screenshot of the new header (mot_tester view, mechanic view, manager view, mobile view). Capture the output. Fix any P1 / P2 issues before calling it done. Paste the output into the PR description.

### Step 6 — Close out

- Mark P52.1 through P52.12 as DONE in `MASTER_PLAN.md`.
- Update the Phase 2 priority line in `CLAUDE.md` — strike P52, move on to P46.
- **Do not update `VISUAL_IMPLEMENTATION_PLAN.md` in this session.** The "P52 pattern: primary / secondary / overflow" note is logged for a separate Phase 3 pass.

---

## Do-not-do list (common failure modes)

- ❌ Don't remove the `awaiting_mechanic` key from `STATUS_TRANSITIONS` entirely — the reverse transitions (out of `awaiting_mechanic`) are still needed for legacy jobs during the soak. Only remove it as a target.
- ❌ Don't touch the P51 RPCs or the `PassbackDialog` / `ReturnToMotTesterButton` / `ResumeMotButton` components' internal logic. Just reorganise where they render.
- ❌ Don't make the `current_role` chip clickable for non-managers. It's a piece of information.
- ❌ Don't drop `Cancel` into the secondary row because it "feels more discoverable." Destructive actions live in the overflow. One extra click is the correct ergonomics.
- ❌ Don't ship without the mobile collapse — the old layout already has horizontal-scroll issues on 360 px screens per P38 notes, don't regress further.
- ❌ Don't update `docs/redesign/VISUAL_IMPLEMENTATION_PLAN.md` — that's a separate Phase 3 task Hossein is handling.

## Done when

All of P52.1 through P52.12 in `MASTER_PLAN.md > P52` are green, new tests pass, design-critique output has no P1 / P2 issues, and `grep -rn "awaiting_mechanic" src/` returns only type definitions, legacy-reverse transitions, and the `Resume MOT` soak guard.

Report back with: list of files changed, test results, design-critique output, before/after screenshots of the job header on `DUD-2026-00009` at each role viewpoint.
