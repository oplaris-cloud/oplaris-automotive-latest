-- 024_staff_role_column.sql — Add role column to staff table for listing
-- Role was only in private.staff_roles (inaccessible via PostgREST).
-- The staff table already has INSERT/UPDATE/DELETE revoked from authenticated,
-- so adding the column here doesn't create a write path.

begin;

alter table staff add column if not exists role text;

-- Backfill from private.staff_roles
update staff s
   set role = sr.role::text
  from private.staff_roles sr
 where sr.staff_id = s.id
   and s.role is null;

-- Also update the addStaffMember insert to set role going forward.
-- The trigger from 018 handles claims sync, this is just for the listing.

commit;
