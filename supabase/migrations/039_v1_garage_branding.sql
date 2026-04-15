-- 039_v1_garage_branding.sql
-- Phase 3 > V1 — Multi-garage theming infrastructure.
--
-- Every visual token that can legitimately differ per garage lives
-- here; semantic colours (success/warning/error) stay constant and
-- are NOT added to this table. `logo_url` already exists from
-- migration 019 (business details for invoices), so we only need the
-- colour + name + font tokens now.
--
-- Placeholder values for Dudley — Hossein will confirm the real
-- primary hex + logo file against their signage during Phase 5 prep.
-- The placeholder is a UK-garage-common red; auto-darken at render
-- time handles the WCAG contrast gap for text usage.

begin;

alter table public.garages
  add column if not exists brand_primary_hex text default '#3b82f6',
  add column if not exists brand_accent_hex  text,
  add column if not exists brand_name        text,
  add column if not exists brand_font        text default 'Inter';

-- Loose guardrails. Anything non-empty that starts with `#` gets
-- through; the server-side loader validates shape more strictly.
alter table public.garages
  drop constraint if exists garages_brand_primary_hex_shape;
alter table public.garages
  add constraint garages_brand_primary_hex_shape
  check (brand_primary_hex is null or brand_primary_hex ~ '^#[0-9a-fA-F]{3,8}$');

alter table public.garages
  drop constraint if exists garages_brand_accent_hex_shape;
alter table public.garages
  add constraint garages_brand_accent_hex_shape
  check (brand_accent_hex is null or brand_accent_hex ~ '^#[0-9a-fA-F]{3,8}$');

-- Seed Dudley with a placeholder red + their business name. Hossein
-- replaces with the real values during Phase 5 prep.
update public.garages
   set brand_primary_hex = coalesce(brand_primary_hex, '#D4232A'),
       brand_name        = coalesce(brand_name, 'Dudley Auto Service'),
       brand_font        = coalesce(brand_font, 'Inter')
 where slug = 'dudley';

commit;
