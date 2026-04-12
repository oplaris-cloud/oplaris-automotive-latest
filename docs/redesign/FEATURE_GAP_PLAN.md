# FEATURE_GAP_PLAN.md — Missing features execution plan

> **Context:** An audit on 2026-04-12 compared the codebase against `dudley-requirements-v1.md` and the UI plan (`AUDIT_PROMPT.md`). Five feature gaps were found. This document is the execution plan for closing them. It follows the same phase-tracker-with-audit-gate pattern used in `BACKEND_AUDIT_PROMPT.md` and `AUDIT_PROMPT.md`.

> **Status:** AWAITING REVIEW — Hossein must approve this plan before any phase is executed.

---

## Gap tracker

| # | Gap | Requirement ref | Current state | Priority |
|---|-----|-----------------|---------------|----------|
| G1 | Bay board has no drag-and-drop | Req §4.5, AUDIT_PROMPT U3 | **DONE** — DnD installed, TS fix applied, build passes | HIGH |
| G2 | No vehicle detail page | Req §6 Scenario D, AUDIT_PROMPT U2 | **DONE** — page renders, New Job pre-fill added | HIGH |
| G3 | MOT history has no UI | Req §4.17, AUDIT_PROMPT U14 | **DONE** — UI + DVSA API verified working | MEDIUM |
| G4 | No vehicle search section in sidebar | Req §6 Scenario D | **DONE** — vehicles page + sidebar link in place | MEDIUM |
| G5 | Car image on vehicle cards (IMAGIN.studio) | New feature (Hossein request) | **DONE** — component built, fallback works | LOW |

---

## Pre-requisites

Before starting any phase:

1. **Install the DnD library:** `pnpm add @hello-pangea/dnd` — this was already added to `package.json` but not installed. Run `pnpm install` and confirm the build passes.
2. **IMAGIN.studio customer key:** Register at https://dashboard.imagin.studio or email service@imagin.studio. Use the demo key `img` for development, replace with real key before production deploy.
3. **DVSA credentials verified:** Check that `.env.local` has valid `DVSA_CLIENT_ID`, `DVSA_CLIENT_SECRET`, `DVSA_TENANT_ID`, `DVSA_SCOPE`, `DVSA_API_KEY`, `DVSA_BASE_URL`. The DVSA route handler and token module already exist.

---

## Phase G1 — Drag-and-drop bay board

**Corresponds to:** AUDIT_PROMPT U3 (bay board), Requirement §4.5

**What was already built (2026-04-12, partially deployed):**
- `src/app/(app)/app/bay-board/BayBoardClient.tsx` — Client component using `@hello-pangea/dnd` with `DragDropContext`, `Droppable` (per bay), `Draggable` (per job card). Optimistic state update on drag, server persist via API call.
- `src/app/api/bay-board/move/route.ts` — POST endpoint, manager-only, validates `jobId` + `bayId` UUIDs, updates `jobs.bay_id`.
- `src/app/(app)/app/bay-board/page.tsx` — Server component rewired to pass `initialBays` to the DnD client component.

**What still needs to happen:**

- [x] **G1.1** Run `pnpm install` to resolve `@hello-pangea/dnd` (this is why the build is broken)
- [x] **G1.2** Verify the build passes: `pnpm build` should complete with no errors (TS fix: splice return type guard in BayBoardClient.tsx)
- [ ] **G1.3** Test drag-and-drop manually:
  - Create 2+ jobs assigned to different bays
  - Drag a job card from Bay 1 to Bay 2
  - Confirm the card appears in Bay 2 immediately (optimistic)
  - Refresh the page — card should still be in Bay 2 (server persisted)
  - Drag while NOT logged in as manager — should fail gracefully
- [ ] **G1.4** Test touch drag on mobile/tablet (the DnD library supports touch natively)
- [ ] **G1.5** Confirm the "Saving..." toast appears during the server call and disappears on completion
- [ ] **G1.6** Edge case: drag to same bay, same position → no API call should fire

**Audit gate:**
- [ ] Shared UI gate from AUDIT_PROMPT (a11y, mobile, loading, error, empty, no hardcoded colours)
- [ ] Touch works on a real phone (200ms hold to initiate drag)
- [ ] Revert on server failure (disconnect network, drag, confirm card snaps back)

---

## Phase G2 — Vehicle detail page

**Corresponds to:** AUDIT_PROMPT U2, Requirement §6 Scenario D

**What was already built (2026-04-12):**
- `src/app/(app)/app/vehicles/actions.ts` — Server action `getVehicleDetail()` fetches vehicle with customer join, all jobs for the vehicle, and cached MOT history from `mot_history_cache`.
- `src/app/(app)/app/vehicles/[id]/page.tsx` — Full detail page with:
  - Hero card with car image (IMAGIN.studio), reg plate badge, make/model/year/colour/VIN/mileage
  - Quick action buttons: "New Job" (pre-fills vehicle+customer), "View Customer"
  - Owner section with customer name, phone, email as a linked card
  - Active jobs section (filtered non-completed/cancelled)
  - MOT history section (delegated to client component)
  - Full job history section (all jobs, newest first)
- `src/app/(app)/app/vehicles/[id]/MotHistorySection.tsx` — Client component (see G3)

**What still needs to happen:**

- [ ] **G2.1** Verify the page renders: navigate to `/app/vehicles/{any-vehicle-uuid}` — should show vehicle detail, not 404
- [ ] **G2.2** Test "New Job" button: should navigate to `/app/jobs/new?vehicleId=...&customerId=...` — confirm the new job form pre-fills these fields (check if `NewJobForm.tsx` reads URL params; if not, add that)
- [ ] **G2.3** Test "View Customer" button: should navigate to correct customer detail page
- [ ] **G2.4** Test with a vehicle that has no jobs — should show "No jobs recorded" empty state
- [ ] **G2.5** Test with a vehicle that has no customer (edge case, shouldn't happen but handle gracefully)
- [ ] **G2.6** Confirm the vehicle card link on the job detail page (`/app/jobs/[id]`) now links to `/app/vehicles/[id]` instead of being a dead card

**Audit gate:**
- [ ] Shared UI gate
- [ ] Page loads in < 1s with a vehicle that has 20+ jobs
- [ ] Reg plate badge uses yellow background, black mono text (UK plate style)
- [ ] All links work (customer, jobs, new job)

---

## Phase G3 — MOT history UI

**Corresponds to:** AUDIT_PROMPT U14, Requirement §4.17

**What was already built (2026-04-12):**
- `src/app/(app)/app/vehicles/[id]/MotHistorySection.tsx` — Client component with:
  - "Refresh from DVSA" button that POSTs to `/api/dvsa/refresh`
  - Loading spinner on the refresh button
  - Error display if DVSA call fails
  - Timeline of MOT tests: date, pass/fail badge, odometer, expiry
  - Expandable defect lists per test (advisory, minor, major, dangerous icons)
  - "No MOT history" state with inline fetch link

**What still needs to happen:**

- [ ] **G3.1** Verify the DVSA API is actually working: the previous session identified auth issues. Test by clicking "Refresh from DVSA" on a real vehicle reg (e.g. a Dudley customer's car). Check the browser network tab for the response.
  - If 502: check the server console for `[dvsa]` errors — likely an OAuth token issue or incorrect API endpoint
  - If 503: DVSA env vars are missing from `.env.local`
  - If it works: the MOT history should populate below the button
- [ ] **G3.2** Verify the DVSA API response structure matches what `MotHistorySection` expects:
  - The component looks for `payload.motTests` or `payload.motTestReports` as an array
  - Each entry should have: `completedDate`, `testResult`, `expiryDate`, `odometerValue`, `odometerUnit`, `defects[]`
  - If the real DVSA response uses different field names, update the type and mapping in `vehicles/actions.ts`
- [ ] **G3.3** Test the 24h cache: refresh once, note the time, refresh again within 24h — second call should return `cached: true` and not hit DVSA
- [ ] **G3.4** Test with a vehicle that has never had an MOT (new car < 3 years old) — DVSA may return 404 or empty array. Handle both gracefully.

**Audit gate:**
- [ ] Shared UI gate
- [ ] Defect severity icons are correct (dangerous = red alert, major = orange X, advisory = grey triangle)
- [ ] "Last refreshed" timestamp visible so managers know how fresh the data is
- [ ] Refresh button disabled while loading (no double-clicks)

---

## Phase G4 — Vehicle search section + sidebar

**Corresponds to:** Requirement §6 Scenario D (manager types reg, sees full history)

**What was already built (2026-04-12):**
- `src/app/(app)/app/vehicles/page.tsx` — Vehicle list/search page with:
  - Search bar (by registration, make, or model)
  - Grid of vehicle cards with car images, reg badge, make/model, customer name
  - Links to vehicle detail pages
- `src/components/app/sidebar.tsx` — "Vehicles" nav item added with Car icon, visible to managers and MOT testers

**What still needs to happen:**

- [ ] **G4.1** Verify the vehicles page renders: navigate to `/app/vehicles` — should show all vehicles (newest first, limit 50)
- [ ] **G4.2** Test search: type a partial reg (e.g. "AB12") — results should filter. Type a make (e.g. "Ford") — should also filter.
- [ ] **G4.3** Verify the sidebar shows "Vehicles" between "Customers" and "Bookings"
- [ ] **G4.4** Confirm vehicle cards link correctly to `/app/vehicles/[id]`
- [ ] **G4.5** Test with 0 vehicles — should show empty state
- [ ] **G4.6** Consider: should the search also search by customer name? (The Supabase `or` filter currently only searches `registration`, `make`, `model`.) If yes, add `customers.full_name` to the filter — requires a different query approach since it's a joined table.

**Audit gate:**
- [ ] Shared UI gate
- [ ] Search feels instant (< 300ms response)
- [ ] Mobile: grid collapses to single column, search bar is full width

---

## Phase G5 — IMAGIN.studio car images

**Corresponds to:** Hossein's request (not in original scope)

**What was already built (2026-04-12):**
- `src/components/ui/car-image.tsx` — Reusable `<CarImage>` component:
  - Builds IMAGIN.studio CDN URL from make/model/year/colour
  - UK colour normalisation (maps "metallic silver" → "silver", "maroon" → "red", etc.)
  - SVG car silhouette fallback if make is missing or image fails to load
  - `onError` handler falls back gracefully
  - Free tier: max 400px width, uses `paintDescription` for colour
  - Currently uses demo customer key `img`
- Used in: vehicle detail page hero, vehicle list cards, customer detail vehicle cards

**What still needs to happen:**

- [ ] **G5.1** Test with real vehicles: check that images load for common UK makes (Ford, Vauxhall, BMW, VW, Audi, Toyota, Honda, Mercedes, Nissan, Hyundai)
- [ ] **G5.2** Test with uncommon makes — verify the fallback SVG shows cleanly
- [ ] **G5.3** Test colour matching: add a "Red" Ford Focus and a "Silver" BMW 3 Series — confirm images show correct colours
- [ ] **G5.4** Register for a proper IMAGIN.studio customer key and replace `"img"` in `car-image.tsx` line that sets the `customer` param. Consider moving this to an env var: `NEXT_PUBLIC_IMAGIN_CUSTOMER_KEY`
- [ ] **G5.5** Performance: confirm images load lazily (the component uses `loading="lazy"`) and don't block page render
- [ ] **G5.6** Consider adding car image to the bay board job cards (small thumbnail next to the reg) — optional, depends on whether it makes the cards too heavy

**Audit gate:**
- [ ] Images load for top 10 UK car makes
- [ ] Fallback SVG renders cleanly when image fails
- [ ] No layout shift when image loads (container has min-height)
- [ ] Page with 20 vehicle cards loads in < 2s on throttled 3G

---

## Execution order

```
G1 (DnD install + test) → G4 (vehicles page + sidebar) → G2 (vehicle detail) → G3 (MOT UI) → G5 (car images)
```

G1 first because the build is currently broken. G4 before G2 because you need the list page to navigate to the detail page. G3 depends on G2 (MOT section lives on the vehicle detail page). G5 is cosmetic and can be tested last.

**Time estimate:** ~2 hours of testing and fixes if the code is already correct. If the DVSA API response structure doesn't match (G3.2), add 30-60 minutes for mapping adjustments.

---

## Files created on 2026-04-12 (reference)

| File | Type | Purpose |
|------|------|---------|
| `src/components/ui/car-image.tsx` | Client component | IMAGIN.studio car image with fallback |
| `src/app/(app)/app/vehicles/page.tsx` | Server component | Vehicle search/list page |
| `src/app/(app)/app/vehicles/actions.ts` | Server action | Vehicle detail + job history + MOT cache |
| `src/app/(app)/app/vehicles/[id]/page.tsx` | Server component | Vehicle detail page |
| `src/app/(app)/app/vehicles/[id]/MotHistorySection.tsx` | Client component | Interactive MOT history display |
| `src/app/(app)/app/bay-board/BayBoardClient.tsx` | Client component | Drag-and-drop bay board |
| `src/app/api/bay-board/move/route.ts` | Route handler | Bay move endpoint (manager-only) |

## Files modified on 2026-04-12 (reference)

| File | Change |
|------|--------|
| `package.json` | Added `@hello-pangea/dnd` |
| `src/components/app/sidebar.tsx` | Added Vehicles nav item with Car icon |
| `src/app/(app)/app/bay-board/page.tsx` | Rewired to use DnD client component |
| `src/app/(app)/app/customers/[id]/page.tsx` | Vehicle cards now show car images + fetch colour |
| `src/app/(app)/app/jobs/[id]/page.tsx` | Vehicle card is now a clickable link to vehicle detail |

---

## How to use this plan

1. Read the whole plan
2. Start with G1.1 (`pnpm install`)
3. Work through each phase in order
4. Check off each item as you go
5. Run the audit gate at the end of each phase
6. Update the gap tracker at the top when a phase is complete
7. If a test fails, fix it before moving to the next phase
