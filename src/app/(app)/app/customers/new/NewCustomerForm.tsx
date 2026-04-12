"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createCustomer } from "../actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function NewCustomerForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const form = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await createCustomer({
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

      router.push(`/app/customers/${result.id}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-5">
      <div>
        <Label htmlFor="fullName">Full Name *</Label>
        <Input id="fullName" name="fullName" required className="mt-1" />
        {fieldErrors.fullName && (
          <p className="mt-1 text-sm text-destructive">{fieldErrors.fullName}</p>
        )}
      </div>

      <div>
        <Label htmlFor="phone">Phone *</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          required
          placeholder="+44 7700 900123"
          className="mt-1"
        />
        {fieldErrors.phone && (
          <p className="mt-1 text-sm text-destructive">{fieldErrors.phone}</p>
        )}
      </div>

      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" className="mt-1" />
        {fieldErrors.email && (
          <p className="mt-1 text-sm text-destructive">{fieldErrors.email}</p>
        )}
      </div>

      <div>
        <Label htmlFor="addressLine1">Address Line 1</Label>
        <Input id="addressLine1" name="addressLine1" className="mt-1" />
      </div>

      <div>
        <Label htmlFor="addressLine2">Address Line 2</Label>
        <Input id="addressLine2" name="addressLine2" className="mt-1" />
      </div>

      <div>
        <Label htmlFor="postcode">Postcode</Label>
        <Input id="postcode" name="postcode" className="mt-1" placeholder="B1 1AA" />
      </div>

      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={3}
          placeholder="Any notes about this customer…"
          className="mt-1"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Adding…" : "Add Customer"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/app/customers")}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
