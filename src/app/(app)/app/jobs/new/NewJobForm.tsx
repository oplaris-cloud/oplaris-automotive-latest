"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createJob } from "../actions";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormCard } from "@/components/ui/form-card";
import { FormActions } from "@/components/ui/form-actions";

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
  const [vehicleId, setVehicleId] = useState(defaultVehicleId ?? "");

  const selectedCustomer = customers.find((c) => c.id === customerId);
  const vehicles = selectedCustomer?.vehicles ?? [];

  // When the customer changes, the previously-selected vehicle no
  // longer belongs to the visible list — drop it so the combobox doesn't
  // submit a vehicle that isn't owned by the chosen customer.
  function handleCustomerChange(next: string) {
    setCustomerId(next);
    if (next !== customerId) setVehicleId("");
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const form = new FormData(e.currentTarget);
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
    <FormCard variant="plain" className="mt-6">
    <form onSubmit={handleSubmit}>
      <FormCard.Fields>
      {/* Customer — searchable combobox; matches across name, phone, and
          the reg plate of any of the customer's vehicles so a manager can
          punch in "AB12 CDE" and land on the right record. */}
      <div>
        <Label htmlFor="customerId" required>Customer</Label>
        <div className="mt-1">
          <Combobox
            id="customerId"
            value={customerId}
            onChange={handleCustomerChange}
            options={customers}
            getValue={(c) => c.id}
            getLabel={(c) => c.fullName}
            getDescription={(c) => c.phone}
            getSearchKeywords={(c) => [
              c.fullName,
              c.phone,
              ...c.vehicles.map((v) => v.registration),
            ]}
            placeholder="Select a customer…"
            searchPlaceholder="Search by name, phone, or reg…"
            emptyLabel="No customers match."
            aria-invalid={Boolean(fieldErrors.customerId)}
          />
        </div>
        {fieldErrors.customerId && (
          <p className="mt-1 text-sm text-destructive">{fieldErrors.customerId}</p>
        )}
      </div>

      {/* Vehicle — scoped to the selected customer's vehicles. */}
      <div>
        <Label htmlFor="vehicleId" required>Vehicle</Label>
        <div className="mt-1">
          <Combobox
            id="vehicleId"
            name="vehicleId"
            value={vehicleId}
            onChange={setVehicleId}
            options={vehicles}
            getValue={(v) => v.id}
            getLabel={(v) => v.label}
            getSearchKeywords={(v) => [v.registration, v.label]}
            disabled={!customerId}
            placeholder={customerId ? "Select a vehicle…" : "Select a customer first"}
            searchPlaceholder="Search by reg or model…"
            emptyLabel="No vehicles for this customer."
            aria-invalid={Boolean(fieldErrors.vehicleId)}
          />
        </div>
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

      </FormCard.Fields>
      <FormActions>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/app/jobs")}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creating…" : "Create Job"}
        </Button>
      </FormActions>
    </form>
    </FormCard>
  );
}
