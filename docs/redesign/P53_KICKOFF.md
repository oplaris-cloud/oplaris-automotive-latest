# P53 Kickoff Prompt — Override handler command palette

> Paste this into Claude Code at the start of the P53 session. Assumes CLAUDE.md auto-loads and P50 (realtime) + P52 (header reorg) are already shipped. Run order: P50 ✅ → P52 ✅ → **P53** → P54 → P46 → P38 → P51.10.

---

## Context

P52 shipped a static three-item "Override role" submenu (MOT tester / Mechanic / Manager) in the job-detail overflow menu. Adequate for Dudley's 3-role enum, **broken** for the real staff count — 2 testers + 5 mechanics today, 20+ per garage on the resale product. The current submenu also only addresses `jobs.current_role`, not `job_assignments` — so managers' common goal ("put Jake on this") has no UI path.

Full spec in `docs/redesign/MASTER_PLAN.md > P53`. Visual mockup at `docs/redesign/P53_OVERRIDE_DIALOG.html` — **open this in a browser before writing any UI code**, it locks the dialog shape.

**Read first, in this order:**
1. `CLAUDE.md > Phase 2` — P53 slots before P54 in the priority line.
2. `docs/redesign/MASTER_PLAN.md > P53` — full spec, RPC signature, acceptance criteria P53.1–P53.14.
3. `docs/redesign/P53_OVERRIDE_DIALOG.html` — visual layout of palette + override dialog.
4. `docs/redesign/MASTER_PLAN.md > P52` — the header pattern this plugs into (primary / secondary / overflow zones).
5. `Oplaris-Skills/vibe-security/references/database-security.md` + `authentication.md` — apply to the new RPC.
6. `Oplaris-Skills/ux-audit/references/interactive-components.md` — command-palette + modal-dialog contracts.

---

## What to build (in order — do not skip steps)

### Step 1 — Migration `037_p53_override_handler.sql`

Single RPC, SECURITY DEFINER, `SET search_path=''`. Signature:

```sql
create or replace function public.override_job_handler(
  p_job_id uuid,
  p_target_role public.staff_role_t,
  p_remove_staff_ids uuid[] default '{}',
  p_assign_staff_id uuid default null,
  p_note text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_garage uuid;
  v_old_role public.staff_role_t;
  v_passback_id uuid;
begin
  -- 1. Role gate
  if not private.has_role('manager') then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  -- 2. Multi-tenant check
  select garage_id, current_role into v_garage, v_old_role
  from public.jobs where id = p_job_id and deleted_at is null;
  if v_garage is null or v_garage <> private.current_garage() then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  -- 3. Validate p_assign_staff_id if provided
  if p_assign_staff_id is not null then
    if not exists (
      select 1 from public.staff s
      where s.id = p_assign_staff_id
        and s.garage_id = v_garage
        and p_target_role = any(s.roles)
        and s.deleted_at is null
    ) then
      raise exception 'Selected staff does not hold the target role' using errcode = 'P0001';
    end if;
  end if;

  -- 4. Delete off-going assignees + auto-stop any running timers
  if array_length(p_remove_staff_ids, 1) > 0 then
    update public.work_logs
       set completed_at = now(),
           completion_note = 'Auto-stopped by manager override'
     where job_id = p_job_id
       and technician_id = any(p_remove_staff_ids)
       and completed_at is null;

    delete from public.job_assignments
     where job_id = p_job_id and staff_id = any(p_remove_staff_ids);
  end if;

  -- 5. Insert new assignee row if requested (on-conflict no-op)
  if p_assign_staff_id is not null then
    insert into public.job_assignments (job_id, staff_id, garage_id, assigned_at)
    values (p_job_id, p_assign_staff_id, v_garage, now())
    on conflict (job_id, staff_id) do nothing;
  end if;

  -- 6. Close any open pass-back
  update public.job_passbacks
     set returned_at = now()
   where job_id = p_job_id and returned_at is null;

  -- 7. Flip current_role
  update public.jobs set current_role = p_target_role, updated_at = now()
   where id = p_job_id;

  -- 8. Insert new job_passbacks event for the override
  insert into public.job_passbacks
    (garage_id, job_id, from_role, to_role, from_staff_id, to_staff_id, items, note, created_at)
  values
    (v_garage, p_job_id, v_old_role, p_target_role, null, p_assign_staff_id,
     '[]'::jsonb, p_note, now())
  returning id into v_passback_id;

  -- 9. Audit log
  insert into public.audit_log (garage_id, actor_id, action, entity_type, entity_id, payload, at)
  values (
    v_garage, auth.uid(), 'job_handler_override', 'jobs', p_job_id,
    jsonb_build_object(
      'from_role', v_old_role, 'to_role', p_target_role,
      'removed_staff_ids', p_remove_staff_ids,
      'assigned_staff_id', p_assign_staff_id,
      'note', p_note,
      'passback_id', v_passback_id
    ),
    now()
  );

  return v_passback_id;
end;
$$;

revoke all on function public.override_job_handler from public, anon;
grant execute on function public.override_job_handler to authenticated;
```

Verify after apply:

```sql
select prosecdef, proconfig from pg_proc where proname = 'override_job_handler';
-- prosecdef true, proconfig {search_path=}

-- Forged-JWT test: non-manager caller raises 42501
-- Cross-tenant test: manager in garage A calling against job in garage B raises 42501
```

### Step 2 — Regenerate TypeScript types

`mcp__supabase__generate_typescript_types` → drop into `src/lib/supabase/types.ts`. The new RPC must appear in the `Functions` block.

### Step 3 — Server action wrapper

File: `src/app/(app)/app/jobs/[id]/actions.ts`

```ts
const overrideSchema = z.object({
  jobId: z.string().uuid(),
  targetRole: z.enum(['mot_tester', 'mechanic', 'manager']),
  removeStaffIds: z.array(z.string().uuid()).default([]),
  assignStaffId: z.string().uuid().nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

export async function overrideJobHandler(input: z.infer<typeof overrideSchema>) {
  await requireRole(['manager']);
  const parsed = overrideSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Validation failed' };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('override_job_handler', {
    p_job_id: parsed.data.jobId,
    p_target_role: parsed.data.targetRole,
    p_remove_staff_ids: parsed.data.removeStaffIds,
    p_assign_staff_id: parsed.data.assignStaffId ?? null,
    p_note: parsed.data.note?.trim() || null,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/app/jobs/${parsed.data.jobId}`);
  revalidatePath('/app/tech');
  revalidatePath('/app');
  return { ok: true, id: data as string };
}
```

### Step 4 — Command palette + override dialog UI

New component: `src/app/(app)/app/jobs/[id]/ChangeHandlerDialog.tsx`.

- Uses shadcn `Command` for the palette. Sections per the spec: `Reset to queue` (2 fixed items) + `Assign directly to a person` (grouped by role, fuzzy-searchable).
- Availability from existing `getStaffAvailability` helper (from P46). Extend if needed to include first-name-only field.
- Opens in a `Dialog` on desktop, `Drawer` on mobile (reuse `useMediaQuery` from P52).
- Picking a `Reset to queue` item opens the override confirmation dialog with Zones A/B/C per `P53_OVERRIDE_DIALOG.html`.
- Picking a person directly:
  - If their role matches current_role → simple reassign flow (one optional "remove others" toggle, then RPC call).
  - If their role doesn't match AND they're single-role → opens the override dialog with their role as the target.
  - If their role doesn't match AND they hold multiple roles → surface the friendly error toast: *"Sarah holds both mechanic + mot_tester. Use 'Return to X queue' first to set the role."*

Wire-up in the P52 overflow menu: replace the existing `Override role →` submenu (three static items) with a single `Change handler…` item that calls `setChangeHandlerOpen(true)`. Keep the rest of the overflow menu untouched.

### Step 5 — Tests

- `tests/rls/override_handler_rpc.test.ts`:
  - Manager on own garage calling against own-garage job → success, returns passback id, flips current_role, auto-stops timers.
  - Non-manager (mot_tester, mechanic) caller → raises `42501`.
  - Manager from garage A calling against job in garage B → raises `42501`.
  - `p_assign_staff_id` for a staff who doesn't hold `p_target_role` → raises `P0001`.
  - Removing a staff with an open `work_logs` row → row gets `completed_at = now()` and `completion_note = 'Auto-stopped by manager override'`.
  - Open `job_passbacks` row gets `returned_at` stamped.
  - Audit log row written with correct payload.

- `tests/unit/override-handler-action.test.ts`:
  - Zod validation rejects bad input.
  - Non-manager session is rejected before the RPC call.

- `tests/e2e/override-handler-palette.spec.ts` (Playwright):
  - Manager flow: open palette → pick `Return to MOT tester queue` → dialog opens → Jake pre-ticked → pick `Assign directly to…` → select Sarah → submit → timeline shows the override event within 2 s (realtime from P50).
  - Multi-role ambiguity: manager picks Sarah directly from the palette when Sarah holds both roles and current_role is mot_tester → friendly error toast, no write.

### Step 6 — Design critique gate

Run `design:design-critique` skill on screenshots of: palette open, override dialog default state, override dialog with "Assign directly to…" expanded, mobile `Drawer` version. Fix any P1/P2 issues. Paste output into PR description.

### Step 7 — Close out

- Mark P53.1–P53.14 as DONE in `MASTER_PLAN.md`.
- Update `CLAUDE.md > Phase 2` — strike P53 from the remaining list, add a DONE summary line with the same shape as P52's.
- **Do not update `VISUAL_IMPLEMENTATION_PLAN.md`** — the availability-pill note is logged in the P53 spec for Phase 3.

---

## Do-not-do list

- ❌ Don't leave the old three-item "Override role" submenu in place — the P52 static submenu is fully replaced by P53's palette + dialog.
- ❌ Don't let non-managers see or reach the palette. Manager-only.
- ❌ Don't silently flip `current_role` when a multi-role person is picked from the palette with role mismatch. Surface the ambiguity error.
- ❌ Don't write directly to `job_assignments`, `job_passbacks`, or `work_logs` from the Server Action — everything goes through the RPC.
- ❌ Don't forget the `on conflict (job_id, staff_id) do nothing` on the re-assign insert. Prevents 23505 if the staff is already on the job.
- ❌ Don't skip the audit log write. P54's timeline reads from it.
- ❌ Don't break the P52 overflow menu for non-manager viewers — Cancel + other overflow items must still work for everyone who can see them.

## Done when

P53.1–P53.14 all green, tests pass, design-critique output has no P1/P2 issues, the palette + override dialog work end-to-end on desktop and mobile, and `grep -rn "Override role" src/` returns zero hits outside documentation.

Report back with: migration file path, RPC name, files changed, test results, design-critique output, before/after screenshots of the overflow menu + the new palette.
