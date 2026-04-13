"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";

import { addStaffMember } from "./actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

const ROLES = [
  { value: "manager", label: "Manager" },
  { value: "mot_tester", label: "MOT Tester" },
  { value: "mechanic", label: "Mechanic" },
];

export function AddStaffDialog() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);

  if (!open) {
    return (
      <Button size="sm" className="gap-1.5" onClick={() => { setOpen(true); setSuccess(false); }}>
        <UserPlus className="h-4 w-4" /> Add Staff
      </Button>
    );
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
        role: (form.get("role") as "manager" | "mot_tester" | "mechanic") ?? "mechanic",
      });
      if (!result.ok) {
        setError(result.error ?? "Failed");
        if (result.fieldErrors) setFieldErrors(result.fieldErrors);
        return;
      }
      setSuccess(true);
      (e.target as HTMLFormElement).reset();
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border p-4 space-y-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <UserPlus className="h-4 w-4" /> Add Staff Member
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="staff-name" required>Full Name</Label>
          <Input id="staff-name" name="fullName" required placeholder="John Smith" className="mt-1" />
          {fieldErrors.fullName && <p className="mt-1 text-xs text-destructive">{fieldErrors.fullName}</p>}
        </div>
        <div>
          <Label htmlFor="staff-email" required>Email</Label>
          <Input id="staff-email" name="email" type="email" required placeholder="john@dudley.local" className="mt-1" />
          {fieldErrors.email && <p className="mt-1 text-xs text-destructive">{fieldErrors.email}</p>}
        </div>
        <div>
          <Label htmlFor="staff-password" required>Password</Label>
          <Input id="staff-password" name="password" type="password" required minLength={8} placeholder="Min 8 characters" className="mt-1" />
          {fieldErrors.password && <p className="mt-1 text-xs text-destructive">{fieldErrors.password}</p>}
        </div>
        <div>
          <Label htmlFor="staff-phone" optional>Phone</Label>
          <Input id="staff-phone" name="phone" type="tel" placeholder="Optional" className="mt-1" />
        </div>
        <div>
          <Label htmlFor="staff-role" required>Role</Label>
          <select
            id="staff-role"
            name="role"
            required
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:ring-2 focus:ring-primary/30 focus:outline-none"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && <p className="text-sm text-green-600">Staff member created. They can log in now.</p>}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Creating..." : "Create Account"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
