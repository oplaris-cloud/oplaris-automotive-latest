import { toast as sonnerToast } from "sonner";

/** P56.3 (UX-H4) — Thin facade over `sonner`.
 *
 *  Why: one import path across the app, consistent message shape, easier
 *  to swap for a different toast library later without a codemod.
 *
 *  Usage:
 *    import { toast } from "@/lib/toast";
 *    toast.success("Saved");
 *    toast.error("Could not save", { description: result.error });
 *    toast.promise(saveJob(), {
 *      loading: "Saving…",
 *      success: "Saved",
 *      error: "Could not save",
 *    });
 */

type ToastOptions = {
  description?: string;
  /** Override default duration. Default: 4 s for success/info, 6 s for error. */
  durationMs?: number;
  /** Action button — click dismisses the toast unless the handler throws. */
  action?: { label: string; onClick: () => void };
};

function normaliseOptions(opts?: ToastOptions) {
  if (!opts) return undefined;
  return {
    description: opts.description,
    duration: opts.durationMs,
    action: opts.action,
  };
}

export const toast = {
  success(message: string, opts?: ToastOptions) {
    return sonnerToast.success(message, normaliseOptions(opts));
  },
  error(message: string, opts?: ToastOptions) {
    return sonnerToast.error(message, {
      ...normaliseOptions(opts),
      duration: opts?.durationMs ?? 6000,
    });
  },
  info(message: string, opts?: ToastOptions) {
    return sonnerToast.info(message, normaliseOptions(opts));
  },
  warning(message: string, opts?: ToastOptions) {
    return sonnerToast.warning(message, normaliseOptions(opts));
  },
  promise<T>(
    promise: Promise<T>,
    messages: { loading: string; success: string; error: string },
  ) {
    return sonnerToast.promise(promise, messages);
  },
  dismiss(id?: string | number) {
    return sonnerToast.dismiss(id);
  },
};
