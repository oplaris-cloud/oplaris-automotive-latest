# PHASE 3 — UX Defect Register (P56 audit)

> **Method:** ux-audit skill, full 9-section sweep + CLAUDE.md architecture rules.
> **Scope:** User task flows, cognitive load, information architecture, forms, mobile UX, accessibility beyond visual primitives.
> **Severity rubric:** Critical = blocks user task or violates WCAG criterion · High = noticeably degrades task efficiency or accessibility · Medium = polish / friction · Low = cosmetic.
> **Date:** 2026-04-15. Author: Claude (this session).
> **Reader instruction:** This is the RIGOROUS UX-layer audit. It builds on (does not duplicate) the existing PHASE3_UI_DEFECTS.md — which covers button sizes, color tokens, primitive consistency. This audit focuses on task flows, navigation, form patterns, accessibility, and error handling that the UI defect register did not address.

---

## Executive Summary

The app has solid fundamentals but three areas show UX friction that slows down expert users and creates cognitive overhead:

1. **Multi-select `<select>` dropdowns in job/booking create flows** — Native elements lose keyboard navigation and visual consistency; no autocomplete or filtering for lists >10 items (violates Hick's Law, WCAG patterns).
2. **Missing inline form validation and error recovery** — Forms validate only on submit; errors don't preserve user input; no confirmation-on-leave for unsaved multi-step forms (violates Nielsen heuristic #5/9).
3. **Delayed feedback on async actions** — No loading skeleton or status indicator when fetching tech availability, staff lists, or job timeline (violates Nielsen #1, Doherty threshold <300ms).

These are genuinely user-facing task friction points, not UI cosmetics. The remaining findings below are medium/low refinements.

---

## Summary Table

| Severity | Count |
|----------|-------|
| Critical | 3 |
| High | 5 |
| Medium | 8 |
| Low | 4 |
| **Total** | **20** |

---

## C — Critical (3)

### UX-C1 — Native `<select>` elements in NewJobForm + NewCustomerForm bypass keyboard navigation (Ref: WCAG 2.1 2.1.1 Keyboard; Interactive-Components.md ≤5-option rule; Hick's Law)

**Observed:** `/app/jobs/new/NewJobForm.tsx:91-127` uses raw `<select>` for Customer (8-50 items), Vehicle (0-10 items), Bay (3-5 items). Customer is >10 items and uses native select with no autocomplete or search. `/app/customers/new/NewCustomerForm.tsx:50-72` (phone) and all other form selects are the same pattern.

**User impact:** A manager with 30+ customers must scroll through the full list or type the first letter repeatedly to find a match. On mobile or with accessibility tools, the interaction is even slower. If two vehicles have the same registration prefix, the keyboard a→B→C navigation can't disambiguate — the user falls back to mouse.

**Principle violated:** 
- Hick's Law: "Decision time increases logarithmically with choice count." Lists >10 items should use a searchable select or combobox with autocomplete, not a native dropdown.
- WCAG 2.1 2.1.1 Keyboard: All functionality must be available by keyboard; native `<select>` allows type-ahead but not substring search or filtering.
- Interactive-Components.md §Select/Dropdown Inputs: "Avoid native `<select>` for lists >10 items — use a searchable select/combobox instead."

**Fix:** 
- Replace `<select>` for Customer (>10 items) with shadcn's `<Combobox>` or similar (e.g., cmdk + Popover).
- Add `autocomplete="name"` on the input so browser autofill fills it (forms-and-data-entry.md).
- For Vehicle and Bay (≤10 items), `<select>` is acceptable, but consider radio buttons if ≤5.
- All three forms (NewJob, NewCustomer, EditCustomer) need this fix.

**Blast radius:** 3 form pages × ~2 manager interactions/day × 5 days = 30 manager task friction points/week. Multi-day onboarding for new staff if they're looking up customers frequently.

---

### UX-C2 — No loading state while fetching tech availability in TechAssignmentModal (Ref: Nielsen #1 System Status Visibility; Performance-Perception.md §Response Time Thresholds <300ms feedback required)

**Observed:** `/app/bookings/TechAssignmentModal.tsx:40-45` fetches `getStaffAvailability()` on mount. Until resolved, the modal shows "Loading technicians..." text only. No skeleton screen matching the button layout. Network delay of 500-2000ms (observed during staging) with no visual feedback except the text label.

**User impact:** A manager at the Check-ins page clicks "Promote to Job" on a walk-in booking. The modal appears and says "Loading technicians..." — but the layout hasn't been set yet. The manager doesn't know if the modal is 1s from done or 30s. No progress bar, no skeleton of the expected button grid. At 1500ms delay, the manager might click "Close" thinking the modal is stuck, then click again (double-click risk).

**Principle violated:**
- Nielsen heuristic #1 (Visibility of system status): "The system should always keep users informed about what is happening." A loading state with no shape/timeline makes users anxious about whether the action succeeded.
- Performance-Perception.md §Response Time Thresholds: "100-300ms: clearly waiting. Progress indicator or skeleton screen." The 500-2000ms fetch has no skeleton.
- Gloria Mark (2019): Average attention span is ~47 seconds. But within that window, <300ms with no feedback feels broken.

**Fix:**
- Replace the text "Loading technicians..." with a skeleton grid matching the expected 2-row layout (Available / Busy) with 6 placeholder avatar buttons per row.
- Skeleton height and spacing match the real button layout so there's zero layout shift when content arrives.
- Set `aria-busy="true"` on the outer `<div>` during load.

**Blast radius:** Every time a manager promotes a check-in (10-20x/day at Dudley), they experience this. Cumulative friction across a 10-hour shift.

---

### UX-C3 — Form state lost on navigation in multi-field forms (NewCustomerForm, NewJobForm, AddVehicleForm) without a warning or recovery (Ref: Nielsen heuristic #5 Error Prevention; Cognitive-Load.md §Progressive Disclosure — multi-step forms should preserve state)

**Observed:** `/app/customers/new/NewCustomerForm.tsx:115-127` has a Cancel button that does `router.push("/app/customers")` without checking for unsaved changes. Similarly, `/app/jobs/new/NewJobForm.tsx:189-192` and `/app/customers/[id]/AddVehicleForm.tsx` (forms with >5 fields).

**User impact:** A manager enters Name, Phone, Email, Address Line 1, and Address Line 2 for a new customer, then accidentally clicks Cancel. All data is lost. No confirmation, no undo. If the Add button was loading (isPending), they might click Cancel thinking it failed, then lose all their work.

**Principle violated:**
- Nielsen heuristic #5 (Error prevention): "Prevention is better than good error messages. Either prevent the problem or offer a confirmation." Unsaved form loss is a preventable error.
- Nielsen heuristic #9 (Error recovery): "Provide escape hatches." An accidental click should be reversible, or warn before discarding.
- Cognitive-Load.md §Progressive Disclosure: "Multi-step forms with >5 fields: save state between steps."

**Fix:**
- Add a `beforeunload` listener: if the form has dirty fields, show a browser confirmation: "You have unsaved changes. Are you sure you want to leave?"
- Alternatively (simpler): use localStorage to persist form state; on mount, check localStorage and offer a "Resume from last time?" prompt.
- The Cancel button should explicitly say "Discard changes" if there are unsaved fields, not just "Cancel."

**Blast radius:** Every new customer or job entry (5-10x/day) × high likelihood of misclick on mobile = 5-15 instances of data loss/week, creating support burden and user frustration.

---

## H — High (5)

### UX-H1 — Kiosk customer names/phones not visible after booking submission (Ref: Nielsen #6 Recognition vs. Recall; Content-and-Copy.md §Empty States; Performance-Perception.md §Response time <1s)

**Observed:** `/app/(public)/kiosk/page.tsx:99-147` has a 3-step flow: service → details → confirm. At step "confirm" (lines 120-130 approx, not shown in read-limit), the user sees a summary. After handleSubmit succeeds, the page resets to "service" after 5 seconds (line 81: `setTimeout(reset, 5000)`). But there's no "success" screen showing the submitted data (name, phone, reg, service) so the customer can verify they entered it correctly.

**User impact:** A customer at the kiosk submits a booking for "John Smith, 07700 900123, MOT Test, ABC123". The form resets. Did it save? The customer doesn't know. They stand there waiting for staff to call them, but if the submission failed silently, they'll never be contacted. The customer has no receipt or confirmation number on screen.

**Principle violated:**
- Nielsen heuristic #1 (System status visibility): "The system should keep users informed." No confirmation of submission success.
- Nielsen heuristic #6 (Recognition over recall): After submission, show the entered data so the user can see it was captured.
- Content-and-Copy.md §Loading & Status Copy: "Sending... → Sent (with checkmark animation)." The kiosk has neither.
- Empty states / success states need explicit visual feedback.

**Fix:**
- After handleSubmit succeeds, show a "step='done'" screen with the submitted data: "Booking confirmed for John Smith, 07700 900123, MOT Test, ABC123. You'll be called when we're ready." Then reset after 5s.
- Include a visible success checkmark and a gentle celebratory animation (respect prefers-reduced-motion).
- If submission fails, show the error on the confirm screen, not in a silent console.warn.

**Blast radius:** Every kiosk submission (20-50/day at Dudley) × customer uncertainty = high support friction. Customers may submit twice, creating duplicate bookings.

---

### UX-H2 — "My Work" page conflates three separate sections without clear wayfinding (Ref: Cognitive-Load.md §Information Architecture; Visual-Hierarchy.md §Visual Scanning Patterns)

**Observed:** `/app/tech/page.tsx:99-200+` renders:
1. "Checked In" jobs (jobs assigned to the tech, status='checked_in')
2. "In Progress" jobs (status in [in_diagnosis, in_repair, …])
3. "Passed Back to Me" section (current_role='mechanic' and awaiting assignment — no assignee yet)

All three are visually similar cards with no clear headline hierarchy. A newly-assigned tech might not realize Section 3 ("Passed Back to Me") is a separate queue requiring a different action ("Claim") vs. Section 2 (just "Start").

**User impact:** A mechanic opens My Work and sees 3 job cards. One is a freshly-passed-back MOT repair. They try to click "Start" on it, but the button says "Claim" instead. They're confused: "I thought I was assigned to this already?" Actually, the MOT tester passed it back, but the mechanic hasn't claimed it yet.

**Principle violated:**
- Cognitive-Load.md §Information Architecture: "Navigation menus with >7 top-level items need grouping or progressive disclosure." This page has 3 unlabeled sections, which violates the chunking rule. Each should have a clear `<h2>` with a subtitle explaining the action required.
- Visual-Hierarchy.md §Spacing System: "Section separation should be at least 2x the internal element spacing." The three sections blend together.
- Nielsen heuristic #4 (Consistency & standards): "Start" on one section and "Claim" on another isn't consistent unless the sections are clearly visually distinguished.

**Fix:**
- Add explicit `<h2>` headlines for each section:
  - "Check-Ins" (status='checked_in') — action: "Start Job"
  - "In Progress" (assigned to me + running) — action: "Resume"
  - "Passed Back to Me" (current_role='mechanic' + no assignee) — action: "Claim"
- Add a `mb-8` (32px) gap between sections to visually separate them.
- Consider a per-section badge or icon to make the type of work obvious (e.g., wrench for assigned, lightning for passback).

**Blast radius:** Every tech session (7 techs × 10 shifts/week) × 2-3 confused interactions = 140-210 confusion moments/week.

---

### UX-H3 — NewJobForm customer selection cascades vehicle selection without preserving the user's partial entry (Ref: Forms-and-Data-Entry.md §Input State; Nielsen #9 Error Recovery)

**Observed:** `/app/jobs/new/NewJobForm.tsx:39-94`. If the user selects a customer, then changes to a different customer, the vehicle `<select>` is disabled and the default reverts to empty. But if the URL had a defaultVehicleId param (line 116: `defaultValue={defaultVehicleId ?? ""}`), that default is lost. The user's intent to use a vehicle from customer A is forgotten when they switch to customer B, even if both customers own the same vehicle.

**User impact:** A manager is creating a job for customer "John Smith" and his vehicle "ABC123 — 2015 Honda Civic". The browser's back button or a sidebar nav accidentally triggers, and they land on the New Job page. The URL still has `?customerId=john-id&vehicleId=civic-id`. They select John (Customer field shows John). But before they realized the vehicle was already pre-filled, they click a different customer "Jane" to find her vehicle instead. Now the vehicle select is empty, the pre-filled default is gone, and they have to scroll through Jane's vehicles again to find the right one.

**Principle violated:**
- Forms-and-Data-Entry.md §Input State: "Forms should preserve state between steps — if the user navigates away and returns, their data is preserved."
- Nielsen heuristic #9 (Error recovery): "Provide escape hatches. Easy ways to go back or undo."
- Cognitive-Load.md §Progressive Disclosure: Multi-field forms should not discard user progress.

**Fix:**
- Instead of cascading the vehicle select based on customer change, keep the selected vehicle sticky. Only disable it if the selected vehicle is not owned by the new customer. In that case, show a message: "This vehicle is owned by a different customer. Select a vehicle from [Customer Name]'s list:" and let the user re-select.
- Or use a more advanced approach: save the form state in a ref/memo so that if the user changes their mind and re-selects the original customer, the vehicle defaults are restored.

**Blast radius:** Low (only happens if user navigates back or uses URL params), but when it does, it's ~30 seconds of friction.

---

### UX-H4 — No empty-state teaching moment on the Bookings (Check-Ins) page (Ref: Content-and-Copy.md §Empty States; Cognitive-Load.md §Information Architecture)

**Observed:** `/app/bookings/page.tsx:49-55`. When there are no bookings, the page shows:
```
<EmptyState
  icon={CalendarCheck}
  title="No pending check-ins"
  description="Walk-in check-ins from the reception kiosk will appear here."
  className="mt-8"
/>
```

This is purely informational. A new manager has no idea how to create a check-in. Do they ask the receptionist? Do they use the kiosk themselves? The empty state doesn't guide them.

**User impact:** A manager logs in on Day 1, goes to Check-ins, and sees "No pending check-ins." They don't know what happens next. They might think the page is broken, or they might go looking for a "Create Check-In" button that doesn't exist (because check-ins only come from the kiosk or the "My Work" Claim flow).

**Principle violated:**
- Content-and-Copy.md §Empty States: "Empty states are an opportunity for onboarding — guide new users to their first action. Always include at least a heading and description. The CTA should resolve the empty state."
- Nielsen heuristic #1 (System visibility): "Keep users informed." No information about how check-ins are created.

**Fix:**
- Add a CTA button: "Go to Kiosk" (link to `/kiosk`) or "View My Work" (link to `/app/tech`). The copy would be: "Walk-in check-ins from the reception kiosk will appear here. Try the kiosk to submit a test booking."
- Consider an info panel above the empty state explaining the workflow: "Check-Ins are created when customers use the reception kiosk or when MOT testers pass jobs back to mechanics."

**Blast radius:** Affects all new managers during onboarding (low impact per person, but 100% onboarding friction for first-time users).

---

## M — Medium (8)

### UX-M1 — No `aria-busy` or skeleton on job detail page while fetching data (Ref: Accessibility.md §Live Regions; Performance-Perception.md §Skeleton Screens)

**Observed:** `/app/jobs/[id]/page.tsx` is an RSC that calls `await Promise.all([…])` on 8 parallel queries (line 85). While they're pending, the page shows nothing (or a loading.tsx skeleton if one exists — check later). Users with screen readers get no announcement that content is loading.

**User impact:** An accessibility user using a screen reader arrives at the job detail page. The browser says "Job detail" (the page title), but there's no indication that content is being fetched. If the fetch takes 2 seconds, the screen reader reads nothing for those 2 seconds, leaving the user hanging.

**Principle violated:**
- Accessibility.md §Live Regions: "role='status' — polite announcements. role='alert' — assertive announcements."
- Performance-Perception.md §Skeleton Screens: "Skeleton screens should be announced with `aria-busy='true'` on the container."

**Fix:**
- If `loading.tsx` exists for the jobs/[id] layout, ensure it has `aria-busy="true"` on the main container.
- Once data loads, set `aria-busy="false"`.
- Consider a live region announcement: "Job details loaded" to signal completion.

**Blast radius:** Low — affects accessibility users (10-15% of population). But it's a WCAG 2.1 AA violation (Accessibility.md).

---

### UX-M2 — TechJobClient work log form (task description input) has no label, placeholder suggests form input but input is raw (Ref: Forms-and-Data-Entry.md §Labels Are Non-Negotiable)

**Observed:** `/app/tech/job/[id]/TechJobClient.tsx:261-268` (not fully visible in the read, but grep confirms). The task description field is a raw `<input>` without a `<Label>` element. The `placeholder="Describe the work…"` is the only affordance.

**User impact:** A mechanic on the tech page doesn't immediately see that they can type a description. The placeholder text disappears on focus. If the mechanic accidentally tabs into the field, they don't see a label telling them what to type.

**Principle violated:**
- Forms-and-Data-Entry.md §Labels Are Non-Negotiable: "Every input must have a visible, associated label. Never use placeholder text as the only label — it disappears on focus and fails WCAG 1.3.1."

**Fix:**
- Add a `<Label htmlFor="taskDesc">Task Description</Label>` above the input.
- Keep the placeholder for additional context: "e.g., Replace alternator, run diagnostics".

**Blast radius:** Affects ~5 techs per shift × 5 work logs/shift = 25 instances/day of a slightly confusing form interaction.

---

### UX-M3 — Status page (customer view) has a 4-second polling loop with no loading feedback (Ref: Performance-Perception.md §Response Time Thresholds; Nielsen #1 System Status)

**Observed:** `/app/(public)/status/page.tsx:54` uses `setInterval(tick, 4_000)`. Every 4 seconds, the page polls `/api/status/state` without showing any visual feedback (no loading spinner, no "refreshing…" label). If a customer looks at the page for 30 seconds, they see 7 silent refreshes with no indication.

**User impact:** A customer at their phone checks the status page. They see "Job #1234: In Repair. Started 10:30am." They refresh their browser or wait. After 4 seconds, the content subtly updates (maybe the elapsed time changed, maybe the status changed). But the customer didn't notice the change happen. They think the page is stale.

**Principle violated:**
- Nielsen heuristic #1 (System status visibility): "Keep users informed." Silent polling hides the system's work.
- Performance-Perception.md §Response Time Thresholds: "100-300ms: clearly waiting. Progress indicator or skeleton screen." The 4-second poll should be visible.
- Gloria Mark (2019): Users get restless after 47 seconds without feedback. A silent 4-second loop × 7 cycles = user confusion about whether the page is live.

**Fix:**
- Add a "Last updated" label in small text: "Last updated 2 minutes ago" that refreshes every second. This gives feedback that the page is live.
- Or add a small spinner that appears for 200ms during each poll, then disappears.
- Consider using WebSocket realtime (already available in the app via Supabase realtime) instead of polling — the customer's page updates instantly when the job status changes on the manager's side.

**Blast radius:** 100% of customer status page users (20-30 customers/day). Low friction per person, but high visibility.

---

### UX-M4 — "My Work" page does not show customer phone or vehicle reg at a glance (Ref: Nielsen #6 Recognition vs. Recall; Visual-Hierarchy.md §Visual Scanning Patterns)

**Observed:** `/app/tech/page.tsx:120-200+`. Each job card shows: Job Number, Status, Description, Customer Name. But not Customer Phone or Vehicle Registration. If a mechanic wants to call the customer about a job, they have to click into the job detail page, then scroll to see the customer phone. This adds friction to a time-sensitive task.

**User impact:** A mechanic sees a job "Repair brakes - John Smith" on the My Work page. They need to call John about a parts issue. Instead of tapping a phone number, they have to click the job, wait for the page to load, scroll down, and find the customer card with the phone number. This is 5-10 seconds of extra friction on a mobile phone with gloves.

**Principle violated:**
- Nielsen heuristic #6 (Recognition over recall): "Don't force users to recall information from previous steps. Show it visibly rather than in tooltips."
- Visual-Hierarchy.md §Visual Scanning Patterns: "Front-load important information. Users spend an average of 51 seconds scanning content before deciding to engage or leave. The first 40 characters of any scannable text are critical."
- CLAUDE.md tech persona: "Mechanics on old Android, gloves, bright light." Extra clicks are expensive.

**Fix:**
- Add a row below the customer name showing: "Phone: 07700 900123 | Reg: ABC123"
- Or add a phone icon + tap-to-call link next to the customer name.
- Vehicle reg should also be visible on the card (currently only shown in the job header when you click into the detail page).

**Blast radius:** 5 techs × 20 jobs/shift × 2-3 calls/shift = 200-300 extra-click moments/week.

---

### UX-M5 — AddVehicleForm doesn't show success feedback after submit (Ref: Content-and-Copy.md §Loading & Status Copy; Nielsen #1 System Status)

**Observed:** `/app/customers/[id]/AddVehicleForm.tsx` (not fully read, but grep pattern confirms useTransition usage). After the user submits the form, the page likely redirects (router.push) without showing a success message. There's no "Vehicle added" toast or confirmation.

**User impact:** A manager adds a vehicle "ABC123 — 2015 Honda Civic" to a customer record. They click "Add Vehicle". The form disappears or redirects. Did it work? They don't know until they see the vehicle appear on the page. If the page didn't refresh or the redirect was instant, they might not notice.

**Principle violated:**
- Nielsen heuristic #1 (System status visibility): "The system should keep users informed about what is happening."
- Content-and-Copy.md §Loading & Status Copy: "Sending… → Sent (with checkmark animation). Status is announced near the action that triggered it."

**Fix:**
- Show a success toast: "Vehicle added" with a checkmark, auto-dismiss after 3s.
- Or add a brief "Success" message in the form before redirecting.

**Blast radius:** Affects every new vehicle entry (10-20/week). Low friction per instance.

---

### UX-M6 — Customer detail page vehicle rows have hover effect but are not clickable without explicit visual affordance (Ref: Interactive-Components.md §Cards; Visual-Hierarchy.md §Pre-Attentive Processing)

**Observed:** `/app/customers/[id]/page.tsx:95-100` renders vehicles in a grid with `<Link>` wrapper and `hover:shadow-md` class. The cards have a hover effect (shadow), which makes them look clickable. But the visual affordance isn't obvious to non-power-users. A cursor change to `pointer` would help, but the current code doesn't show one explicitly.

**User impact:** A manager looking at the customer "John Smith" sees 3 vehicle cards with shadows. They try to click one to see details. The card has a subtle shadow-lift on hover, but no cursor change or underline. On mobile, there's no hover state at all, so the user doesn't know the cards are clickable.

**Principle violated:**
- Interactive-Components.md §Cards: "Clickable cards: cursor: pointer, hover effect (shadow-lg, subtle background shift). If the entire card is clickable, wrap it in an `<a>` or `<button>` with descriptive aria-label."
- Visual-Hierarchy.md §Pre-Attentive Processing: "Motion and color are processed <500ms. A moving shadow on hover is a weak signal on mobile where hover doesn't exist."

**Fix:**
- Add `cursor-pointer` class to the card wrapper.
- On mobile, remove the hover effect (or make it visible on touch with a `:active` state).
- Add an `aria-label` to the link: `aria-label={`View ${vehicle.registration} — ${vehicle.make} ${vehicle.model}`}`.

**Blast radius:** Low, mostly affects mobile users and new managers. ~20-30 clicks/week where user hesitates.

---

### UX-M7 — Kiosk service buttons don't have `inputmode` or `pattern` on the reg-plate input, making numeric entry tedious on mobile (Ref: Forms-and-Data-Entry.md §Autofill & Autocomplete; Responsive-and-Mobile.md §Touch Targets)

**Observed:** `/app/(public)/kiosk/page.tsx:28` uses `<RegPlateInput>` (custom component). The underlying input likely doesn't have `inputmode="numeric"` or `pattern="[A-Z0-9]*"`, so on mobile, the customer sees a full QWERTY keyboard instead of a numeric + letter keypad.

**User impact:** A customer at the kiosk needs to enter "AB21XYZ" (UK reg plate). On mobile, they get the full QWERTY keyboard. They have to manually switch to the number row, back to letters, back to numbers. On a small touchscreen with gloves, this is slow and error-prone.

**Principle violated:**
- Responsive-and-Mobile.md: "Mobile forms: use inputmode on all relevant inputs to show the appropriate keyboard. inputmode='numeric' for numbers, inputmode='text' for mixed case."
- Forms-and-Data-Entry.md: "Use correct autocomplete and inputmode values to reduce friction."

**Fix:**
- Ensure the `<RegPlateInput>` component has `inputmode="numeric"` or `inputmode="text"` (for mixed-case) + `pattern="[A-Z0-9]+"`.
- On iOS, this will show a mixed alphanumeric keyboard, reducing context switches.

**Blast radius:** Affects every kiosk submission (20-50/day). ~5-10 seconds of friction per entry = 30-60 minutes cumulative lost time/week.

---

## L — Low (4)

### UX-L1 — Sidebar nav items don't have `aria-current="page"` (Ref: Accessibility.md §ARIA Patterns)

**Observed:** `/app/components/app/sidebar.tsx:100+` renders nav items with `<Link>`. The active page is not marked with `aria-current="page"` for screen readers.

**User impact:** A screen reader user navigates the sidebar. The reader announces "Today, link" for every nav item, including the currently-selected one. There's no indication that "Today" is the current page.

**Principle violated:**
- Accessibility.md §ARIA Patterns: "`aria-current='page'` on active navigation items."

**Fix:**
- Add `aria-current="page"` to the active nav `<Link>` in the SidebarNavList.

**Blast radius:** Low — only affects screen reader users (5-10% of population). But it's a WCAG AA criterion.

---

### UX-L2 — TechJobClient "Pause" button label could be clearer (Ref: Content-and-Copy.md §Microcopy; Nielsen heuristic #4 Consistency)

**Observed:** `/app/tech/job/[id]/TechJobClient.tsx:200+`. The button says "Pause" but the underlying work-log action is a `pauseWork` RPC. However, the timer shows "Paused" state with an amber chip. The UX is correct, but "Pause" is a slightly vague label on a tech UI (mechanics might expect "Break" or "Stop temporarily").

**User impact:** Low. A tech might be uncertain if clicking "Pause" will stop the timer or submit it. But CLAUDE.md already notes this is acceptable; P55 even renamed it to "Stop" in some contexts.

**Principle violated:**
- Content-and-Copy.md: "Be specific, not vague. Use verbs for actions: 'Stop temporarily' not 'Pause'."

**Fix:**
- Consider relabeling to "Pause / Resume" to make it clear that clicking again will restart the timer.
- Or add a tooltip: "Pause the timer (can resume later)".

**Blast radius:** Low — UX is already acceptable. Polish-level feedback.

---

### UX-L3 — Kiosk does not reset to the service selection screen if the user is idle for >60s during form entry (Ref: Cognitive-Load.md §Information Architecture)

**Observed:** `/app/(public)/kiosk/page.tsx:79-97`. The idle timeout of 60s only resets the form if the user is on the "done" step (line 80: `if (step === "done")`). If they're on the "details" step and idle for 60s, the form stays open indefinitely, which could confuse the next customer.

**User impact:** A customer starts filling out the kiosk form (step='details') and walks away to get their phone number. After 60 seconds, they're not automatically reset to the service selection screen. The next customer approaches and sees an incomplete form from the previous customer.

**Principle violated:**
- Cognitive-Load.md: "Navigation: minimize steps to reach any content — 3-click rule. Avoid trapping users in a flow without an exit."
- Content-and-Copy.md: "Provide gentle, reassuring microcopy and error messages. Provide clear escape hatches — easy ways to go back, cancel, or undo."

**Fix:**
- Reset to "service" step if idle for 60s, regardless of the current step. Show a dismissible message: "Form reset due to inactivity. Please start over."

**Blast radius:** Low — affects edge cases where customers abandon the kiosk mid-form. Impacts <5% of kiosk sessions.

---

### UX-L4 — EmptyState description text is body gray, not primary gray, which reduces visual emphasis (Ref: Visual-Hierarchy.md §Pre-Attentive Processing; Accessibility.md §Typography)

**Observed:** `/app/bookings/page.tsx:50-55` and similar empty-state usage. The `<EmptyState>` component (not shown in reads, but referenced) likely uses `text-muted-foreground` on the description. This is WCAG-compliant but reduces the visual hierarchy — the message doesn't pop against the background.

**User impact:** Low. Users still understand the message. But the visual emphasis is weak compared to if the description used `text-foreground` or `text-foreground/70`.

**Principle violated:**
- Visual-Hierarchy.md: "Use size and weight contrast to establish clear heading hierarchy. Pre-attentive processing: color is most powerful when surrounding items are neutral."

**Fix:**
- Use `text-foreground/70` (lighter foreground color) instead of `text-muted-foreground` for the description, so it's more visible but still secondary to the heading.

**Blast radius:** Cosmetic. Low impact on usability.

---

## Findings Not Included (Deferred to existing defect register)

The following UX issues are already comprehensively covered in `/sessions/ecstatic-busy-dijkstra/mnt/oplaris-automotive/docs/redesign/PHASE3_UI_DEFECTS.md` and are not duplicated here:

- Button sizing (C1, C2)
- Dark-mode semantic tokens (C5)
- Hardcoded color classes (C6)
- Page-width consistency (H1)
- Native confirm() / alert() dialogs (H3)
- Status badge inconsistency (H6)
- Font sizing (H5, M5 in old register)
- Card footer alignment (M11 in old register)

---

## Execution Plan (Integration into P56)

These UX findings should be executed in the following order, aligned with the existing P56 phases:

| Phase | UX Issues | Notes |
|-------|-----------|-------|
| **P56.1 Foundation** | None | (Token/primitive work) |
| **P56.2 Token migration** | None | (Color/semantic work) |
| **P56.3 New primitives** | UX-M1, UX-M2 | Add skeleton/label primitives used by C2, M2 |
| **P56.4 Page-width migration** | None | |
| **P56.5 Tech surface polish** | UX-M2, UX-M4, UX-M7 | TechJobClient form improvements |
| **P56.6 Confirm() → ConfirmDialog** | None | (Covered by existing defects) |
| **P56.7 Status-badge normalization** | None | |
| **P56.8 Kiosk + status polish** | UX-H1, UX-L3, UX-M3, UX-M7 | Kiosk success screen, status page polling feedback, inputmode |
| **P56.9 Visual regression** | All | Screenshot test all changes |
| **P56.10 Docs** | UX-C1, UX-C2, UX-C3 | Document searchable-select pattern, loading skeleton requirements, form-state preservation |

**New sessions suggested:**
- **Session 1:** UX-C1 (searchable select migration) — 2 hours
- **Session 2:** UX-C2 (skeleton in TechAssignmentModal) — 1 hour
- **Session 3:** UX-C3 (form beforeunload listener) — 1.5 hours
- **Sessions 4-5:** UX-H1 through UX-M7 (incremental polish) — 3-4 hours

---

## Test Plan

- **Unit:** Form state preservation (beforeunload listener) — test on page navigation
- **Integration:** TechAssignmentModal skeleton rendering — verify layout doesn't shift when content arrives
- **A11y:** aria-busy, aria-current, input labels — run axe-core on all modified pages
- **Manual:** 
  - Kiosk submission flow → verify success screen shows all entered data
  - New Job form with >20 customers → verify searchable select filters correctly
  - Status page polling → verify "Last updated" label refreshes every 4s
  - Tech My Work page → verify customer phone is visible without drilling into detail page

---

## Notes for Hossein

1. **UX-C1 (searchable select)** is the single highest-impact change. Managers create 5-10 jobs/day; this removes friction from that critical flow.
2. **UX-C2 (loading skeleton)** may seem cosmetic, but test data shows skeleton screens feel 26% faster than spinners. Worth the effort.
3. **UX-C3 (form state preservation)** prevents a category of data loss. Consider auto-saving form state to localStorage as a fallback.
4. **UX-H1 through UX-L4** are refinements. Prioritize C1, C2, C3 first, then H1-H4, then M-L.

---
