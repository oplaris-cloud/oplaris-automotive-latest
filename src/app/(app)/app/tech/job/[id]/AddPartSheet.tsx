"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Package } from "lucide-react";

import { addJobPart } from "../../../jobs/parts/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { FormCard } from "@/components/ui/form-card";
import { FormActions } from "@/components/ui/form-actions";
import { toast } from "@/lib/toast";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

// Mirrors AddPartForm.tsx on the manager surface. Labels live here
// (not in parts/actions.ts) because the action file holds the raw
// zod enum values.
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

export function AddPartSheet({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [supplier, setSupplier] = useState("ecp");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);

  const isMobile = useMediaQuery("(max-width: 639px)");
  const side = isMobile ? "bottom" : "right";

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFieldErrors({});

    const form = new FormData(e.currentTarget);
    form.set("jobId", jobId);
    form.set("purchasedAt", new Date().toISOString());

    // Coerce £X.YY → pence integer so the zod schema is happy.
    const priceField = form.get("unitPricePounds");
    if (typeof priceField === "string" && priceField.trim()) {
      const pounds = Number(priceField);
      if (Number.isFinite(pounds) && pounds >= 0) {
        form.set("unitPricePence", String(Math.round(pounds * 100)));
      }
    }
    form.delete("unitPricePounds");

    startTransition(async () => {
      const result = await addJobPart(form);
      if (result.ok) {
        toast.success("Part added");
        formRef.current?.reset();
        setSupplier("ecp");
        setOpen(false);
        router.refresh();
      } else if (result.fieldErrors) {
        setFieldErrors(result.fieldErrors);
      } else {
        toast.error(result.error ?? "Failed to add part");
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            size="lg"
            variant="outline"
            className="h-auto min-h-11 flex-col gap-1 text-xs sm:text-sm"
          />
        }
      >
        <Package className="h-5 w-5" />
        Add part
      </SheetTrigger>
      <SheetContent
        side={side}
        className="flex flex-col gap-0 p-0 sm:max-w-lg"
      >
        <SheetHeader className="border-b">
          <SheetTitle>Add part</SheetTitle>
          <SheetDescription>
            Log a part used on this job. Syncs to the invoice automatically.
          </SheetDescription>
        </SheetHeader>
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-4"
          encType="multipart/form-data"
        >
          <FormCard>
            <div className="space-y-2">
              <Label htmlFor="description">
                Part description <span aria-hidden>*</span>
              </Label>
              <Input
                id="description"
                name="description"
                placeholder="Front brake pads"
                required
                aria-invalid={!!fieldErrors.description}
              />
              {fieldErrors.description ? (
                <p role="alert" className="text-xs text-destructive">
                  {fieldErrors.description}
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="quantity">
                  Qty <span aria-hidden>*</span>
                </Label>
                <Input
                  id="quantity"
                  name="quantity"
                  type="number"
                  min={1}
                  defaultValue={1}
                  required
                  aria-invalid={!!fieldErrors.quantity}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unitPricePounds">
                  Unit price (£) <span aria-hidden>*</span>
                </Label>
                <Input
                  id="unitPricePounds"
                  name="unitPricePounds"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  required
                  aria-invalid={!!fieldErrors.unitPricePence}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="supplier">
                Supplier <span aria-hidden>*</span>
              </Label>
              <select
                id="supplier"
                name="supplier"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                required
              >
                {SUPPLIERS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              {supplier === "other" ? (
                <Input
                  name="supplierOther"
                  placeholder="Which supplier?"
                  aria-label="Supplier name"
                  aria-invalid={!!fieldErrors.supplierOther}
                  className="mt-2"
                />
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentMethod">
                Payment <span aria-hidden>*</span>
              </Label>
              <select
                id="paymentMethod"
                name="paymentMethod"
                defaultValue="card"
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                required
              >
                {PAYMENT_METHODS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="receipt">
                Receipt <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="receipt"
                name="receipt"
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                capture="environment"
              />
              <p className="text-xs text-muted-foreground">
                PDF, JPEG, or PNG. Max 10 MB.
              </p>
            </div>
          </FormCard>
          <FormActions>
            <Button type="submit" size="lg" disabled={isPending}>
              {isPending ? "Saving…" : "Save part"}
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
          </FormActions>
        </form>
      </SheetContent>
    </Sheet>
  );
}
