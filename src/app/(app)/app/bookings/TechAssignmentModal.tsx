"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

import { promoteBookingToJob, getStaffAvailability, type StaffAvailability } from "./actions";
import { Button } from "@/components/ui/button";
import { StaffAvatar } from "@/components/ui/staff-avatar";

/** Shorten name to "First L." format */
function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return fullName;
  return `${parts[0]} ${parts[parts.length - 1]![0]}.`;
}

interface TechAssignmentModalProps {
  bookingId: string;
  onClose: () => void;
}

export function TechAssignmentModal({ bookingId, onClose }: TechAssignmentModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [staff, setStaff] = useState<StaffAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmBusy, setConfirmBusy] = useState<StaffAvailability | null>(null);

  useEffect(() => {
    getStaffAvailability().then((data) => {
      setStaff(data);
      setLoading(false);
    });
  }, []);

  const handleSelect = (tech: StaffAvailability) => {
    if (tech.isBusy) {
      setConfirmBusy(tech);
      return;
    }
    doPromote(tech.id);
  };

  const doPromote = (staffId: string) => {
    setError(null);
    setConfirmBusy(null);
    startTransition(async () => {
      const result = await promoteBookingToJob({
        bookingId,
        assignedStaffId: staffId,
      });
      if (!result.ok) {
        setError(result.error ?? "Failed to create job");
        return;
      }
      router.push(`/app/jobs/${result.id}`);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="text-center flex-1">
            <h2 className="text-2xl font-bold text-gray-900">Creating Job</h2>
            <p className="mt-1 text-gray-500">Select a technician to assign the job</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="mt-10 text-center text-gray-400">Loading technicians...</div>
        ) : staff.length === 0 ? (
          <div className="mt-10 flex flex-col items-center gap-3 text-center text-gray-400">
            <p>No staff found. Add staff members first.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { onClose(); router.push("/app/settings/staff"); }}
            >
              Go to Settings → Staff
            </Button>
          </div>
        ) : (
          /* Tech avatar grid — 5 per row */
          <div className="mt-8 flex flex-wrap justify-center gap-6">
            {staff.map((tech) => (
              <button
                key={tech.id}
                onClick={() => handleSelect(tech)}
                disabled={isPending}
                className="flex w-20 flex-col items-center gap-2 transition-transform hover:scale-105 active:scale-95 disabled:opacity-50"
              >
                {/* Circle avatar */}
                <div
                  className={`flex h-20 w-20 items-center justify-center rounded-full border-[3px] ${
                    tech.isBusy
                      ? "border-red-300 bg-red-50 text-red-400"
                      : "border-green-400 bg-green-50 text-green-600"
                  }`}
                >
                  <StaffAvatar
                    src={tech.avatar_url}
                    name={tech.full_name}
                    size={74}
                    className={tech.avatar_url ? "" : ""}
                  />
                </div>
                {/* Name */}
                <span className="text-center text-xs font-semibold text-gray-700 leading-tight">
                  {shortName(tech.full_name)}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Legend */}
        <div className="mt-8 flex items-center justify-center gap-6 text-sm font-medium">
          <span className="flex items-center gap-2">
            <span className="h-4 w-4 rounded-full bg-red-400" /> Busy
          </span>
          <span className="flex items-center gap-2">
            <span className="h-4 w-4 rounded-full bg-green-500" /> Free
          </span>
        </div>

        {/* Busy confirmation */}
        {confirmBusy && (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
            <p className="text-sm text-gray-700">
              <strong>{confirmBusy.full_name}</strong> is currently working on{" "}
              <span className="font-mono font-medium">{confirmBusy.currentJobNumber ?? "a job"}</span>.
              Assign anyway?
            </p>
            <div className="mt-3 flex justify-center gap-3">
              <Button
                size="sm"
                onClick={() => doPromote(confirmBusy.id)}
                disabled={isPending}
              >
                {isPending ? "Creating..." : "Yes, assign"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setConfirmBusy(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {error && <p className="mt-4 text-center text-sm text-red-600">{error}</p>}

        {isPending && !confirmBusy && (
          <div className="mt-4 text-center text-sm text-gray-400">
            Creating job and assigning technician...
          </div>
        )}
      </div>
    </div>
  );
}
