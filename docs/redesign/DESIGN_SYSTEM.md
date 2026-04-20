# DESIGN_SYSTEM.md — Oplaris Automotive

> Normative UI spec for the four audiences. Generated via plan-generator Module A + ux-audit pass. Every pixel here is deliberate. If a component isn't in this doc, you don't ship it.

**Stack:** Tailwind + shadcn/ui + Radix primitives + lucide-react icons. No ad-hoc CSS. No inline styles.

---

## 0. Design principles

1. **Garage-floor first.** Every interactive element must work with oily gloves under sunlight on a £150 Android. Minimum target 48×48 px, 60×60 where it matters (tech start/complete buttons). Minimum body text 16 px.
2. **One primary action per screen.** Every screen has one obvious thing to do. Secondary actions are visibly secondary.
3. **Optimistic, but honest.** Writes feel instant; failures are loud, recoverable, and never silent.
4. **Never hide state behind hover.** Phones don't hover. Status is always visible.
5. **WCAG 2.1 AA minimum.** 4.5:1 text contrast, 3:1 non-text, focus rings on every interactive element, every form field has a `<label>`.
6. **Loading states exist.** Empty skeletons, not spinners-on-blank-screens.
7. **Destructive actions are typed or double-confirmed.** "Delete customer" → type the name.
8. **Never a dead end.** Every error state has a "what to do next" link or action.

---

## 1. Tokens

### 1.1 Colour

Two themes: **App** (manager + tech, light by default with dark mode) and **Kiosk** (light only, giant).

```css
/* globals.css */
:root {
  --background: 0 0% 100%;
  --foreground: 222 47% 11%;
  --muted: 210 40% 96%;
  --muted-foreground: 215 16% 47%;
  --border: 214 32% 91%;
  --input: 214 32% 91%;
  --ring: 221 83% 53%;

  --primary: 221 83% 53%;          /* Oplaris blue */
  --primary-foreground: 0 0% 100%;

  --success: 142 71% 45%;          /* job complete, approved */
  --warning: 38 92% 50%;           /* awaiting parts, awaiting customer */
  --danger: 0 84% 60%;             /* overdue, declined, error */
  --info: 199 89% 48%;             /* booked, draft */

  --radius: 0.5rem;
}

.dark {
  --background: 222 47% 6%;
  --foreground: 210 40% 98%;
  --muted: 217 33% 12%;
  --muted-foreground: 215 20% 65%;
  --border: 217 33% 17%;
  --input: 217 33% 17%;
  --primary: 217 91% 60%;
  --primary-foreground: 222 47% 6%;
}
```

**Job status colour mapping (enforced, used everywhere):**

| Status | Token | Contrast check |
|---|---|---|
| draft / booked | info | white text on info-600 = 4.8:1 |
| in_diagnosis / in_repair | primary | white on primary-600 = 5.1:1 |
| awaiting_parts / awaiting_customer_approval | warning | black on warning-400 = 9.2:1 |
| ready_for_collection / completed | success | white on success-600 = 4.7:1 |
| cancelled | muted | muted-foreground on muted = 4.6:1 |

### 1.2 Type

Font stack: `Inter` via `next/font/google`, `font-feature-settings: "cv11", "ss01"`.

| Token | App | Tech mobile | Kiosk |
|---|---|---|---|
| display | 32/40 | 28/36 | 56/64 |
| h1 | 24/32 | 22/30 | 40/48 |
| h2 | 20/28 | 18/26 | 32/40 |
| body | 16/24 | 17/26 | 22/32 |
| small | 14/20 | 15/22 | 18/26 |
| mono | JetBrains Mono 14 | — | — |

Tech mobile bumps everything one step up. Kiosk is huge on purpose.

### 1.3 Spacing, density & rhythm

> Authoritative as of P56.0 (2026-04-15). Supersedes the earlier one-line rule. Rooted in `Oplaris-Skills/ux-audit/references/visual-hierarchy-and-layout.md §Spacing System` and `§Grid & Layout`. Every spacing violation register lives in `docs/redesign/PHASE3_SPACING_AUDIT.md`.

**Base scale** (Tailwind increments, 1 unit = 4 px):

| Token | px | Tailwind class | Role |
|---|---|---|---|
| `space-0` | 0 | `gap-0 / p-0` | Collapsed |
| `space-1` | 4 | `gap-1 / p-1 / mt-1` | Micro — icon-cluster tightening |
| `space-icon` | 6 | `gap-1.5` | **Only off-grid value.** Icon-label pair optical gap. |
| `space-2` | 8 | `gap-2 / p-2 / mt-2` | Tight — between dense rows |
| `space-3` | 12 | `gap-3 / p-3 / mt-3` | Small — heading-to-body, sparse rows |
| `space-4` | 16 | `gap-4 / p-4 / mt-4` | **Base** — card padding, grid gutter |
| `space-5` | 20 | `p-5 / space-y-5` | Comfortable — form-field rhythm |
| `space-6` | 24 | `p-6 / mt-6` | Medium — hero card padding, header-to-body |
| `space-8` | 32 | `mt-8` | **Section gap** — between named sections |
| `space-12` | 48 | `mt-12` | Page-level — above page footer, between unrelated panels |
| `space-16` | 64 | `mt-16` | Rare — landing-page sections only |

**Forbidden values:** every Tailwind `.5` class except the one `gap-1.5` icon token (listed above as `space-icon`). A lint rule in `scripts/check-spacing-tokens.ts` enforces this and fails CI when off-grid values creep back in. The `py-0.5` on `<RegPlate>` is an explicit exception documented in the primitive.

**Card density tokens:**

| Variant | Padding | Use |
|---|---|---|
| `<Card size="sm">` | `p-3` (12 px) | Dense rows, inline banners, mobile list items |
| `<Card size="default">` | `p-4` (16 px) | Standard — KPI, list item, detail card |
| `<Card size="lg">` | `p-6` (24 px) | Hero / summary cards |

Ad-hoc `rounded-lg border bg-card p-*` divs are banned — use `<Card size>`.

**Page-padding tokens** (owned by `<PageContainer>` primitive, P56.3):

| Prop | Width | Mobile padding | Desktop padding |
|---|---|---|---|
| `full` | 100 % | `px-4` (16 px) | `px-6` (24 px) |
| `default` | `max-w-5xl` (1024 px) | `px-4` | `px-6` |
| `narrow` | `max-w-3xl` (768 px) | `px-4` | `px-6` |
| `form` | `max-w-xl` (576 px) | `px-4` | `px-6` |

Vertical page padding is `py-6` (24 px) for every variant; `env(safe-area-inset-bottom)` applied on mobile.

**Layout rhythm — the canonical rule:**

> `card-padding > section-gap ≥ 2 × stack-md ≥ 4 × within-row`
>
> Concretely: card-padding 16 px, section-gap 32 px, between-row 8–16 px, within-row 4–8 px (or `space-icon` 6 px for icon-label pairs).

Enforced via:

- `<Section title description>children</Section>` primitive — owns `mt-8 first:mt-0` and heading rhythm (P56.3).
- `<Stack gap="sm|md|lg">` primitive — owns `space-y-2 | space-y-4 | space-y-6` (P56.3).
- ESLint rule forbidding `mt-*` / `mb-*` on direct children of an element with `space-y-*`.

**Grid & layout:**

- Grids: `gap-4` (16 px) default; `gap-6` (24 px) for sparse hero layouts; `gap-2` (8 px) for dense chip clusters.
- Tables: `<Table density="comfortable" | "compact">`. Comfortable uses shadcn default padding; compact is `py-1.5 text-sm` for data-heavy pages (stock, reports, audit-log).
- Sidebar–main alignment: both columns share `pt-6` from `<AppShell>` — top edges meet.

### 1.4 Radius & shadow

- Radius: `rounded-lg` (8 px) default, `rounded-xl` (12 px) for cards, `rounded-2xl` (16 px) for kiosk tiles. Nested radius rule: inner-radius = outer-radius − padding.
- Shadow: `shadow-sm` for cards, `shadow-md` on hover/press (desktop only), no shadow on kiosk (flat for sunlight). In dark mode shadows are replaced by a lighter `--card` surface — never combine shadow and border on the same element.

### 1.5 Motion

- Durations: 120 ms (micro), 200 ms (default), 320 ms (page). Use Framer Motion only for the bay-board drag animation; everything else is Tailwind `transition-*`.
- Respect `prefers-reduced-motion`: reduce to opacity fades only.

---

## 2. Core components (shadcn/ui set)

Installed: `button`, `input`, `label`, `textarea`, `select`, `dialog`, `sheet`, `dropdown-menu`, `tabs`, `toast` (sonner), `card`, `badge`, `separator`, `scroll-area`, `avatar`, `table`, `skeleton`, `form`, `checkbox`, `radio-group`, `command` (⌘K), `popover`, `calendar`, `tooltip`, `alert`, `alert-dialog`.

**Button variants (extended):**
- `default` — primary action
- `secondary` — neutral
- `destructive` — red, requires confirm
- `ghost` — tertiary, inline
- `tech` — **new** — 72 px tall, full-width, bold, for technician mobile
- `kiosk` — **new** — 120 px tall, display type, for kiosk tiles

**StatusBadge** — custom wrapper around `badge` that reads `job_status` and picks the colour token + icon from a single lookup. Used everywhere so status colours never drift.

**LoadingButton** — `button` + `Loader2` icon + disabled state during `useFormStatus().pending`.

**EmptyState** — illustration + headline + body + primary CTA. Every list view uses it.

**ErrorState** — same shape, red icon, includes "Try again" and "Contact support" links.

---

## 2.1 Phase-3 primitives (P56)

Land order — each one is canonical, ad-hoc replacements get lint-flagged
in PR review:

| Primitive | File | Purpose | Phase |
|---|---|---|---|
| `<Button size="default\|sm\|lg\|xl\|icon\|icon-sm\|icon-lg">` | `ui/button.tsx` | 44 px default, 36 px dense, 48 px primary mobile, 64 px hero | P56.1 |
| `<Section title description actions gap="sm\|md\|lg">` | `ui/section.tsx` | `mt-8 first:mt-0` between named sections + heading row | P56.0 |
| `<Stack gap="sm\|md\|lg">` | `ui/stack.tsx` | `space-y-2 \| 4 \| 6` rhythm, never mix `mt-*` inside | P56.0 |
| `<Card size="sm\|default\|lg">` | `ui/card.tsx` | `p-3 \| 4 \| 6` density variants for table-row vs hero | P56.0 |
| `<FormCard variant="card\|plain">` | `ui/form-card.tsx` | Form container + `<FormCard.Fields>` (`space-y-5`) | P56.2 |
| `<FormActions fullWidth?>` | `ui/form-actions.tsx` | Mobile-first thumb-zone Submit-on-top + desktop right-aligned row | P56.2 |
| `<PageContainer width="full\|default\|narrow\|form">` | `app/page-container.tsx` | Single source of truth for page max-width, no per-page `max-w-*` | P56.3/P56.4 |
| `<PageTitle title description actions>` | `ui/page-title.tsx` | Canonical `<h1>` at `text-2xl font-heading` + `mb-6` to first block | P56.3 |
| `<RegPlate reg size="sm\|default\|lg" variant="front\|rear">` | `ui/reg-plate.tsx` | UK reg display — replaces every `bg-yellow-400` ad-hoc plate | P56.3 |
| `<PassbackBadge items? note?>` | `ui/passback-badge.tsx` | Warning-token chip + tooltip for the 11-item passback checklist | P56.3 |
| `<ConfirmDialog trigger? open? onOpenChange? destructive? onConfirm>` | `ui/confirm-dialog.tsx` | Async-aware wrapper over `AlertDialog` — replaces `window.confirm()` | P56.3/P56.6 |
| `<LoadingState.Page \| .Grid rows? \| .Inline label?>` | `ui/loading-state.tsx` | Skeleton + spinner + `aria-live` — replaces ad-hoc skeleton stacks | P56.3 |
| `<Combobox options value onChange getValue getLabel getDescription? getSearchKeywords? name?>` | `ui/combobox.tsx` | Searchable cmdk-backed picker for >10-option lists | P56.8 |
| `<Label required? optional?>` | `ui/label.tsx` | Required asterisk + `(optional)` hint inline | P56.2 |
| `toast.success/.error/.info/.warning/.promise` | `lib/toast.ts` | Sonner facade — replaces every `alert()` | P56.3/P56.6 |

**Token migration (P56.7) — mandatory mapping:**

| Hardcoded class | Token replacement |
|---|---|
| `bg-amber-*` / `text-amber-*` / `border-amber-*` | `bg-warning` / `text-warning(-foreground)` / `border-warning` |
| `bg-emerald-*` / `text-emerald-*` / `border-emerald-*` | `bg-success` / `text-success(-foreground)` / `border-success` |
| `bg-red-*` / `text-red-*` | `bg-destructive/10` / `text-destructive` |
| `bg-blue-*` / `text-blue-*` | `bg-info/10` / `text-info` (or `text-primary` for CTAs) |
| `bg-yellow-400` (reg plate) | `<RegPlate>` primitive |

Theme-bound colours always go through tokens so dark-mode + V1 brand
re-skin work. Reg plates are the single colour-literal exception (UK
plates must be physical-yellow regardless of theme).

**Page-width system (P56.4) — applied to every `(app)/page.tsx`:**

| Width | max-width | Use case |
|---|---|---|
| `full` | none | Lists, bay-board, kanban, tables, audit-log |
| `default` | `max-w-5xl` (1024 px) | Detail pages, Today dashboard, settings root |
| `narrow` | `max-w-3xl` (768 px) | Tech surfaces, settings sub-pages, guide |
| `form` | `max-w-xl` (576 px) | Single-column create/edit forms |

Padding (`p-4 sm:p-6`) lives on `<main>` in `AppShell` — `PageContainer`
only owns width containment + centering so public surfaces (kiosk,
status) can use it without inheriting app-shell padding.

**Reduced-motion (P56.8/UX-H8):** a global `@media (prefers-reduced-motion)`
rule in `globals.css` zeroes every animation/transition. Don't add
`motion-safe:` prefixes per-call — the global rule is authoritative.

---

## 3. UI 1 — Manager dashboard (`/app/*`)

**Audience:** 3 managers. Desktop primary (Dudley's reception PC), phone secondary (walking around).
**Layout:** left sidebar (collapsible on mobile), top bar with garage name + user menu, content area.

### 3.1 Information architecture

```
/app                         Today view (default)
/app/bay-board               Kanban of active jobs by bay
/app/jobs                    All jobs, filterable
/app/jobs/[id]               Job detail
/app/customers               Customer list + search
/app/customers/[id]          Customer detail + vehicles + history
/app/vehicles/[id]           Vehicle detail + MOT history + jobs
/app/bookings                Inbox of kiosk/online bookings awaiting promotion
/app/reports                 Week/month dashboards (M2)
/app/stock                   Stock management (M2)
/app/warranties              Active warranties (M2)
/app/settings                Staff, bays, Twilio numbers, branding
```

### 3.2 Today view

Four cards across the top:
- **Jobs in progress** — count + click to bay board
- **Awaiting approval** — count of `awaiting_customer_approval` jobs, warning colour if > 0
- **Ready for collection** — success colour
- **New bookings** — count of `bookings` rows with null `job_id`, action: "Review now"

Below: today's schedule timeline (jobs by bay, by hour) and a "Recent customer activity" feed.

**One primary action in the page header: "New job"** (opens a 3-step dialog: customer → vehicle → description).

### 3.3 Bay board

- Columns = bays (drag between to reassign)
- Cards show: job number, reg, customer first name, current status badge, assigned tech avatars, time-in-current-status
- Drag requires pointer-down + 200 ms hold on touch (prevents accidental drag while scrolling)
- Realtime updates (Supabase Realtime) — new cards animate in, moved cards slide
- Filter bar: "Show mine only" / "Show all", status filter, tech filter

### 3.4 Job detail

One page, tabbed:
- **Overview** — customer, vehicle, description, status, assigned techs, approvals, "Generate PDF" button
- **Work log** — chronological list of work_log entries with duration
- **Parts** — table with inline "Add part" sheet (supplier dropdown, price, payment method, file upload)
- **History** — audit_log filtered to this job
- **Warranty** — (M2) create warranty on completion

Status transitions are a single dropdown that only shows **valid** next states (enforced server-side too). Changing status optionally triggers an SMS ("Ready for collection" → prompts "Send SMS to customer?" dialog).

### 3.5 Customer detail

- Header: name, phone, email, "Call" + "SMS" buttons
- Vehicles list with last-service date
- Full job history (reverse chronological)
- Export button (manager only) → JSON download
- Soft-delete button (double confirm)
- Every screen load writes an `audit_log` row — the customer sees "Last viewed by [staff] at [time]" at the top, as a trust signal for Hossein and GDPR evidence

---

## 4. UI 2 — Technician mobile (`/app/tech/*`)

**Audience:** 7 mechanics + MOT testers. Old Android, bright workshop, gloves.
**Layout:** no sidebar. Bottom tab bar with 4 tabs. Full-bleed cards.

### 4.1 IA

```
/app/tech                    "My jobs today" (default)
/app/tech/job/[id]           Active job view (big buttons)
/app/tech/history            My recent work
/app/tech/profile            Me (logout, change password)
```

### 4.2 My jobs today

- Vertical list of assigned jobs, each a full-width card (min 120 px tall)
- Card shows: job number, reg (huge, mono), make/model, current status badge, **one** primary action button: "Start" / "Resume" / "Complete"
- Card tap opens job detail; the primary button on the card bypasses detail and acts directly (after a 300 ms press-and-hold to prevent fat-finger)

### 4.3 Active job view

Structure (top to bottom):

1. **Reg plate** in 32 pt mono on a yellow-ish plate background — recognisable
2. **Customer first name + phone** with tap-to-call
3. **Description** (scrollable if long)
4. **Timer** — big digital clock if a work_log is running
5. **Primary action** — 72 px tall button, full-width: **START WORK** / **PAUSE** / **COMPLETE**
6. **Secondary actions row** — Add part · Request customer approval · Add note
7. **Status** — current job status, read-only (mechanics don't set job status directly)

Task-type picker appears when starting a work_log: radio list of `work_task_type` values, one tap, confirm.

### 4.4 Request customer approval (the star feature)

Mechanic fills: description ("Brake discs need replacing"), amount (big number pad). One-tap confirm. A toast says "SMS sent to [customer first name]". Job status flips to `awaiting_customer_approval`. The card on the list turns warning-yellow.

When the customer approves, the mechanic's phone vibrates + toast: "[Customer] approved £180. You can resume work." (Realtime subscription.)

### 4.5 Add part

Sheet (bottom drawer). Fields:
- Supplier — dropdown (ECP, GSF, AtoZ, eBay, Other → reveals text field)
- Description (autocomplete from past parts in the same garage)
- Price £ · Qty
- Payment — Cash / Card (segmented)
- Attach invoice — camera button (uses `capture="environment"`) or file picker

Upload happens via Server Action. Server runs magic-byte check + size check before storing.

---

## 5. UI 3 — Tablet kiosk (`/kiosk`)

**Audience:** walk-in customers. 10" tablet in reception, locked-down Android kiosk mode.
**Constraint:** must work in 10 seconds, from first tap to "thanks we'll call you".

### 5.1 Screens

1. **Welcome** — "What do you need today?" + 3 massive tiles (kiosk button variant, 120 px tall, icon + label)
   - 🛡️ **MOT**
   - ⚡ **Electrical**
   - 🔧 **Maintenance**
2. **Details** — 4 fields: name, phone (UK numeric keypad), reg (uppercase auto), brief description (optional, 200 char)
3. **Preferred time** — today / tomorrow / this week / "call me" (segmented)
4. **Confirm** — summary + huge green "Submit" button
5. **Done** — "Thanks [name], we'll text you on [phone]" + 5-second countdown → back to Welcome

### 5.2 Kiosk rules

- Auto-return to Welcome after 60 s idle on any screen
- Screen-lock overlay after 5 min idle, tap-to-unlock (no PIN — Hossein wants zero friction, it's inside reception)
- Never display any other customer's data
- Never show prices
- No back button to previous customer's session
- On submit: row in `bookings`, IP + user_agent logged for audit

### 5.3 Anti-misuse

- hCaptcha: no (it's physically inside the garage)
- Rate limit: 20 submissions per kiosk cookie per hour (prevents kid hammering Submit)
- Profanity filter on name + description (`obscenity` package)

---

## 6. UI 4 — Customer status page (`/status`)

**Audience:** public. Phone-first. Must feel safe + professional.
**Constraint:** hostile internet. Any leak is a GDPR incident.

### 6.1 Screens

1. **Landing** — "Check on your car" headline, reg input + phone input, **Send code** button. Tiny text: "We'll SMS a code to the phone number on file."
2. **Enter code** — 6 single-character boxes (like Apple), auto-advance, paste-friendly. 10-minute countdown visible. "Didn't get it? Resend in 45s" (rate limits enforced server-side).
3. **Status** — reg + make/model, current status badge (huge), ETA if available, last update timestamp, and a prose line generated from job status ("Your car is currently in the repair bay. We'll text you when it's ready."). One button: **Close**.

### 6.2 Anti-enumeration UX

- The response to "Send code" is **always** the same: "If that reg and phone match our records, a code has been sent." Same screen, same text, same timing. Proceed to code entry regardless. The code entry screen will simply fail validation if no real code was issued. This prevents timing oracle and response oracle.
- No field says "reg not found" or "phone doesn't match". Ever.
- Rate limit errors are generic: "Too many attempts. Try again in an hour."

### 6.3 Accessibility + trust signals

- Visible lock icon + "Secure check" label in the header
- "Why are you asking for my phone?" expandable — honest one-paragraph GDPR explainer
- "Not your car? [link to report]" — goes to a contact form
- Honeypot field (hidden `<input name="website">` — bots fill it, real users don't)

---

## 7. Accessibility checklist (every screen, every phase)

- [ ] Every form field has a visible `<label>` (no placeholder-as-label)
- [ ] Focus ring on every interactive element, 2 px, offset 2 px
- [ ] Tab order matches visual order
- [ ] Error messages are `aria-live="polite"`, not just red text
- [ ] Tech + kiosk tap targets ≥ 48×48 (primary ≥ 60×60)
- [ ] Contrast: body text 4.5:1, large text 3:1, non-text 3:1
- [ ] No colour-only meaning (status badges have icon + text)
- [ ] Landmarks: `<header>`, `<nav>`, `<main>`, `<footer>` on every page
- [ ] Screen reader: status changes announced via `aria-live`
- [ ] Dialogs: `role="dialog"` + focus trap + Escape to close + return focus on close
- [ ] Images: meaningful `alt`, decorative = `alt=""`
- [ ] Respect `prefers-reduced-motion`
- [ ] Tested with VoiceOver on iOS and TalkBack on Android for the tech mobile + status page

---

## 8. Copy tone

- **Manager UI:** concise, professional, neutral. "Job created." "Customer added."
- **Tech UI:** direct, action-oriented, first-person. "Start work", "You're on this job", "Parts added."
- **Kiosk:** warm, welcoming. "What do you need today?" "Thanks, we'll text you soon."
- **Status page:** reassuring, transparent. "Your car is in the repair bay." Never technical jargon. Never prices.
- **Errors everywhere:** name the problem, name the fix. "Your phone didn't match. Please call us on [number]."
- Never use "Whoops!" "Oops!" "Uh oh!". Not a toy.

---

## 9. Component budget (to stop scope creep on the UI)

The entire app ships with **no more than 40 unique screens**. Count:

- Auth: login, forgot password, reset (3)
- App shell: sidebar, top bar, 404, 403, 500 (5)
- Today, bay board, jobs list, job detail (4)
- Customers list, customer detail, vehicle detail (3)
- Bookings inbox (1)
- Tech: list, job detail (2)
- Kiosk: welcome, details, time, confirm, done (5)
- Status: landing, code, status (3)
- Settings: staff, bays, garage, integrations (4)
- Reports (1)
- Stock: list, detail (2)
- Warranties: list, detail (2)
- GDPR: export, audit viewer (2)
- Admin guide entry page (1)
- Onboarding tour (1)
- Walkthrough video embed (1)

**Total: 40.** If a phase needs a 41st screen, it replaces one. No inflation.
