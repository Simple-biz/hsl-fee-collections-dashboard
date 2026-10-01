"use client";

import { useState } from "react";
import type { CaseRow } from "@/types";
import { bulkMarkOverpaid } from "@/app/(dashboard)/overpaid-cases/actions";
import { bulkReassign, bulkAddToFeePetitions } from "@/app/(dashboard)/master-fees/actions";
import { skippedClosedCasesMessage } from "@/lib/formatters";

interface Params {
  selectedIds: Set<number>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<number>>>;
  setRowOverrides: React.Dispatch<React.SetStateAction<Record<number, Partial<CaseRow>>>>;
  mode: string;
}

export interface BulkActionsState {
  // Archive
  archiveConfirmOpen: boolean;
  setArchiveConfirmOpen: (v: boolean) => void;
  archivePendingIds: number[];
  archivePendingSource: "active_sheet" | "fees_closed_sheet";

  // Bulk close (Fees Closed)
  bulkCloseConfirmOpen: boolean;
  setBulkCloseConfirmOpen: (v: boolean) => void;
  bulkClosePendingIds: number[];

  // Mark overpaid
  bulkOverpaidSaving: boolean;
  bulkOverpaidError: string | null;
  setBulkOverpaidError: (v: string | null) => void;

  // Reassign
  bulkReassignSaving: boolean;
  bulkReassignError: string | null;
  setBulkReassignError: (v: string | null) => void;

  // Fee petitions
  bulkFeePetitionSaving: boolean;
  bulkFeePetitionError: string | null;
  setBulkFeePetitionError: (v: string | null) => void;
  feePetitionConfirmOpen: boolean;
  setFeePetitionConfirmOpen: (v: boolean) => void;
  feePetitionPending: { ids: number[]; selectedCount: number };
  setFeePetitionPending: (v: { ids: number[]; selectedCount: number }) => void;

  // Handlers
  handleBulkReassign: (assignedTo: string) => Promise<void>;
  handleBatchArchive: () => void;
  handleBatchFeesClosed: () => void;
  handleBatchMarkOverpaid: () => Promise<void>;
  handleBatchAddToFeePetitions: () => Promise<void>;
}

// Encapsulates all bulk-operation state and handlers for FeeRecordsTable.
// Dialog open/close for archive and fees-closed is driven by the returned
// state; the dialogs' onArchived/onSuccess callbacks live in the component
// JSX where they also call handleRefresh.
export function useBulkActions({
  selectedIds,
  setSelectedIds,
  setRowOverrides,
  mode,
}: Params): BulkActionsState {
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [archivePendingIds, setArchivePendingIds] = useState<number[]>([]);
  const [archivePendingSource, setArchivePendingSource] = useState<
    "active_sheet" | "fees_closed_sheet"
  >("active_sheet");

  const [bulkCloseConfirmOpen, setBulkCloseConfirmOpen] = useState(false);
  const [bulkClosePendingIds, setBulkClosePendingIds] = useState<number[]>([]);

  const [bulkOverpaidSaving, setBulkOverpaidSaving] = useState(false);
  const [bulkOverpaidError, setBulkOverpaidError] = useState<string | null>(null);

  const [bulkReassignSaving, setBulkReassignSaving] = useState(false);
  const [bulkReassignError, setBulkReassignError] = useState<string | null>(null);

  const [bulkFeePetitionSaving, setBulkFeePetitionSaving] = useState(false);
  const [bulkFeePetitionError, setBulkFeePetitionError] = useState<string | null>(null);
  const [feePetitionConfirmOpen, setFeePetitionConfirmOpen] = useState(false);
  // Snapshot taken when the confirm dialog opens — the dialog must not read
  // live selection state because confirming clears the selection, and the
  // dialog is still mounted through its close animation.
  const [feePetitionPending, setFeePetitionPending] = useState<{
    ids: number[];
    selectedCount: number;
  }>({ ids: [], selectedCount: 0 });

  const handleBulkReassign = async (assignedTo: string) => {
    if (selectedIds.size === 0 || bulkReassignSaving) return;
    setBulkReassignSaving(true);
    setBulkReassignError(null);
    const ids = Array.from(selectedIds);
    try {
      const result = await bulkReassign({ caseIds: ids, assignedTo });
      if (!result.ok) throw new Error(result.error);
      setRowOverrides((prev) => {
        const next = { ...prev };
        for (const id of ids) next[id] = { ...next[id], assigned: assignedTo === "" ? "—" : assignedTo };
        return next;
      });
      setSelectedIds(new Set());
    } catch (err) {
      setBulkReassignError((err as Error).message);
    } finally {
      setBulkReassignSaving(false);
    }
  };

  const handleBatchArchive = () => {
    if (selectedIds.size === 0) return;
    setArchivePendingIds(Array.from(selectedIds));
    setArchivePendingSource(mode === "closed" ? "fees_closed_sheet" : "active_sheet");
    setArchiveConfirmOpen(true);
  };

  const handleBatchFeesClosed = () => {
    if (selectedIds.size === 0) return;
    setBulkClosePendingIds(Array.from(selectedIds));
    setBulkCloseConfirmOpen(true);
  };

  // Adds the selected cases to the Overpaid Cases page independently of the
  // automatic PIF detection flag.
  const handleBatchMarkOverpaid = async () => {
    if (selectedIds.size === 0 || bulkOverpaidSaving) return;
    setBulkOverpaidSaving(true);
    setBulkOverpaidError(null);
    const ids = Array.from(selectedIds);
    try {
      const result = await bulkMarkOverpaid({ caseIds: ids });
      if (!result.ok) throw new Error(result.error);
      setRowOverrides((prev) => {
        const next = { ...prev };
        for (const id of ids) next[id] = { ...next[id], markedOverpaid: true };
        return next;
      });
      setSelectedIds(new Set());
    } catch (err) {
      setBulkOverpaidError((err as Error).message);
    } finally {
      setBulkOverpaidSaving(false);
    }
  };

  const handleBatchAddToFeePetitions = async () => {
    const ids = feePetitionPending.ids;
    if (ids.length === 0 || bulkFeePetitionSaving) return;
    setBulkFeePetitionSaving(true);
    setBulkFeePetitionError(null);
    try {
      const result = await bulkAddToFeePetitions({ caseIds: ids });
      if (!result.ok) throw new Error(result.error);
      // Mark only what the database actually updated. A case closed by someone
      // else between opening this dialog and confirming falls outside the
      // action's scope.
      setRowOverrides((prev) => {
        const next = { ...prev };
        for (const id of result.updated) next[id] = { ...next[id], inFeePetition: true };
        return next;
      });
      const missed = ids.length - result.updated.length;
      if (missed > 0) {
        setBulkFeePetitionError(skippedClosedCasesMessage(missed, ids.length, "added"));
        setSelectedIds(new Set());
        return;
      }
      setSelectedIds(new Set());
      setFeePetitionConfirmOpen(false);
    } catch (err) {
      // Leave the dialog open on failure so the error is read where the action
      // was taken, and Try Again is one click away.
      setBulkFeePetitionError((err as Error).message);
    } finally {
      setBulkFeePetitionSaving(false);
    }
  };

  return {
    archiveConfirmOpen,
    setArchiveConfirmOpen,
    archivePendingIds,
    archivePendingSource,
    bulkCloseConfirmOpen,
    setBulkCloseConfirmOpen,
    bulkClosePendingIds,
    bulkOverpaidSaving,
    bulkOverpaidError,
    setBulkOverpaidError,
    bulkReassignSaving,
    bulkReassignError,
    setBulkReassignError,
    bulkFeePetitionSaving,
    bulkFeePetitionError,
    setBulkFeePetitionError,
    feePetitionConfirmOpen,
    setFeePetitionConfirmOpen,
    feePetitionPending,
    setFeePetitionPending,
    handleBulkReassign,
    handleBatchArchive,
    handleBatchFeesClosed,
    handleBatchMarkOverpaid,
    handleBatchAddToFeePetitions,
  };
}
