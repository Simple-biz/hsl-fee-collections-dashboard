"use client";

import { useRef, useState } from "react";
import { Archive } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

interface ArchiveConfirmDialogProps {
  open: boolean;
  clientIds: number[];
  source: "active_sheet" | "fees_closed_sheet";
  onClose: () => void;
  onArchived: () => void;
}

export function ArchiveConfirmDialog({
  open,
  clientIds,
  source,
  onClose,
  onArchived,
}: ArchiveConfirmDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const count = clientIds.length;

  const handleConfirm = async () => {
    if (submitting) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/archive/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientIds, source }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `Archive failed (${res.status})`);
      }
      onArchived();
      onClose();
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  // ConfirmDialog already refuses to close mid-request; this adds the pieces it
  // can't know about — abandoning the in-flight archive and dropping a stale
  // error so reopening starts clean.
  const handleClose = () => {
    controllerRef.current?.abort();
    setError(null);
    onClose();
  };

  return (
    <ConfirmDialog
      open={open}
      submitting={submitting}
      error={error}
      onConfirm={handleConfirm}
      onClose={handleClose}
      confirmLabel="Archive"
      confirmIcon={Archive}
      confirmVariant="destructive"
      title={`Archive ${count === 1 ? "1 case" : `${count} cases`}?`}
      description={
        <>
          {count === 1
            ? "This case will be removed from the active list and moved to the Archive."
            : `These ${count} cases will be removed from the active list and moved to the Archive.`}{" "}
          They can be restored from the Archive page at any time.
        </>
      }
    />
  );
}
