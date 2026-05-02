import Link from "next/link";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, ArrowRight, LogOut } from "lucide-react";
import { readImpersonationCookie } from "@/lib/auth/super-admin-cookie";

import { enterGarage, exitImpersonation } from "./actions";

/**
 * B6.1 — Garage picker. Lists every tenant via the SECURITY DEFINER
 * `list_garages_for_super_admin()` helper (which gates on the
 * super_admin claim). Clicking a row enters that garage.
 */
export default async function AdminGaragesPage() {
  const supabase = await createSupabaseServerClient();
  const { data: garages } = await supabase.rpc(
    "list_garages_for_super_admin",
  );

  const impersonation = await readImpersonationCookie();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Garages</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Select a garage to enter as Oplaris support. Every action you
            take inside the tenant is recorded in the audit log.
          </p>
        </div>
        {impersonation ? (
          <form action={exitImpersonation}>
            <Button type="submit" variant="outline" size="sm">
              <LogOut className="mr-2 h-4 w-4" />
              Exit impersonation
            </Button>
          </form>
        ) : null}
      </div>

      {!garages || garages.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No garages found.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {(garages as Array<{
            id: string;
            name: string;
            slug: string;
            created_at: string;
          }>).map((g) => {
            const active = impersonation?.garageId === g.id;
            return (
              <li key={g.id}>
                <form
                  action={async () => {
                    "use server";
                    await enterGarage(g.id);
                  }}
                >
                  <button
                    type="submit"
                    className="flex w-full items-center justify-between rounded-lg border bg-card p-4 text-left transition-shadow hover:shadow-md"
                  >
                    <div>
                      <div className="flex items-center gap-2 font-medium">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        {g.name}
                        {active ? (
                          <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                            Active
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 font-mono text-xs text-muted-foreground">
                        {g.slug} · created{" "}
                        {new Date(g.created_at).toLocaleDateString("en-GB")}
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}

      <Card>
        <CardContent className="p-4 text-xs text-muted-foreground">
          <strong>Audit:</strong> view cross-garage actions at{" "}
          <Link href="/admin/audit" className="underline">
            /admin/audit
          </Link>
          .
        </CardContent>
      </Card>
    </div>
  );
}
