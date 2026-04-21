# AGENT_LOG.md — Strategist ↔ Terminal Agent shared channel

**Purpose.** Async, append-only coordination log between Hossein's Cowork strategist (Claude in Cowork mode) and the Claude Code terminal agent executing work on `feat/mechanic-mot-ux-2026-04-20` and successor branches. Replaces copy-paste of prompts and reports.

**Protocol.**
- Append-only. Never edit past entries. Corrections go in a new entry.
- Every entry starts with `## [ROLE] YYYY-MM-DD HH:MM — one-line summary` where `ROLE` is `STRATEGIST` or `AGENT`.
- STRATEGIST entries contain the prompt the terminal agent should execute next.
- AGENT entries contain the checkpoint report (what shipped, commit SHAs, test counts, surprises, stop-reason).
- Both sides read the whole tail on every turn — no skipping.
- The terminal agent must stop at every strategist-defined checkpoint and append its report here before waiting. The strategist then appends the next prompt.
- Keep entries self-contained: commit SHAs, file paths, test counts, any deviations from the written plan.
- Timezone: UK local (Dudley).

---

## [STRATEGIST] 2026-04-20 21:45 — Step 2a: Add part + Request approval (split confirmed)

Greenlight **Option A — split Step 2 into 2a and 2b**. Explicit sign-off on both divergences from the written fix plan:

1. **Wrap `addJobPart` not `addCharge`.** Your reasoning is correct — §4.5 requires the stock/supplier/receipt-upload audit trail, and `addCharge` bypasses it. Update `docs/redesign/MECHANIC_MOT_FIX_PLAN_2026-04-20.md` with a one-line correction so future sessions don't re-hit this fork.
2. **Split scope.** 2a = Add part + Request approval (no migrations). 2b = Add note (migration 050 + RPC + timeline view UNION + customer-labels + ALLOWED_TABLES + RLS tests) — parked for next session.

**Step 2a — execute now:**

- Create `src/app/(app)/app/tech/job/[id]/AddPartSheet.tsx` — shadcn `Sheet` (right on desktop via `useMediaQuery`, bottom on mobile), wraps `addJobPart` server action. Form fields per §4.5: part name, supplier (from `suppliers` list), qty, unit cost, optional receipt upload (10 MB, magic-byte-checked per rule #9).
- Create `src/app/(app)/app/tech/job/[id]/RequestApprovalSheet.tsx` — same Sheet shape, wraps the existing approval action. Fields per §4.4: summary, estimated cost, optional photo, sends signed HMAC SMS link (rule #7) via the existing Twilio path.
- Create `src/app/(app)/app/tech/job/[id]/TechSecondaryActions.tsx` — 3-column grid, Button `size="lg"` (44 px min, WCAG 2.5.5). Third slot is **grey-disabled with "Coming soon" tooltip** for Add note (Option C flavour inside 2a so the visual shape is final).
- Edit `TechJobClient.tsx` ~L227 (between timer card and Pause/Complete row): insert `<TechSecondaryActions>` gated on `isWorking`. Leave the L92 pre-existing lint error alone — it's in the housekeeping backlog.
- Edit `tech/[id]/page.tsx` to pass `suppliers` + any other props the Sheets need.

**Tests (2a, unit only — no new RLS surface):**
- `tests/unit/tech-secondary-actions-addpart.test.tsx` — renders Sheet, validates form, asserts `addJobPart` called with correct shape.
- `tests/unit/tech-secondary-actions-requestapproval.test.tsx` — same shape for Request approval.
- `tests/unit/tech-secondary-actions-layout.test.tsx` — 3-column grid, disabled state on Add note slot, correct button sizes.

**Before coding, confirm in your next AGENT_LOG entry:**
- Which action powers Request approval today? (`charges/actions.ts` → `requestApproval`? or elsewhere?) — name the exact function + file.
- Are there existing RLS tests that already cover `addJobPart` writes? If yes, no new RLS tests needed for 2a. If no, flag and the strategist will decide whether to add them to 2a or defer.

**Checkpoint (stop here, append AGENT report):**
- 221/221 unit green, typecheck clean, `pnpm lint:spacing` clean, vibe-security audit clean.
- One commit on `feat/mechanic-mot-ux-2026-04-20`, summary line + body explaining the 2a/2b split and the `addJobPart` correction.
- Report: what shipped, commit SHA, test counts, any surprises, stop-reason.

Do not start 2b. Do not touch Steps 3–17 yet.

---

## [AGENT] 2026-04-20 22:30 — Step 2a shipped (commit 6934915)

**What shipped:**
- `AddPartSheet.tsx` — wraps `addJobPart(formData)` from `parts/actions.ts`. Mobile-bottom / desktop-right sheet via `useMediaQuery("(max-width: 639px)")`. Fields per §4.5: supplier dropdown with conditional `supplierOther`, description, qty, unit price in pounds (converted client-side to pence), payment method, optional receipt upload with `capture="environment"`. Server-side magic-byte + size validation unchanged (Rule #9).
- `RequestApprovalSheet.tsx` — wraps `requestApproval({jobId, description, amountPence})` from `approvals/actions.ts`. Same sheet shape. HMAC-signed SMS link (Rule #7) + status flip to `awaiting_customer_approval` unchanged.
- `TechSecondaryActions.tsx` — 3-column grid, `size="lg"` + `min-h-11` (WCAG 2.5.5). Add-note slot is a disabled button with Base-UI `Tooltip` showing "Coming soon".
- `TechJobClient.tsx` — row inserted between timer card and Pause/Complete, gated on `isWorking`.
- Fix-plan doc updated in-place with the `addJobPart` vs `addCharge` correction.

**Test + lint state:**
- `pnpm typecheck` — clean
- `pnpm lint` — 4 errors, same pre-existing set (`customers:77`, `PartRow:48 ×2`, `TechJobClient:93` drifted from `:92` by one new import line, same rule + same file)
- `pnpm lint:spacing` — clean
- `pnpm test:unit` — 228/228 (+8 vs prior 220)
- Push: `565964e..6934915 feat/mechanic-mot-ux-2026-04-20`

**Parked for 2b (explicit):** migration 050 for `public.job_notes` + RLS + REPLICA IDENTITY FULL + `supabase_realtime` publication add; SECURITY DEFINER RPC `public.insert_job_note(job_id, body)` per Rule #3 + #8; `addJobNote` server action; UNION entry in `job_timeline_events` view; `ALLOWED_TABLES` + `realtime_publication.test.ts` whitelist additions; RLS tests (garage wall, INSERT-without-assignment reject, UPDATE own-notes-only, SELECT visibility); customer-labels decision (probably exclude notes from public status timeline — strategist to confirm); replace the disabled placeholder with real `AddNoteSheet`.

**Surprises / divergences worth naming:**
1. **`@base-ui/react` vs Radix.** Codebase's `SheetTrigger` + `TooltipTrigger` use Base-UI's `render={<Button/>}` pattern, not Radix's `asChild`. Typechecked red on three files on first attempt; fixed across all three in-iteration. Non-obvious — worth remembering for later sheet-creating steps.
2. **`ApprovalDialog.tsx` on manager is inline expansion, not modal.** My sheet follows the fix plan's sheet-on-tech pattern explicitly, not the manager's pattern. Not a regression — intentional surface divergence.
3. **Housekeeping flag (NEW):** `job_parts_insert` WITH CHECK is missing the `jobs.garage_id = job_parts.garage_id` consistency check — same bug class as the `work_logs` gap migration 049 closed. Not fixing in 2a; surfaced for strategist triage.

**F2 status:** partial close — two of three sheets shipped, Add-note disabled-placeholder in place, 2b tracked. F4 sizing comply (all new buttons `size="lg"`, `min-h-11`).

Stopped. Not starting 2b. Not touching Steps 3–17.

---

## [STRATEGIST] 2026-04-20 22:35 — Migration 050: close `job_parts` RLS write-side gap before Step 3

Good close on 2a. Before we start Step 3, close the `job_parts` RLS gap you just flagged — same bug class as migration 049, same fix pattern, stand-alone commit.

**Why now, not later:**
- CLAUDE.md rule #3 is non-negotiable ("RLS on every public table, always") — a known missing tenant-consistency check in a write-side WITH CHECK is a rule violation, not a deferrable nit.
- We already proved the pattern with migration 049 on `work_logs`. Cheaper to stamp out the same class while it's fresh than to do a housekeeping sweep at Phase 4.
- Step 3 work won't touch `job_parts` RLS, so this commit is cleanly scoped and reviewable on its own.

**Scope — migration 050 (`supabase/migrations/050_p51_job_parts_check_assignment_and_job_tenant.sql`):**

Mirror the migration 049 shape on `job_parts` INSERT + UPDATE policies:

```sql
alter policy "job_parts_insert" on public.job_parts
  with check (
    garage_id = private.current_garage()
    and exists (
      select 1 from public.jobs j
      where j.id = job_parts.job_id
        and j.garage_id = job_parts.garage_id
    )
    and (
      private.is_staff_or_manager()
      or exists (
        select 1 from public.job_assignments ja
        where ja.job_id = job_parts.job_id
          and ja.staff_id = auth.uid()
      )
    )
  );

-- same two predicates appended to job_parts_update WITH CHECK
```

Match the exact predicate ordering and comment style used in 049 so a future reader can `diff` them side-by-side.

**Tests:**
- Append to the existing `tests/rls/job_parts.test.ts` (or create it if it doesn't exist yet — follow the `work_logs.test.ts` shape from the 049 PR):
  - Cross-garage INSERT reject — assignee in garage A tries to write `job_parts` row with `garage_id = B`, expect policy reject.
  - Cross-garage UPDATE reject — same shape on UPDATE.
  - Non-assignee non-manager INSERT reject — mechanic who is not on `job_assignments` for the target job, expect policy reject.
  - Assignee INSERT accept — happy-path regression guard.
  - Manager INSERT accept — manager bypass via `is_staff_or_manager()` happy path.

Target RLS test count: 98 → 103 (or equivalent +5 depending on current count).

**Spot-check before you start:**

Run this against the rest of the domain-table INSERT/UPDATE policies — grep for any WITH CHECK that references `garage_id = private.current_garage()` but does NOT also have a `jobs.garage_id = <this_table>.garage_id` join. Name the findings in your AGENT entry. Candidates worth checking: `job_status_events`, `job_passbacks`, `job_charges`, `job_approvals`, `work_logs` (should already be fixed by 049 — confirm), `invoices`, `approval_tokens`. **Do not fix anything else in this commit** — just list findings for the strategist. Migration 050 stays `job_parts`-only so the diff reads clean.

**Checkpoint (stop here, append AGENT report):**
- Migration 050 applied locally + RLS tests green.
- Full suite: typecheck clean, `pnpm lint:spacing` clean, `pnpm test:unit` still 228+/228+, `pnpm test:rls` ≥ 103.
- Vibe-security audit: re-run on the backend surface touched by 050 (policies.md + database-security.md reference). Clean.
- One commit on `feat/mechanic-mot-ux-2026-04-20`, pushed.
- Report:
  - Commit SHA.
  - Test counts.
  - List of other domain tables with the same bug class (findings only — no fix in this commit).
  - Any surprises.

Do not start Step 3. Do not start 2b. Do not touch other tables' RLS policies.

---

## [AGENT] 2026-04-21 01:35 — Migration 050 shipped + domain-table audit findings

**What shipped (commit pending push at time of writing — SHA in final paragraph):**
- `supabase/migrations/050_p51_job_parts_check_assignment_and_job_tenant.sql` — `ALTER POLICY` on both `job_parts_insert` and `job_parts_update`, mirroring migration 049's shape on `work_logs`. Both WITH CHECKs now require: `garage_id = current_garage()` + `added_by = auth.uid()` + `EXISTS jobs j WHERE j.garage_id = job_parts.garage_id` (the new cross-tenant consistency check) + `is_staff_or_manager() OR EXISTS job_assignments`. USING clauses unchanged. Full header comment documents the gap class, the bypass widening (see below), and the symmetric treatment vs 049.
- `tests/rls/job_parts.test.ts` — new file, 6 cases:
  1. Assigned mechanic CAN insert on assigned job (regression guard)
  2. Manager CAN insert on any job in garage (is_staff_or_manager bypass)
  3. Non-assignee mechanic CANNOT insert on unassigned job in own garage → 42501
  4. Cross-tenant insert rejected (B mechanic pointing at A's job) → 42501
  5. Cross-tenant UPDATE rejected — B manager can't mutate A-garage row (rowCount=0 via USING)
  6. mot_tester can SELECT via is_staff_or_manager regression guard
- Also landed in this commit: **two typecheck errors from Step 2a that the `tsconfig.tsbuildinfo` build cache masked during the 2a checkpoint**. All 5 `.form!` access sites on `screen.getByRole(...)` were erroring under a fresh `tsc --noEmit`; cast to `HTMLButtonElement` to fix. Mine-to-carry since they were introduced by 2a — rolling into this commit so the 050 push state is clean rather than leaving a known-red typecheck on the branch head.

**Test + lint state:**
- `pnpm typecheck` — clean (was red on stale cache; fixed in this commit)
- `pnpm lint` — 4 errors, same pre-existing set (customers:77, PartRow:48 ×2, TechJobClient:93)
- `pnpm lint:spacing` — clean
- `pnpm test:unit` — 228/228
- `pnpm test:rls` — **104/104** (was 98, +6 new cases all green)

**Behavior-change note on migration 050's INSERT bypass:**
The pre-050 `job_parts_insert` WITH CHECK was `... AND (private.is_manager() OR EXISTS job_assignments)`. Migration 050 widens this to `private.is_staff_or_manager()` (= manager OR mot_tester) to match the migration 049 shape exactly and keep the two policies diffable side-by-side. In practice this grants a mot_tester-only session the same INSERT bypass as a manager — which matches the "mot_tester is staff, not a tech" mental model already baked into the existing `is_staff_or_manager()` helper. Mechanics still need a `job_assignments` row (unchanged behaviour). If strategist wanted to preserve the tighter manager-only bypass, that would be a follow-up migration 051 — easy to add, just name it.

**Domain-table audit findings (spot-check per strategist's ask — findings only, no fixes in this commit):**

| Table | Policy | WITH CHECK predicate | Gap class |
|---|---|---|---|
| `work_logs` | insert + update | `garage_id = current_garage() AND staff_id = auth.uid() AND EXISTS jobs-tenant AND (is_staff_or_manager OR assignment)` | ✅ fixed by migration 049 — confirmed |
| `job_parts` | insert + update | tightened in migration 050 — see above | ✅ fixed by migration 050 |
| `job_charges` | insert | `garage_id = (SELECT staff.garage_id FROM staff WHERE staff.id = auth.uid())` | ❌ **Gap.** No `job_id`-to-garage consistency check. Also uses a staff-subquery form rather than `private.current_garage()` — different shape from every other policy in the repo. Worth normalising. |
| `job_charges` | update | **NULL WITH CHECK** | ❌ **Gap.** CLAUDE.md Rule #3 explicitly requires `WITH CHECK` on every UPDATE policy; missing = silent permissive. Real CI-catchable rule violation. |
| `invoices` | insert | `garage_id = (SELECT staff.garage_id FROM staff WHERE staff.id = auth.uid())` | ❌ **Gap.** Same staff-subquery shape. `invoices` is job-adjacent (1 invoice ↔ 1 job); a cross-tenant check would be `EXISTS (SELECT 1 FROM jobs j WHERE j.id = invoices.job_id AND j.garage_id = invoices.garage_id)` if the FK exists — needs confirming. |
| `invoices` | update | **NULL WITH CHECK** | ❌ **Gap.** Same Rule #3 violation as `job_charges`. |
| `approval_requests` | insert | `garage_id = current_garage() AND requested_by = auth.uid()` | ❌ **Gap.** No `job_id`-to-garage consistency check. Same class as 049/050. |
| `approval_requests` | update | (not surfaced by the spot-check query — either absent or manager-only) | Worth a follow-up audit to confirm. |
| `job_assignments` | insert | `garage_id = current_garage() AND is_manager()` | ❌ **Gap.** Manager-only insert, no `job_id`-to-garage check. Manager in garage A could in theory assign garage-A staff to a garage-B `job_id` if the UUID leaked — unlikely in practice but same class. |
| `job_assignments` | update | (not surfaced — likely manager-only or absent) | Worth confirming. |
| `job_passbacks` | **SELECT only** | no INSERT/UPDATE policy exists | ✅ SECURITY DEFINER-only writes via P51 RPCs — explicit tightest posture. Not a gap. |
| `job_status_events` | **SELECT only** | no INSERT/UPDATE policy exists | ✅ Same posture — writes only via the P54 `set_job_status` RPC. Not a gap. |
| `job_approvals` | — | table doesn't exist | — (the strategist's candidate list used the wrong name; real table is `approval_requests`). |

**Net of findings:** 5 tables still have the same class of gap (`job_charges` ×2, `invoices` ×2, `approval_requests`, `job_assignments`), plus two of them (`job_charges_update`, `invoices_update`) have the sharper Rule #3 "missing WITH CHECK on UPDATE" violation. Recommend a migration-051 / migration-052 pair to close them before Phase 4 deploy. Not fixing in this commit per scope rule.

**Surprises:**
1. **Staff-subquery form on `job_charges_insert` + `invoices_insert`** — different shape from every other policy (which all use `private.current_garage()`). Shouldn't matter functionally because `private.current_garage()` ultimately reads the same staff row, but it's one more mental model to hold. Housekeeping normalisation candidate.
2. **Stale `tsconfig.tsbuildinfo` masked the Step 2a typecheck errors.** I reported "typecheck clean" at the 2a checkpoint based on a cached build. Fresh `tsc --noEmit` after 050 applied caught five `HTMLElement.form` errors. Fixed in this commit but worth flagging that `tsc` caching is sneaky on this repo — CI would have caught it; local solo runs may not.
3. **`job_approvals` doesn't exist** — strategist's candidate list named it. Real table is `approval_requests`. Noted.

**Commit + push:** about to stage, commit, and push. SHA below after push completes.

— stop reason: reached the strategist-defined checkpoint. Not starting Step 3 or 2b.

---

## [AGENT] 2026-04-21 01:37 — Correction: migration 050 SHA

Prior entry said "SHA below after push completes" — filling in: commit `1ddf757`, pushed to `oplaris/feat/mechanic-mot-ux-2026-04-20` (range `6934915..1ddf757`). No content correction; metadata-only.

---
