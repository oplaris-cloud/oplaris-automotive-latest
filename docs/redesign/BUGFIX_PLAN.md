# BUGFIX_PLAN.md — Kiosk booking error + sidebar active state

> Two bugs reported 2026-04-12. This plan diagnoses root causes and gives step-by-step fixes.

---

## Bug tracker

| # | Bug | Severity | Root cause | Status |
|---|-----|----------|-----------|--------|
| B1 | Kiosk booking shows "Something went wrong" on submit | HIGH — kiosk is unusable | Service role JWT had a typo (`IkpXVCJm9` → `IkpXVCJ9`) — all admin client operations failed with 401 | **FIXED** — corrected JWT in .env.local |
| B2 | Sidebar stays highlighted on "Today" regardless of current page | MEDIUM — cosmetic but confusing | `x-next-pathname` header never set by proxy → always falls back to `/app` | **FIXED** — replaced with `usePathname()` client wrapper |

---

## Bug B1 — Kiosk booking "Something went wrong"

### How the flow works

1. Customer fills form on `/kiosk` (client component)
2. Client POSTs to `/api/kiosk/booking` with `{ service, customerName, customerPhone, registration, notes }`
3. Route handler calls `verifyKioskCookie()` which reads a `kiosk_device` cookie
4. If no cookie / invalid → returns **401** → client shows "This tablet is not paired"
5. If cookie valid → inserts into `bookings` table using admin (service_role) client
6. If insert fails → returns **500** → client shows "Something went wrong"
7. If insert succeeds → returns **200** → client shows "Booking Received"

### The error "Something went wrong" means the response was non-2xx AND non-401

This narrows it down to two possibilities:

**Possibility A: The tablet was never paired** — BUT the response isn't 401 for some other reason (e.g. the route handler throws before reaching the 401 return, or the proxy interferes).

**Possibility B: The tablet IS paired**, the cookie is valid, but the database insert fails (400 validation or 500 DB error).

### Diagnosis steps (execute in order)

- [ ] **B1.1** Open browser DevTools → Network tab. Submit the booking again. Find the `POST /api/kiosk/booking` request. Record:
  - HTTP status code (400? 401? 500?)
  - Response body (the JSON error message)
  - Report these before proceeding — the fix depends on which error.

- [ ] **B1.2** Check if the kiosk is paired. In DevTools → Application → Cookies → look for `kiosk_device` cookie on your domain.
  - **If missing:** The tablet was never paired. Go to B1.3.
  - **If present:** The cookie exists. Go to B1.4.

- [ ] **B1.3** (If tablet not paired) — Pair the tablet:
  1. Log in as a **manager** on the same browser/device
  2. Go to `/app/settings`
  3. Click "Pair This Tablet" (the `PairTabletButton` component)
  4. This POSTs to `/api/kiosk/pair` which sets the `kiosk_device` cookie
  5. Now navigate to `/kiosk` and try the booking again
  
  **IMPORTANT:** The cookie is set with `sameSite: "strict"` and `httpOnly: true`. This means:
  - You must pair and use the kiosk on the same domain (e.g. both on `localhost:3000`)
  - The cookie won't be visible in JS (`document.cookie`) — only in DevTools → Application → Cookies
  - If you're testing on a different port or domain, the cookie won't carry over

- [ ] **B1.4** (If tablet IS paired but still failing) — Check the server console/terminal where `pnpm dev` is running. Look for error output after submitting.
  
  Common causes:
  - **`job_source` enum doesn't include 'kiosk':** Check the DB by running: `SELECT enum_range(NULL::job_source);` If 'kiosk' isn't listed, you need a migration to add it: `ALTER TYPE job_source ADD VALUE 'kiosk';`
  - **Column mismatch:** The route inserts `ip` as a raw string, but the column is `inet` type. If the IP string is malformed, Postgres will reject it. Fix: cast `ip` to null in dev, or wrap in a try/catch.
  - **`bookings` table doesn't exist yet:** If migration 001_init.sql was never applied to the Supabase instance, the table won't exist. Check by running a query against it.

- [ ] **B1.5** If the error is a `job_source` enum issue, apply the fix:
  - Check what values exist: the enum is defined in 001_init.sql — search for `create type job_source`
  - If 'kiosk' is missing, create a migration to add it
  - If 'kiosk' IS in the enum already, the issue is something else

- [ ] **B1.6** After fixing, test the full flow again:
  1. Navigate to `/kiosk`
  2. Select MOT
  3. Enter name, phone, reg
  4. Submit
  5. Should see "Booking Received" with green checkmark
  6. Check the manager dashboard → Bookings → the new booking should appear

### If the error turns out to be 401 (not paired)

The fix is just B1.3 — pair the tablet. This is a one-time setup per device. In production, a manager would do this once when setting up the physical tablet in reception. For local dev testing, you need to do it once per browser profile.

---

## Bug B2 — Sidebar stuck on "Today"

### Root cause (confirmed by code review)

The app layout at `src/app/(app)/layout.tsx` reads the current path like this:

```typescript
const headersList = await headers();
const pathname = headersList.get("x-next-pathname") ?? "/app";
```

The problem: **nobody sets the `x-next-pathname` header**. The proxy (`src/proxy.ts`) refreshes the Supabase session and gates auth, but never injects this header into the request. So `pathname` is always `"/app"`, and the sidebar always highlights "Today".

### Fix

- [ ] **B2.1** Update the proxy to set the `x-next-pathname` header on every request. In `src/proxy.ts`, before the `return response;` line, add:

```typescript
// Set pathname header for the app layout to read
response.headers.set("x-next-pathname", pathname);
```

**BUT** — there's a catch. The `response` object from `refreshSupabaseSession` might not propagate custom headers correctly to Server Components in Next.js 16. The safer fix is:

- [ ] **B2.2** (Preferred fix) Convert the sidebar active state to use `usePathname()` client-side. This is the idiomatic Next.js approach and doesn't depend on headers at all.

**Steps:**

1. Create a new client wrapper component `src/components/app/sidebar-nav.tsx`:

```tsx
"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import type { StaffRole } from "@/lib/auth/session";

export function SidebarNav({ role }: { role: StaffRole }) {
  const pathname = usePathname();
  return <Sidebar role={role} currentPath={pathname} />;
}
```

2. Update `src/app/(app)/layout.tsx` to use the new component:

```tsx
// Replace:
import { Sidebar } from "@/components/app/sidebar";
// With:
import { SidebarNav } from "@/components/app/sidebar-nav";

// Replace:
<Sidebar role={session.role} currentPath={pathname} />
// With:
<SidebarNav role={session.role} />
```

3. Remove the `x-next-pathname` header reading from `layout.tsx` (the `headersList` lines).

4. Test: navigate to `/app/jobs` — "Jobs" should be highlighted. Navigate to `/app/vehicles` — "Vehicles" should be highlighted. Navigate to `/app` — "Today" should be highlighted.

### Why B2.2 is better than B2.1

- `usePathname()` is the official Next.js App Router way to get the current path
- It updates on client-side navigation (no full page reload needed)
- It doesn't depend on proxy header propagation, which is fragile across Next.js versions
- The sidebar is already a lightweight component — making it a client component has negligible performance impact

---

## Execution order

```
B2 first (quick fix, 5 minutes) → B1 diagnosis (depends on what DevTools shows)
```

B2 is a definite fix with clear steps. B1 needs diagnosis first — the fix depends on the actual error code.

---

## Kickstart prompt for Claude

```
You are fixing two bugs in the Oplaris Automotive project.

Read CLAUDE.md first, then docs/redesign/BUGFIX_PLAN.md.

Execute B2 first (sidebar active state bug) — the fix is to create a
client wrapper component `src/components/app/sidebar-nav.tsx` that uses
`usePathname()` and update `src/app/(app)/layout.tsx` to use it instead
of reading headers. The steps are in BUGFIX_PLAN.md B2.2.

Then execute B1 diagnosis — the kiosk booking is returning an error on
submit. The plan has 6 diagnosis steps. Start with B1.1 if you have
access to DevTools, or B1.2 to check cookie state. The most likely
cause is the tablet was never paired (needs a manager to POST to
/api/kiosk/pair first).

Do NOT skip steps. Report what you find at each step before moving on.
```
