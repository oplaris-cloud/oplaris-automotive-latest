"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/** P56.3 (UI-H3) — Standard confirm dialog.
 *
 *  Thin wrapper around shadcn `AlertDialog` that:
 *    - Handles async `onConfirm` (shows spinner until promise resolves)
 *    - Auto-closes on resolve; leaves open on reject so caller can toast
 *    - Consistent destructive styling when `destructive` is set
 *    - Supports controlled (`open`/`onOpenChange`) or uncontrolled usage
 *
 *  Usage:
 *    <ConfirmDialog
 *      trigger={<Button variant="destructive">Delete</Button>}
 *      title="Delete customer?"
 *      description="This soft-deletes the record. 30-day recovery window."
 *      confirmLabel="Delete"
 *      destructive
 *      onConfirm={async () => deleteCustomer(id)}
 *    />
 */

interface ConfirmDialogProps {
  trigger?: React.ReactElement;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** Controlled open state (optional). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
  /** Optional children rendered inside the content, between the header
   *  and the footer — for bespoke warnings / lists / etc. */
  children?: React.ReactNode;
}

export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  open,
  onOpenChange,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  async function handleConfirm(event: React.MouseEvent) {
    event.preventDefault();
    if (pending) return;
    try {
      setPending(true);
      await onConfirm();
      setOpen(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={setOpen}>
      {trigger ? <AlertDialogTrigger render={trigger} /> : null}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={pending}
            aria-busy={pending || undefined}
          >
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Working…
              </>
            ) : (
              confirmLabel
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
