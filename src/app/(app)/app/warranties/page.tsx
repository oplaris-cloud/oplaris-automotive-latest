import { Shield, AlertTriangle } from "lucide-react";

import { requireManager } from "@/lib/auth/session";

function isExpired(expiresOn: string): boolean {
  return new Date(expiresOn) < new Date();
}

function daysUntil(expiresOn: string): number {
  return Math.ceil((new Date(expiresOn).getTime() - new Date().getTime()) / 86400000);
}
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VoidWarrantyButton } from "./VoidWarrantyButton";

export default async function WarrantiesPage() {
  await requireManager();
  const supabase = await createSupabaseServerClient();

  const { data: warranties } = await supabase
    .from("warranties")
    .select(`
      id, description, starts_on, expires_on, mileage_limit, starting_mileage,
      voided_at, voided_reason,
      vehicles!vehicle_id ( registration, make, model ),
      jobs!job_id ( job_number )
    `)
    .is("voided_at", null)
    .order("expires_on", { ascending: true });

  const active = (warranties ?? []).filter((w) => !isExpired(w.expires_on));
  const expired = (warranties ?? []).filter((w) => isExpired(w.expires_on));

  return (
    <div>
      <h1 className="text-2xl font-semibold">Warranties</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Active warranty coverage across all vehicles.
      </p>

      {active.length === 0 && expired.length === 0 ? (
        <EmptyState
          icon={Shield}
          title="No warranties"
          description="Warranties are created when completing a job."
          className="mt-8"
        />
      ) : (
        <>
          {active.length > 0 && (
            <div className="mt-6">
              <h2 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Active ({active.length})
              </h2>
              <div className="space-y-3">
                {active.map((w) => {
                  const vehicle = Array.isArray(w.vehicles) ? w.vehicles[0] : w.vehicles;
                  const job = Array.isArray(w.jobs) ? w.jobs[0] : w.jobs;
                  const daysLeft = daysUntil(w.expires_on);
                  return (
                    <Card key={w.id}>
                      <CardContent className="flex items-start justify-between p-4">
                        <div>
                          <div className="font-medium">{w.description}</div>
                          <div className="mt-1 text-sm text-muted-foreground">
                            <span className="font-mono">
                              {(vehicle as { registration: string } | null)?.registration ?? "—"}
                            </span>
                            <span className="mx-2">·</span>
                            Job {(job as { job_number: string } | null)?.job_number ?? "—"}
                          </div>
                          <div className="mt-1 text-sm text-muted-foreground">
                            {w.starts_on} → {w.expires_on}
                            {w.mileage_limit && (
                              <span className="ml-2">· {w.mileage_limit.toLocaleString()} miles</span>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          {daysLeft <= 30 ? (
                            <Badge variant="outline" className="border-warning text-warning">
                              <AlertTriangle className="mr-1 h-3 w-3" />
                              {daysLeft}d left
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-success text-success">
                              <Shield className="mr-1 h-3 w-3" />
                              {daysLeft}d left
                            </Badge>
                          )}
                          <div className="mt-2">
                            <VoidWarrantyButton warrantyId={w.id} />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {expired.length > 0 && (
            <div className="mt-8">
              <h2 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Expired ({expired.length})
              </h2>
              <div className="space-y-2 opacity-60">
                {expired.map((w) => {
                  const vehicle = Array.isArray(w.vehicles) ? w.vehicles[0] : w.vehicles;
                  return (
                    <Card key={w.id}>
                      <CardContent className="p-4 text-sm">
                        {w.description} — <span className="font-mono">{(vehicle as { registration: string } | null)?.registration}</span> — expired {w.expires_on}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
