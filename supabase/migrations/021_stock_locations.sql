-- 021_stock_locations.sql — Managed stock locations dropdown

begin;

create table if not exists stock_locations (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages(id) on delete restrict,
  name text not null,
  created_at timestamptz not null default now(),
  unique (garage_id, name)
);

alter table stock_locations enable row level security;

create policy stock_locations_select on stock_locations for select to authenticated
  using (garage_id = (select garage_id from staff where id = auth.uid()));

create policy stock_locations_insert on stock_locations for insert to authenticated
  with check (garage_id = (select garage_id from staff where id = auth.uid()));

create policy stock_locations_update on stock_locations for update to authenticated
  using (garage_id = (select garage_id from staff where id = auth.uid()));

create policy stock_locations_delete on stock_locations for delete to authenticated
  using (garage_id = (select garage_id from staff where id = auth.uid()));

-- Migrate existing free-text locations into managed table
insert into stock_locations (garage_id, name)
select distinct si.garage_id, si.location
from stock_items si
where si.location is not null and si.location != ''
on conflict (garage_id, name) do nothing;

commit;
