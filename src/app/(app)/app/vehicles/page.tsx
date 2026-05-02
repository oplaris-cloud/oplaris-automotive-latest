import Link from "next/link";

import { requireManager } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { CarRepairInProgressIllustration } from "@/components/illustrations";
import { CarImage } from "@/components/ui/car-image";
import { RegPlate } from "@/components/ui/reg-plate";
import { TraderBadge } from "@/components/ui/trader-badge";
import { PageContainer } from "@/components/app/page-container";
import { ListSearch } from "@/components/ui/list-search";
import { VehiclesListRealtime } from "@/lib/realtime/shims";
import {
  composeVehiclesSearchPredicate,
  searchVehicles,
} from "@/lib/search/list-pages";

interface VehiclesPageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function VehiclesPage({ searchParams }: VehiclesPageProps) {
  const session = await requireManager();
  const { q } = await searchParams;
  const supabase = await createSupabaseServerClient();

  const predicate = composeVehiclesSearchPredicate({ q });
  const vehicles = await searchVehicles(supabase, predicate, 50);

  return (
    <PageContainer width="full">
      <VehiclesListRealtime garageId={session.garageId} />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Vehicles</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Search by registration, make, model, or owner name.
          </p>
        </div>
      </div>

      <div className="mt-4">
        <ListSearch placeholder="e.g. AB12 CDE, Ford Focus, John Smith…" />
      </div>

      {/* Results */}
      {!vehicles || vehicles.length === 0 ? (
        <EmptyState
          illustration={CarRepairInProgressIllustration}
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
            const customer = v.customer;
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
                    <RegPlate reg={v.registration} size="default" />
                    <div className="mt-2 text-sm text-muted-foreground">
                      {[v.make, v.model, v.year].filter(Boolean).join(" ") ||
                        "—"}
                    </div>
                    {customer && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {customer.full_name}
                        <TraderBadge isTrader={customer.is_trader ?? false} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
