"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ChevronDown,
  MoreHorizontal,
  UserCog,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/lib/toast";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import {
  STATUS_TRANSITIONS,
  type JobStatus,
} from "@/lib/validation/job-schemas";
import type { CurrentRole } from "@/components/ui/role-badge";

import { updateJobStatus } from "../actions";
import { PassbackDialog } from "./PassbackDialog";
import { ResumeMotButton } from "./ResumeMotButton";
import { ReturnToMotTesterButton } from "./ReturnToMotTesterButton";
import { ChangeHandlerDialog } from "./ChangeHandlerDialog";
import type {
  AssigneeInfo,
  EligibleStaffInfo,
  HandlerRole,
} from "./change-handler-logic";

// ---------------------------------------------------------------------------
// Status label / button helpers
// ---------------------------------------------------------------------------

const STATUS_LABELS: Partial<Record<JobStatus, string>> = {
  in_diagnosis: "Start Diagnosis",
  in_repair: "Start Repair",
  awaiting_parts: "Awaiting Parts",
  awaiting_customer_approval: "Request Approval",
  ready_for_collection: "Ready for Collection",
  completed: "Mark Complete",
};

function labelFor(status: JobStatus): string {
  return STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

// Targets that should never appear as forward action buttons. `cancelled`
// is destructive (overflow only). `awaiting_mechanic` is gone in P52 — the
// state machine no longer emits it as a forward target, but we belt the
// braces here too. `awaiting_customer_approval` is excluded in P2.7b
// (2026-04-28): the SMS-bearing approval flow lives in the dedicated
// `<ApprovalDialog>` card on the job detail page (which collects the
// description + amount the SMS body needs and calls the
// `requestApproval` server action). The bare status flip surfaced by
// `updateJobStatus` did neither, so a manager clicking this button got
// a silent status change with no SMS to the customer.
function nonDestructiveForwardTargets(status: JobStatus): JobStatus[] {
  return (STATUS_TRANSITIONS[status] ?? []).filter(
    (t) =>
      t !== "cancelled" &&
      t !== "awaiting_mechanic" &&
      t !== "awaiting_customer_approval",
  );
}

// ---------------------------------------------------------------------------
// Primary-CTA decision (pure, exported for testing)
// ---------------------------------------------------------------------------

export type PrimaryAction =
  | { kind: "passback"; jobId: string }
  | { kind: "resume_mot"; jobId: string }
  | { kind: "return_to_tester"; jobId: string }
  | { kind: "transition"; jobId: string; target: JobStatus }
  | { kind: "none" };

export interface JobForActions {
  id: string;
  status: JobStatus;
  service: string | null;
  current_role: CurrentRole | null;
}

export interface ViewerContext {
  roles: string[];
  isAssignedMechanic: boolean;
}

export function pickPrimaryAction(
  job: JobForActions,
  viewer: ViewerContext,
): PrimaryAction {
  // Terminal states have no primary action — `STATUS_TRANSITIONS` already
  // returns []; guard early so the "return to tester" branch can't fire
  // on a completed/cancelled job that still has stale current_role.
  if (job.status === "completed" || job.status === "cancelled") {
    return { kind: "none" };
  }

  const isManager = viewer.roles.includes("manager");
  const isTester = viewer.roles.includes("mot_tester");
  const isMechanic = viewer.roles.includes("mechanic");
  const isMotJob = job.service === "mot";

  // Soak path first — legacy MOT jobs sitting at status='awaiting_mechanic'
  // still need a way back. After P51 the tester just clicks Resume MOT.
  if (
    isMotJob &&
    job.current_role === "mot_tester" &&
    job.status === "awaiting_mechanic" &&
    (isTester || isManager)
  ) {
    return { kind: "resume_mot", jobId: job.id };
  }

  if (
    isMotJob &&
    job.current_role === "mot_tester" &&
    (isTester || isManager)
  ) {
    return { kind: "passback", jobId: job.id };
  }

  // "Return to MOT tester" only makes sense for an MOT job mid-pass-back.
  // A non-MOT job whose current_role happens to be 'mechanic' is just a
  // normal mechanic job — don't surface a return action with no destination.
  if (
    isMotJob &&
    job.current_role === "mechanic" &&
    (isManager || (isMechanic && viewer.isAssignedMechanic))
  ) {
    return { kind: "return_to_tester", jobId: job.id };
  }

  // Status-machine fallback. Prefer in_repair → ready_for_collection over
  // anything else, then in_diagnosis → in_repair, then the first legal
  // non-destructive target.
  const targets = nonDestructiveForwardTargets(job.status);
  if (targets.length === 0) return { kind: "none" };

  const preferred =
    targets.find((t) => t === "ready_for_collection") ??
    targets.find((t) => t === "in_repair") ??
    targets[0];

  return { kind: "transition", jobId: job.id, target: preferred! };
}

// ---------------------------------------------------------------------------
// StatusTransitionButton — shared by Primary, Secondary, and Overflow
// ---------------------------------------------------------------------------

interface StatusTransitionButtonProps {
  jobId: string;
  target: JobStatus;
  variant?: "default" | "outline";
  needsConfirm?: boolean;
}

function StatusTransitionButton({
  jobId,
  target,
  variant = "outline",
  needsConfirm = false,
}: StatusTransitionButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [confirming, setConfirming] = React.useState(false);

  const fire = React.useCallback(() => {
    setConfirming(false);
    startTransition(async () => {
      const result = await updateJobStatus({ jobId, status: target });
      if (result.ok) router.refresh();
      else toast.error(result.error ?? "Failed to update status");
    });
  }, [jobId, target, router]);

  if (needsConfirm && confirming) {
    return (
      <span className="inline-flex items-center gap-2 rounded-md border border-warning/50 bg-warning/5 px-2 py-1 text-xs">
        <span>Mark complete?</span>
        <Button size="sm" onClick={fire} disabled={isPending}>
          {isPending ? "…" : "Yes"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setConfirming(false)}
          disabled={isPending}
        >
          No
        </Button>
      </span>
    );
  }

  return (
    <Button
      size="sm"
      variant={variant}
      disabled={isPending}
      onClick={() => (needsConfirm ? setConfirming(true) : fire())}
    >
      {labelFor(target)}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// CancelButton — destructive, always behind a confirm; only used inside
// the Overflow menu so we can drop it cleanly when the status doesn't
// allow it.
// ---------------------------------------------------------------------------

interface CancelMenuItemProps {
  onRequestCancel: () => void;
}

function CancelMenuItem({ onRequestCancel }: CancelMenuItemProps) {
  return (
    <DropdownMenuItem
      variant="destructive"
      onClick={(e) => {
        e.preventDefault();
        onRequestCancel();
      }}
    >
      <XCircle className="h-4 w-4" />
      Cancel job
    </DropdownMenuItem>
  );
}

// ---------------------------------------------------------------------------
// OverflowMenu — DropdownMenu on ≥ sm, Sheet on < sm.
// ---------------------------------------------------------------------------

interface OverflowMenuProps {
  jobId: string;
  status: JobStatus;
  currentRole: CurrentRole | null;
  isManager: boolean;
  hiddenTransitions: JobStatus[];
  onOpenChangeHandler: () => void;
}

interface OverflowMenuContentCallbacks {
  onClose: () => void;
  router: ReturnType<typeof useRouter>;
  onRequestComplete: () => void;
  onRequestCancel: () => void;
}

function OverflowMenuContent({
  jobId,
  status,
  isManager,
  hiddenTransitions,
  onClose,
  onOpenChangeHandler,
  router,
  onRequestComplete,
  onRequestCancel,
}: OverflowMenuProps & OverflowMenuContentCallbacks) {
  const canCancel = (STATUS_TRANSITIONS[status] ?? []).includes("cancelled");
  const canMarkComplete = (STATUS_TRANSITIONS[status] ?? []).includes(
    "completed",
  );

  const fireTransition = (target: JobStatus) => {
    onClose();
    void (async () => {
      const result = await updateJobStatus({ jobId, status: target });
      if (result.ok) router.refresh();
      else toast.error(result.error ?? "Failed to update status");
    })();
  };

  return (
    <>
      {hiddenTransitions.length > 0 && (
        <>
          <DropdownMenuGroup>
            <DropdownMenuLabel>More transitions</DropdownMenuLabel>
            {hiddenTransitions.map((t) => (
              <DropdownMenuItem
                key={t}
                onClick={(e) => {
                  e.preventDefault();
                  fireTransition(t);
                }}
              >
                {labelFor(t)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
        </>
      )}

      {canMarkComplete && (
        <DropdownMenuItem
          onClick={(e) => {
            e.preventDefault();
            onRequestComplete();
          }}
        >
          <CheckCircle2 className="h-4 w-4" />
          Mark complete
        </DropdownMenuItem>
      )}

      {isManager && (
        <DropdownMenuItem
          onClick={(e) => {
            e.preventDefault();
            onClose();
            onOpenChangeHandler();
          }}
        >
          <UserCog className="h-4 w-4" />
          Change handler…
        </DropdownMenuItem>
      )}

      {canCancel && (
        <>
          {(canMarkComplete || isManager) && <DropdownMenuSeparator />}
          <CancelMenuItem onRequestCancel={onRequestCancel} />
        </>
      )}
    </>
  );
}

function OverflowMenu(props: OverflowMenuProps) {
  const isMobile = useMediaQuery("(max-width: 639px)");
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [confirmCompleteOpen, setConfirmCompleteOpen] = React.useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = React.useState(false);

  // The "is it worth showing" check: if there are no overflow items, the
  // trigger renders nothing.
  const canCancel = (STATUS_TRANSITIONS[props.status] ?? []).includes(
    "cancelled",
  );
  const canMarkComplete = (STATUS_TRANSITIONS[props.status] ?? []).includes(
    "completed",
  );
  const anyContent =
    props.hiddenTransitions.length > 0 ||
    canCancel ||
    canMarkComplete ||
    props.isManager;

  if (!anyContent) return null;

  async function runTransition(target: JobStatus, errorLabel: string) {
    const result = await updateJobStatus({ jobId: props.jobId, status: target });
    if (result.ok) router.refresh();
    else toast.error(result.error ?? errorLabel);
  }

  // Closing the menu before opening the ConfirmDialog makes the focus
  // trap work cleanly: shadcn/Base UI will restore focus to the trigger
  // when the dialog closes, and we don't end up with two competing
  // overlays on mobile.
  const handleRequestComplete = () => {
    setOpen(false);
    setConfirmCompleteOpen(true);
  };
  const handleRequestCancel = () => {
    setOpen(false);
    setConfirmCancelOpen(true);
  };

  const content = (
    <OverflowMenuContent
      {...props}
      onClose={() => setOpen(false)}
      router={router}
      onRequestComplete={handleRequestComplete}
      onRequestCancel={handleRequestCancel}
    />
  );

  const trigger = (
    <Button size="sm" variant="ghost" aria-label="More actions" className="px-2" />
  );

  return (
    <>
      {isMobile ? (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger render={trigger}>
            <MoreHorizontal className="h-4 w-4" />
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-xl">
            <SheetHeader>
              <SheetTitle>More actions</SheetTitle>
            </SheetHeader>
            <Separator />
            <div className="flex flex-col gap-1 p-2 pb-6">{content}</div>
          </SheetContent>
        </Sheet>
      ) : (
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger render={trigger}>
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">{content}</DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* P56.6 — confirm dialogs replace `window.confirm()` for destructive
       *  and irreversible transitions so the prompt follows theme + focus
       *  + aria-busy conventions. */}
      <ConfirmDialog
        open={confirmCompleteOpen}
        onOpenChange={setConfirmCompleteOpen}
        title="Mark this job complete?"
        description="The timeline + invoicing views will flip to the completed state."
        confirmLabel="Mark complete"
        onConfirm={() => runTransition("completed", "Failed to update status")}
      />
      <ConfirmDialog
        open={confirmCancelOpen}
        onOpenChange={setConfirmCancelOpen}
        title="Cancel this job?"
        description="This cannot be undone. The job will be removed from all active queues."
        confirmLabel="Cancel job"
        destructive
        onConfirm={() => runTransition("cancelled", "Failed to cancel")}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// JobActionsRow (the export the page renders)
// ---------------------------------------------------------------------------

const SECONDARY_LIMIT = 3;

interface JobActionsRowProps {
  job: JobForActions;
  viewer: ViewerContext;
  /** P53 — data for the manager "Change handler…" palette. Pass empty
   *  arrays for non-manager viewers; the palette is only mounted for
   *  managers regardless. */
  jobNumber?: string;
  assignees?: readonly AssigneeInfo[];
  eligibleStaff?: readonly EligibleStaffInfo[];
}

export function JobActionsRow({
  job,
  viewer,
  jobNumber,
  assignees,
  eligibleStaff,
}: JobActionsRowProps) {
  const isManager = viewer.roles.includes("manager");
  const primary = pickPrimaryAction(job, viewer);
  const [changeHandlerOpen, setChangeHandlerOpen] = React.useState(false);

  // Targets that are still up for grabs as Secondary buttons. We strip
  // the one promoted to Primary so it doesn't appear twice.
  const allForward = nonDestructiveForwardTargets(job.status);
  const allCovered = allForward.filter(
    (t) => primary.kind === "transition" && t === primary.target,
  );
  const remainingTransitions = allForward.filter((t) => !allCovered.includes(t));
  const secondaryTransitions = remainingTransitions
    .filter((t) => t !== "completed") // Mark Complete lives in overflow
    .slice(0, SECONDARY_LIMIT);
  const overflowTransitions = remainingTransitions
    .filter((t) => t !== "completed")
    .slice(SECONDARY_LIMIT);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Primary slot */}
      {renderPrimary(primary)}

      {/* Secondary slot */}
      {secondaryTransitions.map((target) => (
        <StatusTransitionButton
          key={target}
          jobId={job.id}
          target={target}
          variant="outline"
        />
      ))}

      {/* Spacer pushes overflow to the right on wide layouts */}
      <span className="ml-auto" />

      {/* Overflow slot */}
      <OverflowMenu
        jobId={job.id}
        status={job.status}
        currentRole={job.current_role}
        isManager={isManager}
        hiddenTransitions={overflowTransitions}
        onOpenChangeHandler={() => setChangeHandlerOpen(true)}
      />

      {/* P53 — manager-only Change Handler palette/dialog. Sits outside the
          OverflowMenu so closing the menu doesn't unmount it mid-flight. */}
      {isManager ? (
        <ChangeHandlerDialog
          open={changeHandlerOpen}
          onOpenChange={setChangeHandlerOpen}
          jobId={job.id}
          jobNumber={jobNumber ?? ""}
          currentRole={
            job.current_role as HandlerRole | null
          }
          assignees={assignees ?? []}
          eligibleStaff={eligibleStaff ?? []}
        />
      ) : null}

      <ChevronDown aria-hidden className="hidden" />
    </div>
  );
}

function renderPrimary(action: PrimaryAction): React.ReactNode {
  switch (action.kind) {
    case "passback":
      return <PassbackDialog jobId={action.jobId} variant="default" />;
    case "resume_mot":
      return <ResumeMotButton jobId={action.jobId} variant="default" />;
    case "return_to_tester":
      return (
        <ReturnToMotTesterButton jobId={action.jobId} variant="default" />
      );
    case "transition":
      return (
        <StatusTransitionButton
          jobId={action.jobId}
          target={action.target}
          variant="default"
          needsConfirm={action.target === "completed"}
        />
      );
    case "none":
      return null;
  }
}
