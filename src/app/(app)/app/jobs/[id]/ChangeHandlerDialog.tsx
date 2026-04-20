"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, ArrowRight, ChevronLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { cn } from "@/lib/utils";

import { overrideJobHandler } from "../passback/actions";
import {
  composeSubmitLabel,
  decidePaletteSelection,
  type AssigneeInfo,
  type EligibleStaffInfo,
  type HandlerRole,
  type PaletteDecision,
} from "./change-handler-logic";

export interface ChangeHandlerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  jobNumber: string;
  currentRole: HandlerRole | null;
  assignees: readonly AssigneeInfo[];
  eligibleStaff: readonly EligibleStaffInfo[];
}

type Stage = "palette" | "confirm";

interface ConfirmState {
  targetRole: HandlerRole;
  removalSet: Set<string>;
  assignStaffId: string | null;
  assignFirstName: string | null;
  pickerExpanded: boolean;
  assigneesCollapsed: boolean;
  note: string;
}

function firstName(fullName: string): string {
  const t = fullName.trim();
  if (!t) return "";
  return t.split(/\s+/)[0] ?? t;
}

function roleLabel(role: HandlerRole): string {
  return role === "mot_tester" ? "MOT tester" : role === "mechanic" ? "mechanic" : "manager";
}

function roleChipLabel(role: string): string {
  return role === "mot_tester" ? "mot tester" : role;
}

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const [a, b] = parts;
  return ((a?.[0] ?? "") + (b?.[0] ?? "")).toUpperCase() || "?";
}

function AvailabilityPill({ s }: { s: EligibleStaffInfo }) {
  if (s.isBusy) {
    return (
      <span className="text-xs text-warning">
        on {s.currentJobNumber ?? "another job"}
      </span>
    );
  }
  return (
    <span className="text-xs text-success">
      · available
    </span>
  );
}

function PersonAvatar({ fullName, busy }: { fullName: string; busy: boolean }) {
  return (
    <div
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium",
        busy
          ? "bg-warning/20 text-warning"
          : "bg-success/20 text-success",
      )}
    >
      {initials(fullName)}
    </div>
  );
}

export function ChangeHandlerDialog({
  open,
  onOpenChange,
  jobId,
  jobNumber,
  currentRole,
  assignees,
  eligibleStaff,
}: ChangeHandlerDialogProps) {
  const router = useRouter();
  const isMobile = useMediaQuery("(max-width: 639px)");
  const [stage, setStage] = React.useState<Stage>("palette");
  const [confirm, setConfirm] = React.useState<ConfirmState | null>(null);
  const [ambiguous, setAmbiguous] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  // Reset internal state when the dialog closes so a fresh open starts
  // from the palette. We also clear the stale error so it doesn't flash
  // on reopen.
  const resetAll = React.useCallback(() => {
    setStage("palette");
    setConfirm(null);
    setAmbiguous(null);
    setError(null);
  }, []);

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      onOpenChange(next);
      if (!next) resetAll();
    },
    [onOpenChange, resetAll],
  );

  // ---------------------------------------------------------------------
  // Palette selection → confirm dialog or ambiguity toast
  // ---------------------------------------------------------------------

  const handleQueueSelect = React.useCallback(
    (targetRole: Exclude<HandlerRole, "manager">) => {
      const decision = decidePaletteSelection({
        selection: { kind: "queue", targetRole },
        currentRole,
        assignees,
        eligibleStaff,
      });
      applyDecision(decision);
    },
    // applyDecision is defined below; see note
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentRole, assignees, eligibleStaff],
  );

  const handlePersonSelect = React.useCallback(
    (staffId: string) => {
      const decision = decidePaletteSelection({
        selection: { kind: "person", staffId },
        currentRole,
        assignees,
        eligibleStaff,
      });
      applyDecision(decision);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentRole, assignees, eligibleStaff],
  );

  function applyDecision(decision: PaletteDecision) {
    if (decision.kind === "ambiguous") {
      const first = firstName(decision.full_name);
      const roles = [...decision.roles]
        .map((r) => roleChipLabel(r))
        .join(" + ");
      setAmbiguous(
        `${first} holds both ${roles} — use "Return to X queue" first to set the role.`,
      );
      return;
    }
    setAmbiguous(null);
    setError(null);
    setConfirm({
      targetRole: decision.targetRole,
      removalSet: new Set(decision.removeStaffIds),
      assignStaffId: decision.assignStaffId,
      assignFirstName: decision.assignFirstName,
      pickerExpanded: decision.assignStaffId !== null,
      assigneesCollapsed: false,
      note: "",
    });
    setStage("confirm");
  }

  // ---------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------

  const handleSubmit = React.useCallback(() => {
    if (!confirm) return;
    setError(null);

    const payload = {
      jobId,
      targetRole: confirm.targetRole,
      removeStaffIds: Array.from(confirm.removalSet),
      assignStaffId: confirm.assignStaffId,
      note: confirm.note.trim() || null,
    };

    startTransition(async () => {
      const result = await overrideJobHandler(payload);
      if (!result.ok) {
        setError(result.error ?? "Failed to change handler");
        return;
      }
      handleOpenChange(false);
      router.refresh();
    });
  }, [confirm, jobId, handleOpenChange, router]);

  // ---------------------------------------------------------------------
  // Grouping for the palette
  // ---------------------------------------------------------------------

  const testerStaff = eligibleStaff.filter((s) => s.roles.includes("mot_tester"));
  const mechanicStaff = eligibleStaff.filter((s) =>
    s.roles.includes("mechanic"),
  );

  // eligibleStaff filtered by target role for the Zone B picker.
  const pickerCandidates = React.useMemo(() => {
    if (!confirm) return [] as EligibleStaffInfo[];
    return eligibleStaff.filter((s) => s.roles.includes(confirm.targetRole));
  }, [confirm, eligibleStaff]);

  // ---------------------------------------------------------------------
  // Render: palette stage
  // ---------------------------------------------------------------------

  const paletteView = (
    <Command label="Change job handler" className="rounded-lg">
      <CommandInput placeholder="Search staff or type a queue…" />
      <CommandList>
        <CommandEmpty>No staff match. Try a role or clear filters.</CommandEmpty>

        <CommandGroup heading="Reset to queue">
          <CommandItem
            value="queue-mot_tester"
            keywords={["return", "mot", "tester", "queue"]}
            onSelect={() => handleQueueSelect("mot_tester")}
            disabled={currentRole === "mot_tester"}
          >
            <ArrowLeftRight className="h-4 w-4" />
            Return to MOT tester queue
            {currentRole === "mot_tester" ? (
              <span className="ml-auto text-[11px] text-muted-foreground">
                current
              </span>
            ) : null}
          </CommandItem>
          <CommandItem
            value="queue-mechanic"
            keywords={["return", "mechanic", "queue"]}
            onSelect={() => handleQueueSelect("mechanic")}
            disabled={currentRole === "mechanic"}
          >
            <ArrowLeftRight className="h-4 w-4" />
            Return to mechanic queue
            {currentRole === "mechanic" ? (
              <span className="ml-auto text-[11px] text-muted-foreground">
                current
              </span>
            ) : null}
          </CommandItem>
        </CommandGroup>

        {ambiguous ? (
          <div
            role="alert"
            className="mx-2 mt-1 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning"
          >
            {ambiguous}
          </div>
        ) : null}

        <CommandSeparator />

        {testerStaff.length > 0 ? (
          <CommandGroup heading="MOT testers">
            {testerStaff.map((s) => {
              const isAssigned = assignees.some((a) => a.id === s.id);
              return (
                <CommandItem
                  key={`tester-${s.id}`}
                  value={`tester-${s.full_name}-${s.id}`}
                  keywords={[
                    s.full_name,
                    firstName(s.full_name),
                    "mot_tester",
                    "mot tester",
                    s.isBusy ? "busy" : "available",
                  ]}
                  onSelect={() => handlePersonSelect(s.id)}
                >
                  <PersonAvatar fullName={s.full_name} busy={s.isBusy} />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm">
                      {firstName(s.full_name)}
                      <AvailabilityPill s={s} />
                    </span>
                  </div>
                  <div className="ml-auto flex items-center gap-1.5">
                    {s.roles.includes("mechanic") ? (
                      <Badge variant="secondary" className="text-[10px]">
                        mechanic
                      </Badge>
                    ) : null}
                    {isAssigned ? (
                      <Badge variant="outline" className="text-[10px]">
                        current
                      </Badge>
                    ) : null}
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        ) : null}

        {mechanicStaff.length > 0 ? (
          <CommandGroup heading="Mechanics">
            {mechanicStaff
              // Avoid duplicating multi-role staff that already appeared above.
              .filter((s) => !s.roles.includes("mot_tester"))
              .map((s) => {
                const isAssigned = assignees.some((a) => a.id === s.id);
                return (
                  <CommandItem
                    key={`mech-${s.id}`}
                    value={`mech-${s.full_name}-${s.id}`}
                    keywords={[
                      s.full_name,
                      firstName(s.full_name),
                      "mechanic",
                      s.isBusy ? "busy" : "available",
                    ]}
                    onSelect={() => handlePersonSelect(s.id)}
                  >
                    <PersonAvatar fullName={s.full_name} busy={s.isBusy} />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm">
                        {firstName(s.full_name)}
                        <AvailabilityPill s={s} />
                      </span>
                    </div>
                    {isAssigned ? (
                      <Badge
                        variant="outline"
                        className="ml-auto text-[10px]"
                      >
                        current
                      </Badge>
                    ) : null}
                  </CommandItem>
                );
              })}
          </CommandGroup>
        ) : null}
      </CommandList>
    </Command>
  );

  // ---------------------------------------------------------------------
  // Render: confirm dialog body
  // ---------------------------------------------------------------------

  const confirmView = confirm ? (
    <div className="space-y-5">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ml-2 h-7 gap-1 px-2 text-xs"
        onClick={() => setStage("palette")}
        disabled={isPending}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to handler picker
      </Button>

      <div>
        <h3 className="text-base font-semibold">
          {confirm.targetRole === "manager"
            ? "Override to manager"
            : `Return job to ${roleLabel(confirm.targetRole)} queue`}
        </h3>
        <p className="text-xs text-muted-foreground">
          {jobNumber} · currently with {currentRole ? roleLabel(currentRole) : "no one"}
        </p>
      </div>

      {/* Zone A — Currently assigned */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Currently assigned
          </h4>
          {assignees.length > 0 ? (
            <span className="text-[11px] text-muted-foreground">
              Any ticked will be removed
            </span>
          ) : null}
        </div>
        {assignees.length === 0 ? (
          <p className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            No one is assigned yet.
          </p>
        ) : (
          <div className="space-y-2">
            {assignees.map((a) => {
              const checked = confirm.removalSet.has(a.id);
              const mismatch = !a.roles.includes(confirm.targetRole);
              return (
                <label
                  key={a.id}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border px-3 py-2 text-sm transition-colors",
                    checked
                      ? "border-destructive/50 bg-destructive/5"
                      : "border-border bg-background hover:bg-muted/30",
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={checked}
                    onChange={(e) => {
                      setConfirm((prev) =>
                        prev
                          ? {
                              ...prev,
                              removalSet: new Set(
                                e.target.checked
                                  ? [...prev.removalSet, a.id]
                                  : [...prev.removalSet].filter((id) => id !== a.id),
                              ),
                            }
                          : prev,
                      );
                    }}
                    aria-label={`Remove ${a.full_name}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{a.full_name}</span>
                      {a.roles.map((r) => (
                        <Badge
                          key={r}
                          variant="secondary"
                          className="text-[10px]"
                        >
                          {roleChipLabel(r)}
                        </Badge>
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {mismatch
                        ? `Role doesn't cover ${roleLabel(confirm.targetRole)}.`
                        : a.roles.length > 1
                          ? `Also holds ${roleLabel(confirm.targetRole)} — stays by default.`
                          : `Already a ${roleLabel(confirm.targetRole)} — stays by default.`}
                      {a.hasActiveTimer && checked
                        ? " Running timer will be stopped."
                        : null}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </section>

      {/* Zone B — Optional direct assignee */}
      {confirm.targetRole !== "manager" ? (
        <section>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Assign a specific {roleLabel(confirm.targetRole)}{" "}
            <span className="font-normal normal-case text-muted-foreground/70">
              · optional
            </span>
          </h4>
          <div className="divide-y rounded-lg border">
            <label
              className={cn(
                "flex cursor-pointer items-start gap-3 px-3 py-3",
                !confirm.pickerExpanded && "bg-muted/40",
              )}
            >
              <input
                type="radio"
                name="assign-mode"
                className="mt-1 h-4 w-4"
                checked={!confirm.pickerExpanded}
                onChange={() =>
                  setConfirm((prev) =>
                    prev
                      ? {
                          ...prev,
                          pickerExpanded: false,
                          assignStaffId: null,
                          assignFirstName: null,
                        }
                      : prev,
                  )
                }
              />
              <div className="flex-1">
                <div className="text-sm font-medium">Leave in queue</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Any {roleLabel(confirm.targetRole)} can self-claim via My Work.
                </div>
              </div>
              {!confirm.pickerExpanded ? (
                <span className="text-[11px] text-muted-foreground">Default</span>
              ) : null}
            </label>

            <label
              className={cn(
                "flex cursor-pointer items-start gap-3 px-3 py-3",
                confirm.pickerExpanded && "bg-muted/40",
              )}
            >
              <input
                type="radio"
                name="assign-mode"
                className="mt-1 h-4 w-4"
                checked={confirm.pickerExpanded}
                onChange={() =>
                  setConfirm((prev) =>
                    prev ? { ...prev, pickerExpanded: true } : prev,
                  )
                }
              />
              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Assign directly to…</div>
                  {!confirm.pickerExpanded ? (
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : null}
                </div>
                {confirm.pickerExpanded ? (
                  <div className="max-h-56 overflow-y-auto rounded-md border bg-background">
                    {pickerCandidates.length === 0 ? (
                      <p className="px-3 py-3 text-xs text-muted-foreground">
                        No active {roleLabel(confirm.targetRole)} on the roster.
                      </p>
                    ) : (
                      pickerCandidates.map((s) => {
                        const isPicked = confirm.assignStaffId === s.id;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() =>
                              setConfirm((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      assignStaffId: s.id,
                                      assignFirstName: firstName(s.full_name),
                                    }
                                  : prev,
                              )
                            }
                            className={cn(
                              "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50",
                              isPicked && "bg-muted",
                            )}
                          >
                            <PersonAvatar
                              fullName={s.full_name}
                              busy={s.isBusy}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate">
                                {firstName(s.full_name)}
                                <AvailabilityPill s={s} />
                              </div>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                ) : null}
              </div>
            </label>
          </div>
        </section>
      ) : null}

      {/* Zone C — Optional note */}
      <section>
        <Label
          htmlFor="override-note"
          className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Note{" "}
          <span className="font-normal normal-case text-muted-foreground/70">
            · optional, surfaces on job history
          </span>
        </Label>
        <Textarea
          id="override-note"
          rows={2}
          value={confirm.note}
          onChange={(e) =>
            setConfirm((prev) =>
              prev ? { ...prev, note: e.target.value } : prev,
            )
          }
          maxLength={500}
          className="mt-1"
          placeholder="e.g. Jake reassigned to urgent brake job"
        />
      </section>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/5 p-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
    </div>
  ) : null;

  // ---------------------------------------------------------------------
  // Shell — Sheet (mobile) vs Dialog (desktop)
  // ---------------------------------------------------------------------

  const submitLabel = confirm
    ? composeSubmitLabel({
        targetRole: confirm.targetRole,
        assignFirstName: confirm.pickerExpanded ? confirm.assignFirstName : null,
      })
    : "";

  const footer = stage === "confirm" ? (
    <>
      <Button
        type="button"
        variant="ghost"
        onClick={() => handleOpenChange(false)}
        disabled={isPending}
      >
        Cancel
      </Button>
      <Button type="button" onClick={handleSubmit} disabled={isPending}>
        {isPending ? "Saving…" : submitLabel}
      </Button>
    </>
  ) : null;

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="bottom"
          className="max-h-[85vh] overflow-y-auto rounded-t-xl p-0"
        >
          <SheetHeader className="border-b">
            <SheetTitle>
              {stage === "palette" ? "Change handler" : "Confirm change"}
            </SheetTitle>
            <SheetDescription className="text-xs">
              Manager override · {jobNumber}
            </SheetDescription>
          </SheetHeader>
          <div className="p-3">
            {stage === "palette" ? paletteView : confirmView}
          </div>
          {footer ? (
            <div className="flex flex-col-reverse gap-2 border-t bg-muted/40 p-3 sm:flex-row sm:justify-end">
              {footer}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop — Dialog. Palette stage renders a lighter content box; confirm
  // stage has a title + footer like a normal dialog.
  if (stage === "palette") {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="max-w-lg overflow-hidden p-0 ring-0 sm:max-w-lg"
          showCloseButton={false}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Change job handler</DialogTitle>
            <DialogDescription>
              Manager command palette for reassigning job {jobNumber}
            </DialogDescription>
          </DialogHeader>
          {paletteView}
          <div className="flex items-center justify-between border-t bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
            <span>↑/↓ navigate · Enter to pick · Esc to close</span>
            <span>Manager override</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Confirm change</DialogTitle>
          <DialogDescription>
            Review the override before applying it.
          </DialogDescription>
        </DialogHeader>
        <Separator />
        {confirmView}
        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
