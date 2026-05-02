-- 070_smtp_settings_extension_path.sql — pgcrypto search_path fix
--
-- Migration 069 set the SECURITY DEFINER helpers' search_path to
-- `private, public, pg_catalog`. pgcrypto's `pgp_sym_*` functions
-- live in the `extensions` schema on Supabase, so the encrypt /
-- decrypt calls failed with "function does not exist".
--
-- Fix: include `extensions` in every helper's search_path.

begin;

create or replace function public.upsert_smtp_settings(
  p_garage_id  uuid,
  p_host       text,
  p_port       int,
  p_username   text,
  p_password   text,
  p_from_email text,
  p_from_name  text,
  p_secure     boolean,
  p_encryption_key text
)
returns void
language plpgsql
security definer
set search_path = private, public, extensions, pg_catalog
as $$
begin
  if not private.is_super_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_encryption_key is null or length(p_encryption_key) = 0 then
    raise exception 'encryption key required' using errcode = '22023';
  end if;
  if p_port is null or p_port <= 0 or p_port > 65535 then
    raise exception 'invalid port' using errcode = '22023';
  end if;

  insert into private.smtp_settings (
    garage_id, host, port, username, password_encrypted,
    from_email, from_name, secure, updated_at
  )
  values (
    p_garage_id,
    p_host,
    p_port,
    p_username,
    pgp_sym_encrypt(p_password, p_encryption_key),
    p_from_email,
    p_from_name,
    coalesce(p_secure, true),
    now()
  )
  on conflict (garage_id) do update set
    host = excluded.host,
    port = excluded.port,
    username = excluded.username,
    password_encrypted = excluded.password_encrypted,
    from_email = excluded.from_email,
    from_name = excluded.from_name,
    secure = excluded.secure,
    updated_at = now();
end $$;

revoke all on function public.upsert_smtp_settings(
  uuid, text, int, text, text, text, text, boolean, text
) from public, anon;
grant execute on function public.upsert_smtp_settings(
  uuid, text, int, text, text, text, text, boolean, text
) to authenticated;

create or replace function public.get_smtp_settings_for_send(
  p_garage_id uuid,
  p_encryption_key text
)
returns table (
  host text,
  port int,
  username text,
  password text,
  from_email text,
  from_name text,
  secure boolean
)
language plpgsql
security definer
set search_path = private, public, extensions, pg_catalog
as $$
begin
  return query
    select s.host, s.port, s.username,
           pgp_sym_decrypt(s.password_encrypted, p_encryption_key) as password,
           s.from_email, s.from_name, s.secure
      from private.smtp_settings s
     where s.garage_id = p_garage_id;
end $$;

revoke all on function public.get_smtp_settings_for_send(uuid, text)
  from public, anon, authenticated;
grant execute on function public.get_smtp_settings_for_send(uuid, text)
  to service_role;

commit;
