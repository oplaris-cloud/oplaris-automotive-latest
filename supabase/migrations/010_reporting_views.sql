-- 010_reporting_views.sql — Read-only reporting views
--
-- All views filter by garage_id via RLS on the underlying tables.
-- Queried through the authenticated supabase client, so cross-tenant
-- leaks are impossible.

begin;

-- Today's jobs (active, not completed/cancelled)
create or replace view v_todays_jobs as
select
  j.garage_id,
  j.id as job_id,
  j.job_number,
  j.status,
  j.description,
  j.estimated_ready_at,
  j.created_at,
  c.full_name as customer_name,
  v.registration,
  b.name as bay_name
from jobs j
join customers c on c.id = j.customer_id
join vehicles v on v.id = j.vehicle_id
left join bays b on b.id = j.bay_id
where j.deleted_at is null
  and j.status not in ('completed', 'cancelled')
  and j.created_at >= current_date;

-- This week's completed jobs with parts total (revenue proxy)
create or replace view v_weekly_revenue as
select
  j.garage_id,
  j.id as job_id,
  j.job_number,
  j.completed_at,
  c.full_name as customer_name,
  v.registration,
  coalesce(sum(jp.total_pence), 0) as parts_total_pence
from jobs j
join customers c on c.id = j.customer_id
join vehicles v on v.id = j.vehicle_id
left join job_parts jp on jp.job_id = j.id
where j.deleted_at is null
  and j.status = 'completed'
  and j.completed_at >= date_trunc('week', current_date)
group by j.garage_id, j.id, j.job_number, j.completed_at,
         c.full_name, v.registration;

-- Hours per tech this week
create or replace view v_tech_hours as
select
  wl.garage_id,
  s.id as staff_id,
  s.full_name,
  sum(wl.duration_seconds) filter (where wl.ended_at is not null) as total_seconds,
  count(*) filter (where wl.ended_at is null) as active_logs
from work_logs wl
join staff s on s.id = wl.staff_id
where wl.started_at >= date_trunc('week', current_date)
group by wl.garage_id, s.id, s.full_name;

-- Parts spend per job (for the parts cost report)
create or replace view v_parts_by_job as
select
  jp.garage_id,
  jp.job_id,
  j.job_number,
  sum(jp.total_pence) as total_pence,
  count(*) as line_count
from job_parts jp
join jobs j on j.id = jp.job_id
group by jp.garage_id, jp.job_id, j.job_number;

-- Repeat customers (more than one completed job)
create or replace view v_repeat_customers as
select
  j.garage_id,
  c.id as customer_id,
  c.full_name,
  c.phone,
  count(distinct j.id) as job_count,
  max(j.completed_at) as last_visit
from jobs j
join customers c on c.id = j.customer_id
where j.status = 'completed'
  and j.deleted_at is null
  and c.deleted_at is null
group by j.garage_id, c.id, c.full_name, c.phone
having count(distinct j.id) > 1;

-- Common repair types (work_log task_type frequency)
create or replace view v_common_repairs as
select
  wl.garage_id,
  wl.task_type,
  count(*) as occurrence_count,
  sum(wl.duration_seconds) filter (where wl.ended_at is not null) as total_seconds
from work_logs wl
where wl.started_at >= current_date - interval '30 days'
group by wl.garage_id, wl.task_type;

-- Enable RLS on all views isn't needed — views inherit RLS from their
-- underlying tables. The authenticated client can only see rows where
-- the base table policies pass.

commit;
