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
  onClosed: () => void;
}

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

export function BulkFeesClosedConfirmDialog({
  open,
  caseIds,
  onClose,
  onClosed,
}: BulkFeesClosedConfirmDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const count = caseIds.length;

  const handleConfirm = async () => {
    if (submitting) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setSubmitting(true);
    setError(null);

    const results = await Promise.allSettled(
      caseIds.map((id) => closeSingleCase(id, controller.signal)),
    );
    if (controller.signal.aborted) return;

    const failed = results.filter((r) => r.status === "rejected").length;
    setSubmitting(false);

    if (failed > 0) {
      setError(
        failed === count
          ? `Failed to close ${failed === 1 ? "the case" : `all ${failed} cases`}.`
          : `${failed} of ${count} cases failed to close — the rest were closed successfully.`,
      );
      onClosed();
      return;
    }
    onClosed();
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
