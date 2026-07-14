"use client";

import { useRef, useState } from "react";
import { Check, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface BulkFeesClosedConfirmDialogProps {
  open: boolean;
  caseIds: number[];
  onClose: () => void;
  // Fired after a partial failure so the parent can refresh table data
  // (some cases did close) without touching the row selection.
  onProgress: () => void;
  // Fired only once every targeted case has closed — parent clears the
  // selection and refreshes.
  onSuccess: () => void;
}

// Closing hundreds of selected cases at once shouldn't open hundreds of
// simultaneous connections to the (serverless) DB — cap how many PATCHes
// are in flight together, not how many cases can be closed in one go.
const CONCURRENCY = 8;

// Closes each selected case through the same PATCH the single-row Fees
// Closed checkbox used, so permission checks, the closed_at stamp, and
// activity logging all stay identical to that path — just fanned out.
const closeSingleCase = async (caseId: number, signal: AbortSignal) => {
  const res = await fetch(`/api/cases/${caseId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      feeFields: { isClosed: true, feesClosedTrigger: null, nextFollowUpDate: null },
      logMessage: "Fees Closed checked — moved to Fees Closed.",
    }),
    signal,
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error((j as { error?: string }).error ?? `Save failed (${res.status})`);
  }
};

// Runs the closes CONCURRENCY at a time and returns the ids that failed.
const closeCasesThrottled = async (
  ids: number[],
  signal: AbortSignal,
): Promise<number[]> => {
  const failed: number[] = [];
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const batch = ids.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((id) => closeSingleCase(id, signal)),
    );
    if (signal.aborted) return failed;
    batch.forEach((id, j) => {
      if (results[j].status === "rejected") failed.push(id);
    });
  }
  return failed;
};

export function BulkFeesClosedConfirmDialog({
  open,
  caseIds,
  onClose,
  onProgress,
  onSuccess,
}: BulkFeesClosedConfirmDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The working set — shrinks to just the failed ids after a partial
  // failure, so retrying only re-attempts the cases that actually failed
  // instead of re-closing (and re-stamping closed_at on) ones that already
  // succeeded.
  const [remainingIds, setRemainingIds] = useState<number[]>(caseIds);
  const controllerRef = useRef<AbortController | null>(null);

  // Reset the working set to the fresh selection each time the dialog opens
  // — adjusted during render (not an effect) per
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setRemainingIds(caseIds);
      setError(null);
    }
  }

  const count = remainingIds.length;

  const handleConfirm = async () => {
    if (submitting || count === 0) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setSubmitting(true);
    setError(null);

    const attempted = remainingIds;
    const failedIds = await closeCasesThrottled(attempted, controller.signal);
    if (controller.signal.aborted) return;
    setSubmitting(false);

    if (failedIds.length > 0) {
      setRemainingIds(failedIds);
      setError(
        failedIds.length === attempted.length
          ? `Failed to close ${failedIds.length === 1 ? "the case" : `all ${failedIds.length} cases`}.`
          : `${failedIds.length} of ${attempted.length} cases failed to close — the rest closed successfully. Try again to retry the failed one${failedIds.length === 1 ? "" : "s"}.`,
      );
      onProgress();
      return;
    }
    onSuccess();
    onClose();
  };

  const handleOpenChange = (v: boolean) => {
    if (!v && !submitting) {
      controllerRef.current?.abort();
      setError(null);
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Close {count === 1 ? "1 case" : `${count} cases`}?
          </DialogTitle>
          <DialogDescription>
            {count === 1
              ? "This case will be moved to Fees Closed and removed from the active dashboard."
              : `These ${count} cases will be moved to Fees Closed and removed from the active dashboard.`}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        <DialogFooter className="mt-2 gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="default"
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <Check aria-hidden="true" className="h-4 w-4" />
            )}
            Fees Closed
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
