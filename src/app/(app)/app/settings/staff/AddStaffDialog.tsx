"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";

import { addStaffMember } from "./actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { FormCard } from "@/components/ui/form-card";
import { FormActions } from "@/components/ui/form-actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const ROLES = [
  { value: "manager", label: "Manager" },
  { value: "mot_tester", label: "MOT Tester" },
  { value: "mechanic", label: "Mechanic" },
] as const;

export function AddStaffDialog() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<string[]>(["mechanic"]);

  function toggleRole(role: string) {
    setSelectedRoles((prev) => {
      if (prev.includes(role)) {
        if (prev.length === 1) return prev;
        return prev.filter((r) => r !== role);
      }
      return [...prev, role];
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setSuccess(false);

    const form = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await addStaffMember({
        email: (form.get("email") as string) ?? "",
        password: (form.get("password") as string) ?? "",
        fullName: (form.get("fullName") as string) ?? "",
        phone: (form.get("phone") as string) || "",
        roles: selectedRoles as ("manager" | "mot_tester" | "mechanic")[],
      });
      if (!result.ok) {
        setError(result.error ?? "Failed");
        if (result.fieldErrors) setFieldErrors(result.fieldErrors);
        return;
      }
      setSuccess(true);
      (e.target as HTMLFormElement).reset();
      setSelectedRoles(["mechanic"]);
      router.refresh();
      setTimeout(() => {
        setOpen(false);
        setSuccess(false);
      }, 1200);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (!isOpen) {
          setError(null);
          setFieldErrors({});
          setSuccess(false);
          setSelectedRoles(["mechanic"]);
        }
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm" className="gap-1.5" />
        }
      >
        <UserPlus className="h-4 w-4" /> Add Staff
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Staff Member</DialogTitle>
          <DialogDescription>
            Create a new account. They can log in immediately.
          </DialogDescription>
        </DialogHeader>

        <FormCard variant="plain">
        <form onSubmit={handleSubmit}>
          <FormCard.Fields>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="staff-name" required>Full Name</Label>
              <Input
                id="staff-name"
                name="fullName"
                required
                placeholder="John Smith"
                autoComplete="off"
                className="mt-1"
              />
              {fieldErrors.fullName && (
                <p className="mt-1 text-xs text-destructive">{fieldErrors.fullName}</p>
              )}
            </div>
            <div>
              <Label htmlFor="staff-email" required>Email</Label>
              <Input
                id="staff-email"
                name="email"
                type="email"
                required
                placeholder="john@dudley.local"
                autoComplete="off"
                className="mt-1"
              />
              {fieldErrors.email && (
                <p className="mt-1 text-xs text-destructive">{fieldErrors.email}</p>
              )}
            </div>
            <div>
              <Label htmlFor="staff-password" required>Password</Label>
              <Input
                id="staff-password"
                name="password"
                type="password"
                required
                minLength={8}
                placeholder="Min 8 characters"
                autoComplete="new-password"
                className="mt-1"
              />
              {fieldErrors.password && (
                <p className="mt-1 text-xs text-destructive">{fieldErrors.password}</p>
              )}
            </div>
            <div>
              <Label htmlFor="staff-phone" optional>Phone</Label>
              <Input
                id="staff-phone"
                name="phone"
                type="tel"
                placeholder="Optional"
                autoComplete="off"
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label required>Roles</Label>
            <div className="mt-1 flex flex-col gap-2">
              {ROLES.map((r) => (
                <label key={r.value} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedRoles.includes(r.value)}
                    onChange={() => toggleRole(r.value)}
                    className="h-4 w-4 rounded border-input"
                  />
                  {r.label}
                </label>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && (
            <p className="text-sm text-success">
              Staff member created. They can log in now.
            </p>
          )}

          </FormCard.Fields>
          <FormActions>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating..." : "Create Account"}
            </Button>
          </FormActions>
        </form>
        </FormCard>
      </DialogContent>
    </Dialog>
  );
}
