# AUDIT_PROMPT.md — Phased UI build & audit plan

> The UI twin of `BACKEND_AUDIT_PROMPT.md`. Each UI phase has a build task list **and** a ux-audit gate that must pass before the phase counts as done. UI phases run in parallel with backend phases where possible.

## UI phase tracker

| # | Phase | State | Depends on backend | Day |
|---|---|---|---|---|
| U0 | shadcn install + tokens + theme | PENDING | Phase 0 | 1 |
| U1 | App shell (sidebar, top bar, auth pages) | PENDING | Phase 2 | 2 |
| U2 | Customer + vehicle screens | PENDING | Phase 3 | 3 |
| U3 | Jobs list + bay board + job detail | PENDING | Phase 4 | 3–4 |
| U4 | Technician mobile UI | PENDING | Phase 5 | 4 |
| U5 | Parts sheet + file upload UX | PENDING | Phase 6 | 4 |
| U6 | Approval request dialog + approval page | PENDING | Phase 7 | 5 |
| U7 | PDF preview + download UX | PENDING | Phase 8 | 5 |
| U8 | Customer status page | PENDING | Phase 9 | 5–6 |
| U9 | Tablet kiosk screens | PENDING | Phase 10 | 6 |
| U10 | Bookings inbox + promote-to-job | PENDING | Phase 10 | 6 |
| U11 | M1 UX audit + polish | PENDING | M1 live | 7 |
| U12 | Warranty UI | PENDING | Phase 12 | 8 |
| U13 | Stock UI | PENDING | Phase 13 | 9 |
| U14 | DVSA history UI | PENDING | Phase 14 | 10 |
| U15 | Reports dashboard | PENDING | Phase 15 | 11 |
| U16 | GDPR export + audit viewer + soft-delete UI | PENDING | Phase 16 | 12 |
| U17 | Full accessibility pass + mobile polish | PENDING | all | 13 |
| U18 | Admin guide page + onboarding tour + walkthrough video | PENDING | all | 14 |

---

## Shared audit gate (every UI phase)

Before a phase is done:

- [ ] **ux-audit pass** — Read `Oplaris-Skills/ux-audit/references/<area>.md` for whatever this phase touches (forms, navigation, feedback, etc.) and verify no Critical or High findings remain
- [ ] **a11y** — Tab order correct, focus ring visible, labels present, contrast passes Lighthouse ≥ 95 accessibility score
- [ ] **Mobile** — Renders correctly at 360×640, 390×844, 768×1024 (iPhone SE, iPhone 14, iPad)
- [ ] **Loading** — Skeletons not spinners; no content flash
- [ ] **Error** — Every error path has recovery UX, never a dead end
- [ ] **Empty** — Every list has an EmptyState with a CTA
- [ ] **Copy** — Matches tone-per-UI from DESIGN_SYSTEM §8
- [ ] **No hardcoded colours** — every colour reads from a token
- [ ] **No business logic in client components** (grep for `"use client"` files that do math on prices or role checks)

---

## U0 — Tokens + shell (day 1)

**Build:**
- `pnpm dlx shadcn@latest init` with slate base
- Copy tokens from DESIGN_SYSTEM §1 into `globals.css`
- Install component set from DESIGN_SYSTEM §2
- Add `button` variants `tech` and `kiosk`
- Add `StatusBadge`, `LoadingButton`, `EmptyState`, `ErrorState` components in `src/components/ui/`
- Set up three root layouts: `(app)/layout.tsx`, `(public)/kiosk/layout.tsx`, `(public)/status/layout.tsx` — each with its own `<html>` font + theme

**Gate:** shared gate + all 5 component primitives screenshot-tested in Storybook-lite (`/dev/components` dev-only page).

---

## U1 — App shell + auth (day 2)

**Build:**
- `/login` — email + password, shadcn `form`, zod schema, Server Action
- `/forgot-password` — email magic link (Supabase)
- App layout: collapsible sidebar (nav from IA §3.1), top bar with garage name + user avatar menu (profile, logout)
- Role-aware nav: mechanics see only Tech entry; managers see everything
- 403/404/500 pages with recovery

**Gate:** shared gate + logged-out user can't see any app page + logged-in mechanic can't see `/app/customers`.

---

## U2 — Customers + vehicles (day 3)

**Build:**
- `/app/customers` — search + table, paginated, filter by "has open job"
- `/app/customers/[id]` — detail + vehicles list + history
- `/app/vehicles/[id]` — detail + job history
- "Add customer" dialog (name, phone, email) + "Add vehicle" dialog
- Phone input with libphonenumber formatting
- Reg input with auto-uppercase + space strip

**Gate:** shared gate + `audit_log` row written every time a customer detail page is opened (visible in the dev audit viewer).

---

## U3 — Jobs + bay board (day 3–4)

**Build:**
- `/app/jobs` — filterable table
- `/app/bay-board` — drag-and-drop kanban (dnd-kit), realtime updates
- `/app/jobs/[id]` — tabbed detail from DESIGN_SYSTEM §3.4
- "New job" wizard (3-step dialog)
- Status transition dropdown, server-validated

**Gate:** shared gate + drag works with touch (200 ms hold) on a real phone + two browser windows see the same updates within 1 s (realtime).

---

## U4 — Technician mobile (day 4)

**Build:**
- `/app/tech` list
- `/app/tech/job/[id]` active view (DESIGN_SYSTEM §4.3)
- Primary action button with 300 ms press-and-hold
- Task-type picker
- Timer component (client, updates every second, server is source of truth for start time)
- Bottom tab bar

**Gate:** shared gate + hand Hossein a real phone and have him start/pause/complete a job wearing a thin glove + screen readable at max brightness outdoors (photo test).

---

## U5 — Parts sheet + upload (day 4)

**Build:**
- Bottom sheet with the full parts form
- Camera capture button on mobile (`<input type="file" accept="image/*,application/pdf" capture="environment">`)
- Client-side pre-upload: show file name + size, block > 10 MB with a friendly message
- Upload progress bar
- On success, part appears in the parts table instantly (optimistic)

**Gate:** shared gate + upload a 12 MB file → blocked client-side AND server-side + upload a `.exe` renamed `.pdf` → blocked with a clear message.

---

## U6 — Approval flow UI (day 5)

**Build:**
- Tech "Request approval" dialog: description + amount keypad (custom mobile-friendly number pad)
- Manager sees pending approvals in today view with warning colour
- Public approval page at `/approve/[token]` — big garage logo, description, amount in huge type, two massive buttons: **Approve** (success) / **Decline** (destructive)
- After response: thank-you screen + "You can close this window"

**Gate:** shared gate + approval page usable one-handed on a small phone + "Decline" requires a 2-second press-and-hold to prevent fat-fingers + declined path has a "talk to garage" CTA.

---

## U7 — PDF preview (day 5)

**Build:**
- "Generate PDF" button on job detail opens a server-side PDF in a new tab
- Preview modal shows a thumbnail + "Download" + "Email to customer" buttons (email is M2 if Twilio-SMS-with-link is enough for M1)

**Gate:** shared gate + PDF renders identically on Chrome, Firefox, Safari + customer copy matches screen numbers byte-for-byte (snapshot test).

---

## U8 — Customer status page (day 5–6)

**Build:**
- DESIGN_SYSTEM §6 screens exactly
- 6-box code input with paste handling and auto-advance
- Countdown timer
- Honeypot field
- Honest GDPR expander

**Gate:** shared gate + enumeration test: record video of response to valid vs invalid inputs, visually identical + Lighthouse accessibility 100 + works on a 3-year-old Android Chrome.

---

## U9 — Tablet kiosk (day 6)

**Build:**
- DESIGN_SYSTEM §5 screens exactly
- 60-second idle redirect
- 5-minute screen lock
- UK numeric keypad component
- Confirm screen with summary "cards" (not a form, so customers can't second-guess)
- Done screen with animated tick

**Gate:** shared gate + Hossein tests with a real 10" tablet at reception height + works fully offline-to-online transition (store-and-forward not required — just give clear error) + submit-to-done feels fast (< 800 ms perceived).

---

## U10 — Bookings inbox (day 6)

**Build:**
- `/app/bookings` — inbox-style list of unpromoted bookings (kiosk + online)
- Each row expands to show details
- "Promote to job" button: opens the New Job wizard pre-filled with booking data

**Gate:** shared gate + duplicate detection: if a customer by that phone already exists, the wizard offers to link instead of creating.

---

## U11 — M1 UX audit + polish (day 7)

- Full ux-audit pass across all phases U0–U10
- Fix every Critical + High
- Accept + log Medium findings with notes
- Hossein smoke test: he does the full flow himself while Claude watches

**Gate:** zero Critical, zero High. Hossein signs M1.

---

## U12–U14 — Warranty, Stock, DVSA (days 8–10)

Each is its own manager-only screen. Standard shared gate. No surprises.

- **U12 Warranty** — surfaced on job complete + on vehicle detail. "Active warranty" banner with expiry + mileage.
- **U13 Stock** — item list, low-stock warnings, movement log, link from parts form so a part can be drawn from stock.
- **U14 DVSA** — button on vehicle page, loading state, cached data with "last refreshed" timestamp.

---

## U15 — Reports dashboard (day 11)

**Build:**
- `/app/reports` — week/month toggle, 6 tiles from BACKEND_SPEC §3.3 views
- Tremor or shadcn charts
- CSV export button per tile

**Gate:** shared gate + numbers match raw SQL (snapshot test) + loads in < 1 s with 10k jobs seeded.

---

## U16 — GDPR UI (day 12)

**Build:**
- Export button on customer detail → JSON download
- `/app/audit-log` manager-only paginated viewer
- Soft-delete with 30-day recovery banner on deleted-customer detail page

**Gate:** shared gate + export contains every table's rows for the customer + audit viewer handles 1M rows without dying.

---

## U17 — Full a11y pass (day 13)

- Lighthouse accessibility ≥ 95 on every page
- axe-core clean
- VoiceOver walkthrough of the tech mobile and status page
- TalkBack walkthrough on Android
- Keyboard-only walkthrough of the manager dashboard

**Gate:** zero Critical/High a11y issues.

---

## U18 — Onboarding + handover (day 14)

**Build:**
- `/app/guide` — simple markdown-rendered admin guide (embedded in-app, printable)
- First-login tour for managers (Intro.js or similar — 6 steps)
- Walkthrough video embed on the guide page (Hossein records, Claude edits captions)

**Gate:** Hossein can onboard a new Dudley staff member solo using only the guide.

---

## Daily UI ritual

1. Pick the active UI phase from the tracker
2. Read the matching ux-audit reference file(s)
3. Build
4. Run the shared gate
5. Mark complete or write the specific blocker
