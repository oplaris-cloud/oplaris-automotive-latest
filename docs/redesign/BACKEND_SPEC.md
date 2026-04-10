# BACKEND_SPEC.md — Oplaris Automotive

> Authoritative backend architecture. Generated via plan-generator Module B and hardened against vibe-security audit. Every line here is normative — if code disagrees with this doc, the code is wrong.

**Stack:** Next.js 15 App Router · TypeScript strict · self-hosted Supabase (Postgres 15) · Dokploy · Twilio · DVSA MOT API
**Multi-tenant from day one.** Every domain row carries `garage_id`. Dudley = one row in `garages`.

---

## 1. Schema

All tables in `public` unless noted. Primary keys `uuid default gen_random_uuid()`. Timestamps `timestamptz default now()`. Soft-delete via `deleted_at timestamptz` where noted (S).

### 1.1 Tenancy & identity

```sql
-- Garages (tenants)
create table garages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  timezone text not null default 'Europe/London',
  twilio_from_number text,            -- per-tenant Twilio sender
  status_subdomain text unique,        -- e.g. 'dudley' -> dudley.status.oplaris.app
  created_at timestamptz default now()
);

-- Staff users (mirrors auth.users 1:1, scoped to a garage)
create table staff (
  id uuid primary key references auth.users(id) on delete cascade,
  garage_id uuid not null references garages(id) on delete restrict,
  full_name text not null,
  email citext not null,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  unique (garage_id, email)
);

-- Roles live in PRIVATE schema so users can't self-promote
create schema if not exists private;
create type private.staff_role as enum ('manager','mot_tester','mechanic');
create table private.staff_roles (
  staff_id uuid primary key references staff(id) on delete cascade,
  garage_id uuid not null references garages(id) on delete cascade,
  role private.staff_role not null
);
```

A Supabase Auth Hook copies `garage_id` and `role` into the JWT custom claims (`app_metadata.garage_id`, `app_metadata.role`) on every login. RLS reads from JWT, never from a table the user can write.

### 1.2 Customers, vehicles, history

```sql
create table customers (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages(id) on delete restrict,
  full_name text not null,
  phone text not null,                 -- E.164, normalised on write
  email citext,
  address_line1 text, address_line2 text, postcode text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz,              -- S
  unique (garage_id, phone) deferrable initially deferred
);
create index on customers (garage_id, phone) where deleted_at is null;
create index on customers using gin (full_name gin_trgm_ops);

create table vehicles (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages(id) on delete restrict,
  customer_id uuid not null references customers(id) on delete restrict,
  registration text not null,           -- normalised UPPER, no spaces
  make text, model text, year int,
  vin text, colour text, mileage int,
  notes text,
  created_at timestamptz default now(),
  deleted_at timestamptz,               -- S
  unique (garage_id, registration) deferrable initially deferred
);
create index on vehicles (garage_id, registration) where deleted_at is null;

-- DVSA cache (cheap, audit-friendly)
create table mot_history_cache (
  vehicle_id uuid primary key references vehicles(id) on delete cascade,
  garage_id uuid not null references garages(id),
  fetched_at timestamptz not null default now(),
  payload jsonb not null               -- raw DVSA response
);
```

### 1.3 Bays, jobs, time tracking

```sql
create table bays (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages(id) on delete cascade,
  name text not null,                   -- "Bay 1 MOT", etc.
  position int not null,
  capability text[] not null default '{}', -- ['mot'], ['ramp'], ['ramp','tyres'], ['electrical']
  unique (garage_id, name)
);

create type job_status as enum (
  'draft','booked','in_diagnosis','in_repair','awaiting_parts',
  'awaiting_customer_approval','ready_for_collection','completed','cancelled'
);
create type job_source as enum ('manager','kiosk','online','phone','walk_in');

create table jobs (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages(id) on delete restrict,
  job_number text not null,             -- human-facing, e.g. "DUD-2026-00417"
  customer_id uuid not null references customers(id),
  vehicle_id uuid not null references vehicles(id),
  bay_id uuid references bays(id),
  status job_status not null default 'draft',
  source job_source not null default 'manager',
  description text,
  estimated_ready_at timestamptz,
  created_by uuid references staff(id), -- null if from kiosk/online
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  completed_at timestamptz,
  deleted_at timestamptz,               -- S
  unique (garage_id, job_number)
);
create index on jobs (garage_id, status) where deleted_at is null;
create index on jobs (garage_id, bay_id) where status not in ('completed','cancelled');

create table job_assignments (
  job_id uuid references jobs(id) on delete cascade,
  staff_id uuid references staff(id) on delete restrict,
  garage_id uuid not null references garages(id),
  assigned_at timestamptz default now(),
  primary key (job_id, staff_id)
);

create type work_task_type as enum (
  'diagnosis','engine','brakes','electrical','suspension','tyres','mot_test','testing','other'
);
create table work_logs (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages(id),
  job_id uuid not null references jobs(id) on delete cascade,
  staff_id uuid not null references staff(id),
  task_type work_task_type not null,
  description text,
  started_at timestamptz not null,
  ended_at timestamptz,                 -- null = currently running
  duration_seconds int generated always as
    (case when ended_at is null then null
          else extract(epoch from (ended_at - started_at))::int end) stored
);
create index on work_logs (garage_id, job_id);
create unique index one_running_log_per_staff on work_logs (staff_id) where ended_at is null;
```

Job number generation: `SECURITY DEFINER` function `private.next_job_number(garage_id)` using a per-garage sequence table. Never client-supplied.

### 1.4 Parts

```sql
create type part_supplier as enum ('ecp','gsf','atoz','ebay','other');
create type payment_method as enum ('cash','card','bank_transfer');

create table job_parts (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages(id),
  job_id uuid not null references jobs(id) on delete cascade,
  added_by uuid not null references staff(id),
  description text not null,
  supplier part_supplier not null,
  supplier_other text,                  -- required if supplier='other'
  unit_price_pence int not null check (unit_price_pence >= 0),
  quantity int not null default 1 check (quantity > 0),
  total_pence int generated always as (unit_price_pence * quantity) stored,
  purchased_at timestamptz not null,
  payment_method payment_method not null,
  invoice_file_path text,               -- key into storage bucket parts-invoices
  notes text,
  created_at timestamptz default now()
);
create index on job_parts (garage_id, job_id);
```

### 1.5 Customer approvals (the dispute killer)

```sql
create type approval_status as enum ('pending','approved','declined','expired');

create table approval_requests (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages(id),
  job_id uuid not null references jobs(id) on delete cascade,
  requested_by uuid not null references staff(id),
  customer_id uuid not null references customers(id),
  description text not null,            -- "Brake discs need replacing, £180"
  amount_pence int not null check (amount_pence >= 0),
  token_hash text not null,             -- sha256 of HMAC-signed token
  expires_at timestamptz not null,      -- now() + 24h
  status approval_status not null default 'pending',
  responded_at timestamptz,
  responded_ip inet,
  responded_user_agent text,
  created_at timestamptz default now()
);
create index on approval_requests (garage_id, job_id);
create unique index on approval_requests (token_hash);
```

Token format: `base64url( job_id . request_id . expires_at . nonce ) . base64url(HMAC_SHA256(secret, payload))`. Stored as `sha256(token)` in `token_hash` for constant-time lookup. Single-use: `update ... set status = 'approved', responded_at = now() where token_hash = $1 and status = 'pending' and expires_at > now()`.

### 1.6 Warranties

```sql
create table warranties (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages(id),
  job_id uuid not null references jobs(id) on delete cascade,
  vehicle_id uuid not null references vehicles(id),
  description text not null,            -- "Brake disc replacement"
  starts_on date not null,
  expires_on date not null,
  mileage_limit int,                    -- e.g. 12000
  starting_mileage int,
  voided_at timestamptz, voided_reason text,
  created_at timestamptz default now()
);
create index on warranties (garage_id, vehicle_id) where voided_at is null;
```

### 1.7 Stock (M2 — scope confirmed day 7)

```sql
create table stock_items (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages(id),
  sku text,
  description text not null,
  quantity_on_hand int not null default 0,
  reorder_point int,
  unit_cost_pence int,
  location text,
  updated_at timestamptz default now(),
  unique (garage_id, sku)
);

create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages(id),
  stock_item_id uuid not null references stock_items(id),
  job_id uuid references jobs(id),
  delta int not null,                   -- negative = used, positive = restock
  reason text,
  staff_id uuid references staff(id),
  created_at timestamptz default now()
);
```

### 1.8 Customer status page (public-facing, hostile internet)

```sql
-- Anti-enumeration: codes live in private schema, never exposed to PostgREST
create table private.status_codes (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages(id),
  vehicle_id uuid references vehicles(id),  -- null if reg/phone didn't match
  phone_hash text not null,             -- sha256(normalised_phone) — never store raw
  reg_hash text not null,
  code_hash text not null,              -- sha256(6-digit code)
  expires_at timestamptz not null,      -- now() + 10 minutes
  consumed_at timestamptz,
  created_at timestamptz default now(),
  ip inet
);
create index on private.status_codes (phone_hash, expires_at);

-- Rate limit counters in private schema (NOT public — users would reset their own)
create table private.rate_limits (
  bucket text not null,                 -- 'status_phone:+447...' or 'status_ip:1.2.3.4'
  window_start timestamptz not null,
  count int not null default 0,
  primary key (bucket, window_start)
);
```

### 1.9 Bookings (kiosk + online)

```sql
create type booking_service as enum ('mot','electrical','maintenance');

create table bookings (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages(id),
  source job_source not null,           -- 'kiosk' | 'online'
  service booking_service not null,
  customer_name text not null,
  customer_phone text not null,
  customer_email citext,
  registration text not null,
  make text, model text,
  preferred_date date,
  notes text,
  job_id uuid references jobs(id),      -- set when manager promotes to a job
  created_at timestamptz default now(),
  ip inet,                              -- for kiosk fraud audit
  user_agent text
);
create index on bookings (garage_id, created_at desc) where job_id is null;
```

### 1.10 GDPR + audit

```sql
create table audit_log (
  id bigserial primary key,
  garage_id uuid not null references garages(id),
  actor_staff_id uuid references staff(id),
  actor_ip inet,
  action text not null,                 -- 'view_customer','export_customer','delete_job',...
  target_table text,
  target_id uuid,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index on audit_log (garage_id, created_at desc);
create index on audit_log (target_table, target_id);
```

### 1.11 Migration tail (safety net)

Every migration ends with:

```sql
do $$ declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security;', r.tablename);
  end loop;
end $$;
```

---

## 2. Row-Level Security

### 2.1 Helper

```sql
create or replace function private.current_garage() returns uuid
language sql stable as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'garage_id')::uuid,
    null
  )
$$;

create or replace function private.current_role() returns text
language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')
$$;
```

### 2.2 Standard tenant policy template

For every domain table (`customers`, `vehicles`, `jobs`, `job_parts`, `work_logs`, `bookings`, `warranties`, `stock_items`, `stock_movements`, `audit_log`):

```sql
alter table customers enable row level security;

create policy customers_select on customers for select to authenticated
  using (garage_id = private.current_garage() and deleted_at is null);

create policy customers_insert on customers for insert to authenticated
  with check (garage_id = private.current_garage());

create policy customers_update on customers for update to authenticated
  using (garage_id = private.current_garage())
  with check (garage_id = private.current_garage());

-- No DELETE policy. Hard-delete only via private.purge_customer() function.
```

### 2.3 Mechanic isolation

Mechanics see **only the jobs they're assigned to**. Add a stricter overlay on `jobs` and dependents:

```sql
create policy jobs_select_mechanic on jobs for select to authenticated
  using (
    garage_id = private.current_garage()
    and (
      private.current_role() in ('manager','mot_tester')
      or exists (
        select 1 from job_assignments ja
        where ja.job_id = jobs.id and ja.staff_id = auth.uid()
      )
    )
    and deleted_at is null
  );
```

Same overlay on `job_parts`, `work_logs`, `approval_requests` (where `job_id` ties back).

### 2.4 Sensitive columns locked down

```sql
revoke insert, update on staff from authenticated;
grant update (full_name, phone) on staff to authenticated;
-- garage_id and role mutations only via private.* functions called by managers
```

### 2.5 Storage bucket: `parts-invoices`

```sql
-- Bucket created private. Path convention: {garage_id}/{job_id}/{uuid}.{ext}

create policy parts_invoices_read on storage.objects for select to authenticated
  using (
    bucket_id = 'parts-invoices'
    and (storage.foldername(name))[1] = private.current_garage()::text
    and exists (
      select 1 from jobs j
      where j.id::text = (storage.foldername(name))[2]
        and j.garage_id = private.current_garage()
        and (
          private.current_role() in ('manager','mot_tester')
          or exists (select 1 from job_assignments ja where ja.job_id = j.id and ja.staff_id = auth.uid())
        )
    )
  );

create policy parts_invoices_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'parts-invoices'
    and (storage.foldername(name))[1] = private.current_garage()::text
  );
```

Server-side upload handler additionally enforces: file size ≤ 10 MB, MIME ∈ {pdf,jpeg,png}, magic-byte check via `file-type` package.

### 2.6 Public endpoints (status page, kiosk, approvals)

These do **not** use Supabase auth at all. They are Next.js Route Handlers that use the `service_role` key **server-side only** and enforce all rules in TypeScript + parameterised SQL. They never accept a `garage_id` from the client — `garage_id` is resolved from the request hostname (`status_subdomain` lookup).

---

## 3. API surface

All mutations are Server Actions or Route Handlers. No direct client→Postgres for anything sensitive. Read queries can use the Supabase JS client with anon key + RLS.

### 3.1 Server Actions (app-internal, authenticated)

| Action | Inputs | Auth | Notes |
|---|---|---|---|
| `createCustomer` | name, phone, email? | manager | normalises phone, dedupes by phone |
| `createVehicle` | customer_id, reg, make, model | manager | normalises reg |
| `createJob` | customer_id, vehicle_id, description | manager | generates job_number |
| `assignBay` | job_id, bay_id | manager | |
| `assignTech` | job_id, staff_id | manager | |
| `startWork` | job_id, task_type, description | mechanic/mot_tester | enforces "one running log per staff" |
| `pauseWork` | work_log_id | mechanic/mot_tester | |
| `completeWork` | work_log_id | mechanic/mot_tester | |
| `requestApproval` | job_id, description, amount_pence | mechanic/mot_tester | generates token, sends Twilio SMS |
| `addJobPart` | job_id, ...parts fields, file? | any tech on job | uploads file with magic-byte check |
| `generateJobSheet` | job_id | manager | returns signed URL to PDF |
| `markReadyForCollection` | job_id | manager | sends Twilio SMS to customer |
| `markCompleted` | job_id, warranty? | manager | optionally creates warranty row |
| `softDeleteCustomer` | customer_id | manager | sets deleted_at |
| `exportCustomer` | customer_id | manager | calls private.customer_data_export |

### 3.2 Route Handlers (public, no auth)

| Path | Method | Purpose |
|---|---|---|
| `/api/kiosk/booking` | POST | Tablet kiosk booking. CSRF: kiosk auth via per-device long-lived signed cookie issued by manager. |
| `/api/online/booking` | POST | Public booking form. hCaptcha required. Rate limited 5/IP/hour. |
| `/api/status/request-code` | POST | reg + phone → SMS code. Constant-time response, rate limited 3/phone/hr + 10/IP/hr. |
| `/api/status/verify-code` | POST | code → returns ephemeral session cookie scoped to that vehicle. |
| `/api/status/state` | GET | Reads job state from cookie. No PII beyond status + ETA. |
| `/api/approvals/[token]` | GET | Renders approval page. |
| `/api/approvals/[token]` | POST | Records approve/decline. Single-use, constant-time, IP+UA logged. |
| `/api/twilio/status` | POST | Twilio status callback. **Must verify `X-Twilio-Signature`.** |
| `/api/dvsa/refresh` | POST | Manager-triggered DVSA history fetch. Cached 24h. |

### 3.3 Background jobs (`pg_cron` + Edge Functions)

| Job | Schedule | Purpose |
|---|---|---|
| `expire_approvals` | every 5 min | mark `pending` → `expired` past `expires_at` |
| `expire_status_codes` | every minute | delete expired `private.status_codes` |
| `purge_rate_limits` | every 10 min | drop windows older than 1h |
| `hard_delete_soft_deleted` | nightly 03:00 | hard-delete rows with `deleted_at < now() - 30 days` |
| `nightly_pgdump` | nightly 02:00 | encrypted dump → off-site (rclone) |
| `warranty_warning_refresh` | nightly | materialised view of active warranties for fast lookup |

---

## 4. Security checklist (vibe-security pass)

**Critical (must pass before any PR merges):**
- [ ] Service role key never in `NEXT_PUBLIC_*`. Only in Server Actions / Route Handlers.
- [ ] Every table in `public` has RLS enabled (migration tail loop).
- [ ] No `USING (true)` or `USING (auth.uid() IS NOT NULL)` anywhere.
- [ ] Every INSERT/UPDATE policy has `WITH CHECK`.
- [ ] `garage_id` is **never** writable by `authenticated` role on any table.
- [ ] `private.staff_roles` is not exposed via PostgREST.
- [ ] Twilio webhook handlers verify `X-Twilio-Signature` before any DB write.
- [ ] Approval tokens stored as `sha256(token)`, compared in constant time.
- [ ] Status page returns identical response shape + timing for hit/miss.
- [ ] Rate limit counters live in `private` schema, not `public`.
- [ ] File uploads enforce size + MIME + magic-byte check server-side.
- [ ] Storage RLS scopes objects to `garage_id/job_id` path.
- [ ] No SQL string concatenation; all queries parameterised or via Supabase client.
- [ ] hCaptcha on all public POST endpoints (except kiosk).
- [ ] Passwords: NIST 800-63B, k-anonymity check against Pwned Passwords.
- [ ] CSP header set; `frame-ancestors 'none'` on app, kiosk allowed only on kiosk subdomain.
- [ ] Source maps not deployed to production.
- [ ] `.env*` in `.gitignore`.

**High:**
- [ ] CSRF: Server Actions are CSRF-safe by Next.js default; Route Handlers use double-submit cookie.
- [ ] Audit log row written for every customer/vehicle read by staff (use a `SECURITY DEFINER` view that logs on access).
- [ ] DVSA API key server-side only, cached 24h to avoid rate-limit lockout.
- [ ] Twilio: per-tenant `from` number; no cross-tenant SMS possible.
- [ ] Job number is server-generated, not client-supplied.
- [ ] All UUIDs in URLs, no sequential IDs.

---

## 5. Performance + indexes

- Hot reads: `(garage_id, status)` on `jobs`, `(garage_id, registration)` on `vehicles`, `(garage_id, phone)` on `customers` — all already covered.
- Bay board query: single Postgres query joining `jobs` + active `work_logs` + assigned `staff`, ordered by `bay.position`. Target < 50 ms with 10k jobs.
- Customer history: `(garage_id, vehicle_id, completed_at desc)` partial index on `jobs where status = 'completed'`.
- DVSA cache: 24h freshness, refreshed lazily on job creation.
- PDF generation: server-side, streamed, cached to storage by `(job_id, content_hash)` so re-downloads are free.

---

## 6. Anti-patterns (banned)

- **No `service_role` key on the client. Ever.** Audit on every PR.
- **No `useEffect` to fetch data.** Server components + Server Actions only.
- **No business logic in client components.** Status transitions, price calculations, role checks — server-side.
- **No `JSON.parse` on request bodies without zod validation.**
- **No raw SQL string interpolation.** Parameterised or `sql\`` template tag.
- **No "soft" rate limits that warn but don't block.**
- **No password recovery via security questions.** Email magic link only.

---

## 7. Pre-ship checklist

- [ ] All Critical security items above pass
- [ ] Full schema migration runs clean from empty DB
- [ ] RLS test suite: every table, every role, every CRUD verb (Vitest + supabase-js with forged JWTs)
- [ ] Playwright e2e: kiosk booking → manager promotes → tech starts → tech requests approval → customer approves → tech completes → manager generates PDF
- [ ] Backup script tested end-to-end (dump → off-site → restore to scratch DB → row counts match)
- [ ] Twilio sandbox test for all SMS flows
- [ ] DVSA API test against a real reg
- [ ] Load test: 200 concurrent status-page lookups, p95 < 300 ms
- [ ] hCaptcha keys live, not test
- [ ] CSP report-only → enforce after 24h soak
- [ ] Staging env on Dokploy, identical to prod
- [ ] Runbook: how to rotate Twilio token, DVSA key, service_role
