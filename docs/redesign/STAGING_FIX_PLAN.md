# STAGING_FIX_PLAN.md

**Status:** Active. Written 2026-04-25, approved by Hossein.
**Branch:** `staging` (not merged to main yet).
**Source tickets:** Todoist project *Oplaris Automotive* (`6gPHVMrVxHQF9GqG`).
**Executor:** Claude Code session on Hossein's Mac (`cd ~/Desktop/Oplaris/oplaris-automotive`).

**Already shipped to `staging` during Phase 0 (2026-04-25, by a parallel Claude Code session):**
- `3fddb6f` — migration 053 (`public.*` SMS wrappers). Applied to remote Supabase. **P0.2 ✓ done.**
- `3ce05b9` — `env.ts` + `env.public.ts` preprocess empty strings → `undefined` on optional fields. Closes the original hCaptcha boot crash at the source. **P0.3 (partial) ✓.**
- `febe874` — `public/Pattern` → `public/pattern` (case-sensitive Linux fs) + Supabase logo allowlist in `next/image`.
- `02312ab` — CSP hydration fix + Supabase wildcard allowlist.

**User-confirmed working on 2026-04-25:** outbound Twilio dispatch is now functioning end-to-end for OTPs. Remaining Twilio work (E.164 normalisation, kiosk/status-page country-code UX, approval-SMS debug) still in Phase 2.

This plan is the single source of truth for the post-first-deploy bug/feature sweep.
Phase 0 is diagnosis + hotfixes that are already spec'd; Phases 1–3 are the
Todoist items grouped by cost. Each item carries its Todoist task ID so the
executor can apply the `done-by-claude` label via the Todoist API on completion.

---

## Operating rules for the executor

1. **Work strictly in the order of phases below.** Don't start Phase 2 until
   every item in Phase 0 and Phase 1 is green on staging.
2. **Every DB change is a new migration** at the next numeric prefix
   (`053_…`, `054_…`, …). Never edit an existing migration.
3. **Every change lands on `staging` first.** Only after the staging Dokploy
   deploy comes up and the relevant Todoist items check out do you consider
   fast-forwarding `main`.
4. **The `done-by-claude` Todoist label is applied programmatically** (see the
   *Todoist label workflow* section at the bottom) — don't just tick the
   Todoist item manually; the label is the audit trail Hossein reviews later.
5. **If you hit a clarification-blocker, don't guess.** Stop, update this
   doc with the blocker under the relevant item, and move to the next one.

---

## Phase 0 — Diagnosis + Hotfixes (do these before anything else)

### P0.1 — Root cause: "Twilio not working" in staging

**Status:** Partly diagnosed on 2026-04-25.

**Finding #1 — SMS RPC schema routing bug.** `src/lib/sms/queue.ts` calls
`supabase.rpc("insert_sms_outbox", …)`. The function is defined in the
`private` schema (migration 047) but PostgREST only exposes `public`.
Result: every `queueSms()` call dies at the first RPC with
*"Could not find the function public.insert_sms_outbox in the schema cache"*
and Twilio is never invoked. Affects 5 functions:
`insert_sms_outbox`, `attach_sms_twilio_sid`, `update_sms_status`,
`mark_sms_failed`, `cancel_sms`.

**Finding #2 — `TWILIO_ACCOUNT_SID` now corrected** in the user's `.env.local`
to a real `AC…` SID. Pending verification against the live Twilio account
— this is downstream of fixing Finding #1 (until the outbox insert works,
Twilio is never called).

**Finding #3 — Phone format + country-code validation.** Todoist item
`6gRmF2xrXvGJPQ4p` requires E.164 normalisation before Twilio calls +
auto-country-code validation on kiosk + status-page phone inputs. Tracked
as Phase 2 work once the RPC path is healthy.

### P0.2 — Hotfix: add `public` shims for the SMS private functions ✓ DONE

**Shipped as commit `3fddb6f` in `supabase/migrations/053_public_sms_outbox_wrappers.sql`**. Applied to the staging Supabase project. All five `public.*` shims verified via MCP on 2026-04-25.
The SQL recipe below is retained for reference / replay on prod.

**Todoist task ID:** linked to `6gRmF2xrXvGJPQ4p` (dependency, not
replacement — the full Twilio ticket stays open through Phase 2).

**Why shims, not "expose the private schema":** exposing `private` makes
every private function callable through PostgREST. The whole point of the
private schema is to lock the write path. Five shim functions is surgical.

**Deliverable:** `supabase/migrations/053_sms_outbox_public_shims.sql`.

**SQL recipe (copy this into the migration verbatim):**

```sql
-- 053_sms_outbox_public_shims.sql
-- Hotfix: migration 047 put the SMS functions in `private`; PostgREST only
-- exposes `public`, so `supabase.rpc(...)` 404s. These shims delegate to
-- the private versions. The private functions themselves are unchanged.
--
-- Call sites (all currently 404):
--   src/lib/sms/queue.ts:96     insert_sms_outbox
--   src/lib/sms/queue.ts:134    attach_sms_twilio_sid
--   src/lib/sms/queue.ts:148    mark_sms_failed
--   src/app/api/webhooks/twilio/status/route.ts:96  update_sms_status
-- `cancel_sms` has no caller yet but is shimmed for parity.

begin;

create or replace function public.insert_sms_outbox(
  p_garage_id uuid, p_vehicle_id uuid, p_customer_id uuid, p_job_id uuid,
  p_phone text, p_message_body text, p_message_type text,
  p_scheduled_for timestamptz default null
) returns uuid language sql security definer
  set search_path = public, private
as $$
  select private.insert_sms_outbox(
    p_garage_id, p_vehicle_id, p_customer_id, p_job_id,
    p_phone, p_message_body, p_message_type, p_scheduled_for
  );
$$;
revoke all on function public.insert_sms_outbox(
  uuid, uuid, uuid, uuid, text, text, text, timestamptz
) from public, anon;
grant execute on function public.insert_sms_outbox(
  uuid, uuid, uuid, uuid, text, text, text, timestamptz
) to authenticated, service_role;

create or replace function public.attach_sms_twilio_sid(
  p_outbox_id uuid, p_twilio_sid text, p_status text default 'sent'
) returns void language sql security definer
  set search_path = public, private
as $$
  select private.attach_sms_twilio_sid(p_outbox_id, p_twilio_sid, p_status);
$$;
revoke all on function public.attach_sms_twilio_sid(uuid, text, text) from public, anon;
grant execute on function public.attach_sms_twilio_sid(uuid, text, text)
  to authenticated, service_role;

create or replace function public.update_sms_status(
  p_twilio_sid text, p_status text,
  p_error_code text default null, p_error_message text default null,
  p_delivered_at timestamptz default null
) returns void language sql security definer
  set search_path = public, private
as $$
  select private.update_sms_status(
    p_twilio_sid, p_status, p_error_code, p_error_message, p_delivered_at
  );
$$;
revoke all on function public.update_sms_status(text, text, text, text, timestamptz)
  from public, anon;
grant execute on function public.update_sms_status(text, text, text, text, timestamptz)
  to authenticated, service_role;

create or replace function public.mark_sms_failed(
  p_outbox_id uuid, p_error_code text, p_error_message text
) returns void language sql security definer
  set search_path = public, private
as $$
  select private.mark_sms_failed(p_outbox_id, p_error_code, p_error_message);
$$;
revoke all on function public.mark_sms_failed(uuid, text, text) from public, anon;
grant execute on function public.mark_sms_failed(uuid, text, text)
  to authenticated, service_role;

create or replace function public.cancel_sms(
  p_outbox_id uuid, p_reason text default null
) returns void language sql security definer
  set search_path = public, private
as $$
  select private.cancel_sms(p_outbox_id, p_reason);
$$;
revoke all on function public.cancel_sms(uuid, text) from public, anon;
grant execute on function public.cancel_sms(uuid, text) to authenticated, service_role;

commit;
```

**Apply via Supabase CLI or `supabase db push`.** The existing Supabase
project `fzczwkreixorrspwojcl` is the staging DB; it's already at migration
052 HEAD per the `list_migrations` MCP check on 2026-04-25.

**Verify:** after applying, log into the staging app and run the kiosk
booking flow. Outbox insert should succeed; Twilio call should now actually
fire. If Twilio returns an error, that's P0.4 territory — keep moving down
the list.

**Done when:** staging status-page OTP request results in an SMS arriving
on the test phone, and `public.sms_outbox` has a new row with
`twilio_sid` populated.

### P0.3 — Env file issues in `.env.local` (partial)

**Empty-string optional fields:** ✓ fixed at the source by commit `3ce05b9` — the zod schema now `preprocess`es empty strings to `undefined` on all optional fields. This class of boot crash (originally triggered by blank hCaptcha vars) will not recur regardless of what Dokploy injects.

**Remaining items (user-side, NOT code fixes):**

**Finding #4 — Missing slashes in three URL vars.** In `.env.local`:

```
NEXT_PUBLIC_APP_URL=https:oplaris-automotive-das-...      ← missing //
NEXT_PUBLIC_STATUS_URL=https:oplaris-automotive-das-...   ← missing //
TWILIO_WEBHOOK_BASE_URL=https:oplaris-automotive-das-...  ← missing //
```

Zod's `.url()` validator may accept `https:host.tld` because Node's URL
constructor tolerates it as *"scheme + path with no host"*, but downstream
code (signed token issuance, Twilio webhook verification, CORS origin
checks, same-origin cookies) will all misbehave because the host becomes
empty. **Fix:** add the missing `//` to all three values. Also paste the
same into Dokploy's Environment Variables tab and Reload the app.

**Finding #5 — `SUPABASE_JWT_SECRET` shape looks wrong.** Current value
`5c0020c8-8ae2-4ae2-b6cb-0cb8b65e5e90` is a 32-hex-with-dashes UUID.
Supabase's JWT secret is typically a 40+ char base64 or hex string used as
the HMAC signing key. A UUID-shaped value will sign/verify, but it *may*
be the wrong field from the dashboard (JWT Keys vs Project Reference).
**Verify:** open the staging project → Project Settings → API → look for
"JWT Settings" / "JWT Keys" section → compare what's there to the value
above. If the dashboard shows a longer base64 blob, replace.

### P0.4 — Bay-board realtime bay-move check

**Todoist task ID:** `6gRm9xgpwm9Xhvwp`.

**Status:** ✓ diagnosed 2026-04-25 by Claude Code. Bug is client-side,
not server-side. Fix deferred to P2.5 per the original plan.
    ✓ fe2f319 2026-04-25

**Diagnostic query (run via Supabase MCP against `fzczwkreixorrspwojcl`):**

```sql
select r.relname, rc.relreplident,
       exists(select 1 from pg_publication_rel pr
               join pg_publication pub on pub.oid = pr.prpubid
              where pr.prrelid = r.oid and pub.pubname = 'supabase_realtime') as in_pub
  from pg_class r
  join pg_namespace n on n.oid = r.relnamespace
  join pg_class rc on rc.oid = r.oid
 where n.nspname = 'public' and r.relname in ('bookings','jobs');
```

**Result on staging Supabase:**

| relname  | relreplident | in_pub |
|----------|--------------|--------|
| bookings | f            | true   |
| jobs     | f            | true   |

Both tables have `REPLICA IDENTITY FULL` and are members of the
`supabase_realtime` publication. **Server-side replication is correct.**

**Trace through `src/lib/realtime/*` + bay-board surface (also confirmed
correct on paper):**

- `BayBoardRealtime` shim (`src/lib/realtime/shims.tsx:189`) is mounted
  on the page (`src/app/(app)/app/bay-board/page.tsx:23`).
- It subscribes to four tables, all `garageFilter(garageId)` scoped:
  `jobs`, `job_assignments`, `work_logs`, `bays`.
- `jobs` is the right table — `/api/bay-board/move/route.ts:34` does
  `supabase.from("jobs").update({ bay_id }).eq("id", jobId)`.
- `ALLOWED_TABLES` whitelist (`allowed-tables.ts`) includes all four.
- `garageFilter` produces `garage_id=eq.<uuid>` which passes the
  `argsSchema` regex in `use-realtime.ts:23`.

So the subscription filter is fine — `router.refresh()` does fire on
manager B's session when the bay move lands.

**Real root cause: stale local state in `BayBoardClient.tsx:25`.**

```tsx
export function BayBoardClient({ initialBays }: BayBoardClientProps) {
  const [bays, setBays] = useState(initialBays);
  // ...
  // render reads `bays`, not `initialBays`
```

When realtime fires `router.refresh()` on manager B's session:

1. Next.js re-runs `page.tsx` server-side, calls `getBayBoard()`, gets a
   fresh `bays` snapshot.
2. `<BayBoardClient initialBays={...freshSnapshot} />` re-renders with
   the new prop.
3. **But `useState(initialBays)` only honours the initial value.**
   Subsequent prop changes are ignored — `bays` stays at the original
   snapshot until manager B hard-refreshes.

This is a textbook stale-state-after-prop-change bug. Same anti-pattern
likely lurks in any other client component using `useState(prop)`
without a sync effect.

**P2.5 deliverable:**

1. Add a `useEffect(() => setBays(initialBays), [initialBays])` to
   `BayBoardClient.tsx`. Guard with `if (!isPending)` so a concurrent
   realtime refresh doesn't overwrite an in-flight optimistic drag.
   Cleaner alternative: drop the local state entirely and only keep an
   ephemeral `optimisticOverlay` map during the in-flight `startTransition`
   window — fewer race conditions, but a bigger refactor.
2. Audit every other surface using `useRealtimeRouterRefresh` for the
   same pattern: grep for `useState(initialBays)` / `useState(initial…)`
   in client components that have a realtime shim mounted on their parent
   page. Likely candidates: bookings list, jobs list, customers list,
   stock — anything that took a server snapshot through a prop and
   stashed it in `useState`.
3. Add `tests/rls/realtime_isolation.test.ts` regression: drop
   `BayBoardRealtime` into a JSDom harness, fire a synthetic
   postgres_changes event for a `jobs` UPDATE, assert the rendered DOM
   reflects the new bay assignment within the 2-second debounce window.

### P0.5 — Side-finding: `assign_staff_role` RPC orphan

Not a staging blocker; logging for later.
`src/app/(app)/app/settings/staff/actions.ts:107` calls
`supabase.rpc("assign_staff_role", …)` but no migration defines that
function in either `public` or `private`. The caller only `console.warn`s
on failure, so adding a staff member probably silently skips role
assignment today.

**Next step:** check git blame on migration 025 (multi-role intro). The
RPC was likely planned but dropped. Two fixes on the table:
- (a) write the RPC (SECURITY DEFINER, inserts into `private.staff_roles`
  + updates `public.staff.roles` mirror), or
- (b) rewrite the caller to do the direct UPDATE.
Not in scope for this plan; logged here so it doesn't get lost.

---

## Phase 1 — Quick UI polish (~30 min each)

| ID | Todoist | Title | Acceptance |
|----|---------|-------|------------|
| P1.1 ✓ | `6gRm3wjwfjGX8WmG` | Kiosk submit → 3s countdown → redirect to kiosk home | Kiosk success screen shows a visible 3-second countdown (large timer) then replaces `window.location` with the kiosk root URL. Works regardless of whether the SMS send succeeded.<br/>✓ 71a88ab 2026-04-25 |
| P1.2 ✓ | `6gRm53ffqqG7jW2G` | MOT icon on every staff chip | Any place a staff member's name is rendered that has `roles.includes('mot_tester')` shows a Phosphor MOT icon (use the same icon already in the V2 icon barrel) next to the name. Covers: assignee badges on job detail, staff list page (when P3.1 ships), bay-board cards, My Work. Single component change wins: update `<RoleBadge>` / a shared chip helper rather than patching each call site.<br/>✓ 3308916 2026-04-25 |
| P1.3 ✓ | `6gRmCPPmjwxrHGCG` | Edit-customer card → modal mirroring NewCustomerForm | Clicking Edit on the customer detail page opens a shadcn `<Dialog>` containing the same zod schema + form layout as `NewCustomerForm`. Submitting saves via the existing `updateCustomer` server action; dialog closes + route revalidates. Inline edit form is removed.<br/>✓ 2f8ed30 2026-04-25 |

---

## Phase 2 — Medium fixes (1–3 h each)

### P2.1 — Twilio hardening `6gRmF2xrXvGJPQ4p`

Depends on P0.2 (outbox path working).

- Server: wrap every Twilio-bound phone in `libphonenumber-js`'s
  `parsePhoneNumberWithError(phone, 'GB').number` (E.164 output) before
  handing to `queueSms`. Throw a `PhoneParseError` if the shape doesn't
  parse — surfaced as a 400 on the kiosk endpoint and a toast on the
  customer-edit form.
- Kiosk phone input: `<Input inputMode="tel">` with a country-code
  prefix control defaulting to `+44`; live-format via
  `libphonenumber-js`'s `AsYouType`; submit button disabled until
  `isValidPhoneNumber` returns true.
- Status page phone input: same treatment.
- OTP verification after both fixes: run the full kiosk-booking → SMS
  OTP → status-page round-trip on staging.

### P2.2 — SMS outbox contingency `6gRmHR5Qv9XV7xhp`

`sms_outbox` table exists (migration 047). What's missing:

- **Non-throwing Twilio wrapper.** `src/lib/sms/queue.ts` currently
  throws on Twilio failure after writing to outbox. Change the call-site
  pattern so the server action never throws on an SMS failure —
  instead it resolves `{ status: 'failed', outboxId }` and the UI shows
  a toast *"SMS will be retried"*. The outbox row is the source of truth.
- **Manager-visible outbox page.** `/app/messages` already exists.
  Extend it with a "Failed" tab: rows with `status='failed'`, `error_code`,
  `error_message`, `created_at`, and a **Retry** button that re-calls
  `queueSms` with the same payload.
- **Exponential backoff cron.** Supabase `pg_cron` scheduled job
  every 5 min: pick up `status='failed' AND retry_count < 3`, retry,
  bump `retry_count`. After 3 failures leave as `status='failed_final'`
  for manual intervention.

### P2.3 — SMS templates settings page `6gRmH78FwCV5262G`

- **Migration 054** `sms_templates`: `(garage_id uuid, template_key text,
  body text, updated_at timestamptz, primary key (garage_id, template_key))`.
  RLS: manager-read, manager-write, per-garage. Seed three keys on
  migration: `status_code`, `approval_request`, `mot_reminder` with the
  current hard-coded bodies as defaults.
- **Template render helper** `src/lib/sms/templates.ts`: `renderTemplate(key,
  vars, garageId)` — fetches template (cached per request), replaces
  `{{var}}` tokens, returns body. Callers switch from hard-coded strings
  to `renderTemplate(...)`.
- **UI** `/app/settings/sms`: list of templates, editor per template with
  live preview panel showing the rendered output against a sample vars
  object. Manager-only (role gate).

### P2.4 — Bay chooser on Create-job-from-check-in + audit log `6gRm82rV9HM9j6Mp`

- Add `bay_id uuid` optional param to `createJobFromCheckIn` server
  action. Bay dropdown on the "Promote check-in to job" modal: lists bays
  for the current garage, "No bay yet" option keeps current behaviour.
- Write an `audit_log` row on every bay assignment and every bay change
  (not just on first assign). Meta: `{ action: 'bay_assigned', job_id,
  from_bay_id, to_bay_id, actor_staff_id }`.
- Surface bay history on the job detail timeline — `job_timeline_events`
  view gets a new event kind `bay_change` unioned from the audit_log
  predicates. Customer-facing timeline stays filtered to the existing
  customer subset; internal staff timeline shows the new events.

### P2.5 — Bay-board realtime fix `6gRm9xgpwm9Xhvwp`

**Diagnosis closed in P0.4 (2026-04-25):** the bug is **not** in the
subscription filter or the publication. Server-side replication is
correct. Real root cause is `BayBoardClient.tsx:25` storing the server
snapshot in `useState(initialBays)`, which ignores subsequent prop
changes after `router.refresh()` lands. Full trace under P0.4 above.

**Fix shape:** add a prop→state sync effect (or refactor to drop local
state during the optimistic-drag window). Audit every other client
component mounted under a realtime shim for the same anti-pattern. No
new `supabase.channel(` call sites; no migration. Add a regression in
`tests/rls/realtime_isolation.test.ts` that fires a synthetic
postgres_changes event and asserts the rendered DOM reflects the new
state within the 2-second debounce.

### P2.6 — Status page "too many requests" false-positives `6gRmVJHc2g72VX6G`

**Symptom:** Hossein reports random 429s on the public status page,
requiring a hard refresh. Intermittent, not deterministic.

**Current config:** `src/lib/security/rate-limit.ts` enforces two hourly
buckets per CLAUDE.md rule #8: **3/phone/hour** and **10/IP/hour**.

**Likely root causes (in order of likelihood):**

- (a) **Shared-IP collision** — in a real garage, the whole workshop
  Wi-Fi presents one NAT egress IP, so 10 hits/hour is easy to burn
  when multiple customers retry within the same hour. Even 3 retries
  from 4 different customers = 12 requests = tripping the IP bucket.
- (b) **Traefik/Dokploy not forwarding real client IP** — if the
  rate-limit helper reads `x-forwarded-for` but Traefik rewrites it to
  the Dokploy internal IP, every request looks like it came from the
  same IP and the per-IP bucket fills instantly.
- (c) **Bucket key not including the hour window** correctly — stale
  rows in `private.rate_limits` never expire and count against new
  requests.

**Diagnosis before changing config:**

1. Query `private.rate_limits` on the remote Supabase, group by key,
   sort by count desc, last hour. This will immediately show whether
   one IP is dominating (→ root cause b) or whether multiple IPs are
   each fine individually but the aggregate is noisy (→ a).
2. Verify `req.headers.get("x-forwarded-for")` in the status-code
   route — log the parsed IP for a day, compare to what you see in
   `private.rate_limits`.

**Fix options once diagnosed:**

- If (a): raise the IP bucket to **20–30 hits/hour**, keep the
  per-phone at 3/hour so enumeration protection stays intact. Per-phone
  is the real security gate; per-IP is noise control.
- If (b): ensure the route handler honours `x-forwarded-for` correctly
  (first IP in the comma-separated list when behind Traefik).
  `src/lib/security/client-ip.ts` (create if missing) centralises this.
- If (c): add a scheduled `pg_cron` job to prune rows older than 1h
  from `private.rate_limits`, plus a composite index on
  `(key, window_start)`.

**Done when:** Hossein can refresh the status page repeatedly in a
testing session without hitting 429 during normal use. One-liner
instrumentation added to the route that logs 429s with the bucket name
+ current count so future over-limits are traceable.

### P2.7 — Quote URL + approval-SMS send + super_admin role `6gRmVr9GFfgmHhRG`

**Three concerns in one Todoist ticket — split and addressed separately.**

**P2.7a — Quote SMS URL is wrong.**

Near-certain cause: your `.env.local` + Dokploy env currently has
`NEXT_PUBLIC_APP_URL=https:oplaris-…` (missing the `//`). The status /
approval URL builder composes `{NEXT_PUBLIC_APP_URL}/approve/…`, which
then renders in the SMS as `https:oplaris-…/approve/xyz` — not a
clickable link in any SMS client. Phase 0 flagged this under P0.3
Finding #4 as a user-side env fix.

**Belt-and-braces code fix on top of the env fix:** in the SMS template
render path, pass the base URL through a `normaliseAppUrl(raw: string)`
helper that:
- rejects any value whose `URL()` parse produces an empty `host`
- ensures `https://` prefix (inserts `//` if missing, as a last-resort
  defence if an operator pastes a broken value again)
- strips trailing slash

Apply in `src/lib/sms/templates.ts` or its eventual equivalent. Unit-test
with the pathological `https:host.tld` input.

**Done when:** a quote SMS delivered to the test phone contains a
clickable `https://…/approve/…` link that opens the signed approval
page on first tap.

**P2.7b — Approval-request SMS is not sending.**

Symptom: Hossein clicks "Request approval" on a charge; no SMS lands.
Likely causes in order:

- (a) Dependency on P0.2 was fixed — but this SMS path may route through
  a **different code path** than the OTP (e.g. the approval flow might
  still hit `queueSms` but with a malformed template or a failing
  lookup for the customer's phone). The user confirmed *"outbound
  Twilio is working"* for the OTP path; approval-request path is
  untested post-053.
- (b) Signed-token generation in `src/lib/approvals/issue.ts` may throw
  silently if the `APPROVAL_HMAC_SECRET` shape is unexpected
  (regression risk if the secret was recently rotated).
- (c) The approval code path might still call a `private.*` function
  that wasn't in the migration 053 shim set — audit every `supabase.rpc`
  call under `src/app/(app)/app/jobs/charges/actions.ts` and
  `src/lib/approvals/*` and cross-check against the `public.*` function
  list.

**Done when:** from a new job with a draft charge, clicking "Request
approval" causes (i) a row in `sms_outbox` with `status='sent'` +
`twilio_sid` populated, (ii) an SMS on the test phone with a working
signed approval link, (iii) the customer status page shows the
awaiting-approval chip immediately.

**P2.7c — super_admin role → moved to P3.5.**

Hossein confirmed 2026-04-25: this is an **Oplaris-staff support role**.
Purpose: Oplaris team (Hossein + whoever else) can log into any garage
and provide support — edit settings, adjust templates, trace issues.
In v1 the only garage is Dudley so it's effectively a single-garage
support shim, but the feature is architected multi-tenant so future
resale garages don't need a second retrofit. Scoped at P3.5 with its
own migration + RLS audit. P2.3 (per-garage manager-editable SMS
templates) is orthogonal and ships independently; once both land, the
two layer cleanly — super_admin edits platform defaults, garage
managers override per-garage.

---

## Phase 3 — New features (3–8 h each)

### P3.1 — `/app/staff` section `6gRm777pcjQwjv9G`

**Manager-only**, per-garage.

- New route `/app/staff` (sidebar item gated by `manager` role).
- Grid of `<StaffCard>` per staff member showing: avatar (initials fallback),
  full name, role chips (reuse `<RoleBadge>`), status dot (red if any
  `work_logs.ended_at IS NULL`, green otherwise), and when busy: current
  vehicle reg + start time + **live HH:MM:SS timer** computed from the
  running work_log's `started_at` — same math as the existing
  `work-log-timer.ts` helper. Plus "Jobs completed today": count of
  distinct `work_logs.job_id` where `ended_at::date = today`.
- **Realtime** via the existing `useRealtimeRouterRefresh` hook subscribed
  to `work_logs` filtered by `garage_id`. No new realtime plumbing.
- Tap a card → `/app/staff/[id]` detail page: larger live timer, today's
  work-log list, this-week-summary, and the KPI strip described in P3.4.

### P3.2 — Bays rearrangeable `6gRm8vH9mWc773cG`

**Manager-only**, persist per-garage (global order, not per-user).

- **Migration 055**: `alter table bays add column sort_order int not null
  default 0;`. Server action `reorderBays(bayIds: string[])` performs a
  single `UPDATE … SET sort_order = …` via a CTE. Manager-only RLS.
- Bay board UI: wrap the bay columns in `<DragDropContext>` (already using
  `@hello-pangea/dnd` for the cards within each bay), make the bay
  *headers* draggable horizontally. On drop, call `reorderBays`.

### P3.3 — End-of-job checklist `6gRm83rVhrR5jVXG`

**Manager-configurable per tech role, global toggle on/off.**

- **Migration 056** `job_completion_checklists`:
  `(garage_id, role text, items jsonb, enabled bool, updated_at)`.
  Manager RLS. Seed three rows on migration — one per role —
  preloaded with `{"items":["Have you returned the wheel locking nut?",
  "Have you put your tools away?","Have you left the vehicle clean?"]}`
  and `enabled=false` (opt-in).
- **Migration 057** `job_completion_checks`: `(job_id, staff_id,
  items_jsonb, submitted_at)` — stores the tech's answers.
- **Settings page** `/app/settings/checklists`: one tab per role,
  enable-toggle, editable list of items (add/remove/reorder).
- **Modal** on tech's "Complete job" action: if the role's checklist is
  enabled, show the checklist as a blocking modal before the job status
  flips. Each item is a required Yes/No. On submit, write to
  `job_completion_checks`.
- **Manager visibility**: checklist entry on the job detail timeline
  (`job_timeline_events` extension) and on the staff detail page.

### P3.4 — KPI dashboard on reports + staff detail `6gRm9C88J3wJCfHp`

Both on the existing `/app/reports` page (new "Operations" section) and
as a strip on each `/app/staff/[id]` page.

- Top 3 KPIs to ship first:
  1. **Bay utilisation %** — fraction of working hours a bay has an
     in-progress job assigned. Per-bay bar chart by day.
  2. **Jobs-per-type count** — group `jobs.type` / charge categories,
     show last-7-days, last-30-days, and overall.
  3. **Avg cycle time per job type** — median time from
     `jobs.created_at` to `jobs.status='complete'`.
- Per-staff-detail KPIs: jobs completed / week, total billed hours this
  month, average job cycle time, current live timer (reuses P3.1
  infrastructure).
- Reports page gets a CSV export alongside the existing revenue export.
- No new realtime here — reports render at request time.

### P3.5 — `super_admin` Oplaris-staff support role (~1 day) `6gRmVr9GFfgmHhRG` (part c)

**Purpose:** Oplaris team members (Hossein + future teammates) can log
into any garage and provide support — adjust settings, edit SMS
templates, trace customer issues. Architected multi-tenant so future
resale garages inherit it for free, but at v1 the only garage in the
database is Dudley. **Not to be handed out to garage staff.** Every
super_admin action is audit-logged with the actor + garage + target row
for GDPR-style provenance.

**Design decisions (driven by CLAUDE.md Rule #1 — multi-tenant from day one):**

- **Separate registration table**, not a role on `staff`. Super_admins
  are Oplaris employees, not employees of any garage, so they don't
  belong in `public.staff`. Migration adds
  `private.platform_admins (user_id uuid primary key references auth.users,
  created_at timestamptz, created_by uuid references auth.users, revoked_at
  timestamptz)`.
- **JWT claim via Supabase Auth hook.** Extend the existing
  `custom_access_token_hook` (migrations 017/018 already wire it) to set
  `claims.app_metadata.is_super_admin = true` when the user_id is in
  `private.platform_admins` with `revoked_at is null`. Existing
  `garage_id` and `roles` claims stay unchanged — super_admins have
  `garage_id = null` until they *switch* into a garage (see below).
- **Context switching.** A super_admin visiting `/admin` sees a garage
  picker. Selecting a garage issues a short-lived (1h) *impersonation
  session* via a SECURITY DEFINER RPC `public.super_admin_enter_garage
  (p_garage_id uuid)` that writes an `audit_log` row
  `(action='super_admin_enter', target_table='garages', target_id=<g>)`
  and sets a signed server-side cookie carrying the garage_id override.
  Route middleware reads this cookie for super_admin users and injects
  the garage_id into the request context. RLS helper
  `private.current_garage()` is updated to prefer the override cookie's
  garage_id when the caller is a super_admin, and to fall back to the
  JWT claim otherwise.
- **RLS pattern.** New helper `private.is_super_admin()` returning
  boolean. Existing policies gain an `OR private.is_super_admin()`
  branch on the *read* side only for tables that support staff needs
  (customers, vehicles, jobs, settings, audit_log). Write policies
  inherit the impersonation-session garage_id via
  `private.current_garage()` — super_admins mutate *as the selected
  garage* so garage managers see legitimate audit trails, not
  spooky-action-at-a-distance. The four Rule #3 hardening migrations
  (049/050/051/052) still apply: EXISTS-jobs-tenant clauses still fire
  because super_admin writes carry the impersonated garage_id.
- **Audit trail.** Every super_admin INSERT / UPDATE / DELETE fires a
  trigger that writes an `audit_log` row with `action='super_admin_<op>'`
  and meta `{ original_actor: <super_admin_user_id>,
  impersonated_garage: <garage_id>, before: ..., after: ... }`. Read
  operations audit only when touching customer PII (same discipline as
  CLAUDE.md Rule #11).
- **UI.** New `/admin` layout, super_admin-gated:
  - `/admin` — garage picker ("Select a garage to support")
  - `/admin/garages/[id]` — landing: key stats for that garage (jobs
    this week, open invoices, active staff), banner *"You are viewing
    Dudley Auto Service as Oplaris support. All actions are logged."*
  - `/admin/garages/[id]/settings/sms` — template editor (feeds P2.3
    once both are live: super_admin edits *defaults* here, each garage's
    manager can override them in their own /app/settings/sms)
  - `/admin/audit` — cross-garage audit log viewer, filterable by
    garage + actor + action + date
- **Seeding super_admins.** Manual for v1 — an SQL snippet + Hossein
  runs it once against prod after deploy to add his own user_id to
  `private.platform_admins`. No UI for managing super_admins in v1;
  add later when there's more than one. Script:

  ```sql
  insert into private.platform_admins (user_id, created_by)
  values ('<hossein-auth-uid>', '<hossein-auth-uid>');
  ```

**Migrations:**

- `054_platform_admins.sql` — table, helper functions
  (`is_super_admin`, `current_garage` override), `is_super_admin` JWT
  claim via `custom_access_token_hook` extension.
- `055_super_admin_rls_read_policies.sql` — adds
  `OR private.is_super_admin()` to read policies on the curated table
  set (customers, vehicles, jobs, bookings, invoices, job_charges,
  job_parts, work_logs, audit_log, garages, staff, bays).
- `056_super_admin_enter_garage_rpc.sql` — SECURITY DEFINER RPC for
  impersonation session + signed cookie.
- `057_audit_trigger_super_admin.sql` — generic trigger function +
  wiring to the mutation-side audited tables.

**Tests:**

- `tests/rls/platform_admin.test.ts` — new file:
  - Non-super_admin cannot select `platform_admins`
  - Super_admin (no garage selected) sees only a landing page — no
    customer / job data accessible because `current_garage()` returns
    null and every RLS predicate fails
  - Super_admin post-`enter_garage(garage_b)` sees garage_b's data,
    cannot see garage_a's
  - Every super_admin INSERT/UPDATE writes an audit_log row with
    `action='super_admin_*'`
  - Regular manager cannot call `super_admin_enter_garage` — 42501

**Done when:** Hossein (manually seeded as super_admin) can log in,
pick Dudley from the garage picker, land on `/admin/garages/<dudley>/`,
see the banner, edit SMS templates, and leave a clean audit trail
visible at `/admin/audit`.

**Scope anti-creep:** no user management UI for platform_admins in v1,
no billing / subscription surface, no white-label branding editor. Just
support + SMS template defaults. Everything else waits until the 2nd or
3rd real garage is onboarded.

---

## Deferred

- **Resume button + charges merge + rate handling** `6gPHXg438pf9H6pG`.
  Hossein: *"put this aside for now, ask later"*. Revisit after Phase 2.
  Worth splitting: (a) Resume UI (possibly a P55 regression worth
  finding fast), (b) charges-merge, (c) rate handling — these are three
  different features that just happen to share a ticket.
- **Statuses** `6gRmFHr6HQ43hRfG`. Task body is literally
  *"claude, ignore this"*. Leave alone.

---

## Todoist label workflow

The `done-by-claude` label is the audit trail Hossein reviews later. Apply
it programmatically on each completion — don't tick Todoist manually.

**Token:** Hossein's personal API token. **Treat as burn-after-read.** Pass
via env var, never commit.

**One-time label creation (first completion):**

```bash
# Check if the label exists
curl -sS -H "Authorization: Bearer $TODOIST_TOKEN" \
  https://api.todoist.com/api/v1/labels | \
  python3 -c "import sys,json; d=json.load(sys.stdin); \
    labels=d.get('results',d) if isinstance(d,dict) else d; \
    print([l['name'] for l in labels])"

# Create if missing
curl -sS -X POST -H "Authorization: Bearer $TODOIST_TOKEN" \
  -H "Content-Type: application/json" \
  https://api.todoist.com/api/v1/labels \
  -d '{"name":"done-by-claude","color":"berry_red"}'
```

**Per-task completion (repeat for every Px.y):**

1. Keep the task *open* in Todoist (don't mark complete — Hossein wants to
   review first).
2. Add the `done-by-claude` label:

   ```bash
   curl -sS -X POST -H "Authorization: Bearer $TODOIST_TOKEN" \
     -H "Content-Type: application/json" \
     "https://api.todoist.com/api/v1/tasks/<TASK_ID>" \
     -d '{"labels":["done-by-claude"]}'
   ```

   (Merges with existing labels. If the API requires replacing labels
   wholesale, first `GET` the task, read `labels`, append `done-by-claude`,
   `POST` the full array back.)

3. Append a one-line note to this plan doc under the item's row,
   format: `    ✓ <commit-sha> <YYYY-MM-DD>`.

---

## Cross-references

- CLAUDE.md — architecture rules, migration hygiene, role model.
- PRE_PHASE_4_HARDENING.md — sibling hardening queue (RLS sweep shipped
  in migration 052 on staging).
- MECHANIC_MOT_FIX_PLAN_2026-04-20.md — shipped via the
  `feat/mechanic-mot-ux-2026-04-20` branch, merged into `staging`.
- STAGING_SMS_BYPASS.md — prod-guarded dev bypass. Intentionally
  `STATUS_DEV_BYPASS_SMS=false` for this staging (Hossein chose real Twilio).
