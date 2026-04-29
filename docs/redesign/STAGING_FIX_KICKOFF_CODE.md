# STAGING_FIX_KICKOFF.md

**Agent:** Claude Code CLI, running against `~/Desktop/Oplaris/oplaris-automotive`.
**Task:** Execute `docs/redesign/STAGING_FIX_PLAN.md` against the `staging` branch — both the backend fixes and the UI design/build. You are the only agent.

---

## Before you write a line of code

1. Read `CLAUDE.md` end to end. It wins against any other doc on conflict.
2. Read `docs/redesign/STAGING_FIX_PLAN.md` end to end. That's your queue.
3. Read `docs/redesign/DESIGN_SYSTEM.md` §§ 1–2 (primitives + tokens).
4. Skim `docs/redesign/PRE_PHASE_4_HARDENING.md` for context on migrations 049–052.
5. `git log --oneline -20 staging` — know where HEAD is.

## The UX skill you use for every UI task

**Before generating any new page, modal, or form, load the `ux-audit` skill.** It lives at `~/Desktop/Oplaris/Oplaris-Skills/ux-audit/` with `SKILL.md` + 9 reference docs covering the areas you'll touch:

- `accessibility.md`
- `cognitive-load-and-information.md`
- `content-and-copy.md`
- `forms-and-data-entry.md`
- `interactive-components.md`
- `performance-perception.md`
- `responsive-and-mobile.md`
- `theming-and-design-tokens.md`
- `visual-hierarchy-and-layout.md`

**Workflow for any UI-bearing plan item:**

1. Open `SKILL.md` and identify which reference docs apply to this surface (usually 2–4 of the 9).
2. Read those reference docs in full. Take notes on the rules that will shape this design.
3. Sketch the layout + component tree + states in prose first (no code). Cross-check against the rules you just read. Revise.
4. Only then write the TSX + server actions.
5. After the first working pass, run the skill's audit checklist against your output. Fix anything that fails. Log any deliberate deviations at the item's plan-doc entry with a one-line justification.

**Also load `vibe-security` at `~/Desktop/Oplaris/Oplaris-Skills/vibe-security/`** before any item that touches auth, RLS, secrets, signed tokens, rate limits, or file upload. Same workflow — read relevant references, design against them, audit the output.

## Non-negotiable working rules

- **Stay on `staging`.** Don't touch `main`. Hossein fast-forwards when staging is green.
- **Phase order.** P0 → P1 → P2 → P3. Never skip ahead. If a phase item is blocked, log the blocker in the plan doc and move to the next item in the *current* phase, not a future one.
- **One new migration per DB change**, next numeric prefix (054, 055, …). Never edit a shipped migration.
- **Apply migrations via the Supabase MCP** against project `fzczwkreixorrspwojcl`. After MCP apply, commit the `.sql` file for repo provenance — both sides must match.
- **No new `supabase.channel(` call sites.** Use `useRealtimeRouterRefresh` and add the table to both the publication migration and the `ALLOWED_TABLES` whitelist (CLAUDE.md §Phase 2 P50).
- **No RLS regression.** After any migration that touches a domain table, run `pnpm test:rls` locally. If the remote DB doesn't match, reseed against staging Supabase and rerun.
- **No `supabase.rpc("name")` without a matching `public.<name>` function.** If the real definition is in `private.<name>`, write a shim (see migration 053 as the template).
- **Use existing primitives only.** PageContainer, PageTitle, Section, Stack, Card (with size variants), FormCard, FormActions, Combobox, ConfirmDialog, LoadingState, EmptyState, PassbackBadge, RoleBadge. If a genuinely new primitive is needed, add it under `src/components/ui/` with a tested story, and document it at the bottom of `DESIGN_SYSTEM.md` in the same commit.
- **Use existing tokens.** No hardcoded hex, no new colour variables. Dark mode must work — test both themes before merging. Brand theming is live (V1 work) so `--primary` shifts per garage — don't design something that breaks when the primary becomes magenta.
- **44px minimum touch target** on anything tappable (WCAG 2.5.5). The end-of-job checklist modal is phone-primary — techs close jobs on phones with gloves on.

## Phase-specific notes

**Phase 0 + Phase 1:** backend fixes + tiny UI tweaks using existing primitives. No ux-audit deep reads needed — the primitives already encode the rules.

**Phase 2:**
- P2.1, P2.2, P2.4, P2.5, P2.6, P2.7a, P2.7b: backend-heavy, no new UI surfaces. Skip ux-audit unless you're changing a form.
- **P2.3 (SMS templates settings page)**: new UI. Load ux-audit, read `forms-and-data-entry.md` + `content-and-copy.md` + `cognitive-load-and-information.md`, design against them, then build. The template editor is a three-field form with live preview — not complicated, but the preview must stay legible when the template has unfilled `{{variables}}`.

**Phase 3: every item is UI-heavy.** Always load ux-audit.

- **P3.1 (staff list + detail):** `visual-hierarchy-and-layout.md` + `interactive-components.md` + `performance-perception.md`. Live cards with red/green status, live timers. Don't make the manager's eye ping-pong trying to find who's available.
- **P3.2 (bays rearrangeable):** `interactive-components.md`. Drag-and-drop on the bay board headers, persist per-garage.
- **P3.3 (end-of-job checklist):** `forms-and-data-entry.md` + `responsive-and-mobile.md` + `accessibility.md`. Phone-primary modal, must be done in under 15 seconds by someone wearing gloves.
- **P3.4 (KPIs on reports + staff detail):** `cognitive-load-and-information.md` + `visual-hierarchy-and-layout.md`. Three KPIs max per strip — don't build a dashboard of 15 numbers nobody reads.
- **P3.5 (/admin super_admin surfaces):** `cognitive-load-and-information.md` + `visual-hierarchy-and-layout.md` + `content-and-copy.md`. Plus vibe-security (this is a privilege-escalation surface). The impersonation banner is the most important piece of copy in the whole app — get it right.

## Todoist label + comment workflow

Every plan item carries a Todoist task ID (`6gRm…`). On completion of any item:

1. **Do NOT mark the task complete.** Hossein reviews first.
2. **Apply the `done-by-claude` label** via the Todoist API:
   - Token lives at `~/.oplaris/todoist.token` (or env var `TODOIST_TOKEN`). If absent, stop and ask Hossein.
   - First completion: create the label (see STAGING_FIX_PLAN.md > *Todoist label workflow*).
   - Then `POST` the task's `labels` array with `done-by-claude` merged in (don't replace existing labels).
3. **Always leave a Todoist comment summarising what was done.** This is a standing rule (Hossein 2026-04-25): every fix, every change, gets a written summary on the relevant Todoist task so a human reviewer can read what happened without diffing commits. Comment shape:

   ```
   POST https://api.todoist.com/api/v1/comments
   { "task_id": "<id>",
     "content": "Shipped <YYYY-MM-DD> in commit <sha>. <one-paragraph
                 plain-English summary of what changed and why, including
                 any caveats or follow-ups>. Spec:
                 docs/redesign/STAGING_FIX_PLAN.md > P<id>." }
   ```

   Length: aim for 4–8 sentences. Mention the commit SHA, the migration number if any, the user-facing change, and any "but watch out for X" the reviewer should know.

4. **Order of ops:** commit the code changes → push → then apply the label → then post the comment. Comment last so the SHA + plan-doc reference are accurate.

This rule applies equally in Cowork mode if a Cowork session is the one closing out an item.

## Starting queue — Phase 0 remaining

- **P0.3 env fixes** are operator-side (Hossein's `.env.local` + Dokploy env vars have `https:` missing `//`, and the JWT secret may be shaped wrong). You **can't fix** these on disk. Annotate the plan with `awaiting-user` and move on.
- **P0.4 bay-board realtime diagnosis.** Run the `pg_publication_rel` query from the plan via Supabase MCP. If `bookings` has `relreplident = 'f'` and `in_pub = true`, the bug is client-side in `src/lib/realtime/*`. Trace, fix with one commit, `pnpm test:rls`, push. If not, write migration 054 to fix the publication.
- **P0.5 `assign_staff_role` orphan.** `git blame` migration 025. Pick one: (a) write the RPC in a new migration, or (b) rewrite `addStaffMember` in `src/app/(app)/app/settings/staff/actions.ts:105–115` to do the direct INSERT. **Run the vibe-security audit** — this is a role-assignment path.

## Starting command to paste into your session

```
Read CLAUDE.md, docs/redesign/STAGING_FIX_PLAN.md, and docs/redesign/DESIGN_SYSTEM.md
(§§1–2). Then begin with P0.4: run the pg_publication_rel query via the Supabase
MCP (project fzczwkreixorrspwojcl), report what you find, and decide whether the
fix is server-side (new migration) or client-side (subscription filter). Apply
the fix on the staging branch, pnpm test:rls before commit, then label Todoist
task 6gRm9xgpwm9Xhvwp with done-by-claude.
```

## Escape hatches

- If the plan doc and CLAUDE.md conflict, CLAUDE.md wins. Update the plan doc to resolve.
- If Supabase MCP returns an error you can't explain, don't retry-loop. Ask Hossein.
- If a commit fails `pnpm typecheck` or `pnpm test:rls`, roll back the commit. Don't `--no-verify`.
- If a UI design feels wrong after the first pass, re-read the relevant ux-audit reference doc. Don't ship "close enough".
