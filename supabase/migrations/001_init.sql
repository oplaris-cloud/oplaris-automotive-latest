-- 001_init.sql — Oplaris Automotive schema v1
-- Source of truth: docs/redesign/BACKEND_SPEC.md §1
-- Multi-tenant from day one. Every domain table carries garage_id.
-- RLS is enabled in 002_rls.sql; the safety-net loop at the bottom of this
-- file ensures no public table ever escapes RLS even if 002 is forgotten.

begin;

create extension if not exists pgcrypto;
create extension if not exists citext;
create extension if not exists pg_trgm;

create schema if not exists private;

-- =============================================================================
-- 1.1 Tenancy & identity
-- =============================================================================

create table garages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  timezone text not null default 'Europe/London',
  twilio_from_number text,
  status_subdomain text unique,
  created_at timestamptz not null default now()
);

create table staff (
  id uuid primary key references auth.users(id) on delete cascade,
  garage_id uuid not null references garages(id) on delete restrict,
  full_name text not null,
  email citext not null,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (garage_id, email)
);
create index staff_garage_idx on staff (garage_id) where is_active;

create type private.staff_role as enum ('manager', 'mot_tester', 'mechanic');

create table private.staff_roles (
  staff_id uuid primary key references staff(id) on delete cascade,
  garage_id uuid not null references garages(id) on delete cascade,
  role private.staff_role not null
);

-- Per-garage job number sequence (server-side only)
create table private.job_number_seq (
  garage_id uuid primary key references garages(id) on delete cascade,
  prefix text not null,                  -- e.g. 'DUD'
  year int not null,
  next_value int not null default 1
);

-- =============================================================================
-- 1.2 Customers, vehicles, history
-- =============================================================================

create table customers (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages(id) on delete restrict,
  full_name text not null,
  phone text not null,
  email citext,
  address_line1 text,
  address_line2 text,
  postcode text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index customers_garage_phone_uq
  on customers (garage_id, phone) where deleted_at is null;
create index customers_garage_phone_idx
  on customers (garage_id, phone) where deleted_at is null;
create index customers_name_trgm_idx
  on customers using gin (full_name gin_trgm_ops);

create table vehicles (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages(id) on delete restrict,
  customer_id uuid not null references customers(id) on delete restrict,
  registration text not null,
  make text,
  model text,
  year int,
  vin text,
  colour text,
  mileage int,
  notes text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index vehicles_garage_reg_uq
  on vehicles (garage_id, registration) where deleted_at is null;
create index vehicles_customer_idx on vehicles (customer_id) where deleted_at is null;

create table mot_history_cache (
  vehicle_id uuid primary key references vehicles(id) on delete cascade,
  garage_id uuid not null references garages(id) on delete cascade,
  fetched_at timestamptz not null default now(),
  payload jsonb not null
);

-- =============================================================================
-- 1.3 Bays, jobs, time tracking
-- =============================================================================

create table bays (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages(id) on delete cascade,
  name text not null,
  position int not null,
  capability text[] not null default '{}',
  unique (garage_id, name)
);

create type job_status as enum (
  'draft', 'booked', 'in_diagnosis', 'in_repair', 'awaiting_parts',
  'awaiting_customer_approval', 'ready_for_collection', 'completed', 'cancelled'
);

create type job_source as enum ('manager', 'kiosk', 'online', 'phone', 'walk_in');

create table jobs (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages(id) on delete restrict,
  job_number text not null,
  customer_id uuid not null references customers(id),
  vehicle_id uuid not null references vehicles(id),
  bay_id uuid references bays(id),
  status job_status not null default 'draft',
  source job_source not null default 'manager',
  description text,
  estimated_ready_at timestamptz,
  created_by uuid references staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  deleted_at timestamptz,
  unique (garage_id, job_number)
);
create index jobs_garage_status_idx
  on jobs (garage_id, status) where deleted_at is null;
create index jobs_garage_bay_idx
  on jobs (garage_id, bay_id) where status not in ('completed', 'cancelled');
create index jobs_garage_vehicle_completed_idx
  on jobs (garage_id, vehicle_id, completed_at desc) where status = 'completed';

create table job_assignments (
  job_id uuid not null references jobs(id) on delete cascade,
  staff_id uuid not null references staff(id) on delete restrict,
  garage_id uuid not null references garages(id),
  assigned_at timestamptz not null default now(),
  primary key (job_id, staff_id)
);
create index job_assignments_staff_idx on job_assignments (staff_id);

create type work_task_type as enum (
  'diagnosis', 'engine', 'brakes', 'electrical', 'suspension',
  'tyres', 'mot_test', 'testing', 'other'
);

create table work_logs (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages(id),
  job_id uuid not null references jobs(id) on delete cascade,
  staff_id uuid not null references staff(id),
  task_type work_task_type not null,
  description text,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_seconds int generated always as (
    case when ended_at is null then null
         else extract(epoch from (ended_at - started_at))::int end
  ) stored
);
create index work_logs_garage_job_idx on work_logs (garage_id, job_id);
create unique index one_running_log_per_staff
  on work_logs (staff_id) where ended_at is null;

-- =============================================================================
-- 1.4 Parts
-- =============================================================================

create type part_supplier as enum ('ecp', 'gsf', 'atoz', 'ebay', 'other');
create type payment_method as enum ('cash', 'card', 'bank_transfer');

create table job_parts (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages(id),
  job_id uuid not null references jobs(id) on delete cascade,
  added_by uuid not null references staff(id),
  description text not null,
  supplier part_supplier not null,
  supplier_other text,
  unit_price_pence int not null check (unit_price_pence >= 0),
  quantity int not null default 1 check (quantity > 0),
  total_pence int generated always as (unit_price_pence * quantity) stored,
  purchased_at timestamptz not null,
  payment_method payment_method not null,
  invoice_file_path text,
  notes text,
  created_at timestamptz not null default now(),
  check (supplier <> 'other' or supplier_other is not null)
);
create index job_parts_garage_job_idx on job_parts (garage_id, job_id);

-- =============================================================================
-- 1.5 Customer approvals
-- =============================================================================

create type approval_status as enum ('pending', 'approved', 'declined', 'expired');

create table approval_requests (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages(id),
  job_id uuid not null references jobs(id) on delete cascade,
  requested_by uuid not null references staff(id),
  customer_id uuid not null references customers(id),
  description text not null,
  amount_pence int not null check (amount_pence >= 0),
  token_hash text not null,
  expires_at timestamptz not null,
  status approval_status not null default 'pending',
  responded_at timestamptz,
  responded_ip inet,
  responded_user_agent text,
  created_at timestamptz not null default now()
);
create index approval_requests_garage_job_idx
  on approval_requests (garage_id, job_id);
create unique index approval_requests_token_hash_uq
  on approval_requests (token_hash);

-- =============================================================================
-- 1.6 Warranties
-- =============================================================================

create table warranties (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages(id),
  job_id uuid not null references jobs(id) on delete cascade,
  vehicle_id uuid not null references vehicles(id),
  description text not null,
  starts_on date not null,
  expires_on date not null,
  mileage_limit int,
  starting_mileage int,
  voided_at timestamptz,
  voided_reason text,
  created_at timestamptz not null default now(),
  check (expires_on >= starts_on)
);
create index warranties_garage_vehicle_active_idx
  on warranties (garage_id, vehicle_id) where voided_at is null;

-- =============================================================================
-- 1.7 Stock (M2)
-- =============================================================================

create table stock_items (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages(id),
  sku text,
  description text not null,
  quantity_on_hand int not null default 0,
  reorder_point int,
  unit_cost_pence int,
  location text,
  updated_at timestamptz not null default now(),
  unique (garage_id, sku)
);

create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages(id),
  stock_item_id uuid not null references stock_items(id),
  job_id uuid references jobs(id),
  delta int not null,
  reason text,
  staff_id uuid references staff(id),
  created_at timestamptz not null default now()
);
create index stock_movements_garage_item_idx
  on stock_movements (garage_id, stock_item_id);

-- =============================================================================
-- 1.8 Customer status page (PRIVATE schema — never PostgREST-exposed)
-- =============================================================================

create table private.status_codes (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages(id),
  vehicle_id uuid references vehicles(id),
  phone_hash text not null,
  reg_hash text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  ip inet
);
create index status_codes_phone_idx
  on private.status_codes (phone_hash, expires_at);

create table private.rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (bucket, window_start)
);

-- =============================================================================
-- 1.9 Bookings (kiosk + online)
-- =============================================================================

create type booking_service as enum ('mot', 'electrical', 'maintenance');

create table bookings (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages(id),
  source job_source not null,
  service booking_service not null,
  customer_name text not null,
  customer_phone text not null,
  customer_email citext,
  registration text not null,
  make text,
  model text,
  preferred_date date,
  notes text,
  job_id uuid references jobs(id),
  created_at timestamptz not null default now(),
  ip inet,
  user_agent text
);
create index bookings_garage_pending_idx
  on bookings (garage_id, created_at desc) where job_id is null;

-- =============================================================================
-- 1.10 GDPR + audit
-- =============================================================================

create table audit_log (
  id bigserial primary key,
  garage_id uuid not null references garages(id),
  actor_staff_id uuid references staff(id),
  actor_ip inet,
  action text not null,
  target_table text,
  target_id uuid,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_garage_created_idx
  on audit_log (garage_id, created_at desc);
create index audit_log_target_idx
  on audit_log (target_table, target_id);

-- =============================================================================
-- updated_at triggers
-- =============================================================================

create or replace function private.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger customers_touch before update on customers
  for each row execute function private.touch_updated_at();
create trigger jobs_touch before update on jobs
  for each row execute function private.touch_updated_at();
create trigger stock_items_touch before update on stock_items
  for each row execute function private.touch_updated_at();

-- =============================================================================
-- 1.11 Migration tail — RLS safety net
-- =============================================================================

do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security;', r.tablename);
  end loop;
end $$;

commit;
