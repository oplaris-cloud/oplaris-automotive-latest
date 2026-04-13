"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Undo2, CheckCircle } from "lucide-react";

import { updateWarranty, deleteWarranty, claimWarranty, resolveWarrantyClaim } from "../jobs/warranties/actions";
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

interface WarrantyRowActionsProps {
  warranty: {
    id: string;
    supplier: string;
    purchase_date: string;
    expiry_date: string;
    invoice_reference: string | null;
    notes: string | null;
    claim_status: string;
  };
}

export function WarrantyRowActions({ warranty }: WarrantyRowActionsProps) {
  return (
    <div className="flex items-center gap-1">
      {warranty.claim_status === "none" && <ClaimButton warrantyId={warranty.id} />}
      {warranty.claim_status === "claimed" && <ResolveButton warrantyId={warranty.id} />}
      <EditButton warranty={warranty} />
      <DeleteButton warrantyId={warranty.id} />
    </div>
  );
}

function ClaimButton({ warrantyId }: { warrantyId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const reason = (form.get("reason") as string) ?? "";

    startTransition(async () => {
      const result = await claimWarranty({ warrantyId, reason });
      if (!result.ok) { setError(result.error ?? "Failed"); return; }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="rounded p-1 text-warning hover:bg-warning/10" title="Claim warranty">
        <Undo2 className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Claim Warranty</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label required>Why are you claiming?</Label>
            <Textarea name="reason" required rows={3} placeholder="e.g. Part failed after 2 weeks" className="mt-1" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? "Claiming..." : "Submit Claim"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResolveButton({ warrantyId }: { warrantyId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await resolveWarrantyClaim({
        warrantyId,
        resolution: (form.get("resolution") as string) ?? "",
        status: (form.get("status") as "resolved" | "rejected") ?? "resolved",
      });
      if (!result.ok) { setError(result.error ?? "Failed"); return; }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="rounded p-1 text-success hover:bg-success/10" title="Resolve claim">
        <CheckCircle className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Resolve Claim</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label required>Outcome</Label>
            <select name="status" className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="resolved">Resolved (supplier accepted)</option>
              <option value="rejected">Rejected (supplier declined)</option>
            </select>
          </div>
          <div>
            <Label required>Resolution details</Label>
            <Textarea name="resolution" required rows={2} placeholder="e.g. Supplier sent replacement part" className="mt-1" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditButton({ warranty }: { warranty: WarrantyRowActionsProps["warranty"] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await updateWarranty({
        warrantyId: warranty.id,
        supplier: (form.get("supplier") as string) || undefined,
        purchaseDate: (form.get("purchaseDate") as string) || undefined,
        expiryDate: (form.get("expiryDate") as string) || undefined,
        invoiceReference: (form.get("invoiceReference") as string) ?? "",
        notes: (form.get("notes") as string) ?? "",
      });
      if (!result.ok) { setError(result.error ?? "Failed"); return; }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="rounded p-1 text-muted-foreground hover:bg-accent" title="Edit warranty">
        <Pencil className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Warranty</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label required>Supplier</Label>
            <Input name="supplier" required defaultValue={warranty.supplier} className="mt-1" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label required>Purchase Date</Label>
              <Input name="purchaseDate" type="date" required defaultValue={warranty.purchase_date} className="mt-1" />
            </div>
            <div>
              <Label required>Expiry Date</Label>
              <Input name="expiryDate" type="date" required defaultValue={warranty.expiry_date} className="mt-1" />
            </div>
          </div>
          <div>
            <Label optional>Invoice Ref</Label>
            <Input name="invoiceReference" defaultValue={warranty.invoice_reference ?? ""} className="mt-1" />
          </div>
          <div>
            <Label optional>Notes</Label>
            <Textarea name="notes" rows={2} defaultValue={warranty.notes ?? ""} className="mt-1" />
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

function DeleteButton({ warrantyId }: { warrantyId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function handleDelete() {
    startTransition(async () => {
      await deleteWarranty(warrantyId);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Delete warranty">
        <Trash2 className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete Warranty</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Are you sure you want to delete this warranty record? This cannot be undone.
        </p>
        <DialogFooter>
          <Button size="sm" variant="destructive" onClick={handleDelete} disabled={isPending}>
            {isPending ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
