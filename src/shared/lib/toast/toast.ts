"use client";

import { toast as sonnerToast } from "sonner";

/**
 * Toast helpers — thin wrapper around sonner. The undo pattern is the
 * value of this module: COUNCIL §6 mandates "undo on destructive actions
 * (toast with undo > scary modals where possible)."
 *
 * Usage:
 *   toast.success("Product saved");
 *   toast.error("Couldn't save", { description: "Network error — please retry." });
 *   toast.undoable("3 movements deleted", () => restoreMovements(ids));
 */
export const toast = {
  success: (message: string, opts?: { description?: string }) =>
    sonnerToast.success(message, opts),
  error: (message: string, opts?: { description?: string }) =>
    sonnerToast.error(message, opts),
  warning: (message: string, opts?: { description?: string }) =>
    sonnerToast.warning(message, opts),
  info: (message: string, opts?: { description?: string }) =>
    sonnerToast.info(message, opts),
  loading: (message: string) => sonnerToast.loading(message),
  dismiss: (id?: string | number) => sonnerToast.dismiss(id),

  /**
   * Undoable action toast — the COUNCIL §6 pattern. Action runs AFTER a
   * 6s grace window unless the user dismisses or clicks Undo first.
   *
   * Important: the caller's `commit` function fires SOON (act with the
   * UI optimistically), and `onUndo` rolls back. This is the optimistic
   * pattern; if you'd rather defer the action entirely, use a confirm
   * modal.
   */
  undoable: (
    message: string,
    onUndo: () => void,
    opts?: { description?: string; durationMs?: number },
  ) =>
    sonnerToast(message, {
      description: opts?.description,
      duration: opts?.durationMs ?? 6000,
      action: {
        label: "Undo",
        onClick: () => onUndo(),
      },
    }),
};
