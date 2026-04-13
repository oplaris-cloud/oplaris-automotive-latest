-- 022_warranties_stock_only.sql — Drop old warranties table and rebuild as stock-only supplier warranties
-- Warranties now exclusively track supplier warranties on stock items.
-- No relation to jobs, vehicles, or job_parts.

begin;

drop table if exists warranties cascade;

create table warranties (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages(id) on delete restrict,
  stock_item_id uuid not null references stock_items(id) on delete cascade,
  supplier text not null,
  purchase_date date not null,
  expiry_date date not null,
  invoice_reference text,
  notes text,
  claim_status text not null default 'none' check (claim_status in ('none', 'claimed', 'resolved', 'rejected')),
  claim_reason text,
  claim_date timestamptz,
  claim_resolution text,
  voided_at timestamptz,
  voided_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expiry_date >= purchase_date)
);

alter table warranties enable row level security;

create policy warranties_select on warranties for select to authenticated
  using (garage_id = (select garage_id from staff where id = auth.uid()));

create policy warranties_insert on warranties for insert to authenticated
  with check (garage_id = (select garage_id from staff where id = auth.uid()));

create policy warranties_update on warranties for update to authenticated
  using (garage_id = (select garage_id from staff where id = auth.uid()));

create policy warranties_delete on warranties for delete to authenticated
  using (garage_id = (select garage_id from staff where id = auth.uid()));

commit;
