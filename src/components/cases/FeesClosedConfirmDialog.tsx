"use client";

import { useRef, useState } from "react";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

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

  // ConfirmDialog already refuses to close mid-request; this adds what it can't
  // know about — abandoning the in-flight PATCH and dropping a stale error.
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
        ? { isClosed: true, feesClosedTrigger: null, nextFollowUpDate: null }
        : { isClosed: false, feesConfirmation: null, feesClosedTrigger: null };
      const logMessage = isClose
        ? "Fees Closed checked — moved to Fees Closed."
        : "Reopened from Fees Closed — moved back to the active dashboard. PIF and Fees Closed cleared.";
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
      // Deliberately not reset when aborted: the dialog is on its way out and
      // flipping this would flash the idle state during the close.
      if (!controller.signal.aborted) setSubmitting(false);
    }
  };

  return (
    <ConfirmDialog
      open={open}
      submitting={submitting}
      error={error}
      onConfirm={handleConfirm}
      onClose={handleDismiss}
      confirmLabel={isClose ? "Close case" : "Reopen case"}
      confirmVariant={isClose ? "default" : "secondary"}
      title={isClose ? "Close this case?" : "Reopen this case?"}
      description={
        isClose ? (
          <>
            <span className="font-semibold">{caseName}</span> will be moved to
            Fees Closed and removed from the active dashboard.
          </>
        ) : (
          <>
            <span className="font-semibold">{caseName}</span> will move back to
            the active dashboard. PIF and Fees Closed will be cleared.
          </>
        )
      }
    />
  );
}
