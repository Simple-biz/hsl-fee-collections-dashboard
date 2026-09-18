"use client";

import type { ReactNode } from "react";
import { AlertCircle, Loader2, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ConfirmDialogProps {
  open: boolean;
  title: ReactNode;
  description: ReactNode;
  /** Text on the confirming button — say what it does, not "OK". */
  confirmLabel: string;
  /** Shown on the confirm button when idle; swapped for a spinner while submitting. */
  confirmIcon?: LucideIcon;
  /** "destructive" for anything that takes something away. */
  confirmVariant?: "default" | "destructive";
  submitting: boolean;
  /** Rendered in the dialog, not behind it — the caller's page-level banner would be covered by the modal. */
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * The shell every confirm dialog in this app shares: constrained width, header,
 * description, inline error, and a Cancel / confirm footer whose action button
 * shows a spinner while the caller's request is in flight.
 *
 * Extracted because the same ~40 lines of scaffolding had been copied into six
 * dialogs, which is where the inconsistencies crept in — some rendered the
 * error with `role="alert"` and some didn't, and closing while submitting was
 * handled differently in each. Callers now supply only the copy and the action.
 *
 * Presentational: the caller owns the request, its in-flight flag and its
 * error, so nothing here needs to know what is being confirmed.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  confirmIcon: ConfirmIcon,
  confirmVariant = "default",
  submitting,
  error,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      // Never let an outside click or Escape close the dialog mid-request —
      // the action would still land with the confirmation gone from the screen.
      onOpenChange={(v) => {
        if (!v && !submitting) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {error && (
          <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        <DialogFooter className="mt-2 gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={confirmVariant}
            onClick={onConfirm}
            disabled={submitting}
          >
            {submitting ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              ConfirmIcon && <ConfirmIcon aria-hidden="true" className="h-4 w-4" />
            )}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
