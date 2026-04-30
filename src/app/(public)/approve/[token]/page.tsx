import type { Metadata } from "next";
import { headers } from "next/headers";
import { Clock } from "lucide-react";

import { GarageLogo } from "@/components/ui/garage-logo";
import { PatternBackground } from "@/components/ui/pattern-background";
import {
  hashToken,
  verifyApprovalToken,
} from "@/lib/security/approval-tokens";
import { getPublicGarageBrand } from "@/lib/brand/garage-brand";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { ApproveClient } from "./ApproveClient";

export const metadata: Metadata = {
  title: "Approve work",
  robots: { index: false, follow: false },
};

interface ApprovalRow {
  id: string;
  description: string;
  amount_pence: number;
  status: string;
  expires_at: string;
  jobs:
    | {
        job_number: string | null;
        garage_id: string;
        vehicles:
          | {
              registration: string;
              make: string | null;
              model: string | null;
            }
          | { registration: string; make: string | null; model: string | null }[]
          | null;
        garages:
          | { brand_name: string | null; name: string }
          | { brand_name: string | null; name: string }[]
          | null;
      }
    | {
        job_number: string | null;
        garage_id: string;
        vehicles:
          | {
              registration: string;
              make: string | null;
              model: string | null;
            }
          | { registration: string; make: string | null; model: string | null }[]
          | null;
        garages:
          | { brand_name: string | null; name: string }
          | { brand_name: string | null; name: string }[]
          | null;
      }[]
    | null;
}

function unwrap<T>(rel: T | T[] | null): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

/**
 * P2.1 — customer-facing approval surface.
 *
 * The signed HMAC token in `/approve/<token>` is validated server-side
 * against the same approval_requests row that the existing API route
 * (/api/approvals/<token>) reads. Both surfaces share verifyApprovalToken
 * + hashToken, so security posture matches: 24 h expiry, single-use
 * UPDATE on the API side, anti-oracle "this link is no longer valid"
 * response shape regardless of failure cause.
 *
 * The page renders the request details + Approve/Decline buttons that
 * POST back to the existing /api/approvals/<token> endpoint via the
 * client component. We deliberately do NOT duplicate the mutation
 * logic — the API route stays the single write path.
 *
 * Every visit is best-effort audit-logged (`approval_link_visited`) so
 * the manager can later trace "did the customer ever open this?" via
 * /app/audit. The audit insert is fire-and-forget — never blocks the
 * page render.
 */
export default async function ApprovePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const brand = await getPublicGarageBrand();
  const fallbackName = brand?.name ?? "Oplaris Workshop";
  const logoUrl = brand?.logoUrl ?? null;

  // 1. HMAC verify before touching the DB.
  const payload = verifyApprovalToken(token);
  if (!payload) {
    return <ApprovalExpired name={fallbackName} logoUrl={logoUrl} />;
  }

  // 2. Token-side expiry (cheap pre-check).
  if (new Date(payload.expires_at) < new Date()) {
    return <ApprovalExpired name={fallbackName} logoUrl={logoUrl} />;
  }

  // 3. DB lookup by hash.
  const supabase = createSupabaseAdminClient();
  const tokenHash = hashToken(token);
  const { data, error } = await supabase
    .from("approval_requests")
    .select(
      `
        id,
        description,
        amount_pence,
        status,
        expires_at,
        jobs!job_id (
          job_number,
          garage_id,
          vehicles!vehicle_id (
            registration,
            make,
            model
          ),
          garages!garage_id (
            brand_name,
            name
          )
        )
      `,
    )
    .eq("token_hash", tokenHash)
    .maybeSingle<ApprovalRow>();

  if (error || !data) {
    return <ApprovalExpired name={fallbackName} logoUrl={logoUrl} />;
  }

  if (data.status !== "pending") {
    return (
      <AlreadyResponded
        name={fallbackName}
        logoUrl={logoUrl}
        decision={data.status}
      />
    );
  }
  if (new Date(data.expires_at) < new Date()) {
    return <ApprovalExpired name={fallbackName} logoUrl={logoUrl} />;
  }

  const job = unwrap(data.jobs);
  const vehicle = job ? unwrap(job.vehicles) : null;
  const garage = job ? unwrap(job.garages) : null;
  const displayName = garage?.brand_name || garage?.name || fallbackName;

  // 4. Best-effort audit. The token-hash prefix is enough to correlate
  //    with the approval_requests row without leaking the cleartext
  //    token to anyone who later reads the audit row.
  const headerStore = await headers();
  const ip =
    headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  if (job?.garage_id) {
    void supabase.from("audit_log").insert({
      garage_id: job.garage_id,
      actor_staff_id: null,
      actor_ip: ip,
      action: "approval_link_visited",
      target_table: "approval_requests",
      target_id: data.id,
      meta: {
        token_hash_prefix: tokenHash.slice(0, 12),
        user_agent: headerStore.get("user-agent")?.slice(0, 200) ?? null,
      },
    });
  }

  return (
    <ApproveClient
      token={token}
      garageName={displayName}
      logoUrl={logoUrl}
      jobNumber={job?.job_number ?? null}
      vehicleRegistration={vehicle?.registration ?? null}
      vehicleMakeModel={
        [vehicle?.make, vehicle?.model].filter(Boolean).join(" ") || null
      }
      description={data.description}
      amountPence={data.amount_pence}
      expiresAt={data.expires_at}
    />
  );
}

function ApprovalExpired({
  name,
  logoUrl,
}: {
  name: string;
  logoUrl: string | null;
}) {
  return (
    <PatternBackground className="min-h-screen" opacity={0.03}>
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-6 text-center">
        <GarageLogo name={name} logoUrl={logoUrl} size="lg" />
        <div className="rounded-full border border-border bg-background p-4">
          <Clock
            className="h-8 w-8 text-muted-foreground"
            aria-hidden="true"
          />
        </div>
        <div className="space-y-2">
          <h1 className="font-heading text-2xl font-semibold">
            This approval link has expired
          </h1>
          <p className="text-muted-foreground">
            For your security, approval links are valid for 24 hours.
            Please contact {name} and ask them to send you a fresh
            link.
          </p>
        </div>
      </main>
    </PatternBackground>
  );
}

function AlreadyResponded({
  name,
  logoUrl,
  decision,
}: {
  name: string;
  logoUrl: string | null;
  decision: string;
}) {
  const wording =
    decision === "approved"
      ? "You've already approved this request — no further action needed."
      : decision === "declined"
        ? "You've already declined this request."
        : "This request has already been responded to.";
  return (
    <PatternBackground className="min-h-screen" opacity={0.03}>
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-6 text-center">
        <GarageLogo name={name} logoUrl={logoUrl} size="lg" />
        <div className="space-y-2">
          <h1 className="font-heading text-2xl font-semibold">
            Already responded
          </h1>
          <p className="text-muted-foreground">{wording}</p>
        </div>
      </main>
    </PatternBackground>
  );
}
