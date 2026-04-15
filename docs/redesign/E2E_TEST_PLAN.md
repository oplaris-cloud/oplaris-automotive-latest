# E2E Test Plan — Browser verification via Claude Code

**Purpose:** A structured, step-by-step test plan Claude Code can execute using its Chrome browser tools to verify Part D (P29, P30, P33) implementations and the pending Part E fixes, without requiring a human to manually click through the app.

**Tools used:** `mcp__Claude_in_Chrome__navigate`, `computer` (screenshot/click/type), `find`, `read_page`, `read_console_messages`, `read_network_requests`, `javascript_tool`, `resize_window`.

**Prereqs before running:**
1. Dev server running at `http://localhost:3000` (`pnpm dev` or `npm run dev`)
2. All 4 pending migrations (015-018) + migrations 019-023 applied to the local Supabase
3. Seed data loaded: 1 garage, 3 staff (manager, mechanic, MOT tester), 2-3 customers with vehicles, 1-2 jobs in various statuses, some stock items
4. Test credentials available: `oplarismanagement@gmail.com` / [password]

**How to run:** Claude Code should execute each TEST in order, capturing screenshots at key points, reading console for errors, and reporting PASS / FAIL / SKIP per test item. On FAIL, stop and report the exact failure so it can be fixed before continuing.

**Output format for each test:**
```
TEST T-X.Y: [description]
Status: PASS | FAIL | SKIP
Evidence: [screenshot paths + any relevant network/console findings]
Notes: [anything unexpected]
```

---

## T0 — Preflight

### T0.1 — Dev server reachable
1. `navigate` to `http://localhost:3000`
2. `screenshot` — expect login page or redirect
3. `read_console_messages { pattern: "error|warn" }` — no red errors should appear

### T0.2 — Login as manager
1. Login page: `find "email input"` → type `oplarismanagement@gmail.com`
2. `find "password input"` → type the password
3. Click Sign In
4. Expect redirect to `/app` or `/app/today`
5. `screenshot` — dashboard visible with sidebar

**If T0 fails:** do not continue. Report and stop.

---

## T1 — P29 Warranties (stock-only)

### T1.1 — Warranties page loads from stock
1. Navigate to `/app/warranties`
2. Expect redirect to `/app/stock` OR the warranties UI embedded in the stock page
3. `screenshot`
4. Verify visible: "Warranties" section with at least one row OR empty state with "Add Warranty" button

### T1.2 — Add warranty via dialog (not inline form)
1. Click "Add Warranty"
2. Verify a `<Dialog>` modal opens (content floats over the page, not pushing content down)
3. Check console for errors
4. Fill: stock item (pick first), supplier = "Test Supplier Ltd", purchase date = today, expiry = 12 months out, invoice reference = "TEST-001"
5. Click Save
6. Expect modal to close, row appears in warranties list
7. `screenshot` of the new row

### T1.3 — Claim a warranty
1. Find the row added in T1.2
2. Click the Claim button (warning-coloured icon)
3. Verify Dialog modal opens
4. Type a reason: "Part failed after 3 weeks"
5. Click Submit Claim
6. Expect modal to close, row now shows "claimed" status

### T1.4 — Resolve the claim
1. On the same row, click Resolve button (success-coloured icon)
2. Verify Dialog modal opens
3. Pick status = "resolved", type resolution = "Replacement received"
4. Click Submit
5. Expect modal to close, row shows "resolved" status

### T1.5 — No warranty UI on job detail
1. Navigate to any job detail page (`/app/jobs/{id}`)
2. `read_page` looking for any element mentioning "warranty" or "Warranty"
3. Expected: NOTHING. The old job-warranty dialog should be removed.

---

## T2 — P30 Charges + Quote/Invoice

### T2.1 — Charges section exists on job detail
1. Navigate to a draft job (or any job): `/app/jobs/{id}`
2. Scroll to Charges section
3. `screenshot`
4. Verify: "Charges" heading, status badge saying "draft", "Add Charge" button, "Labour from logs" button

### T2.2 — Add a charge (Part type)
1. Click "Add Charge"
2. Verify Dialog modal opens
3. Pick type = Part, description = "Test brake pads", qty = 2, unit price = 45.50
4. Click Add
5. Expect modal closes, new row visible in charges table
6. Verify: subtotal = £91.00, VAT = £18.20, Grand Total = £109.20

### T2.3 — Add a labour charge manually
1. Click "Add Charge"
2. Type = Labour, description = "Workshop labour", qty = 2, unit price = 75.00
3. Save
4. Expect subtotal = £91 + £150 = £241, VAT = £48.20, Total = £289.20

### T2.4 — Labour from logs button
*(Requires the job to have completed work logs)*
1. Click "Labour from logs"
2. **Expected after P40:** Opens AddChargeDialog pre-filled with suggested hours and rate
2b. **Current behaviour (before P40):** Auto-inserts a labour row with ceil(hours) × rate
3. Note which behaviour you see and record it

### T2.5 — Remove a charge
1. Click the trash icon on one charge row
2. Expect row removed immediately, totals recalculate
3. Verify no modal / confirmation required (design choice — OK for now)

### T2.6 — Send Quote
1. Ensure at least 1 charge exists, status = draft
2. Click "Send Quote"
3. Expect status badge changes to "quoted"
4. **Expected after P39.1:** Customer receives SMS — check `read_network_requests { urlPattern: "twilio" }` for outbound Twilio call
5. **Current behaviour (before P39.1):** Just updates status, no SMS
6. Note which behaviour you see

### T2.7 — Generate Invoice
1. Click "Generate Invoice" (visible when status is draft or quoted)
2. Expect status → "invoiced"
3. Expect a new browser tab opens with `/api/invoices/{jobId}`
4. Switch to that tab; screenshot the PDF
5. Verify:
   - Title says "INVOICE" (not QUOTE)
   - Reference = `INV-{job_number}`
   - Garage details at top (name, address, phone, email, VAT)
   - Customer name + address
   - Vehicle reg, make/model, mileage
   - Line items table with Type, Description, Qty, Unit Price, Total
   - Subtotal, VAT (20%), Total rows
   - Footer with balance-due + quotation validity text
   - **Style check: clean, minimal, NO fancy coloured headers or logos.** Plain Helvetica, grey borders, data-focused.

### T2.8 — View Invoice PDF after invoiced
1. Back on job detail
2. Status badge = "invoiced"
3. Button now says "View Invoice PDF"
4. Click → PDF opens in new tab again

### T2.9 — Parts → charges auto-sync (P39.2)
**Expected after P39.2 (currently NOT implemented):**
1. On a draft job, go to Parts section, click "Add Part"
2. Fill description = "Test oil filter", qty = 1, price = 12.50, supplier = "Halfords", payment method = "cash"
3. Save
4. Scroll to Charges section
5. Expect a new "Part" type charge row with description "Test oil filter", qty 1, price £12.50
6. If you see 0 new charges, P39.2 is not done yet — report as FAIL for verification

---

## T3 — P33 / P36 Modal pattern (layout shift)

Goal: Verify inline forms have been replaced with modals. Use viewport height comparison before/after opening forms.

### T3.1 — Log Work
1. Navigate to a job detail page
2. `javascript_tool` to get `document.body.scrollHeight` → call this `heightBefore`
3. Click "Log Work" button
4. Screenshot immediately
5. `javascript_tool` to get `document.body.scrollHeight` → call this `heightAfter`
6. **Pass criteria (P36):** `heightAfter === heightBefore` AND a Dialog overlay is visible
7. **Current behaviour (before P36):** `heightAfter > heightBefore` because inline form pushed content down
8. Note which you see

### T3.2 — Add Part
Same pattern as T3.1 but click "Add Part" button on Parts section.

### T3.3 — Add Vehicle (customer detail page)
1. Navigate to any customer detail page
2. Record scrollHeight before
3. Click "Add Vehicle"
4. Record scrollHeight after
5. Same pass criteria as T3.1

### T3.4 — Edit Job Description
1. Click edit icon on job description
2. Verify EditJobDialog opens as a modal (should already be DONE)
3. Cancel the modal, verify no layout shift occurred

### T3.5 — Inline edit audit via grep-at-runtime
1. Navigate through each page: stock, customers, vehicles, check-ins, settings, warranties, jobs
2. On each page, click any visible edit/add buttons
3. For every form that appears, verify it renders inside a `[role="dialog"]` element
4. `javascript_tool`: `document.querySelectorAll('form').length` — any form NOT inside a dialog when editing should be flagged

---

## T4 — P37 Card heights

### T4.1 — Job detail top row
1. Navigate to a job detail page with customer + vehicle + team cards
2. `javascript_tool`:
```js
const cards = document.querySelectorAll('[data-slot="card"]');
const heights = Array.from(cards).slice(0, 3).map(c => c.getBoundingClientRect().height);
heights
```
3. **Pass criteria (P37):** All 3 heights equal (±1px tolerance)
4. **Current:** Heights differ based on content

### T4.2 — Bay board columns
1. Navigate to `/app/bay-board`
2. Run same heights script on the bay cards
3. **Pass criteria:** All bay columns same height (when cards are in a row)

### T4.3 — Staff cards
1. Navigate to `/app/settings/staff`
2. Run same script on staff cards
3. **Pass criteria:** All cards in same row are equal height

---

## T5 — P38 Mobile-first pass

### T5.1 — Sidebar drawer on mobile
1. `resize_window { width: 375, height: 812 }` (iPhone portrait)
2. Navigate to `/app`
3. Verify sidebar is NOT visible by default
4. Expect a hamburger menu button visible in top bar
5. Click hamburger → sidebar drawer slides in (Sheet component)
6. Click a link → navigates and drawer closes
7. Press ESC → drawer closes

### T5.2 — Customers table → cards on mobile
1. Still at 375 width
2. Navigate to `/app/customers`
3. Screenshot
4. **Pass criteria (P38.2):** Customer rows render as cards (vertical stacked labels/values), no horizontal scroll
5. **Current behaviour:** Table overflows right or has horizontal scroll

### T5.3 — Stock table → cards on mobile
Same as T5.2 but for `/app/stock`.

### T5.4 — Job detail on mobile
1. At 375 width, navigate to a job detail page
2. Screenshot
3. Expect: top 3 cards stack vertically (grid-cols-1), status buttons wrap cleanly, work log entries stack, charges readable, no horizontal scroll anywhere
4. `javascript_tool`: `document.documentElement.scrollWidth === document.documentElement.clientWidth` → true

### T5.5 — Forms on mobile (job creation)
1. At 375 width, navigate to `/app/jobs/new`
2. Screenshot
3. Verify: multi-field rows stack vertically, submit button is full width
4. Inputs are not cut off on right edge

### T5.6 — Kiosk on tablet
1. `resize_window { width: 800, height: 1280 }` (portrait tablet)
2. Navigate to `/kiosk`
3. Verify: no horizontal scroll, buttons are large (≥44px), form fields readable

### T5.7 — Tech pages on small mobile
1. `resize_window { width: 360, height: 640 }` (old Android)
2. Navigate to `/app/tech`
3. Verify: start/pause/complete buttons ≥56px tall (for gloves), no horizontal scroll

### T5.8 — Tap target audit
1. At 375 width, on each key page, use find/read_page to enumerate buttons and links
2. `javascript_tool`:
```js
Array.from(document.querySelectorAll('button, a, [role="button"]'))
  .map(el => ({ text: el.textContent?.trim().slice(0, 30), h: el.getBoundingClientRect().height, w: el.getBoundingClientRect().width }))
  .filter(e => e.h < 44 || e.w < 44)
```
3. **Pass:** list is empty or only contains decorative icons

---

## T6 — P40 Labour rate flexibility

### T6.1 — Settings UI for labour rate (after P40.1)
1. Navigate to `/app/settings`
2. Find "Billing" section
3. Verify labour rate input, default description input
4. Change rate to 85.00, save
5. Refresh page, verify persists

### T6.2 — Labour from logs opens editable dialog (after P40.2)
1. On a job with work logs, click "Labour from logs"
2. Expect AddChargeDialog opens pre-filled (not auto-inserted)
3. Verify qty ≠ ceil (e.g. 1h 22m → 1.5, not 2)
4. Edit qty to 1, submit
5. Charge row appears with qty=1

### T6.3 — Flat fee labour
1. Click Add Charge → Labour
2. Fill qty=1, price=60, description="Emergency callout"
3. Save
4. Charge row = £60

---

## T7 — Visual / theme (V1-V6, if implemented)

Skip for now — visual plan not started yet. Add tests when V1 (theming infrastructure) ships.

---

## T8 — Regression checks on existing features

### T8.1 — Login / logout flow
### T8.2 — Create customer → add vehicle → create job
### T8.3 — Check-in promotion with tech assignment modal (B4 fix)
### T8.4 — Kiosk booking → appears in check-ins
### T8.5 — Tech start/pause/complete work log
### T8.6 — Customer status page lookup

Write these as you run the above tests — if anything unrelated breaks, log it.

---

## Reporting template

After running all tests, produce a summary:

```
# E2E Test Report — {date}

## Part D Verification
- P29 Warranties (T1): {PASS count} / {total}
- P30 Charges+Invoice (T2): {PASS count} / {total}
- P33 Modal pattern (T3): {PASS count} / {total}

## Part E Readiness
- P36 (T3): [DONE / NOT STARTED / PARTIAL]
- P37 (T4): [DONE / NOT STARTED]
- P38 (T5): [DONE / NOT STARTED]
- P39 (T2.6, T2.9, T2.4): [DONE / NOT STARTED]
- P40 (T6): [DONE / NOT STARTED]

## Critical failures (must fix before deploy)
- [list]

## Minor issues / polish
- [list]

## Console errors observed
- [list from read_console_messages]

## Network errors
- [list of 4xx/5xx from read_network_requests]
```

---

## Running order recommendation

1. T0 (preflight) — skip rest if fails
2. T8.1 + T8.2 (sanity — basic flows work)
3. T1 (P29 warranties) — quick pass/fail
4. T2 (P30 charges) — longest, most detail
5. T3 (modal pattern) — identifies P36 work
6. T4 (card heights) — identifies P37 work
7. T5 (mobile) — identifies P38 work at 3 viewports
8. T6 (labour rate) — skip if P40 not done
9. T8.3-T8.6 (regression)

Total estimated runtime with Claude Code browser tools: ~45-60 minutes for a full pass, ~15-20 minutes for T0-T3 only.
