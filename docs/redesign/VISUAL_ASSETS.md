# Visual Assets — Illustration & Pattern Kit

_Phase 3 > V3 + V4 + V5. Updated 2026-04-18 — car part pattern added, alias table corrected, status page redesign planned._

## What's in the kit

**Illustrations** — `src/components/illustrations/`

~20 curated professional hand-drawn SVG illustrations from Envato artist packs
(5 packs, same style: wobbly line-work + single warm-accent fill). All
auto-themed via CSS vars — every illustration reskins per garage without code
changes. Curated set contains only male figures or no human figures (Dudley
deployment policy — future additions must be JPG-previewed before import).

Source packs live in `public/*-utc/SVG/`. Import script:
`node scripts/import-illustrations.mjs`. Generated files say "Auto-generated,
do not hand-edit" — edit the source SVG and re-run instead.

### Alias mapping (`src/components/illustrations/aliases.ts`)

Friendly app-surface names that re-export the best illustration for each slot.
**This table matches the actual committed `aliases.ts` file (2026-04-18):**

| Alias                    | Source illustration                      | Use on                          |
|--------------------------|------------------------------------------|---------------------------------|
| `NoJobsIllustration`     | Car Repair in Progress                   | Jobs list empty state           |
| `KioskHeroIllustration`  | Garage Owner Welcoming Customers         | Kiosk landing hero              |
| `NoCheckInsIllustration` | Battery Replacement                      | Check-ins empty                 |
| `NoCustomersIllustration`| Garage Owner Welcoming Customers         | Customers list empty            |
| `NoStockIllustration`    | Organized Filing System                  | Stock list empty                |
| `NoWarrantiesIllustration`| Data Security                           | Warranties empty                |
| `NoReportsIllustration`  | Mission and Vision                       | Reports empty                   |
| `NoKpiDataIllustration`  | Risk Analysis                            | Dashboard KPI empty             |
| `SearchEmptyIllustration`| Document Review                          | Search returns 0 results        |
| `AllCaughtUpIllustration`| Milestone Achievement                    | All done / inbox zero           |
| `SuccessIllustration`    | Milestone Achievement                    | Post-checkout / invoice paid    |
| `AuditLogEmptyIllustration`| Document Review                        | Audit log empty                 |
| `ErrorIllustration`      | Tech Support Fixing Server Issues        | 500 / generic error             |
| `OfflineIllustration`    | Fixing Digital Device Connections        | Offline / connection lost       |
| `MaintenanceIllustration`| Updating and Patching Software           | Maintenance mode                |
| `DebuggingIllustration`  | Software Debugging and Repair            | 404 / unexpected state          |

### Full library (direct imports from `@/components/illustrations`)

9 automotive (car-garage pack), 4 admin (file-and-document), 2 reports
(project-management), 1 welcome (business-startup), 4 system states
(repair-maintenance).

**Car Part Seamless Pattern** — `public/pattern/`

Hand-drawn seamless tile (same Envato artist style) featuring car parts:
pistons, steering wheels, engines, spark plugs, headlights, car seats, gear
sticks, alloy wheels, car jacks, brake discs. Available in:
- `pattern.svg` — vector, 1829×1489 viewBox, ideal for CSS `background-image`
- `pattern.png` — raster 7621×6205, fallback

**Usage approach:** Black line art at very low opacity (3–5%) over any
background. Stays brand-neutral because it's pure monochrome — works with
any garage's colour scheme. Use `opacity: 0.03` to `0.05` on light
backgrounds, `opacity: 0.02` to `0.04` with white lines on dark backgrounds.

**Where to use the car part pattern:**
- Status page background (behind job cards)
- Login page background (behind auth form or in hero split)
- Kiosk welcome screen (behind service tiles)
- Empty-state card backgrounds (subtle automotive identity)
- PDF job sheet backgrounds (faint watermark behind content)

**Where NOT to use:** data tables, form backgrounds, text-heavy areas, tech
mobile screens (sunlight readability). Same rules as V4.2 in the visual plan.

**Patterns (code-generated)** — `src/components/patterns/`
- `HexGridPattern` — mechanical/engineered vibe; kiosk hero, auth split
- `DiagonalStripesPattern` + `HazardStripe` — racing/workshop bands
- `DotsPattern` — neutral background for quiet surfaces
- `ChevronPattern` — motion/progression; tech mobile hero, status banner
- `TopoPattern` — soft contour lines; 403/404/auth

**Presets** — `src/lib/brand/presets.ts`
- `oplaris` (default, #276DB0 / #E69514)
- `dudley` (matches dudleyautoservice.co.uk exactly — #F0A500 / #1B1A17, Bebas Neue)
- `forest`, `speedshop`, `classic`, `ev` — seeds for other garages

## How the dynamic part works

Every asset paints through the CSS custom properties that V1 already
sets on `<html>`:

```
currentColor                — outline strokes (inherits parent's text color)
var(--accent)               — single warm accent fill, per-garage
var(--card)                 — "paper" surfaces (dark-mode aware)
var(--primary)              — hero strokes, key fills (used by patterns + two-tone hero promotions)
var(--primary-foreground)   — text on top of a primary fill
var(--muted) / --muted-foreground — floor / supporting line-work
var(--border)               — frames, outlines
var(--foreground)           — ink
```

`src/lib/brand/garage-brand.ts` resolves the garage's hex values, pipes
them through `hexToOklch`, and emits the `<style>` block in
`(app)/layout.tsx`. That means **any new illustration or pattern you
drop into the kit automatically reskins per garage** — no theme prop,
no preset lookup, no per-component override. Just `currentColor` and
CSS vars.

### Theming pipeline (3-colour swap)

The Envato SVGs use three CSS classes internally:
- `.cls-1 { fill: #010101; }` → rewritten to `fill: currentColor`
- `.cls-2 { fill: #fece2e; }` → rewritten to `fill: var(--accent)`
- `.cls-3 { fill: #fff; }`    → rewritten to `fill: var(--card)`

The import script (`scripts/import-illustrations.mjs`) does this rewrite
automatically. Result: Oplaris garages show blue + orange, Dudley shows
gold + charcoal, any future garage shows their brand colours — zero code
changes needed.

### Two-tone hero promotion (optional, post-V3)

For 2-3 hero surfaces (kiosk, auth split, dashboard) where both `--primary`
and `--accent` should appear in one illustration: open the source SVG,
reassign selected `.cls-2` shapes to a new `.cls-4 { fill: var(--primary); }`,
re-run the importer. ~10 min per illustration, one-time.

## Dudley match

Dudley's site (http://dudleyautoservice.co.uk/) uses:

| Role       | Hex      | Used for                |
|------------|----------|-------------------------|
| Primary    | #F0A500  | Buttons, CTAs, big type |
| Secondary  | #CF7500  | Hover, depth            |
| Accent     | #1B1A17  | Body/Nav background     |
| Hazard red | #ED1620  | (Not adopted — optional)|
| Display    | Bebas Neue | H1/H2                 |
| Body       | Montserrat | Body/subheads          |

The `dudley` preset encodes primary=#F0A500, accent=#1B1A17,
primary-foreground=#1B1A17 (so orange CTAs have the charcoal label
that matches the live site), display font Bebas Neue. One click in
Settings > Branding → every illustration, every pattern, every
shadcn component reskins.

## Consumer example

```tsx
import { EmptyState } from "@/components/ui/empty-state";
import { NoJobsIllustration } from "@/components/illustrations/aliases";
import { HexGridPattern } from "@/components/patterns";

// Empty state on /app/jobs
<EmptyState
  illustration={<NoJobsIllustration className="h-28 w-auto" />}
  title="No jobs today"
  description="New bookings will appear here."
  actionLabel="New booking"
  actionHref="/app/bookings/new"
/>

// Branded hero on kiosk landing
<HexGridPattern className="rounded-2xl p-10 border">
  <h1 className="text-4xl font-display">Book your service</h1>
</HexGridPattern>
```

`EmptyState` doesn't currently accept an `illustration` prop — that's a
one-line addition when V3 starts ("replace the icon circle with the SVG
if an `illustration` prop is supplied"). Deliberately deferred so V3
can land as its own reviewable PR.

## Preview

Open `oplaris-illustrations-preview.html` in a browser. Live theme
switcher at the top cycles every preset. Dark mode toggle. Proves the
token chain end-to-end with zero Next.js boot time.

## Acceptance for V3/V4 tickets (when they open)

- V3: `EmptyState` accepts `illustration?: ReactNode`, every list with
  an empty path wires up the appropriate alias illustration, storybook /
  Playwright visual diff clean across all 6 presets.
- V4: Patterns placed behind the kiosk landing, status-page banner,
  auth split, 403/404. No pattern behind body copy. Opacity tuned per
  surface (≤15% over cards, ≤25% over large empty hero).

---

## Status page redesign plan (V5.3 expansion)

> Decided 2026-04-18 with Hossein. The current status page is functional
> but oversimplified. It needs to use our brand tokens, design system,
> illustrations, and the car part pattern — just like the rest of the app.

### Data model fixes

**Multi-job-per-vehicle visibility:** The current `/api/status/state`
endpoint returns only the most recent non-cancelled job (`.limit(1)`).
Fix: return **all active jobs** for the verified vehicle. The session
cookie already stores `vehicle_id`, so no schema change needed. If one
active job → works exactly as today. If multiple → customer sees a card
per job with job number, type, and status.

**Vehicle ownership policy:** One car, one owner, transferable. The
`customer_id` FK on `vehicles` stays singular. When a vehicle changes
hands, the manager reassigns it. The old customer's phone no longer
matches, so they're locked out. The new customer's phone matches, so
they get access. No multi-owner tables, no over-engineering.

### What the customer sees

1. **All active jobs** — summary card per job (job number, type, status,
   estimated ready time). Tap into each for the full timeline.
2. **Invoices and quotes** — quoted, invoiced, and paid charges with
   tap-to-download PDF. Cuts out "can you WhatsApp me the invoice?"
   calls.
3. **MOT expiry date** — from cached DVSA lookup (no live API calls
   wasted). If MOT was done at this garage, show that result. Otherwise
   show a link to GOV.UK MOT history check.
4. **Garage contact info** — phone, address, opening hours. Pulled from
   `garages` table. Saves the customer searching.

### What the customer does NOT see

- Their own contact details (no edit = no auth headache)
- Full job history beyond active jobs (nice-to-have, not v1)
- Any write capability (bookings and approvals have their own flows)

### Visual treatment

- Car part pattern SVG as `background-image` at `opacity: 0.03` behind
  the main content area
- Garage logo + name at the top (branded trust signal)
- Brand tokens applied via `getGarageBrandById()` (V5 resolution for
  public routes — no JWT, resolved from signed session or subdomain)
- `FormCard` + `FormActions` for the phone/reg lookup form
- Empty-state illustrations if no active jobs / no invoices
- Clean, trustworthy, mobile-first (customers click SMS links on phones)

### Kiosk forms

The kiosk (`KioskClient.tsx`) also needs migration to `FormCard` +
`FormActions` with `fullWidth` mode (tablet surface). Currently uses
manual `<Card>` + raw button rows. This will happen as part of V5.2
(branded kiosk welcome screen).

---

## MOT reminder system (post-Phase 3 feature)

> Decided 2026-04-18 with Hossein. Refined 2026-04-20 — added DVSA
> pre-check to avoid reminding customers who already got their MOT
> done elsewhere, plus a manager-visible SMS queue.

### The smart flow (one DVSA call per cycle, not three)

```
Daily pg_cron (6 AM)
  │
  ├─ Find vehicles with mot_expiry_date = today + 30 days
  │   └─ DVSA refresh
  │       ├─ New MOT found (expiry moved forward)?
  │       │   └─ Update mot_expiry_date → SKIP all 3 reminders
  │       └─ No new MOT?
  │           └─ Queue 30-day SMS → send
  │
  ├─ Find vehicles with mot_expiry_date = today + 7 days
  │   └─ DVSA refresh (customer may have renewed elsewhere since 30d)
  │       ├─ New MOT found?
  │       │   └─ Update mot_expiry_date → SKIP 7d + 5d
  │       └─ No new MOT?
  │           └─ Queue 7-day SMS → send
  │
  └─ Find vehicles with mot_expiry_date = today + 5 days
      └─ DVSA refresh (customer may have renewed since 7d)
          ├─ New MOT found?
          │   └─ Update mot_expiry_date → SKIP 5d
          └─ No new MOT?
              └─ Queue 5-day SMS → send (final nudge)
```

**API budget:** DVSA allows **500,000 requests/day** (15 RPS burst,
10-request burst cap). Three calls per vehicle per reminder cycle is
negligible at Dudley's scale (~200-300 vehicles = max ~900 calls/month
for MOT reminders). Every reminder is backed by a fresh DVSA check —
no customer ever receives a reminder after they've already renewed
their MOT elsewhere. Zero wasted SMS.

### Tables

**`vehicles` (existing, add column):**
- `mot_expiry_date DATE` — populated from DVSA lookup or manually by staff
- `mot_last_checked_at TIMESTAMPTZ` — when we last hit DVSA for this vehicle

**`mot_reminder_queue` (new):**
```
id              UUID PK DEFAULT gen_random_uuid()
garage_id       UUID NOT NULL REFERENCES garages(id)
vehicle_id      UUID NOT NULL REFERENCES vehicles(id)
reminder_type   TEXT NOT NULL CHECK (reminder_type IN ('30d', '7d', '5d'))
scheduled_for   DATE NOT NULL
dvsa_checked_at TIMESTAMPTZ      -- when the pre-check ran (30d only)
dvsa_result     TEXT              -- 'no_new_mot' | 'mot_found_skipped' | null
sent_at         TIMESTAMPTZ      -- null = pending, set = sent
cancelled_at    TIMESTAMPTZ      -- manager manual cancel
cancel_reason   TEXT              -- 'mot_done_elsewhere' | 'manual' | 'vehicle_deleted'
sms_sid         TEXT              -- Twilio message SID for delivery tracking
created_at      TIMESTAMPTZ DEFAULT now()

UNIQUE (vehicle_id, reminder_type, scheduled_for)  -- no double-queue
```

### SMS copy (garage-branded)

- **30 days:** "Hi {first_name}, your MOT for {reg} expires on {date}.
  Book early to avoid delays — call {garage_name} on {garage_phone}."
- **7 days:** "Reminder: your MOT for {reg} is due next {day_name}.
  {garage_name} has slots available. Call {garage_phone}."
- **5 days:** "Final reminder — your MOT for {reg} expires on {date}.
  Book now to stay legal: {garage_phone}."

### "Last test" on vehicle detail page

Shows the absolute last MOT from cached DVSA data — not just the last
done at this garage. If the customer went to Kwik Fit last year, that's
their last test. Display: test date, result (pass/fail), expiry,
mileage, defect count. Link to GOV.UK MOT history.

### SMS queue UI (manager)

New page `/app/mot-reminders` (or section in `/app/settings`):
- **Upcoming** tab: queued reminders not yet sent (scheduled_for > today)
- **Sent** tab: delivered reminders with Twilio delivery status
- **Skipped** tab: reminders cancelled by DVSA pre-check or manually
- Per-row actions: Cancel (with reason), Resend, View vehicle
- Filter by date range, reminder type
- **Expired MOT list:** vehicles with `mot_expiry_date < now()` where
  no active MOT job exists — the receptionist's call list

### Implementation notes

- No new infrastructure — `pg_cron` + Supabase Edge Functions
- SMS costs on Dudley's existing Twilio account
- Garage-scoped: each garage's reminders use their own brand name,
  phone number, and Twilio credentials
- GDPR: reminders stop when `vehicles.deleted_at` is set or customer
  opts out (future: STOP keyword handling via Twilio webhook)
- Rate limit: max 1 DVSA call per vehicle per 24h (respect their API)
- Batch size: cron processes max 50 vehicles per run to avoid Twilio
  burst limits and DVSA rate caps

### SMS queue — universal outbox (`/app/messages`)

> Decided 2026-04-20 with Hossein. Not MOT-only — every outgoing SMS
> (quotes, approvals, status codes, invoice notifications, MOT reminders)
> flows through one table and one manager-visible page. Top-level sidebar
> item with failed-message badge. Full Twilio delivery tracking.

**Table:** `sms_outbox` — see migration spec below.

**Message types:** `mot_reminder_30d`, `mot_reminder_7d`, `mot_reminder_5d`,
`quote_sent`, `quote_updated`, `approval_request`, `status_code`,
`invoice_sent`.

**Delivery statuses:** `queued` → `sent` → `delivered` | `failed`.
Plus `cancelled` (manual or DVSA-skipped). Updated in real-time via
Twilio status webhook at `/api/webhooks/twilio/status` (signature-verified).

**Page structure:**
- 3 KPI cards: Sent today / Failed / Queued
- Filter bar: Type dropdown, Status dropdown, Date range, Search (phone/reg)
- Table (desktop) / Cards (mobile) with columns: To (reg+phone),
  Type (colour-coded badge), Message (truncated), Status (delivery badge),
  Time, Actions (retry/cancel/view)
- Row expansion: full SMS body, Twilio SID, delivery timestamps,
  DVSA check result (MOT only), linked job
- Pagination (50 per page)

**Sidebar:** "Messages" nav item between Reports and Settings.
Red badge showing count of `status='failed'` messages (manager-only).

**Wiring:** All existing Twilio call sites (quote SMS, approval SMS,
status code SMS) routed through a universal `queueSms()` helper that
inserts into `sms_outbox`, sends via Twilio, writes back the SID.
No more fire-and-forget.

**MOT cron:** Daily 6 AM `pg_cron` inserts `queued` rows for vehicles
at 30d/7d/5d windows. Edge Function picks them up, runs DVSA check,
sends or cancels. Cancelled rows visible under "Skipped" filter.

### Priority

After Phase 3 visual refinement. Could ship alongside Phase 4 deploy
or as a fast follow after go-live.

---

## Unused packs (parked for future verticals)

- `cleaning-services` — ready for a cleaning-services vertical
- `coffee-shop` — ready for café/restaurant vertical
- `digital-nomad` — generic "working" scenes, marketing site use
- `mental-health` — wellness vertical or staff wellbeing features
