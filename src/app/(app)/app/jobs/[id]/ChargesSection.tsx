"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Calculator, FileText, Send } from "lucide-react";

import {
  addCharge,
  updateCharge,
  removeCharge,
  suggestLabourFromLogs,
  markAsQuoted,
  markAsInvoiced,
} from "../charges/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Charge {
  id: string;
  charge_type: string;
  description: string;
  quantity: number;
  unit_price_pence: number;
}

interface ChargesSectionProps {
  jobId: string;
  charges: Charge[];
  invoice: {
    quoteStatus: string;
    subtotalPence: number;
    vatPence: number;
    totalPence: number;
  } | null;
}

function pence(p: number): string {
  return `£${(p / 100).toFixed(2)}`;
}

function lineTotal(c: Charge): number {
  return Math.round(Number(c.quantity) * c.unit_price_pence);
}

interface PrefillCharge {
  chargeType: "labour" | "part" | "other";
  description: string;
  quantity: number;
  unitPricePence: number;
}

export function ChargesSection({ jobId, charges, invoice }: ChargesSectionProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // P40: opening the AddChargeDialog with a labour suggestion pre-filled.
  // Manager can edit any field before saving.
  const [chargePrefill, setChargePrefill] = useState<PrefillCharge | null>(null);

  const subtotal = charges.reduce((sum, c) => sum + lineTotal(c), 0);
  const vat = Math.round(subtotal * 0.2);
  const grandTotal = subtotal + vat;

  const status = invoice?.quoteStatus ?? "draft";
  const isDraft = status === "draft";

  function handleRemove(chargeId: string) {
    startTransition(async () => {
      await removeCharge(chargeId);
      router.refresh();
    });
  }

  function handleSuggestLabour() {
    setError(null);
    startTransition(async () => {
      const result = await suggestLabourFromLogs(jobId);
      if (!result.ok) {
        setError(result.error ?? "No work logs found");
        return;
      }
      // Open the AddChargeDialog with the suggestion pre-filled — the
      // manager confirms (or edits) before any DB write.
      setChargePrefill({
        chargeType: "labour",
        description: result.description ?? "Labour",
        quantity: result.hours ?? 1,
        unitPricePence: result.ratePence ?? 7500,
      });
    });
  }

  function handleSendQuote() {
    startTransition(async () => {
      await markAsQuoted(jobId);
      router.refresh();
    });
  }

  function handleGenerateInvoice() {
    startTransition(async () => {
      await markAsInvoiced(jobId);
      // Also open the PDF
      window.open(`/api/invoices/${jobId}`, "_blank");
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Charges</h2>
          <Badge variant={status === "invoiced" ? "default" : status === "quoted" ? "secondary" : "outline"} className="capitalize">
            {status}
          </Badge>
        </div>
        {isDraft && (
          <div className="flex gap-2">
            <AddChargeDialog
              jobId={jobId}
              prefill={chargePrefill}
              onClose={() => setChargePrefill(null)}
            />
            <Button size="sm" variant="outline" className="gap-1" onClick={handleSuggestLabour} disabled={isPending}>
              <Calculator className="h-3.5 w-3.5" /> Labour from logs
            </Button>
          </div>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      {charges.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No charges yet. Add parts, labour, or other charges.</p>
      ) : (
        <div className="mt-3 rounded-lg border">
          {/* Header */}
          <div className="grid grid-cols-12 gap-2 border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground uppercase">
            <div className="col-span-1">Type</div>
            <div className="col-span-5">Description</div>
            <div className="col-span-2 text-right">Qty</div>
            <div className="col-span-2 text-right">Unit Price</div>
            <div className="col-span-1 text-right">Total</div>
            <div className="col-span-1"></div>
          </div>

          {/* Rows */}
          {charges.map((c) => (
            <div key={c.id} className="grid grid-cols-12 items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0">
              <div className="col-span-1">
                <Badge variant="outline" className="text-xs capitalize">{c.charge_type}</Badge>
              </div>
              <div className="col-span-5">{c.description}</div>
              <div className="col-span-2 text-right font-mono">{Number(c.quantity)}</div>
              <div className="col-span-2 text-right font-mono">{pence(c.unit_price_pence)}</div>
              <div className="col-span-1 text-right font-mono font-medium">{pence(lineTotal(c))}</div>
              <div className="col-span-1 flex justify-end gap-1">
                {isDraft && (
                  <>
                    <EditChargeButton charge={c} />
                    <button
                      onClick={() => handleRemove(c.id)}
                      disabled={isPending}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                      aria-label="Delete charge"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}

          {/* Totals */}
          <div className="border-t bg-muted/30 px-3 py-2 space-y-1">
            <div className="flex justify-between text-sm">
              <span>Subtotal</span>
              <span className="font-mono">{pence(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>VAT (20%)</span>
              <span className="font-mono">{pence(vat)}</span>
            </div>
            <div className="flex justify-between text-base font-bold border-t pt-1">
              <span>Grand Total</span>
              <span className="font-mono">{pence(grandTotal)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Action buttons */}
      {charges.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {isDraft && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={handleSendQuote} disabled={isPending}>
              <Send className="h-4 w-4" /> Send Quote
            </Button>
          )}
          {(status === "quoted" || status === "draft") && (
            <Button size="sm" className="gap-1.5" onClick={handleGenerateInvoice} disabled={isPending}>
              <FileText className="h-4 w-4" /> Generate Invoice
            </Button>
          )}
          {status === "invoiced" && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => window.open(`/api/invoices/${jobId}`, "_blank")}
            >
              <FileText className="h-4 w-4" /> View Invoice PDF
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// Add Charge Dialog
// ------------------------------------------------------------------

interface AddChargePrefill {
  chargeType: "labour" | "part" | "other";
  description: string;
  quantity: number;
  unitPricePence: number;
}

// ------------------------------------------------------------------
// P39.3 — Edit existing charge
// ------------------------------------------------------------------

function EditChargeButton({ charge }: { charge: Charge }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const description = ((form.get("description") as string) ?? "").trim();
    if (!description) {
      setError("Description is required");
      return;
    }
    const priceStr = form.get("unitPrice") as string;

    startTransition(async () => {
      const result = await updateCharge({
        chargeId: charge.id,
        description,
        quantity: Number(form.get("quantity") || 1),
        unitPricePence: priceStr ? Math.round(parseFloat(priceStr) * 100) : 0,
      });
      if (!result.ok) {
        setError(result.error ?? "Failed");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Edit charge"
          />
        }
      >
        <Pencil className="h-3.5 w-3.5" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit Charge</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label required>Description</Label>
            <Input
              name="description"
              defaultValue={charge.description}
              required
              className="mt-1"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label required>Quantity</Label>
              <Input
                name="quantity"
                type="number"
                step="0.01"
                min="0.01"
                required
                defaultValue={Number(charge.quantity)}
                className="mt-1"
              />
            </div>
            <div>
              <Label required>Unit Price (£)</Label>
              <Input
                name="unitPrice"
                type="number"
                step="0.01"
                min="0"
                required
                defaultValue={(charge.unit_price_pence / 100).toFixed(2)}
                className="mt-1"
              />
            </div>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddChargeDialog({
  jobId,
  prefill,
  onClose,
}: {
  jobId: string;
  /** When set, the dialog opens pre-filled (e.g. from "Labour from logs"). */
  prefill?: AddChargePrefill | null;
  onClose?: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Internal open state for the manual "Add Charge" path. The pre-fill
  // path is controlled entirely by the parent — when `prefill` is set
  // the dialog is open; clearing it (via `onClose`) closes the dialog.
  const [internalOpen, setInternalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = prefill ? true : internalOpen;

  function close() {
    setInternalOpen(false);
    onClose?.();
  }

  function handleOpenChange(next: boolean) {
    if (!next) close();
    else setInternalOpen(true);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const priceStr = form.get("unitPrice") as string;
    const description = ((form.get("description") as string) ?? "").trim();

    if (!description) {
      setError("Description is required");
      return;
    }

    startTransition(async () => {
      const result = await addCharge({
        jobId,
        chargeType: (form.get("chargeType") as "part" | "labour" | "other") ?? "other",
        description,
        quantity: Number(form.get("quantity") || 1),
        unitPricePence: priceStr ? Math.round(parseFloat(priceStr) * 100) : 0,
      });
      if (!result.ok) { setError(result.error ?? "Failed"); return; }
      close();
      router.refresh();
    });
  }

  // Pre-fill values fall back to friendly defaults.
  const initialType = prefill?.chargeType ?? "labour";
  const initialDescription = prefill?.description ?? "";
  const initialQuantity = prefill?.quantity ?? 1;
  const initialUnitPrice =
    prefill?.unitPricePence != null ? (prefill.unitPricePence / 100).toFixed(2) : "";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button size="sm" variant="outline" className="gap-1" />}>
        <Plus className="h-3.5 w-3.5" /> Add Charge
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{prefill ? "Add Labour Charge" : "Add Charge"}</DialogTitle>
        </DialogHeader>
        {/* `key` forces React to remount the form when the prefill arrives,
            so the defaultValues actually take effect. */}
        <form
          key={prefill ? `prefill-${prefill.description}-${prefill.quantity}` : "blank"}
          onSubmit={handleSubmit}
          className="space-y-3"
        >
          <div>
            <Label required>Type</Label>
            <select
              name="chargeType"
              defaultValue={initialType}
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="labour">Labour</option>
              <option value="part">Part</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <Label required>Description</Label>
            <Input
              name="description"
              defaultValue={initialDescription}
              required
              placeholder="e.g. Diagnostic + repair"
              className="mt-1"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label required>Quantity</Label>
              <Input
                name="quantity"
                type="number"
                step="0.01"
                min="0.01"
                required
                defaultValue={initialQuantity}
                className="mt-1"
              />
            </div>
            <div>
              <Label required>Unit Price (£)</Label>
              <Input
                name="unitPrice"
                type="number"
                step="0.01"
                min="0"
                required
                defaultValue={initialUnitPrice}
                placeholder="e.g. 75.00"
                className="mt-1"
              />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? "Adding..." : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
