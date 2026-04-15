-- 032_p39_parts_charges_sync_trigger.sql
-- P39.2 — keep job_charges in sync with job_parts.
--
-- Adding a part to a job must produce a corresponding "part" line in the
-- charges basket (and updates/deletes mirror). Lets the manager bill the
-- customer for parts without typing the same row twice.
--
-- Implemented as a trigger so the sync survives any code path — Server
-- Action, admin script, manual SQL — anything that mutates job_parts.

create or replace function private.sync_part_to_charge()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if (TG_OP = 'INSERT') then
    insert into public.job_charges (
      garage_id, job_id, charge_type, description, quantity,
      unit_price_pence, job_part_id
    ) values (
      NEW.garage_id, NEW.job_id, 'part',
      coalesce(NEW.description, 'Part'),
      NEW.quantity, NEW.unit_price_pence, NEW.id
    );
    return NEW;
  elsif (TG_OP = 'UPDATE') then
    update public.job_charges
       set description      = coalesce(NEW.description, 'Part'),
           quantity         = NEW.quantity,
           unit_price_pence = NEW.unit_price_pence
     where job_part_id = NEW.id;
    return NEW;
  elsif (TG_OP = 'DELETE') then
    delete from public.job_charges where job_part_id = OLD.id;
    return OLD;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_sync_part_to_charge_ins on public.job_parts;
drop trigger if exists trg_sync_part_to_charge_upd on public.job_parts;
drop trigger if exists trg_sync_part_to_charge_del on public.job_parts;

create trigger trg_sync_part_to_charge_ins
  after insert on public.job_parts
  for each row execute function private.sync_part_to_charge();

create trigger trg_sync_part_to_charge_upd
  after update on public.job_parts
  for each row execute function private.sync_part_to_charge();

create trigger trg_sync_part_to_charge_del
  after delete on public.job_parts
  for each row execute function private.sync_part_to_charge();

-- Backfill: any existing job_part without a corresponding charge row gets one.
insert into public.job_charges (garage_id, job_id, charge_type, description, quantity, unit_price_pence, job_part_id)
select p.garage_id, p.job_id, 'part', coalesce(p.description, 'Part'), p.quantity, p.unit_price_pence, p.id
  from public.job_parts p
 where not exists (
   select 1 from public.job_charges c where c.job_part_id = p.id
 );
