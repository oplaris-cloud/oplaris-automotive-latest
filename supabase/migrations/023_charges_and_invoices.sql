-- 023_charges_and_invoices.sql — Charges basket + quote/invoice lifecycle

begin;

-- Job charges: line items that build up the quote/invoice
create table job_charges (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages(id) on delete restrict,
  job_id uuid not null references jobs(id) on delete cascade,
  charge_type text not null check (charge_type in ('part', 'labour', 'other')),
  description text not null,
  quantity numeric(10,2) not null default 1,
  unit_price_pence integer not null,
  job_part_id uuid references job_parts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table job_charges enable row level security;

create policy job_charges_select on job_charges for select to authenticated
  using (garage_id = (select garage_id from staff where id = auth.uid()));

create policy job_charges_insert on job_charges for insert to authenticated
  with check (garage_id = (select garage_id from staff where id = auth.uid()));

create policy job_charges_update on job_charges for update to authenticated
  using (garage_id = (select garage_id from staff where id = auth.uid()));

create policy job_charges_delete on job_charges for delete to authenticated
  using (garage_id = (select garage_id from staff where id = auth.uid()));

-- Invoices: tracks the quote/invoice lifecycle per job
create table invoices (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages(id) on delete restrict,
  job_id uuid not null references jobs(id) on delete cascade,
  invoice_number text not null,
  quote_status text not null default 'draft' check (quote_status in ('draft', 'quoted', 'invoiced')),
  subtotal_pence integer not null default 0,
  vat_pence integer not null default 0,
  total_pence integer not null default 0,
  quoted_at timestamptz,
  invoiced_at timestamptz,
  pdf_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (garage_id, invoice_number)
);

alter table invoices enable row level security;

create policy invoices_select on invoices for select to authenticated
  using (garage_id = (select garage_id from staff where id = auth.uid()));

create policy invoices_insert on invoices for insert to authenticated
  with check (garage_id = (select garage_id from staff where id = auth.uid()));

create policy invoices_update on invoices for update to authenticated
  using (garage_id = (select garage_id from staff where id = auth.uid()));

commit;
