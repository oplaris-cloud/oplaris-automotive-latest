-- 015_fix_worklog_rls.sql — Relax work_logs INSERT policy
--
-- Problem: INSERT required tech to be in job_assignments, blocking techs
-- who hadn't been explicitly assigned. Relaxed to allow any staff at the
-- same garage to log work on any job. staff_id = auth.uid() still enforced.

begin;

drop policy if exists work_logs_insert on work_logs;

create policy work_logs_insert on work_logs for insert to authenticated
  with check (
    garage_id = private.current_garage()
    and staff_id = auth.uid()
  );

commit;
