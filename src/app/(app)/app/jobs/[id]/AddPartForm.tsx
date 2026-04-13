"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { addJobPart } from "../parts/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

const SUPPLIERS = [
  { value: "ecp", label: "ECP" },
  { value: "gsf", label: "GSF" },
  { value: "atoz", label: "A to Z" },
  { value: "ebay", label: "eBay" },
  { value: "other", label: "Other" },
];

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank Transfer" },
];

export function AddPartForm({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [supplier, setSupplier] = useState("ecp");
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Add Part
      </Button>
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const form = new FormData(e.currentTarget);
    form.set("jobId", jobId);
    form.set("purchasedAt", new Date().toISOString());

    // Convert price from pounds to pence
    const priceStr = form.get("price") as string;
    const pricePence = Math.round(parseFloat(priceStr || "0") * 100);
    form.set("unitPricePence", String(pricePence));
    form.delete("price");

    startTransition(async () => {
      const result = await addJobPart(form);
      if (!result.ok) {
        setError(result.error ?? "Failed to add part");
        if (result.fieldErrors) setFieldErrors(result.fieldErrors);
        return;
      }
      setOpen(false);
      formRef.current?.reset();
      router.refresh();
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="mt-3 space-y-3 rounded-lg border p-4">
      <h3 className="text-sm font-semibold">Add Part</h3>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="part-desc">Description *</Label>
          <Input id="part-desc" name="description" required placeholder="e.g. Front brake pads" className="mt-1" />
          {fieldErrors.description && <p className="mt-1 text-xs text-destructive">{fieldErrors.description}</p>}
        </div>
        <div>
          <Label htmlFor="part-supplier">Supplier</Label>
          <select
            id="part-supplier"
            name="supplier"
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:ring-2 focus:ring-primary/30 focus:outline-none"
          >
            {SUPPLIERS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        {supplier === "other" && (
          <div>
            <Label htmlFor="part-supplier-other">Supplier Name *</Label>
            <Input id="part-supplier-other" name="supplierOther" required className="mt-1" />
            {fieldErrors.supplierOther && <p className="mt-1 text-xs text-destructive">{fieldErrors.supplierOther}</p>}
          </div>
        )}
        <div>
          <Label htmlFor="part-qty">Quantity</Label>
          <Input id="part-qty" name="quantity" type="number" min="1" defaultValue="1" required className="mt-1" />
        </div>
        <div>
          <Label htmlFor="part-price">Unit Price (£)</Label>
          <Input id="part-price" name="price" type="number" step="0.01" min="0" required placeholder="25.00" className="mt-1" />
        </div>
        <div>
          <Label htmlFor="part-payment">Payment Method</Label>
          <select
            id="part-payment"
            name="paymentMethod"
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:ring-2 focus:ring-primary/30 focus:outline-none"
          >
            {PAYMENT_METHODS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="part-file">Invoice/Receipt (optional)</Label>
          <Input id="part-file" name="invoiceFile" type="file" accept=".pdf,.jpg,.jpeg,.png" className="mt-1" />
          {fieldErrors.invoiceFile && <p className="mt-1 text-xs text-destructive">{fieldErrors.invoiceFile}</p>}
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Adding..." : "Add Part"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
