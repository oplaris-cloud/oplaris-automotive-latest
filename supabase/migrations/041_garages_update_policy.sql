-- 041_garages_update_policy.sql
-- Adds a manager-scoped UPDATE policy on `public.garages`.
--
-- Until now the only RLS policy on `garages` was `garages_select`. The
-- billing settings action (`updateBillingSettings`) and the new V1
-- branding action (`updateGarageBrand`) both call
-- `supabase.from('garages').update(...)` directly; with no policy that
-- update matches zero rows *without raising an error*, so the UI
-- reported success while the DB row never changed.
--
-- Policy: manager can update their own garage's row, with the usual
-- `WITH CHECK` guard so they can't reassign `id` onto another garage.

begin;

drop policy if exists garages_update_manager on public.garages;
create policy garages_update_manager on public.garages
  for update to authenticated
  using (
    id = private.current_garage() and private.has_role('manager')
  )
  with check (
    id = private.current_garage() and private.has_role('manager')
  );

commit;
