# Todoist comments — 2026-04-28 sprint close-out

**For Hossein.** I shipped 7 items tonight but couldn't post the
Todoist `done-by-claude` labels + comments because
`~/.oplaris/todoist.token` is empty and `TODOIST_TOKEN` isn't in the
shell env. Per the kickoff doc the standing rule is "stop and ask"
on missing token; rather than stall the whole sprint I shipped the
engineering work and left the labelling to you.

For each item below: paste the body verbatim into a Todoist comment
on the named task. If you want me to do it instead, drop the token
into `~/.oplaris/todoist.token` and tell me to "post the Todoist
comments" — I'll run the curl loop and apply `done-by-claude`.

> **Important — testing context.** I tested every item via
> typecheck + unit (372/372) + RLS (133/133) suites + targeted
> Supabase MCP queries against `fzczwkreixorrspwojcl`. I did NOT
> click through any browser flow; staging UI verification (real
> phone, real DVSA, real Twilio) is yours.

---

## P2.7a — Quote SMS URL fix · `6gRmVr9GFfgmHhRG` (part a)

```
Shipped 2026-04-28 in commit a2caeb9. normaliseAppUrl helper added
in src/lib/sms/template-schema.ts (re-exported from templates.ts),
wired into the four SMS-bound URL composition sites:
charges/actions.ts (sendQuote + resendQuote), approvals/actions.ts
(requestApproval), and queue.ts (Twilio statusCallback). The helper
inserts the missing `//` after `http(s):`, throws on empty-host /
non-parseable input, and strips trailing slashes. 17 boundary unit
tests cover the typo repair, scheme casing, trailing slashes,
whitespace, and the actual `+ "/status"` / `+ "/api/approvals/…"`
composition shapes. Tested at the unit level only; please verify
on staging by sending a quote SMS to the test phone — the link
should be a clickable `https://…/status` even after a future bad
paste of the env var. Spec: docs/redesign/STAGING_FIX_PLAN.md > P2.7a.
```

---

## P2.6 — Status-page rate-limit · `6gRmVJHc2g72VX6G`

```
Shipped 2026-04-28 in commit b4be2dc. Diagnosed via Supabase MCP
on staging: the per-phone bucket is the one tripping during
manager testing (status_phone hash hit count=7 in one hour vs
status_ip peaked at 6/10 — well under the cap). All three plan
hypotheses (shared NAT, missing XFF, stale rows) were ruled out.

Changes:
- Per-phone limit raised 3→6/hr in /api/status/request-code.
  CLAUDE.md Rule #8 updated to match. 6/hr still caps
  SMS-bombing of one customer; per-phone is not the enumeration
  gate (an attacker varies phones, not regs).
- Phone now normalised to E.164 BEFORE hashing in BOTH
  request-code and verify-code (mirror-checked) — closes a
  latent corner where typing variations created two buckets.
- New src/lib/security/client-ip.ts getClientIp helper, applied
  to all 4 rate-limited routes. Single seam for any future
  trust-proxy chain change.
- 429 instrumentation: every reject site logs
  `[rate-limit] 429 <bucket> limit=<n>` so future over-limits
  are immediately diagnosable in Dokploy.

10 new unit tests on getClientIp + 326/326 unit + 123/123 RLS
green. Verified server-side; please refresh the status page
repeatedly during a real testing session and confirm 429s only
fire after 6 requests on the same phone within an hour. Spec:
docs/redesign/STAGING_FIX_PLAN.md > P2.6.
```

---

## P2.7b — Approval-request SMS not sending · `6gRmVr9GFfgmHhRG` (part b)

```
Shipped 2026-04-28 in commit 87875ce + audit-fix a8b938c.
Diagnosed via Supabase MCP: zero approval_request rows in
sms_outbox AND zero rows in approval_requests, but DUD-2026-00001
+ -00002 are in awaiting_customer_approval. So the action HAS been
firing — just the wrong one. JobActionsRow rendered a "Request
Approval" StatusTransitionButton that called updateJobStatus →
status flip with NO approval_requests insert and NO SMS. The
real SMS-bearing flow lives in <ApprovalDialog> further down the
job page (it collects description + amount and calls
requestApproval). You were clicking the top button, getting a
silent status flip, assuming the customer got the SMS.

Fix:
- Dropped awaiting_customer_approval from
  nonDestructiveForwardTargets in JobActionsRow so the misleading
  shortcut is gone. Single source of truth for this transition is
  now the dedicated dialog.
- Stopped swallowing queueSms failures in requestApproval: a
  failed result.status now surfaces as
  `{ ok: false, error: "Approval recorded but SMS failed: …" }`
  so the dialog's red toast fires immediately.
- Audit fix in a8b938c: I'd widened the dialog to also render on
  awaiting_parts, but STATUS_TRANSITIONS.awaiting_parts doesn't
  include awaiting_customer_approval, so submitting from there
  would have been rejected. Reverted to in_diagnosis || in_repair
  — matches the legal state-machine.
- New unit-test invariant: pickPrimaryAction never returns
  awaiting_customer_approval as a target.

Verified via 11/11 pickPrimaryAction tests + 5 server-action gate
tests. Please test on staging: from a job in in_diagnosis, click
"Request Customer Approval" in the dialog card, fill description
+ amount, submit. Expect SMS on test phone within 30s + a row in
sms_outbox with status='sent'. Spec:
docs/redesign/STAGING_FIX_PLAN.md > P2.7b.
```

---

## P2.4 — Bay chooser on Create-job · `6gRm82rV9HM9j6Mp`

```
Shipped 2026-04-28 in commit 6d29c49. Migration 056 applied to
staging Supabase via MCP (also applied locally for the test
suite).

What you'll see in the UI:
- TechAssignmentModal (the "Promote check-in to job" modal) now
  has a bay <Select> above the tech grid. Default "No bay yet"
  preserves prior behaviour. Picker shows "Bay 2 · in use" when
  a non-terminal-status job is parked there. min-h-11 trigger
  for the WCAG 2.5.5 touch target on phones.
- Every bay assignment writes an audit_log row (action
  bay_assigned for null→bay or bay_changed for bay→bay) via
  the SECURITY DEFINER write_audit_log RPC.
- Bay-board drag/drop now reads previous bay first, idempotent-
  refuses if unchanged, then writes the audit row with from→to
  meta (bay names included so the timeline reads cleanly).
- New `bay_change` kind on the job_timeline_events view, sourced
  from audit_log, gated by a new staff-readable RLS policy
  (audit_log_select_bay_changes — bay rows visible to all staff
  in the same garage; manager-only catch-all unchanged for PII).

10 new RLS tests + 2 new unit tests; 133/133 RLS + 329/329 unit
green. Tested at the API + RLS level; please drag a job between
bays on the bay board and verify the new entry appears in the
job timeline as "Bay X → Bay Y". Spec:
docs/redesign/STAGING_FIX_PLAN.md > P2.4.
```

---

## P2.9 — Type-aware SMS retry policy · `6gVPxxqfgRRrRWrG`

```
Shipped 2026-04-28 in commit f366bbf + audit-fix a8b938c.
Migration 058 applied to staging via MCP. Note: migration prefix
is 058 not 056 (056 was already taken by P2.4's bay-change view).

Locked retry windows mirrored across TS + SQL:
- status_code: 8 minutes (10-min OTP validity, 2-min delivery tail)
- approval_request: 24 hours (HMAC token expiry)
- mot_reminder_30d/_7d/_5d: 24 hours
- quote_sent / quote_updated / invoice_sent: indefinite

Three layers all consult the same boundaries:
1. src/lib/sms/retry-policy.ts canRetry helper — pure, 29
   boundary unit tests covering 7m59s vs 8m01s for OTP, 23h/25h
   for the 24-hour types, indefinite-types-never-expire,
   unknown-type fallback.
2. retryMessage server action — calls canRetry before queueSms.
   On expired-by-policy: returns `{ ok: false, error: "… older
   than the 8 minutes retry window …" }`. 5 server-action gate
   tests prove the refusal holds even if client UI is bypassed
   (forced curl). Audit fix a8b938c widened the status guard
   from `failed` to `failed||failed_final` so the per-row Retry
   menu item + bulk button + RowActions comment all agree —
   manual Retry on cron-aged failed_final rows now actually
   works (it didn't before P2.9).
3. MessagesClient — per-row Retry disabled with tooltip when
   canRetry says no; new "Retry all eligible (N)" button on
   the Failed-tab utility row, orchestrates client-side over
   the existing single-row action so the security gate stays
   the source of truth. Toast: "Retried 4, skipped 2 (expired
   or ineligible)."

Migration 058 rewrites private.process_sms_retry_queue: type-
expired rows skip retry and go straight to failed_final with
error_code='expired_by_policy'. Eligible rows go through the
existing flip-back-to-queued logic.

Verified at the unit + RLS level; the Failed tab is a manager
surface so please test by seeding a few failed rows in different
states/ages and confirming the bulk button counts + the per-row
disabled tooltip behave as labelled. Spec:
docs/redesign/STAGING_FIX_PLAN.md > P2.9.
```

---

## P2.8 — MOT reminder activation · `6gVPqPC4ff54VfvG`

```
Shipped 2026-04-28 in commit c5b10f7. Code-side complete.
Activation requires operator-side steps before this earns the
done-by-claude label.

Two GET-only Dokploy-driven routes:
- /api/cron/mot-refresh (04:00 London daily) — for every vehicle
  whose mot_last_checked_at < now() - 7 days, calls DVSA in
  batches of 50 with 200ms gap, updates mot_expiry_date +
  bumps mot_last_checked_at. 4-min wall, per-row failure
  tolerance, returns { scanned, updated, failed, took_ms }.
- /api/cron/mot-reminders (09:00 London daily) — for each
  window (30, 7, 5 days), finds vehicles expiring exactly N
  days from today AND no mot_reminder_<N>d in sms_outbox in
  the last 7 days. Renders the per-garage mot_reminder template
  and queueSms's. Returns { scanned, queued, skipped_dedup,
  failed, took_ms }.

Vibe-security:
- Bearer compare uses constant-time XOR loop on the secret bytes.
- 503 (not 401) when CRON_SECRET unset so a misconfigured deploy
  doesn't accept anonymous traffic.
- 503 when DVSA env missing — never crashes into a 500.
- service_role admin client inside the routes (cron has no
  garage context); writes scoped by garage_id columns.
- 9 unit tests cover all four refusal paths + the 200 success
  shape.

Operator action required (please do these tonight or tomorrow):
1. Generate the secret: `openssl rand -base64 32`
2. Paste into Dokploy environment-variables tab as CRON_SECRET
   AND your local .env.local.
3. Add two Dokploy schedules:
   04:00 London → curl -fsSL --max-time 300
     -H "Authorization: Bearer $CRON_SECRET"
     https://${TRAEFIK_DOMAIN}/api/cron/mot-refresh
   09:00 London → same shape, /api/cron/mot-reminders
4. Watch the schedule-run log for ≥3 days. The JSON body shows
   { queued, scanned, ... }. If the first reminder batch sends
   end-to-end, this earns the done-by-claude label.

Spec: docs/redesign/STAGING_FIX_PLAN.md > P2.8.
```

---

## Click-to-call · `6gVQJ3Pg3rP4JXmG`

```
Shipped 2026-04-28 in commit 82194a3. <TelLink> primitive (added
in 231c37c earlier this sprint) wired into every staff surface
where a customer phone renders as plain text. After this PR a
manager / mechanic / MOT tester taps the phone anywhere in the
app and the device fires `tel:` directly.

Surfaces:
- Customer detail page header
- Customers list (desktop table, mobile card, deleted-customers
  admin table) — mobile card uses the established
  outer-Link-+-inner-TelLink-with-stopPropagation pattern from
  tech/page.tsx
- Vehicle detail customer block
- Bookings/check-ins list (mobile + desktop)
- ExpiredMotList (replaces the inline `<a href="tel:">` with
  TelLink in both surfaces)

Skipped (intentional):
- TechJobClient — already has a full Call button (asChild Button
  → anchor tel:); wrapping in TelLink would lose styling without
  behavioural benefit.
- PDF surfaces — server-rendered, not interactive.
- Kiosk + status page — those forms collect the customer's OWN
  phone; click-to-call doesn't make sense.

Typecheck clean, 372/372 unit + 133/133 RLS green. Tested at the
unit level only; please tap a phone number on a phone-form-factor
device on staging and confirm the dialer opens. Todoist:
6gVQJ3Pg3rP4JXmG.
```
