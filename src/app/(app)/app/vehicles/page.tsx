import Link from "next/link";
import { Search } from "lucide-react";

import { requireManager } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { CarImage } from "@/components/ui/car-image";
import { VehiclesListRealtime } from "@/lib/realtime/shims";

interface VehiclesPageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function VehiclesPage({ searchParams }: VehiclesPageProps) {
  const session = await requireManager();
  const { q } = await searchParams;
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("vehicles")
    .select(
      `
      id, registration, make, model, year, colour,
      customer:customers!customer_id ( id, full_name, phone )
    `,
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);

  if (q && q.trim().length > 0) {
    const term = q.trim().toUpperCase();
    // Search by reg, make, or model
    query = query.or(
      `registration.ilike.%${term}%,make.ilike.%${term}%,model.ilike.%${term}%`,
    );
  }

  const { data: vehicles } = await query;

  return (
    <div>
      <VehiclesListRealtime garageId={session.garageId} />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Vehicles</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Search by registration, make, or model.
          </p>
        </div>
      </div>

      {/* Search bar */}
      <form className="mt-4" action="/app/vehicles" method="GET">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            name="q"
            defaultValue={q ?? ""}
            placeholder="e.g. AB12 CDE or Ford Focus"
            className="w-full rounded-lg border bg-background py-2 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            autoComplete="off"
          />
        </div>
      </form>

      {/* Results */}
      {!vehicles || vehicles.length === 0 ? (
        <EmptyState
          title={q ? "No vehicles found" : "No vehicles"}
          description={
            q
              ? `Nothing matched "${q}". Try a different search.`
              : "Vehicles appear here once added to a customer."
          }
          className="mt-8"
        />
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {vehicles.map((v) => {
            const customer = Array.isArray(v.customer)
              ? v.customer[0]
              : v.customer;
            return (
              <Link key={v.id} href={`/app/vehicles/${v.id}`}>
                <Card className="overflow-hidden transition-shadow hover:shadow-md">
                  <div className="bg-muted/30 px-4 py-3">
                    <CarImage
                      make={v.make}
                      model={v.model}
                      year={v.year}
                      colour={v.colour}
                      className="mx-auto h-[100px]"
                      width={400}
                    />
                  </div>
                  <CardContent className="p-4">
                    <div className="inline-block rounded bg-yellow-400 px-2 py-1 font-mono text-sm font-bold text-black">
                      {v.registration}
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      {[v.make, v.model, v.year].filter(Boolean).join(" ") ||
                        "—"}
                    </div>
                    {customer && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {(customer as { full_name: string }).full_name}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
