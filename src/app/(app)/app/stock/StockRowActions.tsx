"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, ArrowUpDown } from "lucide-react";

import { updateStockItem, recordStockMovement } from "../settings/stock/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { LocationSelect } from "./LocationSelect";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";

interface StockRowActionsProps {
  item: {
    id: string;
    description: string;
    sku: string | null;
    reorder_point: number | null;
    unit_cost_pence: number | null;
    location: string | null;
  };
  locations: { id: string; name: string }[];
}

export function EditStockButton({ item, locations }: StockRowActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const costStr = form.get("unitCost") as string;

    startTransition(async () => {
      const result = await updateStockItem({
        id: item.id,
        description: (form.get("description") as string) || undefined,
        sku: (form.get("sku") as string) || "",
        reorderPoint: form.get("reorderPoint") ? Number(form.get("reorderPoint")) : undefined,
        unitCostPence: costStr ? Math.round(parseFloat(costStr) * 100) : undefined,
        location: (form.get("location") as string) || "",
      });
      if (!result.ok) { setError(result.error ?? "Failed"); return; }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="rounded p-1 text-muted-foreground hover:bg-accent" title="Edit">
        <Pencil className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Stock Item</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label optional>Description</Label>
            <Input name="description" defaultValue={item.description} className="mt-1" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label optional>SKU</Label>
              <Input name="sku" defaultValue={item.sku ?? ""} className="mt-1" />
            </div>
            <div>
              <Label optional>Reorder Point</Label>
              <Input name="reorderPoint" type="number" min="0" defaultValue={item.reorder_point ?? ""} className="mt-1" />
            </div>
            <div>
              <Label optional>Unit Cost (£)</Label>
              <Input name="unitCost" type="number" step="0.01" min="0" defaultValue={item.unit_cost_pence ? (item.unit_cost_pence / 100).toFixed(2) : ""} className="mt-1" />
            </div>
            <div>
              <Label optional>Location</Label>
              <div className="mt-1">
                <LocationSelect locations={locations} defaultValue={item.location} />
              </div>
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RecordMovementButton({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const type = form.get("type") as string;
    const qty = Number(form.get("quantity") || 0);
    const delta = type === "usage" ? -qty : qty;

    startTransition(async () => {
      const result = await recordStockMovement({
        stockItemId: itemId,
        delta,
        reason: (form.get("reason") as string) || "",
      });
      if (!result.ok) { setError(result.error ?? "Failed"); return; }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="rounded p-1 text-muted-foreground hover:bg-accent" title="Record movement">
        <ArrowUpDown className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Record Stock Movement</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label required>Type</Label>
            <select name="type" className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="usage">Usage (remove)</option>
              <option value="restock">Restock (add)</option>
              <option value="adjustment">Adjustment (add)</option>
            </select>
          </div>
          <div>
            <Label required>Quantity</Label>
            <Input name="quantity" type="number" min="1" required placeholder="e.g. 5" className="mt-1" />
          </div>
          <div>
            <Label optional>Reason/Reference</Label>
            <Input name="reason" placeholder="e.g. Job #DUD-2026-00042" className="mt-1" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? "Recording..." : "Record"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
