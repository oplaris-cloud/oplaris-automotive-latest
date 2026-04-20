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
  resendQuote,
  revertToQuoted,
  markAsPaid,
  revertToInvoiced,
} from "../charges/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/lib/toast";
import { CheckCircle2, Banknote } from "lucide-react";
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

type PaymentMethod = "cash" | "card" | "bank_transfer" | "other";

interface ChargesSectionProps {
  jobId: string;
  charges: Charge[];
  invoice: {
    quoteStatus: string;
    subtotalPence: number;
    vatPence: number;
    totalPence: number;
    /** Migration 045 — bumps on every CRUD while `quoted`. */
    revision: number;
    /** Auto-maintained by DB trigger (migration 045). */
    updatedAt: string | null;
    /** Migration 046 — stamped when `quoteStatus === 'paid'`. */
    paidAt: string | null;
    paymentMethod: PaymentMethod | null;
  } | null;
}

function pence(p: number): string {
  return `£${(p / 100).toFixed(2)}`;
}

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  bank_transfer: "Bank transfer",
  other: "Other",
};

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
  const revision = invoice?.revision ?? 1;
  const isDraft = status === "draft";
  const isQuoted = status === "quoted";
  const isInvoiced = status === "invoiced";
  const isPaid = status === "paid";
  // Migration 045 — charges are editable on both draft AND quoted.
  // Migrations 045 + 046 — invoiced AND paid are read-only. Managers
  // must explicitly revert to unlock.
  const isEditable = isDraft || isQuoted;

  function handleRemove(chargeId: string) {
    startTransition(async () => {
      const result = await removeCharge(chargeId);
      if (!result.ok) {
        toast.error(result.error ?? "Could not remove charge");
        return;
      }
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
      const result = await markAsQuoted(jobId);
      if (!result.ok) {
        toast.error(result.error ?? "Could not send quote");
        return;
      }
      toast.success("Quote sent to customer");
      router.refresh();
    });
  }

  function handleResendQuote() {
    startTransition(async () => {
      const result = await resendQuote(jobId);
      if (!result.ok) {
        toast.error(result.error ?? "Could not resend quote");
        return;
      }
      toast.success(
        revision > 1
          ? `Updated quote sent (rev ${revision})`
          : "Quote resent to customer",
      );
      router.refresh();
    });
  }

  function handleGenerateInvoice() {
    startTransition(async () => {
      const result = await markAsInvoiced(jobId);
      if (!result.ok) {
        toast.error(result.error ?? "Could not generate invoice");
        return;
      }
      // Also open the PDF
      window.open(`/api/invoices/${jobId}`, "_blank");
      router.refresh();
    });
  }

  // Wrapped in a promise so `ConfirmDialog` can await it and show the
  // pending spinner while the RPC round-trips.
  async function handleRevertToQuoted() {
    const result = await revertToQuoted(jobId);
    if (!result.ok) {
      toast.error(result.error ?? "Could not revert invoice");
      return;
    }
    toast.success("Invoice reverted to quoted — charges are editable again");
    router.refresh();
  }

  async function handleMarkAsPaid(method: PaymentMethod) {
    const result = await markAsPaid({ jobId, paymentMethod: method });
    if (!result.ok) {
      toast.error(result.error ?? "Could not record payment");
      return;
    }
    toast.success(`Payment recorded — ${PAYMENT_LABELS[method]}`);
    router.refresh();
  }

  async function handleRevertToInvoiced() {
    const result = await revertToInvoiced(jobId);
    if (!result.ok) {
      toast.error(result.error ?? "Could not revert payment");
      return;
    }
    toast.success("Payment cleared — invoice is editable again");
    router.refresh();
  }

  return (
    <div>
      {/* V046 — PAID banner sits above the Charges header so managers
       *  see the payment state first + can't miss that the invoice is
       *  now read-only. Green success tokens; date + method come from
       *  the invoice row. */}
      {isPaid && invoice ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-success/40 bg-success/10 p-3">
          <CheckCircle2 className="h-5 w-5 text-success" />
          <div className="flex-1 text-sm">
            <span className="font-semibold text-success">Paid</span>
            {invoice.paidAt ? (
              <span className="ml-2 text-muted-foreground">
                {new Date(invoice.paidAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            ) : null}
            {invoice.paymentMethod ? (
              <span className="ml-2 text-muted-foreground">
                · {PAYMENT_LABELS[invoice.paymentMethod]}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">Charges</h2>
          <Badge
            variant={
              isPaid || isInvoiced
                ? "default"
                : isQuoted
                  ? "secondary"
                  : "outline"
            }
            className="capitalize"
          >
            {status}
          </Badge>
          {revision > 1 ? (
            <Badge variant="outline" className="text-[11px]">
              Rev {revision}
            </Badge>
          ) : null}
        </div>
        {isEditable && (
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
                {isEditable && (
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

      {/* Action buttons — tiered by `quote_status` (migration 045).
       *  draft    → Send Quote + Generate Invoice
       *  quoted   → Resend quote (updated SMS copy on rev > 1) + Generate Invoice
       *  invoiced → View PDF + Revert to quoted (destructive confirm) */}
      {charges.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {isDraft ? (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={handleSendQuote} disabled={isPending}>
              <Send className="h-4 w-4" /> Send Quote
            </Button>
          ) : null}

          {isQuoted ? (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={handleResendQuote}
              disabled={isPending}
            >
              <Send className="h-4 w-4" />
              {revision > 1 ? "Resend updated quote" : "Resend quote"}
            </Button>
          ) : null}

          {(isQuoted || isDraft) && (
            <Button size="sm" className="gap-1.5" onClick={handleGenerateInvoice} disabled={isPending}>
              <FileText className="h-4 w-4" /> Generate Invoice
            </Button>
          )}

          {isInvoiced ? (
            <>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => window.open(`/api/invoices/${jobId}`, "_blank")}
              >
                <FileText className="h-4 w-4" /> View Invoice PDF
              </Button>
              <MarkAsPaidDialog
                totalPence={invoice?.totalPence ?? 0}
                onConfirm={handleMarkAsPaid}
                disabled={isPending}
              />
              <ConfirmDialog
                trigger={
                  <Button
                    size="sm"
                    variant="destructive"
                    className="gap-1.5"
                    disabled={isPending}
                  >
                    <Send className="h-4 w-4" /> Revert to quoted
                  </Button>
                }
                title="Revert this invoice to quoted?"
                description="Charges become editable again. The invoice number and revision history are preserved."
                confirmLabel="Revert"
                destructive
                onConfirm={handleRevertToQuoted}
              />
            </>
          ) : null}

          {isPaid ? (
            <>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => window.open(`/api/invoices/${jobId}`, "_blank")}
              >
                <FileText className="h-4 w-4" /> View Invoice PDF
              </Button>
              <ConfirmDialog
                trigger={
                  <Button
                    size="sm"
                    variant="destructive"
                    className="gap-1.5"
                    disabled={isPending}
                  >
                    Revert payment
                  </Button>
                }
                title="Revert the recorded payment?"
                description="The invoice returns to the invoiced state. The customer's PAID badge will disappear."
                confirmLabel="Revert payment"
                destructive
                onConfirm={handleRevertToInvoiced}
              />
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// Mark as Paid Dialog (migration 046)
// ------------------------------------------------------------------

function MarkAsPaidDialog({
  totalPence,
  onConfirm,
  disabled,
}: {
  totalPence: number;
  onConfirm: (method: PaymentMethod) => Promise<void>;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    try {
      setSubmitting(true);
      await onConfirm(method);
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" className="gap-1.5" disabled={disabled}>
            <Banknote className="h-4 w-4" /> Mark as paid
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-lg bg-muted p-3 text-center">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Amount
            </div>
            <div className="mt-1 text-2xl font-bold tabular-nums">
              {pence(totalPence)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Partial payments are not yet supported — this records the full invoice.
            </div>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Payment method</legend>
            {(["cash", "card", "bank_transfer", "other"] as PaymentMethod[]).map(
              (m) => (
                <label
                  key={m}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 hover:bg-muted/50"
                >
                  <input
                    type="radio"
                    name="payment-method"
                    value={m}
                    checked={method === m}
                    onChange={() => setMethod(m)}
                    className="h-4 w-4"
                  />
                  <span className="text-sm">{PAYMENT_LABELS[m]}</span>
                </label>
              ),
            )}
          </fieldset>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Recording…" : "Record payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
