import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  verifyApprovalToken,
  hashToken,
} from "@/lib/security/approval-tokens";

/**
 * 410 Gone for all denial cases — expired, already used, bad token.
 * Same shape regardless of reason to prevent oracle attacks.
 */
const GONE = () =>
  NextResponse.json(
    { error: "This link has expired or has already been used." },
    { status: 410 },
  );

/**
 * GET /api/approvals/[token] — render the approval details page.
 *
 * Public endpoint — no auth required (customer clicks from SMS).
 * Uses service_role to read the DB because the customer has no
 * Supabase session. All trust comes from the HMAC signature.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;

  // 1. Verify HMAC
  const payload = verifyApprovalToken(token);
  if (!payload) return GONE();

  // 2. Check expiry (client-side, before DB hit)
  if (new Date(payload.expires_at) < new Date()) return GONE();

  // 3. Look up by hash
  const supabase = createSupabaseAdminClient();
  const hash = hashToken(token);
  const { data, error } = await supabase
    .from("approval_requests")
    .select("id, description, amount_pence, status, expires_at")
    .eq("token_hash", hash)
    .single();

  if (error || !data) return GONE();
  if (data.status !== "pending") return GONE();
  if (new Date(data.expires_at) < new Date()) return GONE();

  // Return the approval details (no PII beyond what the customer
  // already knows — description and amount).
  return NextResponse.json({
    id: data.id,
    description: data.description,
    amount: `£${(data.amount_pence / 100).toFixed(2)}`,
  });
}

/**
 * POST /api/approvals/[token] — record approve or decline.
 *
 * Single-use: the UPDATE has a WHERE clause that only matches
 * `status = 'pending' AND expires_at > now()`. If the row was
 * already approved/declined, zero rows are affected → 410.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;

  // 1. Verify HMAC
  const payload = verifyApprovalToken(token);
  if (!payload) return GONE();

  // 2. Parse body
  let body: { decision?: string };
  try {
    body = (await request.json()) as { decision?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const decision = body.decision;
  if (decision !== "approved" && decision !== "declined") {
    return NextResponse.json(
      { error: "Decision must be 'approved' or 'declined'" },
      { status: 400 },
    );
  }

  // 3. Single-use update
  const supabase = createSupabaseAdminClient();
  const hash = hashToken(token);
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = request.headers.get("user-agent") ?? null;

  const { data, error } = await supabase
    .from("approval_requests")
    .update({
      status: decision,
      responded_at: new Date().toISOString(),
      responded_ip: ip,
      responded_user_agent: userAgent,
    })
    .eq("token_hash", hash)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .select("id, job_id, status")
    .single();

  if (error || !data) return GONE();

  return NextResponse.json({ ok: true, status: data.status });
}
