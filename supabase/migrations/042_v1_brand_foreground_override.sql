-- 042_v1_brand_foreground_override.sql
-- Phase 3 > V1 — Manager override for the button text colour.
--
-- The auto-picker in `src/lib/brand/oklch.ts` chooses black or white
-- against the brand primary based on OKLCH L. That covers 99% of
-- cases, but some brand palettes (e.g. very high chroma purples on
-- the black/white boundary) still read poorly. This column lets the
-- manager pin a specific text colour — empty means "auto".

begin;

alter table public.garages
  add column if not exists brand_primary_foreground_hex text;

alter table public.garages
  drop constraint if exists garages_brand_primary_foreground_hex_shape;
alter table public.garages
  add constraint garages_brand_primary_foreground_hex_shape
  check (
    brand_primary_foreground_hex is null
    or brand_primary_foreground_hex ~ '^#[0-9a-fA-F]{3,8}$'
  );

commit;
