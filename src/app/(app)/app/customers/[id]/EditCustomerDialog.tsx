"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";

import { updateCustomer } from "../actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

// P1.3 — replaces the previous in-page expand/collapse form. Wraps a true
// modal Dialog so the action is destructive-feeling (overlay + escape-to-
// close) and the layout mirrors NewCustomerForm 1:1 — same field grid,
// same Label `required`/`optional` hints, same error shape — so the user
// learns one form, not two. The only deltas are the id passed to
// updateCustomer + the action button copy ("Save Changes" vs "Add").
export function EditCustomerDialog({ customer }: EditCustomerDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline" className="gap-1.5">
            <Pencil className="h-4 w-4" /> Edit
          </Button>
        }
      />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Customer</DialogTitle>
          <DialogDescription>
            Update {customer.full_name}&apos;s details. Phone changes flow
            through to SMS dispatch on the next outbound message.
          </DialogDescription>
        </DialogHeader>

        <form
          id="edit-customer-form"
          onSubmit={handleSubmit}
          className="space-y-5"
        >
          {/* Mirrors NewCustomerForm.tsx — pair Name + Phone, then Email
              full-width, then Address1 + Address2, Postcode, Notes. */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <Label htmlFor="edit-fullName" required>
                Full Name
              </Label>
              <Input
                id="edit-fullName"
                name="fullName"
                required
                defaultValue={customer.full_name}
                className="mt-1 w-full"
              />
              {fieldErrors.fullName && (
                <p className="mt-1 text-sm text-destructive">
                  {fieldErrors.fullName}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="edit-phone" required>
                Phone
              </Label>
              <Input
                id="edit-phone"
                name="phone"
                type="tel"
                required
                placeholder="+44 7700 900123"
                defaultValue={customer.phone}
                className="mt-1 w-full"
              />
              {fieldErrors.phone && (
                <p className="mt-1 text-sm text-destructive">
                  {fieldErrors.phone}
                </p>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="edit-email" optional>
              Email
            </Label>
            <Input
              id="edit-email"
              name="email"
              type="email"
              defaultValue={customer.email ?? ""}
              className="mt-1 w-full"
            />
            {fieldErrors.email && (
              <p className="mt-1 text-sm text-destructive">
                {fieldErrors.email}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <Label htmlFor="edit-addressLine1" optional>
                Address Line 1
              </Label>
              <Input
                id="edit-addressLine1"
                name="addressLine1"
                defaultValue={customer.address_line1 ?? ""}
                className="mt-1 w-full"
              />
            </div>
            <div>
              <Label htmlFor="edit-addressLine2" optional>
                Address Line 2
              </Label>
              <Input
                id="edit-addressLine2"
                name="addressLine2"
                defaultValue={customer.address_line2 ?? ""}
                className="mt-1 w-full"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="edit-postcode" optional>
              Postcode
            </Label>
            <Input
              id="edit-postcode"
              name="postcode"
              placeholder="B1 1AA"
              defaultValue={customer.postcode ?? ""}
              className="mt-1 w-full sm:max-w-xs"
            />
          </div>

          <div>
            <Label htmlFor="edit-notes" optional>
              Notes
            </Label>
            <Textarea
              id="edit-notes"
              name="notes"
              rows={3}
              placeholder="Any notes about this customer…"
              defaultValue={customer.notes ?? ""}
              className="mt-1 w-full"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="edit-customer-form"
            disabled={isPending}
          >
            {isPending ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
