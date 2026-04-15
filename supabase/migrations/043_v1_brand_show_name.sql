-- 043_v1_brand_show_name.sql
-- Phase 3 > V1 — Show/hide the business name next to the logo.
--
-- Most uploaded logos are wordmarks already (the Dudley SVG is a
-- stylised "DUDLEY AUTO"), so rendering the business name right next
-- to them is redundant. This per-garage toggle lets the manager
-- suppress the duplicate label without losing the name from the DB —
-- `brand_name` still drives ARIA alt-text, PDF headers, and the
-- public status page where no logo renders.

begin;

alter table public.garages
  add column if not exists brand_show_name boolean not null default true;

commit;
