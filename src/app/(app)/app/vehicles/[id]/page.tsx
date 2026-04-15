import Link from "next/link";
import { notFound } from "next/navigation";
import {
  User,
  Phone,
  Mail,
  Wrench,
  Plus,
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  History,
} from "lucide-react";

import { requireManager } from "@/lib/auth/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { CarImage } from "@/components/ui/car-image";
import { getVehicleDetail } from "../actions";
import { MotHistorySection } from "./MotHistorySection";
import { DeleteVehicleButton } from "./DeleteVehicleButton";
import { VehicleDetailRealtime } from "@/lib/realtime/shims";
import type { JobStatus } from "@/lib/validation/job-schemas";

interface VehicleDetailProps {
  params: Promise<{ id: string }>;
}

export default async function VehicleDetailPage({ params }: VehicleDetailProps) {
  await requireManager();
  const { id } = await params;
  const { vehicle, jobs, motHistory, error } = await getVehicleDetail(id);

  if (error || !vehicle) notFound();

  const activeJobs = jobs.filter(
    (j) => j.status !== "completed" && j.status !== "cancelled",
  );
  const completedJobs = jobs.filter(
    (j) => j.status === "completed" || j.status === "cancelled",
  );

  return (
    <div className="max-w-4xl">
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
                <div className="inline-block rounded-md bg-yellow-400 px-3 py-1 font-mono text-xl font-bold text-black">
                  {vehicle.registration}
                </div>
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
              <Link
                href={`/app/customers/${vehicle.customer.id}`}
                className="text-base font-medium hover:underline"
              >
                {vehicle.customer.full_name}
              </Link>
              <div className="mt-2 flex flex-wrap gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Phone className="h-4 w-4" /> {vehicle.customer.phone}
                </span>
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

      {/* MOT History */}
      <Separator className="my-6" />
      <MotHistorySection
        vehicleId={vehicle.id}
        registration={vehicle.registration}
        motHistory={motHistory}
      />

      {/* Full job history */}
      <Separator className="my-6" />
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <History className="h-5 w-5" /> Job History ({jobs.length})
      </h2>
      {jobs.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          No jobs recorded for this vehicle yet.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {jobs.map((j) => (
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
                    </div>
                  </div>
                  <StatusBadge status={j.status as JobStatus} />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
