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
| P1.2 ⚠ partial | `6gRm53ffqqG7jW2G` | MOT icon on every staff chip | First pass `3308916 2026-04-25` shipped a Phosphor SealCheck icon AFTER the name on bay-board chips + TeamManager. **Followup needed** (Hossein 2026-04-27): use `public/MOT_Logo.svg` as the canonical glyph (it's a PNG inside an .svg name — `next/image` handles it), render BEFORE the name not after, and centralise via `<StaffAvatar>`: add a `roles?` prop that overlays a small MOT badge corner-piece on the avatar circle, so every avatar surface (TechAssignmentModal — the "Create job from check-in" modal Hossein flagged — plus settings/staff, future /app/staff list) gets it for free. On surfaces without an avatar (bay-board chips, TeamManager badges), keep `<StaffRoleIcons />` but reorder it to render before the name. Preserve the existing component shape — Hossein's note: "do not innovate further". |
| P1.3 ✓ | `6gRmCPPmjwxrHGCG` | Edit-customer card → modal mirroring NewCustomerForm | Clicking Edit on the customer detail page opens a shadcn `<Dialog>` containing the same zod schema + form layout as `NewCustomerForm`. Submitting saves via the existing `updateCustomer` server action; dialog closes + route revalidates. Inline edit form is removed.<br/>✓ 2f8ed30 2026-04-25 |
| P1.4 ✓ | `6gVQJ3gFrWCf9c2G` | Logout auto-refresh broken | Logout dropdown form converted to a Server Action so React's RSC runtime drives signOut + revalidatePath('/', 'layout') + redirect('/login') in one round-trip — Radix's portal-rendered DropdownMenuContent was intercepting the native form submit so the page never navigated. /logout route handler kept as defensive entrypoint. 2 unit tests cover the action contract.<br/>✓ 356786d 2026-04-30 |
| P1.5 ✓ | `6gVQJ37Gxhwr7p2G` | Add Vehicle modal — layout + visual fixes | Look-up button switched to `variant="secondary"` so the disabled state stops rendering as Dudley's brand red at opacity-50 (the "broken pink gradient" Hossein flagged). UK side strip on `<RegPlateInput>` rebuilt: dropped the blue-on-blue invisible circle + sub-pixel "EU stars" SVG, replaced with a proper Union Jack mini-flag (3-colour saltire + cross) + readable `text-xs` white "UK" wordmark per modern post-2021 plate spec. Tightened the Registration label/spacing to match every other field. 3 new unit tests guard the visual contract.<br/>✓ 78f296a 2026-04-30 |
| P2.10 ✓ | `6gVw8Xp9X2jJmRpp` | Approval-request URL + SMS shortener | New customer-facing `/approve/<token>` page (server-verifies HMAC, fetches the request, renders Approve/Decline UI through `ApproveClient`) + new `public.short_links` table (mig 062, 6-char id from a 56-char unambiguous alphabet, manager-only RLS, service-role writes) + new `/r/<id>` 302 redirect route handler that refuses past `expires_at`. Approval-request action now mints `mintShortApprovalLink` so the SMS body stops embedding the ~250-char base64 token. Backwards compat: `/api/approvals/<token>` stays the single write path. 9 unit + 8 RLS new, 149/149 RLS + 404/404 unit total.<br/>✓ 8df27be 2026-04-30 |

---

## P1 sprint — Batch 3 (manager UI polish, 2026-04-30)

| ID | Todoist | Title | Acceptance |
|----|---------|-------|------------|
| B3.1 ✓ | `6gVQJ3Ggmg6mFwHG` | Vehicle detail: Job History above MOT | Two `<Section>` blocks on `/app/vehicles/[id]` swapped — Job History now sits above MOT History per the more-frequent-lookup rule. Active Jobs hero stays at the top.<br/>✓ 2ffb983 2026-04-30 |
| B3.2 ✓ | `6gVQJ38f3VCV6WMG` | MOT history collapses to most recent + toggle | `MotHistorySection` now defaults to showing only `motHistory[0]` with a "Show full history (N)" button below (N = older count). Click expands inline + flips to "Hide full history"; `aria-expanded` toggles. Empty state when 0 priors: quiet "No prior MOT history" line. 3 unit tests cover the three documented row-count cases.<br/>✓ 1a9bb8c 2026-04-30 |
| B3.3 ✓ | `6gVQJ344gFpC8g6G` | Clickable customer names + reg plates | `<RegPlate vehicleId>` becomes a Link when an id is passed; new `<CustomerNameLink customerId fullName />` primitive wraps the inline `customer.full_name` rendering pattern. Wired across jobs list, jobs/[id], messages, vehicles/[id] Owner, tech, staff hero + today-log. **Skipped** on StaffCard + bay-board cards + vehicles list cards — each wraps the whole card in an outer Link, so a nested anchor would be invalid HTML; comment-noted at each call site. 2 new unit tests + select extensions to project the missing ids. 411/411 unit + 149/149 RLS.<br/>✓ 81a416f 2026-04-30 |
| B3.4 ✓ | `6gVQJ35vw3J73Jpp` | Sidebar dark navy + white text | Staff-shell `<Sidebar />` + mobile `<Sheet>` drawer hardcoded to `bg-slate-900 text-white`, active nav `bg-white/10`, hover `bg-white/5`, internal borders `border-white/10`, GarageLogo unchanged. Operational chrome no longer re-skins per garage; brand expression stays on public surfaces (Hossein 2026-04-27). Inline comment at each override site references the decision + when to revisit (multi-garage white-label).<br/>✓ fdbe9e7 2026-04-30 |

---

## P1 sprint — Batch 4 (TRADER customer flag, 2026-04-30)

| ID | Todoist | Title | Acceptance |
|----|---------|-------|------------|
| B4 ✓ | `6gVQJ3WFRHPQ257G` | TRADER customer flag end-to-end | Migrations 063 + 064 add `public.customers.is_trader` (manager-only trigger gate, defensive no-JWT bypass). New `<Switch>` + `<TraderBadge>` primitives. `<CustomerNameLink isTrader>` extended so every B3.3 surface picks up the badge. EditCustomer + NewCustomer forms gained the Switch (manager-gated). Surfaces wired across customers list/detail, jobs list/detail, messages, tech, vehicles. Filter chip deferred to Batch 5 — TODO marker left in customers/page.tsx. 5 unit + 8 RLS new tests; 416/416 unit + 157/157 RLS green.<br/>✓ dd63d19 2026-04-30 |

---

## P1 sprint — Batch 5 (in-page search + global spotlight, 2026-05-02)

| ID | Todoist | Title | Acceptance |
|----|---------|-------|------------|
| B5.1 ✓ | `6gVQJ3GxCjQ76mgG` | Jobs list search + date/time filter | New shared `<ListSearch>` primitive (debounced 200ms, optional date-range Popover with native datetime-local). New `composeJobsSearchPredicate` + `searchJobs` in `src/lib/search/jobs.ts` running multi-step RLS-scoped queries (customers ILIKE → vehicles ILIKE → jobs IN). Phone normalisation via `normalisePhoneSafe` expands a query like `07911 123456` to E.164 + local + bare-national + digits-only-with-country variants so storage-format mismatches don't hide a customer. `/app/jobs` rewired: search bar at top, status pills below, status pills now preserve the active text/date filters when toggled. CLAUDE.md addendum (BEFORE-trigger pattern under rule 3) committed first. 11 compose + 6 component unit + 5 RLS isolation tests; 433/433 unit + 162/162 RLS green.<br/>✓ 8fc2456 2026-05-02 |
| B5.2 ✓ | `6gVQJ396fffhfH7G` | Per-vehicle Job History search + chips | New shared `<FilterChips>` primitive (multi-select, URL-state-backed, `role=switch`/`aria-checked`). New `composeVehicleJobsSearchPredicate` + `searchVehicleJobs` in `src/lib/search/vehicle-jobs.ts` — vehicle scope is implicit (page route), text fan-out into `jobs.description` + `job_charges.description` + `job_parts.description` (no `invoices.description` column exists in the schema, so that part of the spec is satisfied via job_charges which IS the line-item description). Repair-type chips (mot/electrical/maintenance) filter via `bookings.service` joined on the job. Service badge appears next to each result. 7 compose + 7 chip-component unit + 6 RLS isolation tests; 450/450 unit + 168/168 RLS green.<br/>✓ TODO 2026-05-02 |

---

## Phase 2 — Medium fixes (1–3 h each)

### P2.1 — Twilio hardening `6gRmF2xrXvGJPQ4p`

**Status:** ✓ shipped 2026-04-25 in three commits.
    ✓ dad957f 2026-04-25 — server-side: PhoneParseError + normalisePhoneSafe + isValidPhoneNumberInput; status-page duplicate normaliser removed; kiosk endpoint normalises before insert with typed 400.
    ✓ 01d9bd6 2026-04-25 — `<PhoneInput>` primitive (+44 prefix, AsYouType, isValid gate) + kiosk integration.
    ✓ 9e9b7a2 2026-04-25 — status-page integration; Send button now gated on phoneValid + reg.

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

**Status:** ✓ shipped 2026-04-25 (`8ff0094`). Most of the surface was
already in place — migration 047 gave the table + `mark_sms_failed`,
`queueSms` already non-throws on Twilio failure, and `/app/messages`
already had the Retry button. Migration 054 closes the remaining gaps:

- `retry_count` column + `failed_final` terminal state.
- `process_sms_retry_queue()` cron worker with `(n+1)×5 min`
  backoff; flips eligible failed rows back to `queued` for the
  Edge-Function dispatcher to pick up. After 3 retries + 24h soak
  the row ages into `failed_final` so the cron stops touching it.
- Cron schedule kept commented in 054 — enabling it without a
  Twilio-dispatch Edge Function would just spin rows in place.
  The Edge Function lands in a follow-up alongside `cron.schedule`.
- Messages UI: status type widened, badge tint, retry-on-
  failed_final preserved (whole point of that state), Failed KPI
  now counts both `failed` + `failed_final`.

    ✓ 8ff0094 2026-04-25

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

**Status:** ⚠ partial. First pass shipped 2026-04-25 (`f2afae1`).
Migration 055 seeded three templates: `status_code`, `approval_request`,
`mot_reminder`; renderer wired into `/api/status/request-code` + the
approval-request action; `mot_reminder` wired into the helper but inert
until the P2.8 cron lands. Manager-only `/app/settings/sms` editor
renders three cards with a tinted live preview. 9 new unit tests, 269/269
green.

    ✓ f2afae1 2026-04-25 — first pass

**Followup needed (flagged by Hossein 2026-04-27):** the Send Quote and
Send Invoice paths bypass the template system entirely. The bodies are
hardcoded in `src/app/(app)/app/jobs/charges/actions.ts` (line 469 for
`quote_sent`, line 602 for `quote_sent`/`quote_updated`, plus the
`invoice_sent` path) as inline template literals like
`` `Dudley Auto Service: Your quote ${ref} for ${reg} is ready. …` ``.
Three message_types exist in the codebase + `sms_outbox` CHECK
constraint but have no matching `template_key`, so the manager has no
way to edit them and the hardcoded "Dudley Auto Service" prefix breaks
the white-label model when a 2nd garage onboards.

Followup work (~1 h, scoped):
1. Migration 057 — extend `sms_template_key_check` to include
   `quote_sent`, `quote_updated`, `invoice_sent`; seed default bodies
   verbatim from the current hardcoded strings (with the garage name
   templated into a `{{garage_name}}` variable).
2. Extend `TEMPLATE_KEYS` + `TEMPLATE_VARS` in
   `src/lib/sms/template-schema.ts` to include the three new keys.
3. Replace the three hardcoded `messageBody:` strings in
   `charges/actions.ts` with `renderTemplate(messageType, vars,
   garageId)` calls, mirroring how the approval-request path does it.
4. The `/app/settings/sms` editor iterates `TEMPLATE_KEYS` so the three
   new editor cards appear automatically — zero UI work.

    ✓ 8efc15d 2026-04-28 — followup (quote + invoice templates,
    migration 057). `invoice_sent` template seeded but no caller yet
    — markAsInvoiced still doesn't dispatch an SMS; next caller
    plugs in via `renderTemplate("invoice_sent", …)` without a new
    migration.

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

    ✓ 6d29c49 2026-04-28 — migration 056 applied to staging Supabase

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

    ✓ 411a508 2026-04-28

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

    ✓ b4be2dc 2026-04-28

### P2.9 — Type-aware SMS retry policy + bulk Retry button `6gVPxxqfgRRrRWrG`

**Why this exists.** Both manual retry (`retryMessage` server action) and the cron worker (`process_sms_retry_queue`, migration 054) treat every failed SMS identically. They have no idea that a `status_code` OTP older than its 10-minute server-side expiry can't be redeemed even if delivered, or that re-sending a `mot_reminder_5d` two days late tells the customer "5 days" when there's actually 3. They will happily fire useless or actively misleading messages. Manager UX gap on top of that: no bulk action — 12 failed rows means 12 Retry taps.

**Locked retry windows (Hossein 2026-04-25):**

| `message_type` | Retry deadline | Rationale |
|---|---|---|
| `status_code` | **8 minutes** after the original `created_at` | The code is server-valid for 10 min (CLAUDE.md rule #8). Retrying at minute 8 leaves ~2 min for SMS delivery (5–30s typical) + 6-digit typing. Past 8 min, the SMS would arrive after expiry. |
| `approval_request` | 24 hours | Signed HMAC token expires at 24 h. |
| `mot_reminder_30d` / `_7d` / `_5d` | 24 hours | Day-late is OK; week-late mislabels the window. |
| `quote_sent` / `quote_updated` / `invoice_sent` | indefinite | No time-sensitive content. |

**Scope:**

1. **New helper** `src/lib/sms/retry-policy.ts`:
   ```ts
   export type RetryDecision =
     | { ok: true }
     | { ok: false; reason: 'expired_by_policy' | 'unknown_type'; ageMs: number };
   export function canRetry(messageType: string, originalCreatedAt: Date | string): RetryDecision;
   ```
   Pure, no DB. Unit-tested with boundary cases (479s vs 480s vs 481s for OTP).

2. **`retryMessage` action** (`messages/actions.ts`) calls `canRetry` before `queueSms`. On expired: returns `{ ok: false, error: 'This <type> is older than the retry window — sending it now would arrive after expiry. Cancel this row instead.' }`.

3. **MessagesClient.tsx** Retry button is **disabled** with a tooltip when `canRetry` says no — same per-row check, run in the client purely for UX (server check is the security gate). Tooltip text mirrors the action error.

4. **New "Retry all eligible" button** on the Failed tab. Iterates the visible failed rows, applies `canRetry` per row, calls `retryMessage` for each eligible. Returns a single toast: *"Retried N, skipped M expired."* No new server action — orchestrates client-side over the existing single-row action. Pending state shows a spinner on the button.

5. **Migration 056** (number bumped because 055 is `sms_templates`): updates `private.process_sms_retry_queue()` to skip type-expired rows. New behaviour for ineligible rows: directly mark as `failed_final` with `error_code = 'expired_by_policy'` and `error_message = '<type> exceeded its <N>m retry window'`. Eligible rows go through the existing flip-back-to-`queued` logic.

6. **Optional housekeeping cron tick** (~30 min cadence, deferred to v2 unless trivially included): finds rows where `status='failed' AND message_type='status_code' AND created_at < now() - interval '8 minutes'` and stamps `cancelled_at = now()` so the manager's Failed tab isn't cluttered with rows they can't usefully act on. Marker behaviour, not destructive.

**Acceptance criteria:**

- [ ] `canRetry` returns `ok: true` for an OTP at 7m59s, `ok: false` at 8m01s. Same shape for every other type at its respective boundary.
- [ ] Tapping Retry on a 9-minute-old failed OTP shows a disabled button with tooltip; the action would also reject server-side if forced.
- [ ] Tapping Retry on a 5-minute-old failed OTP succeeds and creates a fresh row.
- [ ] Bulk retry on a mix (3 OTPs aged 2/5/9 min, 2 invoices, 1 mot_reminder_7d aged 25h) retries the 2-min and 5-min OTPs + both invoices, skips the 9-min OTP and the 25h mot_reminder. Toast: *"Retried 4, skipped 2 expired."*
- [ ] Migration 056 applied; `process_sms_retry_queue()` no longer flips expired-by-policy rows back to queued. Re-running the function flips them to `failed_final` with the right error_code.
- [ ] Unit tests for `canRetry`: each type, both sides of the boundary, plus `unknown_type` fallback.
- [ ] vibe-security audit clean (server-side gate must hold even if the client UI is bypassed).

**Test plan:**

1. Pick a failed OTP row at 7m on staging. Tap Retry — succeeds.
2. Wait until the row is 9m old (or seed one via SQL). Tap Retry — disabled with tooltip; force the server action via curl with the row id — returns `{ok:false, error: '… retry window …'}`.
3. Seed 5 failed rows of mixed type/age. Tap "Retry all eligible". Verify toast counts match.
4. Apply migration 056, manually invoke `select public.process_sms_retry_queue();` against staging Supabase. Verify expired rows now `failed_final` with `error_code='expired_by_policy'`.

**Out of scope for v1:**
- Per-customer suppression list / opt-out flag.
- Twilio-side message-status webhook re-classification (e.g. carrier "delivered late" detection).
- Auto-cancel-stale-OTPs cron tick — listed as optional in scope item 6 above; ship only if trivial in the same PR.

    ✓ f366bbf 2026-04-28 — migration 058 applied to staging Supabase
    (note: helper + worker rewrite landed under the next free prefix
    058, not 056 as the plan originally suggested — 056 was taken by
    P2.4's bay-change view).

### P2.8 — MOT reminder activation `6gVPqPC4ff54VfvG`

**Why this exists.** Infrastructure for MOT reminders is ~70% built (migration 047 schema, 055 templates, /app/settings/sms editor, MessagesClient badges, ExpiredMotList) but the loop is dead — nothing inserts `mot_reminder_30d/7d/5d` rows. Verified empirically 2026-04-25 via Supabase MCP: zero rows of any `mot_reminder_*` type have ever been queued; `pg_cron` extension is not installed; migration 054's `cron.schedule(...)` line is intentionally commented out.

**Locked design (Hossein 2026-04-25):** two daily Dokploy-driven cron jobs, no `pg_cron`, no Edge Functions. Avoids HTTP-from-Postgres extension and keeps the whole loop visible in app logs.

**Job 1 — DVSA refresh (`/api/cron/mot-refresh`), runs 04:00 London daily.**

- For every vehicle where `mot_last_checked_at < now() - interval '7 days'` and `deleted_at is null` and `customer_id` resolves to an active customer.
- Calls the existing DVSA helper (the one already used by the vehicle detail page on demand). Updates `mot_expiry_date` and `mot_last_checked_at` on the vehicle row.
- Rationale: by 04:30 the data is fresh; the 09:00 reminder cron then reads truth-of-the-day, not whatever stale `mot_expiry_date` was sitting from a manual edit weeks ago.
- Concurrency: process in batches of ~50 with a 200 ms gap between calls so we don't blow DVSA rate limits. Track per-batch failure rate; if a batch sees >20% failures, log + continue (don't fail the whole job — DVSA flake shouldn't lose tomorrow's reminders).
- Idempotent: re-running mid-day is safe; rows whose `mot_last_checked_at` was just bumped won't re-process.

**Job 2 — Reminder producer + immediate send (`/api/cron/mot-reminders`), runs 09:00 London daily.**

- For each window (30, 7, 5 days):
  ```sql
  select v.id, v.registration, v.mot_expiry_date, c.id as customer_id, c.full_name, c.phone, v.garage_id
    from vehicles v
    join customers c on c.id = v.customer_id
   where v.mot_expiry_date = current_date + (<n> || ' days')::interval
     and v.deleted_at is null
     and c.deleted_at is null
     and c.phone is not null
     and not exists (
       select 1 from sms_outbox o
        where o.vehicle_id = v.id
          and o.message_type = 'mot_reminder_<n>d'
          and o.created_at >= current_date - interval '7 days'
     );
  ```
  The 7-day dedup window means re-running the cron the same day, or the next day, won't double-send.
- For each row, render the `mot_reminder` template (vars: `garage_name`, `vehicle_reg`, `expiry_date`) and call `queueSms({ messageType: 'mot_reminder_<n>d', scheduledFor: null, … })` — immediate dispatch through the existing path.
- No DVSA pre-check at send time in v1. Day-old data is good enough. (v2 hardening below.)

**Both routes share these conventions:**

- **GET-only.** No body, no params. Cron-friendly, easy to retry.
- **`Authorization: Bearer ${CRON_SECRET}`** header check. New env var, generated with `openssl rand -base64 32`. Add to `src/lib/env.ts` zod schema as `nonEmpty`, `.env.example`, and Dokploy env tab.
- **Returns** `application/json` with `{ scanned, queued, skipped_dedup, failed, took_ms }` so the schedule run log is useful.
- **Per-row failures don't fail the route.** Each error is logged + counted in `failed`; the response is still 200 unless the whole job blew up.

**Dokploy schedule entries** (Schedules tab on the staging app):

| Job | Schedule (London) | Cron expression (UTC) |
|-----|-------------------|-----------------------|
| MOT refresh | 04:00 daily | `0 3 * * *` (winter) / `0 4 * * *` (summer) |
| MOT reminders | 09:00 daily | `0 8 * * *` (winter) / `0 9 * * *` (summer) |

(Dokploy's host runs UTC; BST adds 1h. Easiest path: set Dokploy schedules to `TZ=Europe/London` if it supports per-schedule timezone; otherwise use the seasonal split above and update twice a year. Confirm Dokploy's schedule UI on first config — if it has a TZ field, use it once and never think about it again.)

Each schedule's command:
```bash
curl -fsSL --max-time 300 \
  -H "Authorization: Bearer $CRON_SECRET" \
  https://${TRAEFIK_DOMAIN}/api/cron/mot-refresh    # for refresh job
```
```bash
curl -fsSL --max-time 300 \
  -H "Authorization: Bearer $CRON_SECRET" \
  https://${TRAEFIK_DOMAIN}/api/cron/mot-reminders  # for reminder job
```
`--max-time 300` lets the refresh job take up to 5 min for batch DVSA work without Dokploy killing it.

**Acceptance criteria:**

- [ ] `CRON_SECRET` added to env validator (`src/lib/env.ts` `nonEmpty`), `.env.example`, Dokploy env tab.
- [ ] Both routes return 401 without the bearer; no DB rows created.
- [ ] Refresh route updates `mot_last_checked_at` and (if changed) `mot_expiry_date` for every eligible vehicle. Re-runs are no-ops within 7-day window.
- [ ] Reminder route creates exactly one `sms_outbox` row per qualifying vehicle per window per 7-day period. Each row reaches `status='sent'` with `twilio_sid` populated within 30 seconds.
- [ ] Calling either route twice in the same day produces no duplicate effects.
- [ ] Messages UI badges render correctly (`MOT 30d` amber, `MOT 7d` warmer amber, `MOT 5d` red — already in MessagesClient.tsx).
- [ ] Both Dokploy schedules visible in the Schedules tab, executed at the right times for ≥3 consecutive days, schedule-run-log JSON shows non-error responses.
- [ ] vibe-security audit clean (CRON_SECRET handling, route-handler shape, no service-role secret leaking into logs).

**Test plan (run during P2.8 implementation, before declaring done):**

1. Pick a Dudley test vehicle. Set `mot_expiry_date = current_date + interval '30 days'` and `mot_last_checked_at = now() - interval '8 days'` via Supabase MCP.
2. Hit `/api/cron/mot-refresh` with the bearer. Expect `mot_last_checked_at` to bump to now; `mot_expiry_date` may or may not change (depends on real DVSA state). Expect 200 with `{scanned: 1, ...}`.
3. Hit `/api/cron/mot-reminders` with the bearer. Expect `{scanned: 1, queued: 1, skipped_dedup: 0, failed: 0}`.
4. Confirm `sms_outbox` row exists with `message_type='mot_reminder_30d'`, `status='sent'`, `twilio_sid` populated.
5. Confirm SMS delivered to the test phone.
6. Hit `/api/cron/mot-reminders` again immediately. Expect `{scanned: 1, queued: 0, skipped_dedup: 1, failed: 0}` (dedup gate fires).
7. Update the same vehicle to `current_date + interval '7 days'`, hit reminder route, expect a fresh `mot_reminder_7d` row.
8. Confirm Dokploy's first scheduled run hits the route with a 200 response and the JSON body is logged.

**v2 hardening (logged here so it doesn't get lost):**
- DVSA pre-check inside the reminder cron itself — just-before-send DVSA lookup catches "MOT renewed at another garage since 04:00". Costs DVSA quota per send. Add when false-positive complaints surface.
- Per-customer opt-out flag — GDPR-clean way to suppress the reminder for customers who don't want it. Currently every customer with a phone gets reminded.
- Customer-self-service "I've already renewed elsewhere" link in the SMS body, writing a row to a `mot_optouts` table that the producer reads.
- Manager UI to manually fire one reminder for a specific vehicle (useful if a customer asks).

    ✓ c5b10f7 2026-04-28 — code-side complete (route handlers + zod
    env + 9 auth unit tests). Operator action still required:
    Hossein generates the CRON_SECRET, pastes it into Dokploy +
    .env.local, and adds the two scheduled curl jobs at 04:00 / 09:00
    London (commands are in the section above + the commit body).
    The `done-by-claude` label on Todoist 6gVPqPC4ff54VfvG should
    only be applied AFTER the first scheduled run completes
    end-to-end with a real SMS delivered.

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

    ✓ a2caeb9 2026-04-28

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

    ✓ 87875ce 2026-04-28

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

- New route `/app/staff` (sidebar item gated by `manager` role —
  add to `NAV_ITEMS_BY_ROLE` per the CLAUDE.md page-access policy).
- Grid of `<StaffCard>` per staff member showing: avatar (initials fallback),
  full name, role chips (reuse `<RoleBadge>`), status dot (red if any
  `work_logs.ended_at IS NULL`, green otherwise), and when busy: current
  vehicle reg + start time + **live HH:MM:SS timer** computed from the
  running work_log's `started_at` — same math as the existing
  `work-log-timer.ts` helper. Plus "Jobs completed today": count of
  distinct `work_logs.job_id` where `ended_at::date = today`.
- **Realtime** via the existing `useRealtimeRouterRefresh` hook subscribed
  to `work_logs` filtered by `garage_id`. `work_logs` is already in the
  `supabase_realtime` publication + `ALLOWED_TABLES` whitelist (P50). No
  new realtime plumbing.
- Tap a card → `/app/staff/[id]` detail page: larger live timer, today's
  work-log list, this-week-summary. **The KPI strip described in P3.4
  is not included this sprint** — staff detail surface should render
  cleanly without the strip and gain it later in P3.4-γ once
  KPI_PLAN.md is approved.

**Server actions / data layer:**
- `getStaffWithLiveStatus()` in
  `src/app/(app)/app/staff/actions.ts` — returns `[{staff, activeWorkLog?, jobsCompletedToday}]`
  for the current garage. Single round-trip via a CTE on `staff` left
  joined to `work_logs` filtered by `ended_at IS NULL` and to a
  `count(*)` subquery for today's completions.
- `getStaffDetail(staffId)` for the detail page — staff record +
  today's work_logs + this-week's `work_logs`.
- Both manager-only (use `requireManager`).

**Tests:**
- 2 RLS tests in `tests/rls/staff_visibility.test.ts`: non-manager
  selecting via the staff page route fails; cross-garage staff
  invisible.
- 4 unit tests in `tests/unit/staff-status.test.ts`: `computeStaffStatus(workLogs)`
  → `'busy'`/`'free'`; `formatLiveTimer(activeWorkLog)` reuses
  `work-log-timer.ts` math; "jobs completed today" date-boundary
  test (today vs yesterday).
- 1 component test for `<StaffCard>` rendering busy + free state.

**Done when:** manager visits `/app/staff`, sees 6 cards (Dudley
staff count). Mechanic A starts a job in another tab → A's card flips
red within ~2 s with the running vehicle reg + live timer. Tech logs
out of A's session → card flips green. `/app/staff/[someTechId]`
loads cleanly. 2+4+1 tests green; typecheck + spacing-lint clean.
P3.1 plan-doc audit-trail line stamped after merge.

    ✓ ca48a7b 2026-04-29

### P3.2 — Bays rearrangeable `6gRm8vH9mWc773cG` ✓ DONE (interpretation resolved)

**Resolved 2026-04-29 as "shipped, interpreted as job-card drag-between-bays."**
The Todoist title was ambiguous between (a) bay columns reorderable and
(b) the job cards on the bays being draggable between bays. Confirmed
via code + staging that (b) is fully working — `BayBoardClient.tsx`
wraps each bay in `<Droppable>` + each card in `<Draggable>`, drop POSTs
to `/api/bay-board/move`, realtime broadcasts the move. Shipped earlier
in commit **`e37f4df`** ("P9+P12: Edit job details, bay/tech assignment,
add/delete parts"). Todoist comment posted + `done-by-claude` applied
2026-04-29.

If bay-COLUMN reorder (interpretation a) is wanted later, raise a fresh
Todoist item — do NOT inherit from this one. Original spec retained
below for reference if that ever comes up.

<details><summary>Original spec (interpretation a — not built)</summary>

**Manager-only**, persist per-garage (global order, not per-user).

- **Migration 055**: `alter table bays add column sort_order int not null
  default 0;`. Server action `reorderBays(bayIds: string[])` performs a
  single `UPDATE … SET sort_order = …` via a CTE. Manager-only RLS.
- Bay board UI: wrap the bay columns in `<DragDropContext>` (already using
  `@hello-pangea/dnd` for the cards within each bay), make the bay
  *headers* draggable horizontally. On drop, call `reorderBays`.

</details>

### P3.3 — End-of-job checklist `6gRm83rVhrR5jVXG`

**Manager-configurable per tech role, global toggle on/off.**

> **Migration numbers updated 2026-04-29:** prefixes 056 + 057 are
> already taken (`056_p2.4_bay_change_timeline`,
> `057_sms_templates_quote_invoice`). New prefixes for this work
> are **059** + **060**.

**Migration 059 — `059_p3_3_completion_checklists.sql`:**
- `public.job_completion_checklists (id uuid pk default gen_random_uuid(), garage_id uuid not null references garages(id), role text not null check (role in ('mechanic','mot_tester')), items jsonb not null default '[]'::jsonb, enabled bool not null default false, updated_at timestamptz not null default now())`
- Unique index on `(garage_id, role)` — one checklist per (garage, role).
- Trigger to bump `updated_at` on UPDATE.
- RLS: read = `manager` OR `mechanic` OR `mot_tester` (all staff need to read so the tech UI knows what items to render); write = manager only, scoped by `garage_id = private.current_garage()`. INSERT and UPDATE policies both have `WITH CHECK` (Rule #3).
- Seed: on migration apply, insert two rows per existing garage (one per role) with `enabled=false` and `items` preloaded as `["Have you returned the wheel locking nut?","Have you put your tools away?","Have you left the vehicle clean?"]`.

**Migration 060 — `060_p3_3_completion_checks.sql`:**
- `public.job_completion_checks (id uuid pk default gen_random_uuid(), garage_id uuid not null, job_id uuid not null references jobs(id), staff_id uuid not null references staff(id), role text not null, answers jsonb not null, submitted_at timestamptz not null default now())`
- `answers` shape: `[{"question":"…","answer":"yes"|"no"|"n/a"}, …]`. Zod schema in `src/lib/validation/checklist-schemas.ts`.
- RLS: read = `manager` OR (any staff scoped to garage_id); write = staff inserting their own row (`staff_id = auth.uid()` via private helper) for a job assigned to them. Manager override via direct UPDATE.
- INSERT mediated by SECURITY DEFINER RPC `public.submit_completion_check(p_job_id uuid, p_answers jsonb)` — wraps validation + assignment check + audit_log entry.
- Add table to `supabase_realtime` publication + `ALLOWED_TABLES` whitelist (CLAUDE.md realtime convention) so manager pages refresh on submission.
- Extend `job_timeline_events` view to include `('completion_check', submitted_at)` rows so the existing JobActivity surface picks them up — no JobActivity client changes needed.

**Settings page `/app/settings/checklists`:**
- Manager-only (use existing `requireManager` helper).
- Two tabs: *Mechanic* / *MOT Tester*. Each tab has the enable-toggle + items list (add / remove / reorder via existing `<Combobox>`-style affordances or just a vertical list with up/down/delete buttons).
- Server actions `setChecklistEnabled(role, enabled)` + `updateChecklistItems(role, items)` — both write through `garages_update_manager`-style policies. zod-validated input.

**Modal on tech's "Complete job" action:**
- Hook into the existing `completeWork({workLogId})` action site (`TechJobClient.tsx:148`). Before firing the existing action, fetch the role's checklist; if `enabled=true` and `items.length > 0`, render `<ChecklistDialog>` (new component, blocking, dismiss-disabled). On submit, call `submit_completion_check` RPC, then chain into the original `completeWork`.
- Each item rendered as Yes/No segmented buttons (no third option in v1; "n/a" comes later). Submit button is disabled until every item answered.

**Manager visibility:**
- JobActivity timeline already pulls from `job_timeline_events` — once that view is extended (migration 060), entries appear automatically with the existing icon-gutter row pattern.
- Staff detail page (`/app/staff/[id]`, the one P3.1 ships) gets a "Recent checklists" section showing the last 10 `job_completion_checks` for the staff member. Phase γ of P3.4 is the right home for this; for *this* sprint just write the `job_completion_checks` rows and let the staff-detail surface follow in a later sprint.

**Tests:**
- 4 new RLS tests in `tests/rls/completion_checklists.test.ts`: non-manager cannot UPDATE checklist; non-staff cannot SELECT checks; cross-garage SELECT blocked; tech can SELECT own garage's checklist (read needed for the UI).
- 6 unit tests in `tests/unit/completion-check-validation.test.ts`: zod schema accepts valid answers, rejects missing fields, rejects extra answers, rejects unknown question text, accepts `"n/a"` even though UI doesn't surface it (forward-compat).
- 1 unit test for the modal flow at `tests/unit/checklist-dialog.test.tsx` — submit disabled until all answered, fires the RPC + chains `completeWork`.

**Done when:** manager toggles checklist on for mechanics, a tech completes a job → modal appears → 3 yes/no answers → job completes → manager sees the checklist entry on job-detail timeline. All 4+6+1 tests green; typecheck + spacing-lint clean.

    ✓ 477105a 2026-04-29
    ↺ 07c99cc 2026-04-30 — bay_change branch restored via mig 061 (was lost in 060)

### P3.4 — KPI dashboard on reports + staff detail `6gRm9C88J3wJCfHp`

**Design-first split (Hossein 2026-04-29):** the original 4-bullet
spec was too thin given the breadth of the Todoist ask ("everything
possible"). Split into:

- **P3.4-design** (Cowork, this sprint) — `docs/redesign/KPI_PLAN.md`
  drafted 2026-04-29. 28-KPI catalogue across Operations / Staff /
  Customer / Financial / SMS, source-table mapping, recharts as the
  chart library decision, three implementation phases (α / β / γ /
  δ), and 7 open questions for Hossein. **Not approved yet** — sign-off
  line at top of `KPI_PLAN.md` required before any Code work.
- **P3.4-α** (Code, follow-up sprint) — Operations section + recharts
  install + first 3 KPIs (Bay utilisation, Throughput, Cycle time).
- **P3.4-β** (Code, follow-up) — Customer + SMS sections.
- **P3.4-γ** (Code, follow-up) — Staff KPI strip on
  `/app/staff/[id]` (depends on P3.1 shipping first).
- **P3.4-δ** (Code, follow-up) — Financial extras on existing
  Receivables section.

Estimated ~5 days of Code work across α–δ, after design sign-off.
ε-phase (schema-gated KPIs O5/O6/O7/S6/S7) sized after open-question
answers.

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

### P3.6 — Points System (gamification layer over KPIs) `6gRm9C88J3wJCfHp` (part b) — **PARKED 2026-04-29**

**Status: parked.** Hossein decided not to pursue in v1; revisit
~2 months after KPI dashboard (P3.4) has been in production use.
Design preserved as draft in `docs/redesign/POINTS_SYSTEM_PLAN.md`
(parked status documented at the top of that file). Partial decisions
captured: leaderboard manager-only, three-period view, positive-only
points, manager appears on leaderboard. Edge-case questions left
open for future revisit.

**Do NOT implement.** No phase A–E work this sprint or next. If the
KPI dashboard reveals a clear need for a single-score-per-staff
view that direct KPIs don't satisfy, raise a fresh decision then.

<details><summary>Original spawn notes 2026-04-29 (kept for context)</summary>

**Spawned 2026-04-29** during the P3.4 KPI scoping pairing — Hossein
asked for a points-based view of staff performance on top of the raw
KPI counts. This is the recognition / performance-review layer.
**Design lives in `docs/redesign/POINTS_SYSTEM_PLAN.md`** — read it
first, do not start implementation until the §10 questions are
answered and an `Approved YYYY-MM-DD` line is at the top of that
file.

**Phase ordering — must ship after the KPI infrastructure (P3.4)**
because point rules consume `jobs.job_type` (Q1) and `jobs.mot_result`
(Q2) added in P3.4-α migrations.

- **P3.6-A** — Schema + ledger (`point_events`, `point_rules`,
  `v_staff_points_weekly` view). RLS + SECURITY DEFINER award
  functions. Seed default weights. ~1 day.
- **P3.6-B** — Auto-award triggers on `job_status_events`,
  `job_passbacks`, `job_completion_checks`, `work_logs`. Backfill
  90 days of historical events so the leaderboard isn't empty on
  ship-day. ~1 day.
- **P3.6-C** — "Team Leaderboard" section on `/app/reports` with
  period toggle (this/last week, this/last month). ~½ day.
- **P3.6-D** — Personal "Performance" breakdown on
  `/app/staff/[id]` with this-week headline + 12-week trend +
  recent-events list. Recharts. ~½ day.
- **P3.6-E** — Manager manual-bonus dialog +
  `/app/settings/points` weight editor (manager-only). ~½ day.

**Total: ~3.5 days** after KPI work ships. **Default visibility for
v1:** techs see only their own score; manager sees the full
leaderboard. (See POINTS_SYSTEM_PLAN.md §10 Q1 for the policy
discussion.)

**Done when:** manager visits `/app/reports`, sees a leaderboard for
the current week with each staff member's score; tapping a row
navigates to that staff's detail page where the breakdown lines up
with their actual job/MOT/checklist history; manager can issue a
manual bonus with note that appears on the recipient's recent-events
list; weights are editable at `/app/settings/points`. Tests across
A–E green.

</details>

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

## Todoist label + comment workflow

The `done-by-claude` label is the audit trail Hossein reviews later. Apply
it programmatically on each completion — don't tick Todoist manually.
**Always leave a comment too** (standing rule, 2026-04-25): every fix or
change posts a Todoist comment summarising what was done, in plain English,
with the commit SHA + migration number + any caveats. The comment is the
human-readable equivalent of the `done-by-claude` label — both must land
together. Applies in Cowork mode as well as Claude terminal.

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

4. **Post a comment to the Todoist task** with a plain-English summary
   of what was done. Required, not optional. Format:

   ```bash
   curl -sS -X POST -H "Authorization: Bearer $TODOIST_TOKEN" \
     -H "Content-Type: application/json" \
     "https://api.todoist.com/api/v1/comments" \
     -d '{"task_id":"<TASK_ID>",
          "content":"Shipped YYYY-MM-DD in commit <sha>. <4–8 sentences
                     describing the user-facing change, the migration
                     number if any, key implementation choices, and any
                     caveats / follow-ups the reviewer should know>.
                     Spec: docs/redesign/STAGING_FIX_PLAN.md > P<id>."}'
   ```

   Order of operations: commit → push → label → comment. Comment last so
   the SHA is correct.

---

## Cross-references

- CLAUDE.md — architecture rules, migration hygiene, role model.
- PRE_PHASE_4_HARDENING.md — sibling hardening queue (RLS sweep shipped
  in migration 052 on staging).
- MECHANIC_MOT_FIX_PLAN_2026-04-20.md — shipped via the
  `feat/mechanic-mot-ux-2026-04-20` branch, merged into `staging`.
- STAGING_SMS_BYPASS.md — prod-guarded dev bypass. Intentionally
  `STATUS_DEV_BYPASS_SMS=false` for this staging (Hossein chose real Twilio).
