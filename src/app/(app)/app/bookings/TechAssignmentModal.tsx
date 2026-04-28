"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X } from "lucide-react";

import {
  createJobFromCheckIn,
  getStaffAvailability,
  type StaffAvailability,
} from "./actions";
import { groupTechsByAvailability } from "./group-techs";
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

export function TechAssignmentModal({
  bookingId,
  onClose,
}: TechAssignmentModalProps) {
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

  const { available, busy } = groupTechsByAvailability(staff);

  const handleSelect = (tech: StaffAvailability): void => {
    if (tech.isBusy) {
      setConfirmBusy(tech);
      return;
    }
    doCreate(tech.id);
  };

  const doCreate = (technicianId: string): void => {
    setError(null);
    setConfirmBusy(null);
    startTransition(async () => {
      const result = await createJobFromCheckIn({
        bookingId,
        technicianId,
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
            <p className="mt-1 text-gray-500">
              Select a technician to assign the job
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="mt-10 text-center text-gray-400">
            Loading technicians...
          </div>
        ) : staff.length === 0 ? (
          <div className="mt-10 flex flex-col items-center gap-3 text-center text-gray-400">
            <p>No technicians found. Add a mechanic or MOT tester first.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onClose();
                router.push("/app/settings/staff");
              }}
            >
              Go to Settings → Staff
            </Button>
          </div>
        ) : (
          <div className="mt-8 space-y-6">
            {/* Available section — listed first per spec */}
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-success">
                Available now ({available.length})
              </h3>
              {available.length === 0 ? (
                <p className="mt-2 text-sm text-gray-400">
                  Everyone is currently working — pick someone from below.
                </p>
              ) : (
                <div className="mt-3 flex flex-wrap justify-center gap-6">
                  {available.map((tech) => (
                    <TechAvatarButton
                      key={tech.id}
                      tech={tech}
                      onSelect={handleSelect}
                      disabled={isPending}
                    />
                  ))}
                </div>
              )}
            </section>

            {busy.length > 0 && (
              <>
                <hr className="border-gray-200" />
                {/* Busy section — divider above per spec */}
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-destructive">
                    Busy ({busy.length})
                  </h3>
                  <div className="mt-3 flex flex-wrap justify-center gap-6">
                    {busy.map((tech) => (
                      <TechAvatarButton
                        key={tech.id}
                        tech={tech}
                        onSelect={handleSelect}
                        disabled={isPending}
                      />
                    ))}
                  </div>
                </section>
              </>
            )}
          </div>
        )}

        {/* Busy-tech confirmation (P46.4 / P46.5) */}
        {confirmBusy && (
          <div className="mt-6 rounded-xl border border-warning/40 bg-warning/10 p-4 text-center">
            <p className="text-sm text-gray-700">
              <strong>{confirmBusy.full_name}</strong> is currently working on{" "}
              {confirmBusy.currentJobId ? (
                <Link
                  href={`/app/jobs/${confirmBusy.currentJobId}`}
                  className="font-mono font-medium underline underline-offset-2"
                  target="_blank"
                  rel="noopener"
                >
                  {confirmBusy.currentJobNumber ?? "a job"}
                </Link>
              ) : (
                <span className="font-mono font-medium">
                  {confirmBusy.currentJobNumber ?? "a job"}
                </span>
              )}
              . Assign anyway?
            </p>
            <div className="mt-3 flex justify-center gap-3">
              <Button
                size="sm"
                onClick={() => doCreate(confirmBusy.id)}
                disabled={isPending}
              >
                {isPending ? "Creating..." : "Yes, assign"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirmBusy(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {error && (
          <p className="mt-4 text-center text-sm text-destructive">{error}</p>
        )}

        {isPending && !confirmBusy && (
          <div className="mt-4 text-center text-sm text-gray-400">
            Creating job and assigning technician...
          </div>
        )}
      </div>
    </div>
  );
}

interface TechAvatarButtonProps {
  tech: StaffAvailability;
  onSelect: (tech: StaffAvailability) => void;
  disabled: boolean;
}

function TechAvatarButton({ tech, onSelect, disabled }: TechAvatarButtonProps) {
  return (
    <button
      onClick={() => onSelect(tech)}
      disabled={disabled}
      className="flex w-20 flex-col items-center gap-2 transition-transform hover:scale-105 active:scale-95 disabled:opacity-50"
    >
      <div
        className={`flex h-20 w-20 items-center justify-center rounded-full border-[3px] ${
          tech.isBusy
            ? "border-destructive/40 bg-destructive/10 text-destructive/60"
            : "border-success bg-success/10 text-success"
        }`}
      >
        <StaffAvatar
          src={tech.avatar_url}
          name={tech.full_name}
          size={74}
          roles={tech.roles}
        />
      </div>
      <span className="text-center text-xs font-semibold text-gray-700 leading-tight">
        {shortName(tech.full_name)}
      </span>
      {tech.isBusy && tech.currentJobNumber && (
        <span className="font-mono text-[10px] text-destructive">
          on {tech.currentJobNumber}
        </span>
      )}
    </button>
  );
}
