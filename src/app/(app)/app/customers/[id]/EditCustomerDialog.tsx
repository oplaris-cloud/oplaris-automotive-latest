"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";

import { updateCustomer } from "../actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface EditCustomerDialogProps {
  customer: {
    id: string;
    full_name: string;
    phone: string;
    email: string | null;
    address_line1: string | null;
    address_line2: string | null;
    postcode: string | null;
    notes: string | null;
  };
}

export function EditCustomerDialog({ customer }: EditCustomerDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  if (!open) {
    return (
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
        <Pencil className="h-4 w-4" /> Edit
      </Button>
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const form = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await updateCustomer({
        id: customer.id,
        fullName: (form.get("fullName") as string) ?? "",
        phone: (form.get("phone") as string) ?? "",
        email: (form.get("email") as string) || "",
        addressLine1: (form.get("addressLine1") as string) || "",
        addressLine2: (form.get("addressLine2") as string) || "",
        postcode: (form.get("postcode") as string) || "",
        notes: (form.get("notes") as string) || "",
      });

      if (!result.ok) {
        setError(result.error ?? "Something went wrong");
        if (result.fieldErrors) setFieldErrors(result.fieldErrors);
        return;
      }

      setOpen(false);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-4 rounded-lg border p-4">
      <h3 className="text-sm font-semibold">Edit Customer</h3>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="edit-fullName" required>Full Name</Label>
          <Input id="edit-fullName" name="fullName" required defaultValue={customer.full_name} className="mt-1" />
          {fieldErrors.fullName && <p className="mt-1 text-sm text-destructive">{fieldErrors.fullName}</p>}
        </div>
        <div>
          <Label htmlFor="edit-phone" required>Phone</Label>
          <Input id="edit-phone" name="phone" type="tel" required defaultValue={customer.phone} className="mt-1" />
          {fieldErrors.phone && <p className="mt-1 text-sm text-destructive">{fieldErrors.phone}</p>}
        </div>
        <div>
          <Label htmlFor="edit-email" optional>Email</Label>
          <Input id="edit-email" name="email" type="email" defaultValue={customer.email ?? ""} className="mt-1" />
        </div>
        <div>
          <Label htmlFor="edit-postcode" optional>Postcode</Label>
          <Input id="edit-postcode" name="postcode" defaultValue={customer.postcode ?? ""} className="mt-1" />
        </div>
      </div>
      <div>
        <Label htmlFor="edit-addressLine1" optional>Address Line 1</Label>
        <Input id="edit-addressLine1" name="addressLine1" defaultValue={customer.address_line1 ?? ""} className="mt-1" />
      </div>
      <div>
        <Label htmlFor="edit-addressLine2" optional>Address Line 2</Label>
        <Input id="edit-addressLine2" name="addressLine2" defaultValue={customer.address_line2 ?? ""} className="mt-1" />
      </div>
      <div>
        <Label htmlFor="edit-notes" optional>Notes</Label>
        <Textarea id="edit-notes" name="notes" rows={2} defaultValue={customer.notes ?? ""} className="mt-1" />
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Saving..." : "Save Changes"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
