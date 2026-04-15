import Link from "next/link";
import { notFound } from "next/navigation";
import { Car, Phone, Mail, MapPin } from "lucide-react";

import { requireManager } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CarImage } from "@/components/ui/car-image";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/ui/empty-state";
import { AddVehicleForm } from "./AddVehicleForm";
import { EditCustomerDialog } from "./EditCustomerDialog";
import { GdprExportButton } from "./GdprExportButton";
import { CustomerDetailRealtime } from "@/lib/realtime/shims";

interface CustomerDetailProps {
  params: Promise<{ id: string }>;
}

export default async function CustomerDetailPage({ params }: CustomerDetailProps) {
  const session = await requireManager();
  const isManager = session.roles.includes("manager");
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!customer) notFound();

  const { data: vehicles } = await supabase
    .from("vehicles")
    .select("id, registration, make, model, year, colour")
    .eq("customer_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, job_number, status, description, created_at")
    .eq("customer_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <div className="max-w-3xl">
      <CustomerDetailRealtime customerId={customer.id} />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{customer.full_name}</h1>
        <div className="flex items-center gap-2">
          <EditCustomerDialog customer={customer} />
          {isManager && <GdprExportButton customerId={customer.id} customerName={customer.full_name} />}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Phone className="h-4 w-4" /> {customer.phone}
        </span>
        {customer.email && (
          <span className="flex items-center gap-1.5">
            <Mail className="h-4 w-4" /> {customer.email}
          </span>
        )}
        {customer.postcode && (
          <span className="flex items-center gap-1.5">
            <MapPin className="h-4 w-4" /> {customer.postcode}
          </span>
        )}
      </div>

      {customer.notes && (
        <p className="mt-3 text-sm text-muted-foreground">{customer.notes}</p>
      )}

      <Separator className="my-6" />

      {/* Vehicles */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Vehicles</h2>
      </div>
      {!vehicles || vehicles.length === 0 ? (
        <EmptyState
          icon={Car}
          title="No vehicles"
          description="Add a vehicle to this customer."
          className="mt-4"
        />
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {vehicles.map((v) => (
            <Link key={v.id} href={`/app/vehicles/${v.id}`}>
              <Card className="overflow-hidden transition-shadow hover:shadow-md">
                <div className="bg-muted/30 px-3 py-2">
                  <CarImage
                    make={v.make}
                    model={v.model}
                    year={v.year}
                    colour={v.colour}
                    className="mx-auto h-[80px]"
                    width={400}
                  />
                </div>
                <CardContent className="p-4">
                  <div className="inline-block rounded bg-yellow-400 px-2 py-1 font-mono text-sm font-bold text-black">
                    {v.registration}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {[v.make, v.model, v.year].filter(Boolean).join(" ") || "—"}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
      <div className="mt-4">
        <AddVehicleForm customerId={id} />
      </div>

      <Separator className="my-6" />

      {/* Recent jobs */}
      <h2 className="text-lg font-semibold">Recent Jobs</h2>
      {!jobs || jobs.length === 0 ? (
        <EmptyState title="No jobs" description="No jobs for this customer yet." className="mt-4" />
      ) : (
        <div className="mt-3 space-y-2">
          {jobs.map((j) => (
            <Link key={j.id} href={`/app/jobs/${j.id}`}>
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <span className="font-mono text-sm font-medium">{j.job_number}</span>
                    {j.description && (
                      <span className="ml-2 text-sm text-muted-foreground">
                        {j.description.slice(0, 60)}
                      </span>
                    )}
                  </div>
                  <span className="text-xs capitalize text-muted-foreground">
                    {j.status.replace(/_/g, " ")}
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
