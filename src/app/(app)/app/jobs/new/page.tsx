import { requireManager } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NewJobForm } from "./NewJobForm";

interface NewJobPageProps {
  searchParams: Promise<{ vehicleId?: string; customerId?: string }>;
}

export default async function NewJobPage({ searchParams }: NewJobPageProps) {
  await requireManager();
  const { vehicleId: urlVehicleId, customerId: urlCustomerId } = await searchParams;
  const supabase = await createSupabaseServerClient();

  const [{ data: customers }, { data: bays }] = await Promise.all([
    supabase
      .from("customers")
      .select("id, full_name, phone, vehicles:vehicles(id, registration, make, model)")
      .is("deleted_at", null)
      .order("full_name"),
    supabase
      .from("bays")
      .select("id, name")
      .order("name"),
  ]);

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold">New Job</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Select a customer and vehicle to create a job card.
      </p>
      <NewJobForm
        defaultCustomerId={urlCustomerId}
        defaultVehicleId={urlVehicleId}
        customers={(customers ?? []).map((c) => ({
          id: c.id,
          fullName: c.full_name,
          phone: c.phone,
          vehicles: ((c.vehicles ?? []) as { id: string; registration: string; make: string | null; model: string | null }[]).map((v) => ({
            id: v.id,
            registration: v.registration,
            label: [v.registration, v.make, v.model].filter(Boolean).join(" — "),
          })),
        }))}
        bays={(bays ?? []).map((b) => ({ id: b.id, name: b.name }))}
      />
    </div>
  );
}
