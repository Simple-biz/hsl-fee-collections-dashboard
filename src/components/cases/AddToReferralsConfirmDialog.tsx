"use client";

import { useRef, useState } from "react";
import { UserPlus, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AddToReferralsConfirmDialogProps {
  open: boolean;
  count: number;
  submitting: boolean;
  error: string | null;
  onConfirm: (referredBy: string) => void;
  onClose: () => void;
}

export function AddToReferralsConfirmDialog({
  open,
  count,
  submitting,
  error,
  onConfirm,
  onClose,
}: AddToReferralsConfirmDialogProps) {
  const [referredBy, setReferredBy] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleOpenChange = (next: boolean) => {
    if (!next && !submitting) {
      setReferredBy("");
      onClose();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (referredBy.trim()) onConfirm(referredBy.trim());
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            Add {count === 1 ? "1 case" : `${count} cases`} to Referrals?
          </DialogTitle>
          <DialogDescription>
            {count === 1
              ? "This case will appear on the Referrals page."
              : `These ${count} cases will appear on the Referrals page.`}{" "}
            If a case is already there its referrer name will be updated.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="referred-by">Referral Source</Label>
            <Input
              id="referred-by"
              ref={inputRef}
              placeholder="Name of referrer"
              value={referredBy}
              onChange={(e) => setReferredBy(e.target.value)}
              maxLength={200}
              disabled={submitting}
              autoComplete="off"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting || !referredBy.trim()}
              className="gap-1.5"
            >
              {submitting ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus aria-hidden="true" className="h-4 w-4" />
              )}
              Add to Referrals
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
