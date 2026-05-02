import Link from "next/link";
import { notFound } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readImpersonationCookie } from "@/lib/auth/super-admin-cookie";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, AlertTriangle } from "lucide-react";

import { exitImpersonation } from "../../actions";

/**
 * B6.1 — Tenant landing while impersonating.
 *
 * The mandatory red banner is the most important piece of copy on
 * this whole feature (ux-audit content-and-copy reference). It must
 * be impossible to miss + can't be dismissed.
 *
 * The "Continue to manager dashboard" link drops the operator into
 * the regular `/app` surface, where every Server Component reads the
 * impersonation cookie via `createSupabaseServerClient` and scopes
 * its data to the impersonated garage. RLS on every table enforces
 * the same scoping, plus the audit trigger writes a row for every
 * mutation the operator performs.
 */
export default async function AdminGarageLandingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const impersonation = await readImpersonationCookie();
  if (!impersonation || impersonation.garageId !== id) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();
  const { data: garage } = await supabase
    .from("garages")
    .select("id, name, slug")
    .eq("id", id)
    .maybeSingle();

  if (!garage) notFound();

  // KPIs scoped via current_garage() (which honours the impersonation
  // header). Cheap counts so the banner page is responsive.
  const [{ count: customerCount }, { count: jobCount }, { count: bookingCount }] =
    await Promise.all([
      supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null),
      supabase.from("jobs").select("id", { count: "exact", head: true }),
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .is("job_id", null),
    ]);

  return (
    <div className="space-y-6">
      {/* THE banner — biggest type, can't be dismissed, copy is direct. */}
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-1 h-5 w-5 shrink-0 text-destructive" />
            <div className="flex-1">
              <h2 className="font-heading text-xl font-semibold text-foreground">
                You are viewing {garage.name} as Oplaris support.
              </h2>
              <p className="mt-2 text-sm text-foreground/80">
                Every read and write is logged in the audit trail.
                Use this access only for support requests the tenant
                has authorised. Cookie expires in one hour.
              </p>
            </div>
            <form action={exitImpersonation}>
              <Button type="submit" size="sm" variant="outline">
                Exit
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi label="Customers" value={customerCount ?? 0} />
        <Kpi label="Jobs" value={jobCount ?? 0} />
        <Kpi label="Pending check-ins" value={bookingCount ?? 0} />
      </div>

      <Card>
        <CardContent className="flex items-center justify-between p-6">
          <div>
            <h3 className="font-medium">Continue to manager dashboard</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              You'll see the same UI a manager sees, scoped to{" "}
              {garage.name}. The red banner stays in the Oplaris admin
              chrome so you always know you're in support mode.
            </p>
          </div>
          <Link href="/app">
            <Button>
              Open <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="mt-1 font-heading text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}
