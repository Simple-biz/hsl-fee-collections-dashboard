"use client";

import { Receipt } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

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
  // Selecting rows that are already in the section is normal — say what's
  // being skipped rather than silently acting on a smaller number than the
  // selection count the bar is showing.
  const skipped = selectedCount - count;

  return (
    <ConfirmDialog
      open={open}
      submitting={submitting}
      error={error}
      onConfirm={onConfirm}
      onClose={onClose}
      confirmLabel="Add to Fee Petitions"
      confirmIcon={Receipt}
      title={`Add ${count === 1 ? "1 case" : `${count} cases`} to Fee Petitions?`}
      description={
        <>
          {count === 1
            ? "This case will appear on the Fee Petitions page for the specialists to work."
            : `These ${count} cases will appear on the Fee Petitions page for the specialists to work.`}
          {skipped > 0 &&
            ` ${skipped} of the ${selectedCount} selected ${skipped === 1 ? "is" : "are"} already there and will be left alone.`}
          {" "}You can take a case back out at any time from the Fee Petitions
          page — its checklist is kept.
        </>
      }
    />
  );
}
