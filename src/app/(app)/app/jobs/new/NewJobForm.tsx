"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createJob } from "../actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface Customer {
  id: string;
  fullName: string;
  phone: string;
  vehicles: { id: string; registration: string; label: string }[];
}

interface Bay {
  id: string;
  name: string;
}

export function NewJobForm({
  customers,
  bays,
  defaultCustomerId,
  defaultVehicleId,
}: {
  customers: Customer[];
  bays: Bay[];
  defaultCustomerId?: string;
  defaultVehicleId?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [customerId, setCustomerId] = useState(defaultCustomerId ?? "");

  const selectedCustomer = customers.find((c) => c.id === customerId);
  const vehicles = selectedCustomer?.vehicles ?? [];

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const form = new FormData(e.currentTarget);
    const vehicleId = form.get("vehicleId") as string;
    const description = form.get("description") as string;
    const bayId = (form.get("bayId") as string) || undefined;
    const estimatedReadyAt = (form.get("estimatedReadyAt") as string) || undefined;

    if (!customerId) {
      setFieldErrors({ customerId: "Select a customer" });
      return;
    }
    if (!vehicleId) {
      setFieldErrors({ vehicleId: "Select a vehicle" });
      return;
    }

    startTransition(async () => {
      const result = await createJob({
        customerId,
        vehicleId,
        description: description || "",
        source: "manager",
        bayId,
        estimatedReadyAt: estimatedReadyAt
          ? new Date(estimatedReadyAt).toISOString()
          : undefined,
      });

      if (!result.ok) {
        setError(result.error ?? "Something went wrong");
        if (result.fieldErrors) setFieldErrors(result.fieldErrors);
        return;
      }

      router.push(`/app/jobs/${result.id}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-5">
      {/* Customer */}
      <div>
        <Label htmlFor="customerId" required>Customer</Label>
        <select
          id="customerId"
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-ring focus:ring-2 focus:ring-ring focus:outline-none"
        >
          <option value="">Select a customer…</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.fullName} ({c.phone})
            </option>
          ))}
        </select>
        {fieldErrors.customerId && (
          <p className="mt-1 text-sm text-destructive">{fieldErrors.customerId}</p>
        )}
      </div>

      {/* Vehicle */}
      <div>
        <Label htmlFor="vehicleId" required>Vehicle</Label>
        <select
          id="vehicleId"
          name="vehicleId"
          disabled={!customerId}
          defaultValue={defaultVehicleId ?? ""}
          className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-ring focus:ring-2 focus:ring-ring focus:outline-none disabled:opacity-50"
        >
          <option value="">
            {customerId ? "Select a vehicle…" : "Select a customer first"}
          </option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
        {fieldErrors.vehicleId && (
          <p className="mt-1 text-sm text-destructive">{fieldErrors.vehicleId}</p>
        )}
      </div>

      {/* P38.4 — Bay + ETA pair on sm+, stack on mobile. */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="bayId" optional>Bay</Label>
          <select
            id="bayId"
            name="bayId"
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-ring focus:ring-2 focus:ring-ring focus:outline-none"
          >
            <option value="">No bay assigned</option>
            {bays.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="estimatedReadyAt" optional>Estimated Ready</Label>
          <Input
            id="estimatedReadyAt"
            name="estimatedReadyAt"
            type="datetime-local"
            className="mt-1 w-full"
          />
        </div>
      </div>

      {/* Description */}
      <div>
        <Label htmlFor="description" optional>Description</Label>
        <Textarea
          id="description"
          name="description"
          rows={3}
          placeholder="Describe the work needed…"
          className="mt-1"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          className="w-full sm:w-auto"
          onClick={() => router.push("/app/jobs")}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
          {isPending ? "Creating…" : "Create Job"}
        </Button>
      </div>
    </form>
  );
}
