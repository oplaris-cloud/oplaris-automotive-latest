"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";

import { deleteJobPart } from "../parts/actions";
import { Button } from "@/components/ui/button";

interface PartRowProps {
  part: {
    id: string;
    description: string;
    supplier: string;
    quantity: number;
    unit_price_pence: number;
    total_pence: number;
    payment_method: string;
  };
  isManager: boolean;
}

function pence(p: number): string {
  return `£${(p / 100).toFixed(2)}`;
}

export function PartRow({ part, isManager }: PartRowProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteJobPart({ partId: part.id });
      if (!result.ok) {
        setError(result.error ?? "Failed to delete");
        return;
      }
      router.refresh();
    });
  };

  if (confirmDelete) {
    return (
      <div className="border-b bg-destructive/5 p-3">
        <p className="text-sm">Delete "{part.description}"?</p>
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="destructive" disabled={isPending} onClick={handleDelete}>
            {isPending ? "Deleting..." : "Delete"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between p-3">
      <div>
        <div className="text-sm font-medium">{part.description}</div>
        <div className="text-xs text-muted-foreground capitalize">
          {part.supplier} · {part.payment_method.replace("_", " ")} · qty {part.quantity}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm">{pence(part.total_pence)}</span>
        {isManager && (
          <button
            onClick={() => setConfirmDelete(true)}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            title="Delete part"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
