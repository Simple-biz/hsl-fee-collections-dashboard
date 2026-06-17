"use client";

import { useRef, useState } from "react";
import { Archive, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
            Archive {count === 1 ? "1 case" : `${count} cases`}?
          </DialogTitle>
          <DialogDescription>
            {count === 1
              ? "This case will be removed from the active list and moved to the Archive."
              : `These ${count} cases will be removed from the active list and moved to the Archive.`}{" "}
            They can be restored from the Archive page at any time.
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
            variant="destructive"
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <Archive aria-hidden="true" className="h-4 w-4" />
            )}
            Archive
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
