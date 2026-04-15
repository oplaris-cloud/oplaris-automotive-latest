"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TechAssignmentModal } from "./TechAssignmentModal";

export function PromoteButton({
  bookingId,
  className,
}: {
  bookingId: string;
  /** Category-coloured when passed from a row. */
  className?: string;
}) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <Button
        size="sm"
        onClick={() => setShowModal(true)}
        className={cn("gap-1.5", className)}
      >
        <Plus className="h-4 w-4" />
        Create Job
      </Button>
      {showModal && (
        <TechAssignmentModal
          bookingId={bookingId}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
