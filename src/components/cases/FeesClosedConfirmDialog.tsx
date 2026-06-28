"use client";

import { useRef, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface FeesClosedConfirmDialogProps {
  open: boolean;
  mode: "close" | "reopen";
  caseId: number | null;
  caseName: string;
  onClose: () => void;
  onConfirmed: () => void;
}

export function FeesClosedConfirmDialog({
  open,
  mode,
  caseId,
  caseName,
  onClose,
  onConfirmed,
}: FeesClosedConfirmDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const isClose = mode === "close";

  const handleDismiss = () => {
    controllerRef.current?.abort();
    setError(null);
    onClose();
  };

  const handleConfirm = async () => {
    if (caseId == null || submitting) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setSubmitting(true);
    setError(null);
    try {
      const feeFields = isClose
        ? { isClosed: true, feesClosedTrigger: null }
        : { isClosed: false, feesConfirmation: null, feesClosedTrigger: null };
      const logMessage = isClose
        ? "Fees Closed checked — moved to Fees Closed."
        : "Reopened from Fees Closed — moved back to the active dashboard. Fees Confirmation and Fees Closed cleared.";
      const res = await fetch(`/api/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feeFields, logMessage }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Save failed (${res.status})`);
      }
      onConfirmed();
      onClose();
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError((e as Error).message);
    } finally {
      if (!controller.signal.aborted) setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !submitting) handleDismiss();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isClose ? "Close this case?" : "Reopen this case?"}
          </DialogTitle>
          <DialogDescription>
            {isClose ? (
              <>
                <span className="font-semibold">{caseName}</span> will be moved
                to Fees Closed and removed from the active dashboard.
              </>
            ) : (
              <>
                <span className="font-semibold">{caseName}</span> will move back
                to the active dashboard. Fees Confirmation and Fees Closed will
                be cleared.
              </>
            )}
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
            onClick={handleDismiss}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={isClose ? "default" : "secondary"}
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {isClose ? "Close case" : "Reopen case"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
