-- 069_smtp_settings.sql — per-garage SMTP credentials
--
-- B6.2 — SMTP integration. Each tenant configures their own SMTP
-- relay (Gmail SMTP, SendGrid, Postmark, whatever). Credentials live
-- in `private.smtp_settings` with the password encrypted at rest via
-- `pgcrypto.pgp_sym_encrypt`. Decryption happens only inside the
-- SECURITY DEFINER helper `private.get_smtp_settings(p_garage_id)`,
-- which is callable solely through the `public.smtp_settings_for_send`
-- shim — itself service-role-only.
--
-- Access model:
--   - The table lives in `private`, so PostgREST never exposes it
--     directly. UPSERT happens via `public.upsert_smtp_settings(...)`
--     which gates on `is_super_admin()`. Read happens via a
--     paired listing helper that returns everything except the
--     decrypted password.
--   - The decryption helper is the only path to the plaintext, and
--     it is callable only by `service_role` (so anon JWTs can never
--     reach it via PostgREST).
--   - The encryption key comes from the GUC `app.smtp_encryption_key`
--     which the Next.js Supabase client sets per-request via the
--     server-only `SMTP_ENCRYPTION_KEY` env var. No SQL function ever
--     writes the key into the database.

begin;

-- Make absolutely sure pgcrypto is loaded — 001_init.sql does this
-- already, but a fresh checkout against a slimmer DB shouldn't fail.
create extension if not exists pgcrypto;

create table private.smtp_settings (
  garage_id          uuid primary key references public.garages(id) on delete cascade,
  host               text not null,
  port               int  not null check (port > 0 and port <= 65535),
  username           text not null,
  password_encrypted bytea not null,
  from_email         text not null,
  from_name          text not null,
  secure             boolean not null default true,
  updated_at         timestamptz not null default now()
);

-- Private schema is unreachable via PostgREST (revoked in 002).
-- We don't add any RLS policies — there's nothing to expose.

-- =============================================================================
-- Helpers
-- =============================================================================

-- public.upsert_smtp_settings — super_admin-only INSERT/UPDATE entry point
create or replace function public.upsert_smtp_settings(
  p_garage_id  uuid,
  p_host       text,
  p_port       int,
  p_username   text,
  p_password   text,                -- plaintext — never stored
  p_from_email text,
  p_from_name  text,
  p_secure     boolean,
  p_encryption_key text
)
returns void
language plpgsql
security definer
set search_path = private, public, pg_catalog
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

-- public.get_smtp_settings_meta — returns everything EXCEPT password
-- (so the super_admin /admin/settings/smtp page can render the form
-- without ever touching plaintext).
create or replace function public.get_smtp_settings_meta(p_garage_id uuid)
returns table (
  garage_id uuid,
  host text,
  port int,
  username text,
  from_email text,
  from_name text,
  secure boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = private, public
as $$
begin
  if not private.is_super_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query
    select s.garage_id, s.host, s.port, s.username,
           s.from_email, s.from_name, s.secure, s.updated_at
      from private.smtp_settings s
     where s.garage_id = p_garage_id;
end $$;

revoke all on function public.get_smtp_settings_meta(uuid)
  from public, anon;
grant execute on function public.get_smtp_settings_meta(uuid)
  to authenticated;

-- public.get_smtp_settings_for_send — returns the full creds incl.
-- decrypted password. Callable only by service_role so a leaked anon
-- JWT can't reach it. The Next.js email module uses the service-role
-- client to call this.
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
set search_path = private, public, pg_catalog
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

-- public.delete_smtp_settings — super_admin-only purge
create or replace function public.delete_smtp_settings(p_garage_id uuid)
returns void
language plpgsql
security definer
set search_path = private, public
as $$
begin
  if not private.is_super_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  delete from private.smtp_settings where garage_id = p_garage_id;
end $$;

revoke all on function public.delete_smtp_settings(uuid)
  from public, anon;
grant execute on function public.delete_smtp_settings(uuid)
  to authenticated;

commit;
