-- 044_p53_override_null_current_role_fix.sql
--
-- Bugfix: `public.override_job_handler` crashed with
--
--   null value in column "from_role" of relation "job_passbacks"
--   violates not-null constraint
--
-- Repro: a job whose jobs."current_role" is NULL (legacy rows that
-- slipped through the P51 migration-033 best-effort backfill, or any
-- job created before the column existed). The manager opens the
-- "Change handler" command palette, picks a target role, and submits.
-- Inside the RPC:
--
--   select "current_role" into v_old_role …   -- = NULL
--   if v_old_role is distinct from p_target_role then
--     insert into job_passbacks (..., from_role, ...) values (…, v_old_role, …)
--
-- NULL `is distinct from` any value, so the guard passes; the insert
-- fires with from_role = NULL; job_passbacks.from_role is NOT NULL →
-- 23502.
--
-- Fix: if there is no prior role there is no pass-back to record. Skip
-- the job_passbacks insert, record the override in audit_log with
-- from_role = null so the timeline/audit page still captures the
-- event. The RPC still returns NULL in that branch, which matches its
-- existing "role did not change" semantics and is already tolerated by
-- the caller (`overrideJobHandler` server action).
--
-- Also: defensive backfill — coalesce any remaining NULL current_role
-- rows to 'mechanic' (the same fallback P51's migration 033 used for
-- post-approval / in-repair jobs) so future overrides don't hit this
-- path at all.

begin;

-- 1. Defensive backfill of any NULL current_role rows.
update public.jobs
   set "current_role" = case
     when status in ('in_repair', 'awaiting_parts',
                     'awaiting_customer_approval',
                     'awaiting_mechanic',
                     'ready_for_collection', 'completed')
       then 'mechanic'::private.staff_role
     when status in ('draft', 'booked', 'checked_in', 'in_diagnosis')
       then 'mot_tester'::private.staff_role
     else 'mechanic'::private.staff_role
   end
 where "current_role" is null;

-- 2. Replace override_job_handler with a NULL-safe branch.
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

  -- 6. Optional direct assign (role check happens via FK + RLS).
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

revoke all on function public.override_job_handler(
  uuid, private.staff_role, uuid[], uuid, text
) from public, anon, authenticated;

grant execute on function public.override_job_handler(
  uuid, private.staff_role, uuid[], uuid, text
) to authenticated;

comment on function public.override_job_handler(
  uuid, private.staff_role, uuid[], uuid, text
) is
  'P53 — Manager-only handler override. Flips jobs.current_role, removes/assigns staff, auto-stops running work_logs for removed staff, closes any open job_passbacks, appends a new job_passbacks event (only when a prior role exists AND differs) + audit_log entry. Returns the new job_passbacks.id, or null when no pass-back row was written (first-assignment or same-role). Fixed in 044 to no longer violate job_passbacks.from_role NOT NULL on legacy jobs with current_role = NULL.';

commit;
