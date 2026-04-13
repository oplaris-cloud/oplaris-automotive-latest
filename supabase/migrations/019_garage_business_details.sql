-- 019_garage_business_details.sql — Add business details to garages for invoices

begin;

alter table garages add column if not exists labour_rate_pence integer not null default 7500;
alter table garages add column if not exists vat_number text;
alter table garages add column if not exists address_line1 text;
alter table garages add column if not exists address_line2 text;
alter table garages add column if not exists postcode text;
alter table garages add column if not exists phone text;
alter table garages add column if not exists email text;
alter table garages add column if not exists website text;
alter table garages add column if not exists logo_url text;

-- Seed Dudley's details
update garages
set
  labour_rate_pence = 7500,
  vat_number = '482 7719 52',
  address_line1 = '45 Dudley Street',
  address_line2 = 'Luton',
  postcode = 'LU2 0NP',
  phone = '01582 733036',
  email = 'info@dudleyautoservice.co.uk',
  website = 'www.dudleyautoservice.co.uk'
where slug = 'dudley';

commit;
