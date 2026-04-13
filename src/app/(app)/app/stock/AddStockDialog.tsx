"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { createStockItem } from "../settings/stock/actions";
import { createStockWarranty } from "../jobs/warranties/actions";
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

function todayStr() {
  return new Date().toISOString().split("T")[0]!;
}
function yearFromNow() {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split("T")[0]!;
}

interface AddStockDialogProps {
  locations: { id: string; name: string }[];
  stockItems?: { id: string; description: string }[];
}

export function AddStockDialog({ locations }: AddStockDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showWarranty, setShowWarranty] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const priceStr = form.get("unitCost") as string;

    startTransition(async () => {
      const result = await createStockItem({
        description: (form.get("description") as string) ?? "",
        sku: (form.get("sku") as string) || "",
        quantityOnHand: Number(form.get("quantityOnHand") || 0),
        reorderPoint: form.get("reorderPoint") ? Number(form.get("reorderPoint")) : undefined,
        unitCostPence: priceStr ? Math.round(parseFloat(priceStr) * 100) : undefined,
        location: (form.get("location") as string) || "",
      });
      if (!result.ok) { setError(result.error ?? "Failed"); return; }

      // If warranty fields filled, create warranty for the new stock item
      const supplier = (form.get("warrantySupplier") as string) ?? "";
      const purchaseDate = (form.get("warrantyPurchaseDate") as string) ?? "";
      const expiryDate = (form.get("warrantyExpiryDate") as string) ?? "";
      if (showWarranty && supplier && purchaseDate && expiryDate && result.id) {
        const wResult = await createStockWarranty({
          stockItemId: result.id,
          supplier,
          purchaseDate,
          expiryDate,
          invoiceReference: (form.get("warrantyInvoiceRef") as string) || undefined,
        });
        if (!wResult.ok) {
          // Stock item created but warranty failed — non-blocking
          console.warn("Warranty creation failed:", wResult.error);
        }
      }

      setOpen(false);
      setShowWarranty(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setShowWarranty(false); }}>
      <DialogTrigger render={<Button size="sm" className="gap-1.5" />}>
        <Plus className="h-4 w-4" /> Add Item
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Stock Item</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label htmlFor="stock-desc" required>Description</Label>
            <Input id="stock-desc" name="description" required placeholder="e.g. Oil filter" className="mt-1" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="stock-sku" optional>SKU</Label>
              <Input id="stock-sku" name="sku" placeholder="Optional" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="stock-qty" optional>Quantity</Label>
              <Input id="stock-qty" name="quantityOnHand" type="number" min="0" defaultValue="0" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="stock-reorder" optional>Reorder Point</Label>
              <Input id="stock-reorder" name="reorderPoint" type="number" min="0" placeholder="e.g. 5" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="stock-cost" optional>Unit Cost (£)</Label>
              <Input id="stock-cost" name="unitCost" type="number" step="0.01" min="0" placeholder="e.g. 8.50" className="mt-1" />
            </div>
          </div>
          <div>
            <Label optional>Location</Label>
            <div className="mt-1">
              <LocationSelect locations={locations} />
            </div>
          </div>
          <div>
            <Label optional>Invoice / Receipt</Label>
            <Input name="invoiceFile" type="file" accept=".pdf,.jpg,.jpeg,.png" className="mt-1" />
          </div>

          {/* Warranty section */}
          {!showWarranty ? (
            <button
              type="button"
              onClick={() => setShowWarranty(true)}
              className="text-sm text-primary hover:underline"
            >
              + Add supplier warranty
            </button>
          ) : (
            <div className="rounded-lg border border-dashed p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Supplier Warranty</span>
                <button type="button" onClick={() => setShowWarranty(false)} className="text-xs text-muted-foreground hover:text-foreground">Remove</button>
              </div>
              <div>
                <Label required>Supplier</Label>
                <Input name="warrantySupplier" required placeholder="e.g. Euro Car Parts" className="mt-1" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label required>Purchase Date</Label>
                  <Input name="warrantyPurchaseDate" type="date" required defaultValue={todayStr()} className="mt-1" />
                </div>
                <div>
                  <Label required>Warranty Expiry</Label>
                  <Input name="warrantyExpiryDate" type="date" required defaultValue={yearFromNow()} className="mt-1" />
                </div>
              </div>
              <div>
                <Label optional>Invoice / Receipt Ref</Label>
                <Input name="warrantyInvoiceRef" placeholder="e.g. INV-2026-1234" className="mt-1" />
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? "Adding..." : "Add Item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
