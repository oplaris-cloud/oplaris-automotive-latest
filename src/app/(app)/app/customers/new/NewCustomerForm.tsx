"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createCustomer } from "../actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FormCard } from "@/components/ui/form-card";
import { FormActions } from "@/components/ui/form-actions";

export function NewCustomerForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // B4 — Trade flag, defaults off.
  const [isTrader, setIsTrader] = useState(false);

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
        isTrader,
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
    <FormCard variant="plain" className="mt-6">
    <form onSubmit={handleSubmit}>
      <FormCard.Fields>
      {/* P38.4 — pair Name + Phone, Address1 + Address2, Postcode + Email
          on sm+; stack on mobile. */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="fullName" required>Full Name</Label>
          <Input id="fullName" name="fullName" required className="mt-1 w-full" />
          {fieldErrors.fullName && (
            <p className="mt-1 text-sm text-destructive">{fieldErrors.fullName}</p>
          )}
        </div>
        <div>
          <Label htmlFor="phone" required>Phone</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            required
            placeholder="+44 7700 900123"
            className="mt-1 w-full"
          />
          {fieldErrors.phone && (
            <p className="mt-1 text-sm text-destructive">{fieldErrors.phone}</p>
          )}
        </div>
      </div>

      <div>
        <Label htmlFor="email" optional>Email</Label>
        <Input id="email" name="email" type="email" className="mt-1 w-full" />
        {fieldErrors.email && (
          <p className="mt-1 text-sm text-destructive">{fieldErrors.email}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="addressLine1" optional>Address Line 1</Label>
          <Input id="addressLine1" name="addressLine1" className="mt-1 w-full" />
        </div>
        <div>
          <Label htmlFor="addressLine2" optional>Address Line 2</Label>
          <Input id="addressLine2" name="addressLine2" className="mt-1 w-full" />
        </div>
      </div>

      <div>
        <Label htmlFor="postcode" optional>Postcode</Label>
        <Input id="postcode" name="postcode" className="mt-1 w-full sm:max-w-xs" placeholder="B1 1AA" />
      </div>

      <div>
        <Label htmlFor="notes" optional>Notes</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={3}
          placeholder="Any notes about this customer…"
          className="mt-1 w-full"
        />
      </div>

      {/* B4 — Trade-customer toggle. Off by default. */}
      <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/30 p-3">
        <Switch
          id="isTrader"
          checked={isTrader}
          onCheckedChange={(v) => setIsTrader(v as boolean)}
          aria-describedby="isTrader-help"
        />
        <div className="flex-1">
          <Label
            htmlFor="isTrader"
            className="cursor-pointer text-sm font-medium"
          >
            TRADER
          </Label>
          <p
            id="isTrader-help"
            className="mt-1 text-xs text-muted-foreground"
          >
            Trade customer — billing + pricing may differ.
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      </FormCard.Fields>
      <FormActions>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/app/customers")}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Adding…" : "Add Customer"}
        </Button>
      </FormActions>
    </form>
    </FormCard>
  );
}
