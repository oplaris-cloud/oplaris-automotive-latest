# Dudley Auto Service — Workshop Management App
## Requirements & Scope (v1)

> **This document is for you (Dudley) to read and approve.**
> It describes exactly what we are building, how you will use it, what is included in the price, and — importantly — what is not. Please read it all. If anything is wrong, missing, or worded in a way you don't like, tell us **before you sign off**. After sign-off, any new feature requests will be quoted and invoiced separately.

**Prepared by:** Oplaris
**Prepared for:** Dudley Auto Service
**Date:** 10 April 2026
**Status:** Draft — awaiting your approval

---

## 1. In one sentence

We are building a mobile-first web app that replaces the WhatsApp-and-voice chaos in your workshop with a single organised system: customers and their vehicles in one place, job cards on a visual bay board, technicians logging work from their phones, one-tap customer approvals by SMS, parts tracking with supplier records, a self-service customer status page, a tablet booking kiosk to replace the current Fluent Forms setup, and a complete history for every car that ever comes through your door.

---

## 2. Who uses the app

| Role | Who | What they can do |
|------|-----|------------------|
| **Manager** (3 people — 2 managers + 1 sub-manager) | You and your team | Everything. Create customers, book jobs, assign technicians to bays, approve parts orders, send invoices, see all reports, manage warranties. |
| **MOT Tester** (2 people) | Your MOT testers | Log MOT work against assigned jobs, update job status, record results. |
| **Mechanic** (5 people, incl. 2 electrical specialists) | Your technicians | See only their assigned jobs. Start/pause/complete work. Request customer approval for extra work with one tap. Log parts used. |
| **Customer** (walk-ins and returning) | Anyone booking a service | Book online or at the kiosk. Track their car's status from their phone. Receive SMS updates. |

No hidden roles. No "admin plus extra admin." If someone new joins, you add them from the settings page.

---

## 3. The problems this app solves

These are the exact pain points you told us you have today:

- **No organisation** — jobs live in people's heads or on WhatsApp.
- **No reporting** — you count cash at the end of the day; no view of who did what or how much you made on each job.
- **No technician accountability** — no way to see who worked on which car, for how long, or how well.
- **No customer history** — when the same customer comes back six months later, nobody remembers what was done.
- **No multi-vehicle handling** — customers with two or three cars are tracked as separate entries.
- **No invoice tracking** — invoices are an Excel template that anyone can overwrite or lose.
- **No repair history** — no way to look up "what did we do on this reg last time."
- **No parts tracking** — parts are ordered by "anyone who's free," with no record of what was ordered, from where, or how much it cost.
- **No warranty tracking** — you cannot tell a customer whether a previous repair is still under warranty.
- **Customers keep calling to ask "is my car ready yet?"** — you currently answer by WhatsApp or phone, one at a time.
- **The booking kiosk is a WordPress plugin with Fluent Forms** — clunky, no real integration, not built for a workshop.

---

## 4. What you are getting — delivered in 2 weeks, in 2 stages

We are splitting delivery into **two milestones** so you get a working app at the end of Week 1 that you could run your garage on, and a complete product at the end of Week 2. **Nothing is left out. Both milestones are included in the agreed price.**

### Milestone 1 — "Go-Live Core" (end of Week 1, target Thursday 16 April 2026)

At the end of Week 1 you will be able to:

1. **Log in securely** with a username and password. Each staff member has their own account.
2. **Create a customer and their vehicle(s)** — one customer, many cars. Reg number, make, model, VIN, mileage, notes.
3. **Import your existing 3,000 Fluent Forms records** into the new system. We will review the import together with you and clean up any conflicts.
4. **Create a job card** for a customer + vehicle — one click from the customer screen. Each job gets a unique job number, a description, a status, and a creation timestamp.
5. **Assign the job to a bay** by dragging it onto a visual bay board (Bay 1 MOT, Bay 2 Ramp, Bay 3 Ramp, Bay 4 Ramp + Tyres, Bay 5 Electrical). The board shows every active job in real time.
6. **Assign technicians to a job** — one or more. Technicians only see jobs they are assigned to.
7. **Technicians log work from their phones** — Start Work, Pause, Complete. Time is tracked automatically. They pick a task type (Diagnosis, Engine, Brakes, Electrical, Suspension, Testing, Other) and write a short description.
8. **One-tap customer approval for extra work** — when a technician finds something new mid-job (e.g. "brake discs shot, £180 extra"), they tap a button on their phone. The customer gets an SMS with a secure, single-use link that expires after 24 hours. They tap Yes or No. The answer is cryptographically verified on our end (so nobody can fake approvals from the internet) and logged with a timestamp. No more walking to the manager, no more "I never agreed to that" disputes.
9. **Record parts used on a job** — for every part: supplier (ECP / GSF / AtoZ / eBay / Other with custom name), price paid, purchase date and time, payment method (cash / card / bank transfer), and you can attach the supplier invoice as a file (PDF, JPG, or PNG, up to 10 MB per file). Files are scoped to the job — a technician on Job A cannot see invoices from Job B.
10. **Generate a PDF job sheet** for any job — line items, labour, parts, totals. Ready to print or email to the customer. *(This is a pro-forma job sheet, not a legal invoice. See section 5.)*
11. **Customer self-service status page** — any customer can go to a public URL, type their reg number and phone number, and request a 6-digit code by SMS. They enter the code, and see the current status of their car (e.g. "In Diagnosis", "Waiting for Parts", "Ready for Collection"). No passwords. To protect Dudley's customer data: the page is rate-limited (a maximum of 3 SMS codes per phone per hour, 10 per IP per hour), the same response is returned whether or not the reg/phone exists in the system (so nobody can use the page to discover who is a Dudley customer), codes are single-use and expire after 10 minutes, and the page is logged for audit. The phone number on file must match for a code to be sent.
12. **Tablet booking kiosk** — replaces the current Fluent Forms / WordPress totem. Customers walk in, tap a big screen, pick **MOT**, **Electrical**, or **Maintenance**, enter their details, and the booking lands straight in your system as a draft job card. No more copy-paste from WordPress.
13. **Manager dashboard** — see every active job, every bay, every technician, every booking, on one screen. Works on desktop and phone.
14. **SMS notifications** — via your existing Twilio account. Job ready for collection, approval requests, status updates.

### Milestone 2 — "Complete" (end of Week 2, target Thursday 23 April 2026)

By the end of Week 2, on top of everything above, you will also have:

15. **Warranty tracking** — every completed repair can be marked with a warranty period (e.g. 12 months / 12,000 miles). When the same reg comes back, the system warns you if any previous work is still under warranty and shows you what's covered.
16. **Stock management** — track parts you keep on the shelf (small but essential). Reduces stock when used on a job, warns you when running low. *(Exact scope agreed with you on day 7 — see section 7.)*
17. **MOT history from DVSA** — automatic lookup against the DVSA API (using your existing access) so when you create a job for a vehicle, the full MOT history shows up instantly.
18. **Reporting dashboard** — today's jobs, this week's revenue, hours worked per technician, parts spend per job, repeat customers, most common repair types. The numbers Dudley actually cares about.
19. **GDPR tools** — a "download everything we have on this customer" button (for data requests), soft delete with a 30-day recovery window, and a full audit log of who accessed what.
20. **Polished mobile experience** — the technician phone UI refined based on real use during Week 1.
21. **Accessibility pass** — usable on old Android phones, with gloves, in bright workshop lighting.
22. **Admin guide** — a short written document for your managers, plus a walkthrough video.

---

## 5. What is **not** in this version (important — read this)

To keep the 2-week timeline realistic and the price fixed, these things are deliberately left out:

- **Legal HMRC-compliant invoices.** You get a professional PDF **job sheet** that lists labour, parts, VAT, and totals. It is not a sequentially numbered legal invoice with HMRC audit trail. You continue using your existing invoicing method (Excel template) for the legal documents. *We are building proper HMRC invoicing later as a separate product feature — because it is required for the other garages we plan to sell this to, not because Dudley needs it on day one.*
- **Accounting integration** (Xero / Sage / QuickBooks / FreeAgent). Not in v1. Can be added later as a paid extra.
- **Payroll.** Not our problem. You pay technicians the way you already pay them.
- **Multi-site / multi-garage interface.** The data model supports it, so when you open a second site we can enable it in a day — but there is no UI for it in v1.
- **Online payments by customers** (Stripe, card-not-present, etc.). Customers still pay in your reception the way they do today.
- **Supplier integration** (auto-ordering from ECP/GSF). You still order parts the way you do today — the app just *records* what you ordered, from whom, for how much.

If any of these items are important to you, tell us now. We can add them to the scope (and the invoice) before sign-off, or keep them for a Phase 2 engagement after Milestone 2 is delivered.

---

## 6. How it works day-to-day — walkthroughs

### Scenario A: Customer walks in for an MOT

1. Customer taps the **kiosk** in reception. Picks **MOT** (or Electrical / Maintenance). Types name, phone, reg, make/model, drops keys.
2. Booking lands in the manager dashboard as a draft job card.
3. Manager reviews it in 10 seconds, assigns it to **Bay 1 (MOT)** and an MOT tester by dragging the card.
4. MOT tester sees the job on their phone, taps **Start Work**.
5. When done, taps **Complete**. System auto-calculates time spent.
6. Manager reviews, prints the PDF job sheet, sends the customer an SMS: "Your car is ready for collection."

### Scenario B: Brake job turns into a bigger job

1. Customer booked for brake pads.
2. Manager creates the job, assigns it to Bay 3 and Mechanic X.
3. Mechanic X starts work. Discovers the discs are shot too — extra £180.
4. Mechanic taps **Request Customer Approval**, types "Discs also need replacing, £180 extra".
5. Customer receives an SMS with a link. Taps **Approve**.
6. Approval logged with timestamp. Mechanic continues work. No more disputes.

### Scenario C: Customer wants to know if their car is ready

1. Customer goes to `status.dudleyautoservice.co.uk` (or similar).
2. Types their reg number and phone number.
3. Gets an SMS with a 6-digit code or magic link.
4. Sees: "Your car is currently In Repair. Estimated ready: today 3pm. Last update: technician started brake replacement at 11:42."
5. No phone call to your managers. No WhatsApp spam.

### Scenario D: Returning customer, same car, six months later

1. Manager types the reg number.
2. System shows: customer name, phone, this car, full history of every previous job, previous parts used, previous technicians, **any active warranty**.
3. Manager creates a new job in 5 seconds. Customer feels like a regular.

---

## 7. Data we are bringing in

- **3,000 existing customer records** from your current WordPress / Fluent Forms setup.
- Fields expected: name, email, phone, reg number, make, model.
- We expect some records to be incomplete or duplicated. We will:
  1. Write an import script that tolerates missing fields.
  2. Deduplicate by phone number (the most reliable identifier).
  3. Produce a "review me" list of conflicts for you to resolve.
  4. Run the import on **day 12 of 14**, with you on a call, against the real production system. Not before.

**Before import day**, we need from you: a sample of 20 anonymised rows (any 20, exported from Fluent Forms as CSV) so we can test the script against real-looking data.

**On stock management (day 7 check-in):** we will ask you five specific questions — do you track quantity-on-hand, reorder points, locations, stocktakes, or just "we have N of this part"? The answer decides whether stock is half a day or three days of work, and we'd rather ask the right question than build the wrong feature.

---

## 8. Where your data lives

- **Database:** PostgreSQL (via self-hosted Supabase) running on **Oplaris in-house hardware** via Dokploy.
- **Application:** Node.js web app, same hosting.
- **File storage** (parts invoices, photos): self-hosted Supabase Storage, same hardware.
- **Backups:** Automated daily Postgres backups, sent to an off-site location (we will confirm the destination with you before go-live). No backups = no go-live. Non-negotiable.
- **SMS:** via your existing Twilio account (we will need access to add the integration).
- **MOT/DVSA:** via your existing DVSA API access (we will need the credentials on day 10).

**GDPR note:** all your customer data lives in the UK on hardware you can physically walk up to. We build in:
- A customer data export function (for subject access requests).
- A soft-delete with 30-day recovery window.
- A full audit log (who accessed which customer, when).
- Row-level security so a leaked technician login cannot export your customer list.
- Rate limiting on the public customer status page so nobody can scrape it.

---

## 9. What Oplaris needs from Dudley Auto Service

Before we start building, we need:
- **Your written sign-off on this document** (a reply on WhatsApp or email saying "agreed" is enough).
- **Twilio account access** — we need to be able to send test SMS.
- **DVSA API credentials** — needed by day 10 of build.
- **A 20-row sample** of your Fluent Forms export — needed by day 8 of build.
- **Your phone number for the daily check-in** — we will ping you once a day with progress so you are never in the dark.

During the build we may ask you one question per day, at most. If you do not respond within 24 hours, the timeline slips by the same amount. This is the one rule we need you to honour on your side.

---

## 10. Price, timeline, and the scope-creep rule

| Item | Value |
|------|-------|
| **Price** | £2,500 fixed, for everything in sections 4.1 through 4.22. |
| **Start date** | The day you sign this document. |
| **Milestone 1 delivery** | 7 calendar days after start. |
| **Milestone 2 delivery** | 14 calendar days after start. |
| **Payment** | 50% on sign-off, 50% on Milestone 2 delivery. |

**The scope-creep rule** (read carefully):

Everything listed in this document is included in the £2,500. After you sign off, any new feature — **no matter how small** — is quoted and invoiced separately. A "small tweak" that takes two hours is £X. A new module is a new project. This is how we protect both of us: you know exactly what you are paying for, and we are not asked to work unpaid overtime. If you read this document and want to add something, the time to say so is **before you sign**, not after.

Conversely: small refinements to features already listed (e.g. "make the button green instead of blue", "add a filter to the job list") are included. If it's a change to how an existing feature works, it's in. If it's a feature that isn't listed here, it's out.

---

## 11. Sign-off

By replying "agreed" (by WhatsApp, email, or in person), you confirm:

- You have read this entire document.
- You understand what is included and what is not.
- You agree to the price, the timeline, and the scope-creep rule.
- You agree to provide the items in section 9 on time.

**Dudley Auto Service — signed:** _____________________________   **Date:** ___________

**Oplaris — signed:** _____________________________   **Date:** ___________

---

*Document version: v1 — draft for approval. Any changes to this document after sign-off must be agreed in writing by both parties.*
