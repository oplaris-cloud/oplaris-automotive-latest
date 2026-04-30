"use server";

import { requireManager } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface VehicleDetail {
  id: string;
  registration: string;
  make: string | null;
  model: string | null;
  year: number | null;
  vin: string | null;
  colour: string | null;
  mileage: number | null;
  notes: string | null;
  customer: {
    id: string;
    full_name: string;
    phone: string;
    email: string | null;
  } | null;
}

export interface VehicleJob {
  id: string;
  job_number: string;
  status: string;
  description: string | null;
  created_at: string;
  completed_at: string | null;
  bay_name: string | null;
}

export interface MotHistoryEntry {
  completedDate: string;
  testResult: string;
  expiryDate?: string;
  odometerValue?: string;
  odometerUnit?: string;
  motTestNumber?: string;
  defects?: Array<{
    text: string;
    type: string;
    dangerous?: boolean;
  }>;
}

export async function getVehicleDetail(vehicleId: string): Promise<{
  vehicle: VehicleDetail | null;
  jobs: VehicleJob[];
  motHistory: MotHistoryEntry[];
  error?: string;
}> {
  await requireManager();
  const supabase = await createSupabaseServerClient();

  // Fetch vehicle with customer
  const { data: vehicle, error: vErr } = await supabase
    .from("vehicles")
    .select(`
      id, registration, make, model, year, vin, colour, mileage, notes,
      customer:customers!customer_id ( id, full_name, phone, email, is_trader )
    `)
    .eq("id", vehicleId)
    .is("deleted_at", null)
    .single();

  if (vErr || !vehicle) {
    return { vehicle: null, jobs: [], motHistory: [], error: "Vehicle not found" };
  }

  // Fetch jobs for this vehicle
  const { data: jobsRaw } = await supabase
    .from("jobs")
    .select(`
      id, job_number, status, description, created_at, completed_at,
      bays:bays!bay_id ( name )
    `)
    .eq("vehicle_id", vehicleId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const jobs: VehicleJob[] = (jobsRaw ?? []).map((j) => {
    const bay = Array.isArray(j.bays) ? j.bays[0] : j.bays;
    return {
      id: j.id,
      job_number: j.job_number,
      status: j.status,
      description: j.description,
      created_at: j.created_at,
      completed_at: j.completed_at,
      bay_name: (bay as { name: string } | null)?.name ?? null,
    };
  });

  // Fetch cached MOT history
  const { data: motCache } = await supabase
    .from("mot_history_cache")
    .select("payload")
    .eq("vehicle_id", vehicleId)
    .single();

  let motHistory: MotHistoryEntry[] = [];
  if (motCache?.payload) {
    try {
      // DVSA API returns { motTests: [...] } at the vehicle level
      const payload = motCache.payload as Record<string, unknown>;
      const tests = (payload.motTests ?? payload.motTestReports ?? []) as MotHistoryEntry[];
      motHistory = Array.isArray(tests) ? tests : [];
    } catch {
      // ignore malformed cache
    }
  }

  const cust = Array.isArray(vehicle.customer)
    ? vehicle.customer[0]
    : vehicle.customer;

  return {
    vehicle: {
      ...vehicle,
      customer: cust as VehicleDetail["customer"],
    } as VehicleDetail,
    jobs,
    motHistory,
  };
}
