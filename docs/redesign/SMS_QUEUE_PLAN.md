# SMS_QUEUE_PLAN.md — Universal SMS Outbox + MOT Reminder System

> **Decided:** 2026-04-20 with Hossein.
> **Scope:** Universal SMS outbox (all message types) + MOT reminder
> automation with DVSA pre-checks + manager SMS queue UI.
> **Priority:** After Phase 4 deploy or fast-follow post-launch.
> **Estimated:** ~6–8 hours across 5 implementation steps.

---

## Step 1 — Migration: `sms_outbox` table + `vehicles` columns (~45 min)

**Migration file:** `supabase/migrations/047_sms_outbox.sql`

```sql
-- 1a. SMS outbox — universal table for every outgoing SMS
CREATE TABLE sms_outbox (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  garage_id       UUID NOT NULL REFERENCES garages(id),
  vehicle_id      UUID REFERENCES vehicles(id),
  customer_id     UUID REFERENCES customers(id),
  job_id          UUID REFERENCES jobs(id),

  -- Message content
  phone           TEXT NOT NULL,
  message_body    TEXT NOT NULL,
  message_type    TEXT NOT NULL,

  -- Scheduling (null = send immediately)
  scheduled_for   TIMESTAMPTZ,

  -- DVSA pre-check (MOT reminders only)
  dvsa_checked_at TIMESTAMPTZ,
  dvsa_result     TEXT,

  -- Twilio delivery tracking
  twilio_sid      TEXT,
  status          TEXT NOT NULL DEFAULT 'queued',
  status_updated_at TIMESTAMPTZ,
  error_code      TEXT,
  error_message   TEXT,

  -- Lifecycle
  cancelled_at    TIMESTAMPTZ,
  cancel_reason   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT sms_type_check CHECK (
    message_type IN (
      'mot_reminder_30d', 'mot_reminder_7d', 'mot_reminder_5d',
      'quote_sent', 'quote_updated',
      'approval_request',
      'status_code',
      'invoice_sent'
    )
  ),
  CONSTRAINT sms_status_check CHECK (
    status IN ('queued', 'sent', 'delivered', 'failed', 'cancelled')
  ),
  CONSTRAINT sms_dvsa_result_check CHECK (
    dvsa_result IS NULL
    OR dvsa_result IN ('no_new_mot', 'mot_renewed_skipped')
  )
);

-- 1b. Indexes
CREATE INDEX sms_outbox_queued_idx
  ON sms_outbox (garage_id, scheduled_for)
  WHERE status = 'queued' AND cancelled_at IS NULL;

CREATE INDEX sms_outbox_status_date_idx
  ON sms_outbox (garage_id, status, created_at DESC);

CREATE INDEX sms_outbox_vehicle_idx
  ON sms_outbox (vehicle_id, message_type, scheduled_for)
  WHERE vehicle_id IS NOT NULL;

CREATE INDEX sms_outbox_twilio_sid_idx
  ON sms_outbox (twilio_sid)
  WHERE twilio_sid IS NOT NULL;

-- 1c. RLS
ALTER TABLE sms_outbox ENABLE ROW LEVEL SECURITY;

-- Managers can read all outbox rows for their garage
CREATE POLICY sms_outbox_select_manager ON sms_outbox
  FOR SELECT TO authenticated
  USING (
    garage_id = private.current_garage()
    AND private.has_role('manager')
  );

-- No direct INSERT/UPDATE/DELETE from authenticated role —
-- all writes go through SECURITY DEFINER functions
REVOKE INSERT, UPDATE, DELETE ON sms_outbox FROM authenticated;

-- 1d. SECURITY DEFINER helper for system writes
CREATE OR REPLACE FUNCTION private.insert_sms_outbox(
  p_garage_id     UUID,
  p_vehicle_id    UUID,
  p_customer_id   UUID,
  p_job_id        UUID,
  p_phone         TEXT,
  p_message_body  TEXT,
  p_message_type  TEXT,
  p_scheduled_for TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO sms_outbox (
    garage_id, vehicle_id, customer_id, job_id,
    phone, message_body, message_type, scheduled_for
  ) VALUES (
    p_garage_id, p_vehicle_id, p_customer_id, p_job_id,
    p_phone, p_message_body, p_message_type, p_scheduled_for
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- 1e. SECURITY DEFINER helper for Twilio status updates
CREATE OR REPLACE FUNCTION private.update_sms_status(
  p_twilio_sid    TEXT,
  p_status        TEXT,
  p_error_code    TEXT DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  UPDATE sms_outbox
  SET status = p_status,
      status_updated_at = now(),
      error_code = p_error_code,
      error_message = p_error_message
  WHERE twilio_sid = p_twilio_sid;
END;
$$;

-- 1f. Vehicle MOT columns (if not already present)
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS mot_expiry_date DATE,
  ADD COLUMN IF NOT EXISTS mot_last_checked_at TIMESTAMPTZ;

-- 1g. Add sms_outbox to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE sms_outbox;
```

**RLS pattern:** Manager read-only. All writes through `SECURITY DEFINER`
functions in `private` schema. Follows the same pattern as `audit_log`,
`job_status_events`, and `job_passbacks`.

---

## Step 2 — `queueSms()` universal helper + rewire existing sends (~1.5 hours)

**File:** `src/lib/sms/queue.ts`

```typescript
type QueueSmsInput = {
  garageId: string;
  vehicleId?: string;
  customerId?: string;
  jobId?: string;
  phone: string;          // E.164
  messageBody: string;
  messageType: SmsType;
  scheduledFor?: Date;    // null = send now
};

type SmsType =
  | 'mot_reminder_30d' | 'mot_reminder_7d' | 'mot_reminder_5d'
  | 'quote_sent' | 'quote_updated'
  | 'approval_request'
  | 'status_code'
  | 'invoice_sent';

export async function queueSms(input: QueueSmsInput): Promise<string> {
  // 1. Insert row via private.insert_sms_outbox RPC
  // 2. If no scheduledFor (send immediately):
  //    a. Call Twilio
  //    b. Update row with twilio_sid + status='sent'
  //    c. On Twilio failure: update status='failed' + error
  // 3. If scheduledFor: leave as 'queued', cron picks it up
  // Returns: sms_outbox.id
}
```

**Rewire these existing call sites to use `queueSms()`:**

| Current location | message_type | Notes |
|---|---|---|
| `jobs/charges/actions.ts` → `markAsQuoted()` | `quote_sent` | SMS on Send Quote |
| `jobs/charges/actions.ts` → `resendQuote()` | `quote_updated` | Revision-aware resend |
| `jobs/approvals/actions.ts` → `requestApproval()` | `approval_request` | Signed HMAC link |
| `api/status/request-code/route.ts` | `status_code` | 6-digit OTP |
| `jobs/charges/actions.ts` → `markAsInvoiced()` | `invoice_sent` | If SMS on invoice ships |

Each call site currently does `twilioClient.messages.create()` inline.
Replace with `queueSms()` — same Twilio call happens inside the helper,
but now the row exists in `sms_outbox` with the SID for tracking.

**Fallback:** If Twilio fails, the row stays with `status='failed'` +
`error_code` + `error_message`. The manager sees it in the queue and
can retry. Current behaviour (log error + skip) is replaced with
visible failure tracking.

---

## Step 3 — Twilio delivery webhook (~45 min)

**File:** `src/app/api/webhooks/twilio/status/route.ts`

```typescript
// POST /api/webhooks/twilio/status
// Twilio calls this with MessageSid + MessageStatus on every
// status change (queued → sent → delivered | failed | undelivered)

export async function POST(req: Request) {
  // 1. Verify X-Twilio-Signature (rule #6)
  // 2. Extract MessageSid + MessageStatus + ErrorCode
  // 3. Call private.update_sms_status(sid, status, errorCode, errorMsg)
  // 4. Return 200
}
```

**Twilio config:** Each `twilioClient.messages.create()` call adds
`statusCallback: '{APP_URL}/api/webhooks/twilio/status'` so Twilio
pushes delivery updates back to us.

**Status mapping:**
- Twilio `queued` / `accepted` / `sending` → our `sent`
- Twilio `delivered` → our `delivered`
- Twilio `failed` / `undelivered` → our `failed`

---

## Step 4 — MOT reminder cron + DVSA pre-check (~1.5 hours)

**File:** `supabase/functions/mot-reminders/index.ts` (Supabase Edge Function)

**Triggered by:** `pg_cron` daily at 06:00 UTC (calls the Edge Function
via `net.http_post`)

**Flow per run:**

```
1. Query vehicles WHERE mot_expiry_date IN (today+30, today+7, today+5)
   AND deleted_at IS NULL
   AND customer has a phone on file
   AND no existing queued/sent reminder for this vehicle+type+date

2. For each vehicle:
   a. Determine reminder_type (30d / 7d / 5d)
   b. DVSA refresh: GET /trade/vehicles/mot-test?registration={reg}
      - Rate: max 15/s, 500k/day (plenty of headroom)
      - Compare latest MOT expiry from DVSA vs our mot_expiry_date
      - If DVSA shows a newer expiry (MOT was renewed):
        → UPDATE vehicles SET mot_expiry_date = new_date,
                              mot_last_checked_at = now()
        → INSERT sms_outbox row with status='cancelled',
          cancel_reason='mot_renewed_elsewhere',
          dvsa_result='mot_renewed_skipped'
        → SKIP sending
      - If no new MOT:
        → UPDATE vehicles SET mot_last_checked_at = now()
        → Continue to send

   c. Build SMS copy (garage-branded):
      - 30d: "Hi {first_name}, your MOT for {reg} expires on {date}.
              Book early — call {garage_name} on {garage_phone}."
      - 7d:  "Reminder: your MOT for {reg} is due next {day_name}.
              {garage_name} has slots available. Call {garage_phone}."
      - 5d:  "Final reminder — your MOT for {reg} expires on {date}.
              Book now to stay legal: {garage_phone}."

   d. Call queueSms() → sends immediately, row tracked in sms_outbox

3. Log summary: "Processed N vehicles, sent M reminders, skipped K
   (MOT renewed elsewhere)"
```

**Batch limits:** Process max 50 vehicles per run to stay well within
DVSA rate limits (15 RPS) and Twilio burst limits. If more than 50
vehicles hit a window on the same day, the next run picks up the rest
(the dedup query — "no existing row for this vehicle+type+date" —
prevents double-sends).

**DVSA caching:** After a DVSA check, `mot_last_checked_at` is stamped.
The cron skips vehicles checked in the last 24h for the same reminder
tier (edge case: cron retries after a partial failure).

---

## Step 5 — UI: `/app/messages` page (~2 hours)

### 5a. Sidebar nav

**File:** `src/app/(app)/layout.tsx` (modify NAV_ITEMS)

Add "Messages" between Reports and Settings. Icon: `ChatText` from
Phosphor or `MessageSquare` from Lucide. Manager-only.

**Badge:** Red dot with count of `sms_outbox WHERE status='failed'
AND garage_id = current_garage()`. Same pattern as the check-ins badge.

### 5b. Page + server component

**File:** `src/app/(app)/app/messages/page.tsx`

```typescript
// RSC: fetch KPIs + first page of messages
// - Sent today: COUNT WHERE status IN ('sent','delivered') AND created_at >= today
// - Failed: COUNT WHERE status = 'failed'
// - Queued: COUNT WHERE status = 'queued'
// Pass to client component for interactive filtering
```

### 5c. Client component

**File:** `src/app/(app)/app/messages/MessagesClient.tsx`

**KPI strip:** 3 cards (Sent today / Failed / Queued) using `<Card size="sm">`.
Failed card uses `text-destructive` when count > 0.

**Filter bar:**
- Type dropdown: All | MOT Reminder | Quote | Approval | Status Code | Invoice
- Status dropdown: All | Queued | Sent | Delivered | Failed | Cancelled
- Date range: shadcn DatePickerWithRange (defaults to last 7 days)
- Search: phone number or registration (debounced 300ms)

**Table (desktop `hidden md:block`):**
| Column | Width | Content |
|---|---|---|
| To | 20% | `<RegPlate>` (if vehicle) + phone below. Reg links to vehicle page. |
| Type | 12% | Colour-coded badge. MOT=amber, Quote=blue, Approval=purple, Status=grey, Invoice=green. |
| Message | 35% | Truncated body (~50 chars). Full text on row expand. |
| Status | 13% | Badge: Queued (amber ⏳), Sent (blue ↑), Delivered (green ✓), Failed (red ✗), Cancelled (grey ⊘). |
| Time | 10% | Relative ("2h ago") with full timestamp on hover. Scheduled time for queued. |
| Actions | 10% | `⋯` overflow: Retry (failed), Cancel (queued), View vehicle, View job. |

**Cards (mobile `md:hidden`):**
Each card: reg plate badge top-left, type badge top-right, truncated
message body, status + time bottom row, tap to expand.

**Row expansion:** Click/tap a row → inline expand (not a dialog) showing:
- Full SMS body
- Twilio SID (copyable)
- Timeline: Created → Sent → Delivered (or Failed + error code)
- DVSA result (MOT reminders only): "Checked DVSA — no new MOT found"
  or "MOT renewed at another garage — reminder skipped"
- Links: View vehicle, View job (if applicable), View customer

**Pagination:** 50 per page, server-side offset/limit. Prev/Next buttons.

### 5d. Server actions

**File:** `src/app/(app)/app/messages/actions.ts`

```typescript
// getMessages(filters, page) — paginated query with type/status/date/search filters
// getMessageKpis() — 3 counts for the KPI strip
// retryMessage(id) — re-sends a failed message via queueSms() (manager-only)
// cancelMessage(id) — sets cancelled_at + cancel_reason='manual' (queued only)
```

### 5e. Realtime

Add `sms_outbox` to the `ALLOWED_TABLES` whitelist in
`src/lib/realtime/index.ts`. Wire `useRealtimeRouterRefresh` on the
messages page so new sends / delivery updates appear live without
manual refresh.

### 5f. Expired MOT list

**Section at the bottom of `/app/messages`** (or a separate tab):

"Vehicles with expired MOT" — table showing vehicles where
`mot_expiry_date < today` AND no active MOT job exists. Columns:
Reg, Customer name, Phone (tap-to-call), Expired on, Days overdue.
This is the receptionist's call list for manual follow-up.

---

## Step 6 — "Last test" on vehicle detail page (~30 min)

**File:** `src/app/(app)/app/vehicles/[id]/page.tsx` (modify MOT card)

The MOT card currently shows expiry + last test. Ensure "Last test"
always reads from cached DVSA data (the absolute last MOT test for
this registration, regardless of where it was done). Display:
- Test date
- Result (Passed / Failed)
- Mileage at test
- Defect count (if any)
- Link to GOV.UK MOT history: `https://www.check-mot.service.gov.uk/results?registration={reg}`

If no DVSA data cached, show "No MOT data — Refresh from DVSA" button.

---

## Execution order + dependencies

```
Step 1 (migration)
  ↓
Step 2 (queueSms helper + rewire)  ←  depends on table existing
  ↓
Step 3 (Twilio webhook)            ←  depends on queueSms setting statusCallback
  ↓
Step 4 (MOT cron + DVSA)           ←  depends on queueSms + DVSA fetch logic
  ↓
Step 5 (UI page)                   ←  depends on data in sms_outbox
  ↓
Step 6 (vehicle MOT card)          ←  independent, can run in parallel with Step 5
```

**Steps 1–3** can ship together as one PR (the plumbing). Every
existing SMS send immediately starts appearing in the outbox.

**Step 4** is a separate PR (MOT automation). Can be toggled off
via env var `MOT_REMINDERS_ENABLED=true` so it doesn't fire
until Twilio creds are live.

**Steps 5–6** are the UI layer, can ship together.

---

## Test plan

| # | What | How |
|---|---|---|
| T1 | `queueSms` inserts row + sends + writes SID | Unit test with mocked Twilio |
| T2 | `queueSms` failure → status='failed' + error | Unit test with Twilio throwing |
| T3 | Twilio webhook updates status | Unit test: POST with valid signature → row updated |
| T4 | Twilio webhook rejects bad signature | Unit test: POST with wrong signature → 403 |
| T5 | MOT cron: vehicle at 30d → DVSA check → send | Integration test with mocked DVSA |
| T6 | MOT cron: DVSA shows renewed → skip + cancel | Integration test |
| T7 | MOT cron: dedup (no double-send same day) | Unit test: second run returns 0 new rows |
| T8 | Messages page: filters work | Playwright e2e (gated on staging) |
| T9 | Messages page: retry failed message | Playwright e2e |
| T10 | Expired MOT list shows correct vehicles | Unit test |
| T11 | RLS: mechanic cannot read sms_outbox | RLS test |
| T12 | RLS: authenticated cannot INSERT directly | RLS test |

---

## DVSA API reference

- **Endpoint:** `https://history.mot.api.gov.uk/v1/trade/vehicles/mot-test?registration={reg}`
- **Auth:** API key in `x-api-key` header (Dudley's existing credentials)
- **Rate limits:** 500,000/day, 15 RPS, 10-burst cap
- **Source:** https://documentation.history.mot.api.gov.uk/mot-history-api/rate-limits/
- **At Dudley's scale (~300 vehicles):** max ~900 DVSA calls/month for
  MOT reminders. 0.006% of daily quota. No optimisation needed.
