-- 048_p53_override_role_validation_restore.sql
--
-- Restores the P0001 role-validation block that migration 044 (the P53
-- null-`current_role` hotfix) inadvertently dropped from
-- `public.override_job_handler`.
--
-- Migration 037 (P53 original) raised `P0001 "Selected staff does not
-- hold the target role"` when `p_assign_staff_id` was set but the staff
-- row did not have the incoming target_role in its `roles[]` array.
-- Migration 044 did a full CREATE OR REPLACE to fix the null-role crash
-- and dropped that check — its comment ("role check happens via FK +
-- RLS") is wrong: `public.job_assignments` has no CHECK/FK enforcing
-- role-matching. A manager could therefore assign a mechanic to a role
-- that mechanic does not hold, bypassing the P53 security model.
--
-- Fix: CREATE OR REPLACE with 044's full body, with the 037 role-check
-- block re-inserted at its original position (just before the optional
-- direct assign). Everything else — NULL-safe `from_role` insert,
-- self-healing pass-back close-out, audit-log entry — stays as 044.
--
-- Caught by tests/rls/override_handler_rpc.test.ts >
--   `override_job_handler — target-role validation >
--    p_assign_staff_id must hold the target role, else raises P0001`.

begin;

create or replace function public.override_job_handler(
  p_job_id          uuid,
  p_target_role     private.staff_role,
  p_remove_staff_ids uuid[]      default '{}'::uuid[],
  p_assign_staff_id  uuid        default null,
  p_note            text         default null
) returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_uid          uuid := auth.uid();
  v_garage       uuid;
  v_old_role     private.staff_role;
  v_clean_note   text;
  v_passback_id  uuid;
begin
  -- 1. Manager gate.
  if not private.has_role('manager') then
    raise exception 'Only managers can override a job''s handler' using errcode = '42501';
  end if;

  -- 2. Multi-tenant check. Fetch garage + current role for the job.
  select garage_id, "current_role"
    into v_garage, v_old_role
    from public.jobs
   where id = p_job_id
     and garage_id = private.current_garage();

  if v_garage is null then
    raise exception 'Job not found or not in your garage' using errcode = '42501';
  end if;

  -- 3. Normalise the note (empty string ⇒ null).
  v_clean_note := nullif(btrim(coalesce(p_note, '')), '');

  -- 4. Close any open pass-back for the job. Stamp returned_at so the
  --    timeline shows a clean "returned" event.
  update public.job_passbacks
     set returned_at = now()
   where job_id = p_job_id
     and returned_at is null;

  -- 5. Delete off-going assignees + auto-stop their running work_logs.
  if p_remove_staff_ids is not null and array_length(p_remove_staff_ids, 1) > 0 then
    update public.work_logs
       set ended_at = now()
     where job_id  = p_job_id
       and staff_id = any(p_remove_staff_ids)
       and ended_at is null;

    delete from public.job_assignments
     where job_id  = p_job_id
       and staff_id = any(p_remove_staff_ids);
  end if;

  -- 5b. Role-validation guard (restored from 037 — dropped by 044).
  --     If we're directly assigning a staff member, enforce that they
  --     hold the target role. `job_assignments` has no FK/CHECK that
  --     captures this, so it MUST be enforced here.
  if p_assign_staff_id is not null then
    if not exists (
      select 1
        from public.staff s
       where s.id = p_assign_staff_id
         and s.garage_id = v_garage
         and s.is_active = true
         and p_target_role::text = any(coalesce(s.roles, '{}'::text[]))
    ) then
      raise exception 'Selected staff does not hold the target role'
        using errcode = 'P0001';
    end if;
  end if;

  -- 6. Optional direct assign. Role-matching enforced above (step 5b).
  if p_assign_staff_id is not null then
    insert into public.job_assignments (garage_id, job_id, staff_id)
    values (v_garage, p_job_id, p_assign_staff_id)
    on conflict (job_id, staff_id) do nothing;
  end if;

  -- 7. Flip current_role + bump updated_at.
  update public.jobs
     set "current_role" = p_target_role,
         updated_at     = now()
   where id = p_job_id;

  -- 8. Append a job_passbacks event ONLY when we have a real prior role.
  --    The `job_passbacks_roles_differ` CHECK + NOT NULL on from_role
  --    mean we can only write the event when:
  --       * v_old_role IS NOT NULL      (first-assignment case excluded), AND
  --       * v_old_role <> p_target_role (same-role overrides excluded).
  --    Everything else is captured by audit_log below.
  if v_old_role is not null and v_old_role <> p_target_role then
    insert into public.job_passbacks
      (garage_id, job_id, from_role, to_role,
       from_staff_id, to_staff_id, items, note)
    values
      (v_garage, p_job_id, v_old_role, p_target_role,
       null, p_assign_staff_id, '[]'::jsonb, v_clean_note)
    returning id into v_passback_id;
  end if;

  -- 9. Audit trail entry — always written, regardless of the passback
  --    branch. Records the three distinct cases (role-change with
  --    passback / same-role person-only / first-assignment no-prior-role)
  --    so the audit page and P54 timeline can tell them apart.
  insert into public.audit_log
    (garage_id, actor_staff_id, action, target_table, target_id, meta)
  values (
    v_garage, v_uid, 'job_handler_override', 'jobs', p_job_id,
    jsonb_build_object(
      'from_role',         v_old_role::text,               -- nullable
      'to_role',           p_target_role::text,
      'removed_staff_ids', to_jsonb(coalesce(p_remove_staff_ids, '{}'::uuid[])),
      'assigned_staff_id', to_jsonb(p_assign_staff_id),
      'note',              v_clean_note,
      'passback_id',       to_jsonb(v_passback_id),        -- null when no passback row
      'role_change',       (v_old_role is distinct from p_target_role),
      'had_prior_role',    (v_old_role is not null)
    )
  );

  return v_passback_id;
end $$;

comment on function public.override_job_handler(
  uuid, private.staff_role, uuid[], uuid, text
) is
  'P53 — Manager-only handler override. Flips jobs.current_role, removes/assigns staff, auto-stops running work_logs for removed staff, closes any open job_passbacks, appends a new job_passbacks event (only when a prior role exists AND differs) + audit_log entry. Validates p_assign_staff_id holds the target role (P0001 if not). Returns the new job_passbacks.id, or null when no pass-back row was written (first-assignment or same-role). NULL-safe on legacy jobs with current_role = NULL (see migration 044). Role-validation guard restored by migration 048.';

commit;
