"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TechAssignmentModal } from "./TechAssignmentModal";

export function PromoteButton({ bookingId }: { bookingId: string }) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <Button size="sm" onClick={() => setShowModal(true)} className="gap-1.5">
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
