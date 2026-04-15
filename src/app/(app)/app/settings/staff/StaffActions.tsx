"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, UserX, UserCheck } from "lucide-react";

import { updateStaffMember, toggleStaffActive } from "./actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";

const ROLES = [
  { value: "manager", label: "Manager" },
  { value: "mot_tester", label: "MOT Tester" },
  { value: "mechanic", label: "Mechanic" },
] as const;

interface EditStaffButtonProps {
  staff: {
    id: string;
    full_name: string;
    email: string;
    phone: string | null;
    roles: string[];
  };
}

export function EditStaffButton({ staff }: EditStaffButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<string[]>(staff.roles);

  function toggleRole(role: string) {
    setSelectedRoles((prev) => {
      if (prev.includes(role)) {
        // Don't allow removing the last role
        if (prev.length === 1) return prev;
        return prev.filter((r) => r !== role);
      }
      return [...prev, role];
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await updateStaffMember({
        staffId: staff.id,
        fullName: (form.get("fullName") as string) || undefined,
        phone: (form.get("phone") as string) || "",
        roles: selectedRoles as ("manager" | "mot_tester" | "mechanic")[],
      });
      if (!result.ok) { setError(result.error ?? "Failed"); return; }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (isOpen) setSelectedRoles(staff.roles);
      }}
    >
      <DialogTrigger className="rounded p-1 text-muted-foreground hover:bg-accent" title="Edit staff">
        <Pencil className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit Staff Member</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label required>Full Name</Label>
            <Input name="fullName" required defaultValue={staff.full_name} className="mt-1" />
          </div>
          <div>
            <Label optional>Phone</Label>
            <Input name="phone" type="tel" defaultValue={staff.phone ?? ""} className="mt-1" />
          </div>
          <div>
            <Label>Email</Label>
            <Input value={staff.email} disabled className="mt-1 opacity-60" />
            <p className="mt-1 text-xs text-muted-foreground">Email cannot be changed after creation.</p>
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
            <p className="mt-1 text-xs text-muted-foreground">
              User must re-login for role changes to take effect.
            </p>
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

interface DeactivateStaffButtonProps {
  staffId: string;
  isActive: boolean;
}

export function DeactivateStaffButton({ staffId, isActive }: DeactivateStaffButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    startTransition(async () => {
      await toggleStaffActive({ staffId, isActive: !isActive });
      router.refresh();
    });
  }

  if (isActive) {
    return (
      <button
        onClick={handleToggle}
        disabled={isPending}
        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
        title="Deactivate"
      >
        <UserX className="h-4 w-4" />
      </button>
    );
  }

  return (
    <Button size="sm" variant="outline" className="gap-1" onClick={handleToggle} disabled={isPending}>
      <UserCheck className="h-3.5 w-3.5" />
      {isPending ? "..." : "Reactivate"}
    </Button>
  );
}
