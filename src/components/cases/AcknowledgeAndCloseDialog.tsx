"use client";

import { useState } from "react";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AcknowledgeAndCloseDialogProps {
  open: boolean;
  caseId: number | null;
  caseName: string;
  // The fee_records field whose value triggered this confirmation (e.g.
  // "feesConfirmation"). The value gets saved either way; "Yes" additionally
  // flips isClosed.
  triggerField: string;
  triggerValue: string;
  // Display label used in the dialog copy + activity log entry.
  triggerLabel: string;
  onClose: () => void; // dismiss without saving (revert the dropdown)
  onAcknowledged: () => void; // after a successful save (parent refreshes)
}

/**
 * Confirmation prompt shown after a dashboard cell change that may close
 * the case (e.g. Fees Confirmation = "Paid In Full"). Saves the value
 * either way; "Yes" additionally marks the case closed (moving it to
 * /fees-closed). Cancel saves nothing.
 */
export function AcknowledgeAndCloseDialog({
  open,
  caseId,
  caseName,
  triggerField,
  triggerValue,
  triggerLabel,
  onClose,
  onAcknowledged,
}: AcknowledgeAndCloseDialogProps) {
  const [submitting, setSubmitting] = useState<"close" | "keep" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (markClosed: boolean) => {
    if (caseId == null || submitting) return;
    setSubmitting(markClosed ? "close" : "keep");
    setError(null);
    try {
      const baseFields: Record<string, string | boolean | null> = {
        [triggerField]: triggerValue,
      };
      if (markClosed) {
        baseFields.isClosed = true;
        baseFields.nextFollowUpDate = null;
      }
      const res = await fetch(`/api/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feeFields: baseFields,
          logMessage: markClosed
            ? `${triggerLabel} set to "${triggerValue}"; marked closed and moved to Fees Closed.`
            : `${triggerLabel} set to "${triggerValue}".`,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Save failed (${res.status})`);
      }
      onAcknowledged();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && submitting === null) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark case as closed?</DialogTitle>
          <DialogDescription>
            <span className="font-semibold">{caseName}</span> will have{" "}
            <span className="font-semibold">{triggerLabel}</span> set to{" "}
            <span className="font-semibold">{triggerValue}</span>. Has this case
            already been closed? If so, it moves to Fees Closed and leaves the
            dashboard.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p
            role="alert"
            className="flex items-center gap-2 text-sm text-destructive"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}

        <DialogFooter className="mt-2 gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submitting !== null}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => submit(false)}
            disabled={submitting !== null}
          >
            {submitting === "keep" && (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            No, keep on dashboard
          </Button>
          <Button
            type="button"
            onClick={() => submit(true)}
            disabled={submitting !== null}
          >
            {submitting === "close" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            )}
            Yes, mark closed
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
