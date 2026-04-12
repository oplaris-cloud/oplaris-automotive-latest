"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { softDeleteVehicle } from "@/app/(app)/app/customers/vehicles/actions";
import { Button } from "@/components/ui/button";

export function DeleteVehicleButton({ vehicleId }: { vehicleId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!confirm) {
    return (
      <Button size="sm" variant="outline" className="gap-1.5 text-destructive hover:bg-destructive/10" onClick={() => setConfirm(true)}>
        <Trash2 className="h-4 w-4" /> Delete Vehicle
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
      <p className="text-sm font-medium">Are you sure? This vehicle will be removed from all lists.</p>
      {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
      <div className="mt-2 flex gap-2">
        <Button
          size="sm"
          variant="destructive"
          disabled={isPending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await softDeleteVehicle(vehicleId);
              if (!result.ok) {
                setError(result.error ?? "Failed to delete");
                return;
              }
              router.push("/app/vehicles");
            });
          }}
        >
          {isPending ? "Deleting..." : "Yes, delete"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setConfirm(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
