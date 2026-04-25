"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Plus } from "lucide-react";

import { assignBay, assignTech, unassignTech } from "../actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StaffRoleIcons } from "@/components/ui/staff-role-icons";

interface StaffRow {
  id: string;
  full_name: string;
  roles: string[] | null;
}

interface TeamManagerProps {
  jobId: string;
  currentBayId: string | null;
  bays: { id: string; name: string }[];
  assignedStaff: StaffRow[];
  allStaff: StaffRow[];
}

export function TeamManager({
  jobId,
  currentBayId,
  bays,
  assignedStaff,
  allStaff,
}: TeamManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showStaffPicker, setShowStaffPicker] = useState(false);

  const unassignedStaff = allStaff.filter(
    (s) => !assignedStaff.some((a) => a.id === s.id),
  );

  const handleBayChange = (bayId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await assignBay({ jobId, bayId: bayId || null });
      if (!result.ok) setError(result.error ?? "Failed");
      router.refresh();
    });
  };

  const handleAssign = (staffId: string) => {
    setError(null);
    setShowStaffPicker(false);
    startTransition(async () => {
      const result = await assignTech({ jobId, staffId });
      if (!result.ok) setError(result.error ?? "Failed");
      router.refresh();
    });
  };

  const handleUnassign = (staffId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await unassignTech({ jobId, staffId });
      if (!result.ok) setError(result.error ?? "Failed");
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      {/* Bay picker */}
      <div>
        <label htmlFor="bay-select" className="text-xs font-medium text-muted-foreground">Bay</label>
        <select
          id="bay-select"
          value={currentBayId ?? ""}
          onChange={(e) => handleBayChange(e.target.value)}
          disabled={isPending}
          className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:ring-2 focus:ring-primary/30 focus:outline-none disabled:opacity-50"
        >
          <option value="">Unassigned</option>
          {bays.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>

      {/* Assigned techs */}
      <div>
        <div className="text-xs font-medium text-muted-foreground">Team</div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {assignedStaff.map((s) => (
            <Badge key={s.id} variant="secondary" className="gap-1 pr-1 text-xs">
              {s.full_name}
              <StaffRoleIcons roles={s.roles} />
              <button
                onClick={() => handleUnassign(s.id)}
                disabled={isPending}
                className="ml-1 rounded-full p-1 hover:bg-destructive/20"
                title={`Remove ${s.full_name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}

          {!showStaffPicker ? (
            <Button
              size="sm"
              variant="outline"
              className="h-6 gap-1 px-2 text-xs"
              onClick={() => setShowStaffPicker(true)}
              disabled={unassignedStaff.length === 0}
            >
              <Plus className="h-3 w-3" /> Add
            </Button>
          ) : (
            <select
              autoFocus
              onChange={(e) => { if (e.target.value) handleAssign(e.target.value); }}
              onBlur={() => setShowStaffPicker(false)}
              className="rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm focus:ring-2 focus:ring-primary/30 focus:outline-none"
            >
              <option value="">Select tech...</option>
              {unassignedStaff.map((s) => (
                <option key={s.id} value={s.id}>{s.full_name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
