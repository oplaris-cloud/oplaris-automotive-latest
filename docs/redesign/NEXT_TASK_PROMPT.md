# Next Task — autonomous kickoff

> Paste this into any fresh Claude Code session. It self-discovers the next task from the priority list, reads the spec, executes it, and closes out — no hand-crafting per task.

---

You are continuing the Oplaris Automotive build. Do not ask me which task to do — find it yourself and execute it end-to-end.

## Discover the task

1. Read `CLAUDE.md` — architecture rules + current `Phase 2` priority line.
2. Read `docs/redesign/MASTER_PLAN.md > Part F execution order` — the strict queue of remaining work.
3. Find the **first item** in CLAUDE.md's "Remaining in priority order:" sentence that is not yet marked DONE. That is your task. Note its ID (e.g. P53, P54, P46, P38, P51.10).
4. If a dedicated kickoff file exists for that task at `docs/redesign/{TASK_ID}_KICKOFF.md`, read it — it contains the full playbook and supersedes anything below. Execute it and skip to "Close out."
5. If no kickoff file exists, proceed with the generic flow below.

## Plan before executing

1. Jump to `docs/redesign/MASTER_PLAN.md > {TASK_ID}` for the full spec + numbered acceptance criteria.
2. Read every doc the spec cross-references (e.g. `BACKEND_SPEC.md`, `DESIGN_SYSTEM.md`, `USER_FLOW_DIAGRAM.html`, visual mockups).
3. Consult the relevant `Oplaris-Skills/*/references/*.md` before touching auth / RLS / passwords / Twilio / file upload / UI. Backend changes → `vibe-security`. UI changes → `ux-audit`.
4. Sketch your implementation in one paragraph before writing code. If the spec has ambiguity, pick the option most aligned with CLAUDE.md's architecture rules and note the choice in the PR description — do not block on questions unless safety, security, or multi-tenancy is at stake.

## Execute

Apply these standards to every change:

- **Migrations** go via the Supabase MCP `apply_migration` tool. Verify with `execute_sql` using the queries the spec provides.
- **Regenerate types** (`src/lib/supabase/types.ts`) after any schema change via `mcp__supabase__generate_typescript_types`.
- **RPCs:** SECURITY DEFINER, `SET search_path=''`, caller-role gated with `private.has_role(...)`, `garage_id = private.current_garage()` multi-tenant check inside the body. Revoke EXECUTE from `public, anon`, grant to `authenticated`.
- **RLS:** every new public table ends with `ENABLE ROW LEVEL SECURITY`. Policies scoped by `garage_id`. `WITH CHECK` on every INSERT/UPDATE. No `USING (true)`.
- **Server actions:** `"use server"`, zod-validate inputs, call RPCs (never direct UPDATE for sensitive state), return `{ ok, error? }`, no silent swallows. `requireRole([...])` at the top.
- **UI:** shadcn primitives, Tailwind, RSC-first. Mobile at 375 px must work. Minimum 44×44 px touch targets. Use `useMediaQuery` for desktop/mobile variant swaps (the P52 pattern).
- **Realtime:** go through `useRealtimeRouterRefresh` — the only sanctioned `supabase.channel(` call site. Add new tables to both the `supabase_realtime` publication (migration) and `ALLOWED_TABLES` (whitelist). REPLICA IDENTITY FULL.
- **Tests first or at least same-PR:** unit for pure logic, `tests/rls/` for RPC + RLS, Playwright for end-to-end flows. Never mark a task DONE with failing tests.
- **Audit:** run the `vibe-security` audit pass for any backend change. Run `design:design-critique` for any UI change, paste the output in the PR description, fix any P1/P2 issues before declaring done.

## Close out

1. Tick every acceptance-criterion checkbox for the task in `MASTER_PLAN.md`.
2. Update the `Phase 2` priority sentence in `CLAUDE.md`: add a DONE summary line for this task (mirror the shape of the P52/P50/P51 DONE entries), strike it from the "Remaining in priority order:" list.
3. If the task subsumes other items (check the spec's "subsumes" notes), strike those too.
4. Report back with:
   - List of files changed (paths only, no diff).
   - Migration file path + RPC names, if any.
   - Test results (count passing / failing).
   - `design:design-critique` output (paste verbatim) for UI work.
   - Before/after screenshots for UI work.

## Global do-not-do

- ❌ Don't jump tasks — do only the current top remaining item. Log follow-ups for future sessions.
- ❌ Don't touch `docs/redesign/VISUAL_IMPLEMENTATION_PLAN.md` unless the task is a Phase 3 item.
- ❌ Don't write migration 034 (P51.10) until the soak ends ~2026-04-28.
- ❌ Don't mark DONE with failing tests or a known security finding.
- ❌ Don't update the git config, skip hooks, force-push, or amend commits unless explicitly asked.
- ❌ Don't write to `jobs.awaiting_passback`, `jobs.status='awaiting_mechanic'`, or the deprecated `bookings.passback_*` / `passed_from_job_id` fields — use the P51 RPCs.

## Done when

Every acceptance criterion for your task is green, `CLAUDE.md` is updated, tests pass, security + design audits are clean, and the next item in the priority list is ready for its own session.

---

**Task ID discovery, again, in one sentence:** read `CLAUDE.md > Phase 2 > Remaining in priority order:`, take the first listed item, check if `docs/redesign/{TASK_ID}_KICKOFF.md` exists, use it if it does, otherwise work from `MASTER_PLAN.md > {TASK_ID}`.
