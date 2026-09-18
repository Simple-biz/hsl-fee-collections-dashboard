"use client";

import { MinusCircle } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

/**
 * Same database write, opposite sentiment depending on which tab you're on:
 *
 * - `remove` (Pending) — this case shouldn't be in the workflow. Taking it back out.
 * - `clear`  (Completed) — the petition is finished. Filing it away.
 *
 * Staff read a red "Remove" on a completed petition as undoing the approval,
 * which is why the verb changes even though the action doesn't.
 */
type RemovalVerb = "remove" | "clear";

interface RemoveFromFeePetitionsConfirmDialogProps {
  open: boolean;
  /** Number of cases affected — 1 for the per-row action. */
  count: number;
  /** Claimant name, for a single row, so the dialog names the case. */
  caseName?: string;
  /** Defaults to "remove"; Completed Petitions passes "clear". */
  verb?: RemovalVerb;
  submitting: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Confirm step for taking cases off the Fee Petitions page — shared by the
 * bulk action on the Pending tab and the per-row remove on Completed
 * Petitions, so both read identically.
 *
 * Removing is the only way out of this section now that the case's Level no
 * longer controls membership, which makes it a more consequential click than
 * it looks. It is still reversible — only the membership flag is cleared, and
 * "Add to Fee Petitions" on Master Fees restores the case with its checklist,
 * assignee, notes and approval intact — and the copy says so, so nobody
 * hesitates over a routine step.
 */
export function RemoveFromFeePetitionsConfirmDialog({
  open,
  count,
  caseName,
  verb = "remove",
  submitting,
  error,
  onConfirm,
  onClose,
}: RemoveFromFeePetitionsConfirmDialogProps) {
  const subject =
    count === 1 && caseName ? caseName : count === 1 ? "1 case" : `${count} cases`;
  const action = verb === "clear" ? "Clear" : "Remove";

  return (
    <ConfirmDialog
      open={open}
      submitting={submitting}
      error={error}
      onConfirm={onConfirm}
      onClose={onClose}
      confirmLabel={`${action} from Fee Petitions`}
      confirmIcon={MinusCircle}
      confirmVariant="destructive"
      title={`${action} ${subject} from Fee Petitions?`}
      description={
        verb === "clear" ? (
          <>
            {count === 1 ? "This petition is" : `These ${count} petitions are`} done,
            so {count === 1 ? "it" : "they"} will come off the Fee Petitions page.
            Checklist progress, the assigned specialist, notes and the approval
            are all kept.
          </>
        ) : (
          <>
            {count === 1 ? "This case" : `These ${count} cases`} will no longer
            appear on the Fee Petitions page. Checklist progress, the assigned
            specialist, notes and any approval are all kept — adding the{" "}
            {count === 1 ? "case" : "cases"} back from Master Fee Records
            restores everything exactly as it is now.
          </>
        )
      }
    />
  );
}
