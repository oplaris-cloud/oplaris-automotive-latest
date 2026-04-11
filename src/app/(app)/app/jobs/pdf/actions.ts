"use server";

import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";

import { requireManager } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { JobSheetDocument, type JobSheetData } from "@/lib/pdf/job-sheet";

/**
 * Generate a PDF job sheet for the given job.
 *
 * Returns the PDF as a base64-encoded string (Server Actions can't return
 * binary buffers directly). The client decodes it into a Blob and opens
 * a download / new tab.
 *
 * Cross-tenant safety: the Supabase query runs through RLS, so a manager
 * can only generate PDFs for their own garage's jobs.
 *
 * No internal UUIDs appear in the PDF — only job_number, customer name,
 * vehicle reg, and financial data.
 */
export async function generateJobSheet(
  jobId: string,
): Promise<{ pdf: string } | { error: string }> {
  const session = await requireManager();

  if (!jobId || !/^[0-9a-f-]{36}$/.test(jobId)) {
    return { error: "Invalid job ID" };
  }

  const supabase = await createSupabaseServerClient();

  // Fetch job + customer + vehicle in one go (RLS filters by garage)
  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select(`
      id, job_number, status, description, created_at, completed_at,
      customers!customer_id ( full_name, phone, email ),
      vehicles!vehicle_id ( registration, make, model, year, mileage )
    `)
    .eq("id", jobId)
    .single();

  if (jobErr || !job) return { error: "Job not found" };

  // Fetch labour (work logs)
  const { data: workLogs } = await supabase
    .from("work_logs")
    .select("task_type, description, duration_seconds, staff:staff!staff_id ( full_name )")
    .eq("job_id", jobId)
    .order("started_at", { ascending: true });

  // Fetch parts
  const { data: parts } = await supabase
    .from("job_parts")
    .select("description, supplier, quantity, unit_price_pence, total_pence")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });

  // Fetch garage name
  const { data: garage } = await supabase
    .from("garages")
    .select("name")
    .eq("id", session.garageId)
    .single();

  // Shape the data for the PDF template
  const customer = Array.isArray(job.customers) ? job.customers[0] : job.customers;
  const vehicle = Array.isArray(job.vehicles) ? job.vehicles[0] : job.vehicles;

  const sheetData: JobSheetData = {
    garage: { name: garage?.name ?? "Garage" },
    job: {
      jobNumber: job.job_number,
      status: job.status,
      createdAt: job.created_at,
      completedAt: job.completed_at,
      description: job.description,
    },
    customer: {
      fullName: (customer as { full_name: string })?.full_name ?? "Unknown",
      phone: (customer as { phone: string })?.phone ?? "",
      email: (customer as { email: string | null })?.email ?? null,
    },
    vehicle: {
      registration: (vehicle as { registration: string })?.registration ?? "—",
      make: (vehicle as { make: string | null })?.make ?? null,
      model: (vehicle as { model: string | null })?.model ?? null,
      year: (vehicle as { year: number | null })?.year ?? null,
      mileage: (vehicle as { mileage: number | null })?.mileage ?? null,
    },
    labourLines: (workLogs ?? []).map((wl) => {
      const staff = Array.isArray(wl.staff) ? wl.staff[0] : wl.staff;
      return {
        taskType: wl.task_type,
        description: wl.description,
        durationSeconds: wl.duration_seconds,
        staffName: (staff as { full_name: string })?.full_name ?? "—",
      };
    }),
    partsLines: (parts ?? []).map((p) => ({
      description: p.description,
      supplier: p.supplier,
      quantity: p.quantity,
      unitPricePence: p.unit_price_pence,
      totalPence: p.total_pence,
    })),
  };

  // Render to PDF buffer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = React.createElement(JobSheetDocument, { data: sheetData }) as any;
  const buffer = await renderToBuffer(element);

  // Return base64 (Server Actions can't return binary)
  return { pdf: Buffer.from(buffer).toString("base64") };
}
