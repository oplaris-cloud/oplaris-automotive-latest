-- 062_short_links.sql
-- P2.1 (Batch 2.1) — URL shortener for SMS-friendly approval links.
--
-- Why: the approval-request SMS currently embeds a ~250-char base64
-- HMAC token straight into the body (e.g.
-- `https://<host>/api/approvals/eyJqb2JfaWQ…`), which Hossein flagged
-- 2026-04-30 — it's an API endpoint that returns JSON (not a customer
-- page), AND the URL bloats the SMS over a single 160-char segment.
--
-- The fix is two-fold:
--   * a new customer page at `/approve/<token>` that actually renders
--     the approval UI (this migration is the storage layer for the
--     short-link side; the page itself is a Next route).
--   * a 6-char id stored in `public.short_links` that the public
--     `/r/<id>` route handler 302s to the long URL. The id is sourced
--     from a 56-char alphabet (digits 2-9 + A-Z minus I,O + a-z minus
--     l,o) so it stays human-typeable for SMS dictation while giving
--     us 56^6 ≈ 30.8 billion ids — enumeration is infeasible at the
--     per-IP rate limits the rest of the public surface enforces.
--
-- The table is service-role-write / manager-read, scoped per garage.
-- The /r/<id> route handler reads via the admin client (anonymous
-- traffic carries no JWT) and refuses to redirect once `expires_at`
-- has passed, sending the visitor to a static "link expired" page.

begin;

create table if not exists public.short_links (
  id           text primary key
    check (id ~ '^[A-Za-z0-9]{6}$'),
  garage_id    uuid not null references public.garages(id) on delete cascade,
  target_url   text not null check (length(target_url) between 8 and 4096),
  purpose      text not null check (purpose in ('approval', 'status', 'invoice', 'quote')),
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  used_count   int not null default 0,
  last_used_at timestamptz
);

create index if not exists short_links_garage_idx
  on public.short_links (garage_id, created_at desc);
create index if not exists short_links_expires_idx
  on public.short_links (expires_at);

-- =============================================================================
-- RLS — manager-only read of own garage; writes locked to service_role.
-- =============================================================================

alter table public.short_links enable row level security;

drop policy if exists short_links_select_manager on public.short_links;
create policy short_links_select_manager on public.short_links
  for select to authenticated
  using (
    garage_id = private.current_garage()
    and private.has_role('manager')
  );

-- No INSERT/UPDATE/DELETE policy for authenticated — every mutation
-- goes through src/lib/sms/short-link.ts which uses the admin client.
-- The /r/<id> route handler also reads via the admin client because
-- anonymous customer visits carry no JWT.
revoke insert, update, delete on public.short_links from authenticated, anon;

comment on table public.short_links is
  'P2.1 — 6-char id → long URL redirect table. Backs `/r/<id>`. Manager-
  read for own garage; writes are service-role only via
  src/lib/sms/short-link.ts. Each row carries an explicit `expires_at`
  bound to the underlying token expiry (typically 24 h for approvals).';

commit;
