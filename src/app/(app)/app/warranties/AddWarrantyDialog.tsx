"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { createStockWarranty } from "../jobs/warranties/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";

function todayStr() {
  return new Date().toISOString().split("T")[0]!;
}

function yearFromNow() {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split("T")[0]!;
}

interface AddWarrantyDialogProps {
  stockItems: { id: string; description: string; sku: string | null }[];
}

export function AddWarrantyDialog({ stockItems }: AddWarrantyDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await createStockWarranty({
        stockItemId: (form.get("stockItemId") as string) ?? "",
        supplier: (form.get("supplier") as string) ?? "",
        purchaseDate: (form.get("purchaseDate") as string) ?? todayStr(),
        expiryDate: (form.get("expiryDate") as string) ?? yearFromNow(),
        invoiceReference: (form.get("invoiceReference") as string) || undefined,
        notes: (form.get("notes") as string) || undefined,
      });
      if (!result.ok) {
        setError(result.error ?? "Failed to create warranty");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" className="gap-1.5" />}>
        <Plus className="h-4 w-4" /> Add Warranty
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Part Warranty</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label required>Stock Item</Label>
            <select
              name="stockItemId"
              required
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Select a stock item...</option>
              {stockItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.description}{item.sku ? ` (${item.sku})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label required>Supplier</Label>
            <Input name="supplier" required placeholder="e.g. Euro Car Parts" className="mt-1" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label required>Purchase Date</Label>
              <Input name="purchaseDate" type="date" required defaultValue={todayStr()} className="mt-1" />
            </div>
            <div>
              <Label required>Warranty Expiry</Label>
              <Input name="expiryDate" type="date" required defaultValue={yearFromNow()} className="mt-1" />
            </div>
          </div>
          <div>
            <Label optional>Invoice / Receipt Ref</Label>
            <Input name="invoiceReference" placeholder="e.g. INV-2026-1234" className="mt-1" />
          </div>
          <div>
            <Label optional>Notes</Label>
            <Textarea name="notes" rows={2} placeholder="Any additional notes..." className="mt-1" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? "Creating..." : "Add Warranty"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
