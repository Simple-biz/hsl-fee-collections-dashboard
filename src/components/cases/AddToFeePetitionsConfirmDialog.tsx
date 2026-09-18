"use client";

import { AlertCircle, Loader2, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AddToFeePetitionsConfirmDialogProps {
  open: boolean;
  /** Cases that will actually move — already excludes any that are in the section. */
  count: number;
  /** How many rows are selected, so the dialog can say what it's leaving alone. */
  selectedCount: number;
  submitting: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Confirm step for "Add to Fee Petitions" on Master Fee Records.
 *
 * Adding is cheap and fully reversible — "Remove from Fee Petitions" puts a
 * case back with its checklist intact — so this is a guard against a stray
 * click on a large selection rather than a warning about anything dangerous.
 * The copy says so, so nobody reads it as destructive.
 *
 * Presentational only: the parent owns the action, its in-flight flag and its
 * error, matching how the other batch actions in that bar are wired.
 */
export function AddToFeePetitionsConfirmDialog({
  open,
  count,
  selectedCount,
  submitting,
  error,
  onConfirm,
  onClose,
}: AddToFeePetitionsConfirmDialogProps) {
  const handleOpenChange = (v: boolean) => {
    if (!v && !submitting) onClose();
  };

  // Selecting rows that are already in the section is normal — say what's
  // being skipped rather than silently acting on a smaller number than the
  // selection count the bar is showing.
  const skipped = selectedCount - count;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Add {count === 1 ? "1 case" : `${count} cases`} to Fee Petitions?
          </DialogTitle>
          <DialogDescription>
            {count === 1
              ? "This case will appear on the Fee Petitions page for the specialists to work."
              : `These ${count} cases will appear on the Fee Petitions page for the specialists to work.`}
            {skipped > 0 &&
              ` ${skipped} of the ${selectedCount} selected ${skipped === 1 ? "is" : "are"} already there and will be left alone.`}
            {" "}You can take a case back out at any time from the Fee Petitions
            page — its checklist is kept.
          </DialogDescription>
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
          <Button type="button" variant="default" onClick={onConfirm} disabled={submitting}>
            {submitting ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <Receipt aria-hidden="true" className="h-4 w-4" />
            )}
            Add to Fee Petitions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
