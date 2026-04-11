import type { Metadata } from "next";

import { requireManager } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Admin Guide",
};

export default async function GuidePage() {
  await requireManager();

  return (
    <article className="prose prose-neutral max-w-3xl dark:prose-invert">
      <h1>Admin Guide</h1>
      <p className="lead">
        Everything you need to run the Oplaris Workshop system day-to-day.
      </p>

      <h2>1. Daily Workflow</h2>
      <ol>
        <li><strong>Check the Today view</strong> — see active jobs, pending approvals, and new bookings at a glance.</li>
        <li><strong>Review the Bay Board</strong> — drag jobs between bays, assign technicians, monitor live work progress.</li>
        <li><strong>Process kiosk bookings</strong> — go to Bookings to review and promote walk-in requests to real jobs.</li>
        <li><strong>End of day</strong> — check the Reports page for the day&apos;s summary.</li>
      </ol>

      <h2>2. Managing Customers &amp; Vehicles</h2>
      <ul>
        <li>Search customers by name from the Customers page.</li>
        <li>Click a customer to see their vehicles and job history.</li>
        <li>Phone numbers are normalised to UK format automatically.</li>
        <li>Registration plates are stored uppercase with no spaces.</li>
      </ul>

      <h2>3. Creating a Job</h2>
      <ol>
        <li>Go to Jobs → New Job.</li>
        <li>Select the customer and vehicle.</li>
        <li>Add a description of the work needed.</li>
        <li>Assign a bay and technician(s).</li>
        <li>The system generates a unique job number (e.g. DUD-2026-00001).</li>
      </ol>

      <h2>4. Customer Approvals</h2>
      <p>
        When a technician finds additional work needed, they request customer approval.
        The customer receives an SMS with a secure link to approve or decline.
        Links expire after 24 hours and can only be used once.
      </p>

      <h2>5. Parts &amp; Invoices</h2>
      <ul>
        <li>Add parts to any job — supplier, price, quantity, payment method.</li>
        <li>Upload invoice photos/PDFs (max 10 MB, PDF/JPEG/PNG only).</li>
        <li>Files are verified for content type — renamed executables are blocked.</li>
      </ul>

      <h2>6. PDF Job Sheets</h2>
      <p>
        Generate a pro-forma job sheet from any job detail page. It includes
        customer details, vehicle info, labour log, and parts with totals.
        Stamped &quot;PRO-FORMA — NOT A VAT INVOICE&quot;.
      </p>

      <h2>7. Customer Status Page</h2>
      <p>
        Customers can check their vehicle status at <code>/status</code>.
        They enter their registration + phone number, receive a 6-digit SMS code,
        and see the current job status. No login required.
      </p>

      <h2>8. Tablet Kiosk</h2>
      <p>
        The reception tablet at <code>/kiosk</code> lets walk-in customers book
        an MOT, electrical, or maintenance appointment. A manager must pair the
        tablet first (Settings → Pair Tablet). The form auto-clears after 60
        seconds of inactivity.
      </p>

      <h2>9. Warranties</h2>
      <p>
        Create warranties when completing a job. They appear on the vehicle
        detail page and on the Warranties page with expiry countdowns. Void a
        warranty if the terms are breached.
      </p>

      <h2>10. Stock Management</h2>
      <p>
        Track parts inventory under Stock. Items with a reorder point show a
        &quot;Low&quot; warning when quantity drops below threshold.
      </p>

      <h2>11. GDPR &amp; Data</h2>
      <ul>
        <li><strong>Export</strong> — on any customer detail page, export all their data as JSON.</li>
        <li><strong>Delete</strong> — soft-delete a customer. They can be restored within 30 days. After 30 days, data is permanently purged.</li>
        <li><strong>Audit log</strong> — every staff action is recorded. View under Settings → Audit Log.</li>
      </ul>

      <h2>12. Security Notes</h2>
      <ul>
        <li>Passwords must be at least 8 characters and not appear in known data breaches.</li>
        <li>Staff roles (manager, MOT tester, mechanic) control what each person can see and do.</li>
        <li>All data is scoped to your garage — no other garage can see your data.</li>
        <li>Twilio SMS and DVSA MOT lookups use your garage&apos;s own credentials.</li>
      </ul>

      <h2>13. Key Rotation Runbook</h2>
      <table>
        <thead>
          <tr><th>Secret</th><th>Where</th><th>How to rotate</th></tr>
        </thead>
        <tbody>
          <tr><td>Supabase service role key</td><td>Dokploy env panel</td><td>Regenerate in Supabase dashboard → update Dokploy → redeploy</td></tr>
          <tr><td>Twilio auth token</td><td>Dokploy env panel</td><td>Rotate in Twilio console → update Dokploy → redeploy</td></tr>
          <tr><td>DVSA API key</td><td>Dokploy env panel</td><td>Request new key from DVSA → update Dokploy → redeploy</td></tr>
          <tr><td>HMAC secrets</td><td>Dokploy env panel</td><td>Generate new random string → update Dokploy → redeploy (invalidates active approval links)</td></tr>
        </tbody>
      </table>
    </article>
  );
}
