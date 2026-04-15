-- 037_p53_override_handler.sql
-- P53 — Single RPC behind the Change-handler command palette.
--
-- Replaces the P52 static "Override role" submenu (three enum items, no
-- assignment support) with one atomic call that can:
--   * flip jobs."current_role" to a target role,
--   * delete off-going assignees + auto-stop their running work_logs,
--   * optionally insert a new assignee,
--   * close any open job_passbacks row for the job, and
--   * append a new job_passbacks event + audit_log row for the override.
--
-- Manager-only. Multi-tenant. Atomic (one transaction, last-write-wins on
-- current_role if two managers race). Writes the job_passbacks event so the
-- P54 Job Activity timeline picks the override up for free.
--
-- Enum / column corrections vs. the original spec sketch:
--   * role enum is private.staff_role (not public.staff_role_t)
--   * staff soft-delete is represented by is_active = false, no deleted_at
--   * work_logs has ended_at + description (no completion_note column) —
--     we set ended_at = now() and leave description untouched so the
--     existing `duration_seconds` generated column stays sound
--   * audit_log columns are (actor_staff_id, action, target_table,
--     target_id, meta) — not (actor_id, entity_type, entity_id, payload)

begin;

create or replace function public.override_job_handler(
  p_job_id            uuid,
  p_target_role       private.staff_role,
  p_remove_staff_ids  uuid[] default '{}',
  p_assign_staff_id   uuid   default null,
  p_note              text   default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid          uuid := auth.uid();
  v_garage       uuid;
  v_old_role     private.staff_role;
  v_passback_id  uuid;
  v_clean_note   text := nullif(btrim(p_note), '');
begin
  -- 1. Caller must be authenticated + hold the manager role.
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if not private.has_role('manager') then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  -- 2. Multi-tenant check. Fetch garage + current role for the job.
  select garage_id, "current_role"
    into v_garage, v_old_role
    from public.jobs
   where id = p_job_id
     and deleted_at is null;

  if v_garage is null or v_garage <> private.current_garage() then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  -- 3. Validate the optional direct-assignee: same garage, active, and
  --    holds the incoming target role in their roles[] array.
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

  -- 4. Remove off-going assignees. For anyone we drop, auto-stop any
  --    open work_logs row on this job so the timer isn't left running.
  --    `one_running_log_per_staff` partial unique index would otherwise
  --    block a future start.
  if array_length(p_remove_staff_ids, 1) > 0 then
    update public.work_logs
       set ended_at = now()
     where job_id = p_job_id
       and staff_id = any(p_remove_staff_ids)
       and ended_at is null;

    delete from public.job_assignments
     where job_id = p_job_id
       and staff_id = any(p_remove_staff_ids);
  end if;

  -- 5. Insert the new assignee if provided. The primary key is
  --    (job_id, staff_id), so on-conflict-do-nothing prevents a 23505
  --    when the person was already on the job.
  if p_assign_staff_id is not null then
    insert into public.job_assignments (job_id, staff_id, garage_id, assigned_at)
    values (p_job_id, p_assign_staff_id, v_garage, now())
    on conflict (job_id, staff_id) do nothing;
  end if;

  -- 6. Close the most-recent open pass-back for this job (if any). The
  --    P51 flow guarantees at most one open row at a time.
  update public.job_passbacks
     set returned_at = now()
   where id = (
     select id from public.job_passbacks
      where job_id = p_job_id
        and returned_at is null
      order by created_at desc
      limit 1
   );

  -- 7. Flip current_role + bump updated_at.
  update public.jobs
     set "current_role" = p_target_role,
         updated_at     = now()
   where id = p_job_id;

  -- 8. Append a new job_passbacks event for the override. The
  --    `job_passbacks_roles_differ` CHECK constraint requires
  --    from_role <> to_role — if the manager opens the palette and
  --    picks the current role, step 7 is a no-op but this would still
  --    fail. Short-circuit that case: same role ⇒ no event row, no
  --    audit entry; return null (not an error — the rest of the RPC
  --    may have removed/assigned staff, which is a legitimate action).
  if v_old_role is distinct from p_target_role then
    insert into public.job_passbacks
      (garage_id, job_id, from_role, to_role,
       from_staff_id, to_staff_id, items, note)
    values
      (v_garage, p_job_id, v_old_role, p_target_role,
       null, p_assign_staff_id, '[]'::jsonb, v_clean_note)
    returning id into v_passback_id;

    -- 9. Audit trail entry for P54's timeline + the /app/audit-log page.
    insert into public.audit_log
      (garage_id, actor_staff_id, action, target_table, target_id, meta)
    values (
      v_garage, v_uid, 'job_handler_override', 'jobs', p_job_id,
      jsonb_build_object(
        'from_role', v_old_role::text,
        'to_role', p_target_role::text,
        'removed_staff_ids', to_jsonb(coalesce(p_remove_staff_ids, '{}'::uuid[])),
        'assigned_staff_id', to_jsonb(p_assign_staff_id),
        'note', v_clean_note,
        'passback_id', v_passback_id
      )
    );
  else
    -- Same-role override (person-only change). Still worth an audit
    -- entry so the history is complete.
    insert into public.audit_log
      (garage_id, actor_staff_id, action, target_table, target_id, meta)
    values (
      v_garage, v_uid, 'job_handler_override', 'jobs', p_job_id,
      jsonb_build_object(
        'from_role', v_old_role::text,
        'to_role', p_target_role::text,
        'removed_staff_ids', to_jsonb(coalesce(p_remove_staff_ids, '{}'::uuid[])),
        'assigned_staff_id', to_jsonb(p_assign_staff_id),
        'note', v_clean_note,
        'role_change', false
      )
    );
  end if;

  return v_passback_id;
end $$;

revoke all on function public.override_job_handler(
  uuid, private.staff_role, uuid[], uuid, text
) from public, anon;
grant execute on function public.override_job_handler(
  uuid, private.staff_role, uuid[], uuid, text
) to authenticated;

comment on function public.override_job_handler(
  uuid, private.staff_role, uuid[], uuid, text
) is
  'P53 — Manager-only handler override. Flips jobs.current_role, removes/assigns staff, auto-stops running work_logs for removed staff, closes any open job_passbacks, appends a new job_passbacks event + audit_log entry. Returns the new job_passbacks.id, or null if the role did not change.';

commit;
