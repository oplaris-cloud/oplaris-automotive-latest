"use client";

import { StickyNote } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { AddPartSheet } from "./AddPartSheet";
import { RequestApprovalSheet } from "./RequestApprovalSheet";

/**
 * Tech secondary-action row (audit F2, DESIGN_SYSTEM §4.3).
 *
 * Three mobile-first actions rendered below the timer and above the
 * Pause / Complete primary pair while a work_log is running:
 *
 *   Add part · Request approval · Add note
 *
 * Add note is wired as a disabled placeholder in this step (2a). The
 * real implementation ships in step 2b behind migration 050 + a new
 * SECURITY DEFINER RPC + a UNION entry in `job_timeline_events`.
 */
export function TechSecondaryActions({ jobId }: { jobId: string }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <AddPartSheet jobId={jobId} />
      <RequestApprovalSheet jobId={jobId} />
      <TooltipProvider>
        <Tooltip>
          {/* Wrapper span keeps the tooltip attachable on a disabled
           *  button — disabled `<button>` elements don't emit pointer
           *  events to the Base-UI trigger. */}
          <TooltipTrigger render={<span tabIndex={0} aria-disabled="true" />}>
            <Button
              size="lg"
              variant="outline"
              disabled
              className="h-auto min-h-11 w-full flex-col gap-1 text-xs sm:text-sm"
              aria-label="Add note — coming soon"
            >
              <StickyNote className="h-5 w-5" />
              Add note
            </Button>
          </TooltipTrigger>
          <TooltipContent>Coming soon</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
