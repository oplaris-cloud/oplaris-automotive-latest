import Link from "next/link";
import { notFound } from "next/navigation";
import {
  User,
  Phone,
  Mail,
  Wrench,
  Plus,
  History,
} from "lucide-react";

import { requireManager } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { CarImage } from "@/components/ui/car-image";
import { CustomerNameLink } from "@/components/ui/customer-name-link";
import { RegPlate } from "@/components/ui/reg-plate";
import { TelLink } from "@/components/ui/tel-link";
import { PageContainer } from "@/components/app/page-container";
import { ListSearch } from "@/components/ui/list-search";
import { FilterChips } from "@/components/ui/filter-chips";
import { getVehicleDetail } from "../actions";
import { MotHistorySection } from "./MotHistorySection";
import { DeleteVehicleButton } from "./DeleteVehicleButton";
import { VehicleDetailRealtime } from "@/lib/realtime/shims";
import type { JobStatus } from "@/lib/validation/job-schemas";
import {
  composeVehicleJobsSearchPredicate,
  searchVehicleJobs,
  REPAIR_CHIP_OPTIONS,
} from "@/lib/search/vehicle-jobs";

interface VehicleDetailProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; repair?: string }>;
}

export default async function VehicleDetailPage({
  params,
  searchParams,
}: VehicleDetailProps) {
  await requireManager();
  const { id } = await params;
  const { q, repair } = await searchParams;
  const { vehicle, jobs, motHistory, error } = await getVehicleDetail(id);

  if (error || !vehicle) notFound();

  // Filtered job history runs through the new search predicate. The
  // first call above kept its full-list contract for active-jobs +
  // header counts; this second pass is the searchable view.
  const supabase = await createSupabaseServerClient();
  const predicate = composeVehicleJobsSearchPredicate({ q, repair });
  const filteredJobs = await searchVehicleJobs(supabase, id, predicate);
  const isFiltering = predicate.q !== null || predicate.repairChips.length > 0;

  const activeJobs = jobs.filter(
    (j) => j.status !== "completed" && j.status !== "cancelled",
  );

  return (
    <PageContainer width="default">
      <VehicleDetailRealtime vehicleId={vehicle.id} />
      {/* Hero card with car image */}
      <Card className="overflow-hidden">
        <div className="relative bg-gradient-to-br from-muted/40 to-muted/80 p-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            {/* Car image */}
            <div className="mx-auto w-full max-w-[280px] sm:mx-0 sm:w-[280px] sm:shrink-0">
              <CarImage
                make={vehicle.make}
                model={vehicle.model}
                year={vehicle.year}
                colour={vehicle.colour}
                className="rounded-lg"
              />
            </div>

            {/* Vehicle info */}
            <div className="flex-1 space-y-3">
              <div>
                <RegPlate reg={vehicle.registration} size="lg" />
              </div>
              <div className="text-lg font-medium">
                {[vehicle.make, vehicle.model, vehicle.year]
                  .filter(Boolean)
                  .join(" ") || "Unknown vehicle"}
              </div>
              {vehicle.colour && (
                <div className="text-sm text-muted-foreground">
                  Colour: {vehicle.colour}
                </div>
              )}
              {vehicle.vin && (
                <div className="font-mono text-xs text-muted-foreground">
                  VIN: {vehicle.vin}
                </div>
              )}
              {vehicle.mileage != null && (
                <div className="text-sm text-muted-foreground">
                  Mileage: {vehicle.mileage.toLocaleString()} miles
                </div>
              )}
              {vehicle.notes && (
                <p className="text-sm text-muted-foreground">{vehicle.notes}</p>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Quick actions row */}
      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          href={`/app/jobs/new?vehicleId=${vehicle.id}&customerId=${vehicle.customer?.id ?? ""}`}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> New Job
        </Link>
        {vehicle.customer && (
          <Link
            href={`/app/customers/${vehicle.customer.id}`}
            className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
          >
            <User className="h-4 w-4" /> View Customer
          </Link>
        )}
        <DeleteVehicleButton vehicleId={vehicle.id} />
      </div>

      {/* Customer card */}
      {vehicle.customer && (
        <>
          <Separator className="my-6" />
          <h2 className="text-lg font-semibold">Owner</h2>
          <Card className="mt-3">
            <CardContent className="p-4">
              <CustomerNameLink
                customerId={vehicle.customer.id}
                fullName={vehicle.customer.full_name}
                isTrader={
                  (vehicle.customer as { is_trader?: boolean }).is_trader ??
                  false
                }
                className="text-base font-medium"
              />
              <div className="mt-2 flex flex-wrap gap-4 text-sm text-muted-foreground">
                <TelLink
                  phone={vehicle.customer.phone}
                  label={`Call ${vehicle.customer.full_name}`}
                  className="flex items-center gap-1.5 hover:text-foreground hover:underline underline-offset-4"
                >
                  <Phone className="h-4 w-4" /> {vehicle.customer.phone}
                </TelLink>
                {vehicle.customer.email && (
                  <span className="flex items-center gap-1.5">
                    <Mail className="h-4 w-4" /> {vehicle.customer.email}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Active jobs */}
      {activeJobs.length > 0 && (
        <>
          <Separator className="my-6" />
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Wrench className="h-5 w-5" /> Active Jobs
          </h2>
          <div className="mt-3 space-y-2">
            {activeJobs.map((j) => (
              <Link key={j.id} href={`/app/jobs/${j.id}`}>
                <Card className="transition-shadow hover:shadow-md">
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <span className="font-mono text-sm font-medium">
                        {j.job_number}
                      </span>
                      {j.description && (
                        <span className="ml-2 text-sm text-muted-foreground">
                          {j.description.slice(0, 80)}
                        </span>
                      )}
                      <div className="mt-1 text-xs text-muted-foreground">
                        {j.bay_name && `${j.bay_name} · `}
                        {new Date(j.created_at).toLocaleDateString("en-GB")}
                      </div>
                    </div>
                    <StatusBadge status={j.status as JobStatus} />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}

      {/* Full job history — moved above MOT History per Hossein
          2026-04-30 (Todoist 6gVQJ3Ggmg6mFwHG): job history is the
          more frequently-accessed lookup when checking a vehicle.
          Bug-4 (2026-05-02): show the filtered count when filters
          are active so the H2 always matches the rendered list. */}
      <Separator className="my-6" />
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <History className="h-5 w-5" />{" "}
        {isFiltering
          ? `Job History (${filteredJobs.length} of ${jobs.length})`
          : `Job History (${jobs.length})`}
      </h2>
      {jobs.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          No jobs recorded for this vehicle yet.
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center">
            <ListSearch
              placeholder="Search descriptions, parts, charges…"
              className="md:flex-1"
            />
            <FilterChips
              paramName="repair"
              options={REPAIR_CHIP_OPTIONS}
              ariaLabel="Filter by repair type"
            />
          </div>
          {filteredJobs.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {isFiltering
                ? "No jobs match the current filters."
                : "No jobs recorded for this vehicle yet."}
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {filteredJobs.map((j) => (
                <Link key={j.id} href={`/app/jobs/${j.id}`}>
                  <Card className="transition-shadow hover:shadow-md">
                    <CardContent className="flex items-center justify-between p-4">
                      <div>
                        <span className="font-mono text-sm font-medium">
                          {j.job_number}
                        </span>
                        {j.description && (
                          <span className="ml-2 text-sm text-muted-foreground">
                            {j.description.slice(0, 80)}
                          </span>
                        )}
                        <div className="mt-1 text-xs text-muted-foreground">
                          {j.bay_name && `${j.bay_name} · `}
                          {new Date(j.created_at).toLocaleDateString("en-GB")}
                          {j.completed_at &&
                            ` — completed ${new Date(j.completed_at).toLocaleDateString("en-GB")}`}
                          {j.service && (
                            <Badge variant="secondary" className="ml-2 capitalize">
                              {j.service}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <StatusBadge status={j.status as JobStatus} />
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {/* MOT History */}
      <Separator className="my-6" />
      <MotHistorySection
        vehicleId={vehicle.id}
        registration={vehicle.registration}
        motHistory={motHistory}
        now={new Date()}
      />
    </PageContainer>
  );
}
