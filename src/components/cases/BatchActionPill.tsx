"use client";

import { Check, Loader2, Plus, Archive, X, Receipt } from "lucide-react";
import type { ApprovedByOption } from "@/types";

interface Props {
  selectedIds: Set<number>;
  mode: string;
  isAdmin: boolean;
  canFinalize: boolean;
  canAddToFeePetitions: boolean;
  bulkOverpaidError: string | null;
  bulkReassignError: string | null;
  bulkCloseConfirmOpen: boolean;
  handleBatchFeesClosed: () => void;
  bulkOverpaidSaving: boolean;
  handleBatchMarkOverpaid: () => Promise<void>;
  feePetitionAddableIds: number[];
  bulkFeePetitionSaving: boolean;
  setFeePetitionPending: (v: { ids: number[]; selectedCount: number }) => void;
  setFeePetitionConfirmOpen: (v: boolean) => void;
  assignedOptions: ApprovedByOption[];
  bulkReassignSaving: boolean;
  handleBulkReassign: (assignedTo: string) => Promise<void>;
  archiveConfirmOpen: boolean;
  handleBatchArchive: () => void;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<number>>>;
}

export function BatchActionPill({
  selectedIds, mode, isAdmin, canFinalize, canAddToFeePetitions,
  bulkOverpaidError, bulkReassignError,
  bulkCloseConfirmOpen, handleBatchFeesClosed,
  bulkOverpaidSaving, handleBatchMarkOverpaid,
  feePetitionAddableIds, bulkFeePetitionSaving, setFeePetitionPending, setFeePetitionConfirmOpen,
  assignedOptions, bulkReassignSaving, handleBulkReassign,
  archiveConfirmOpen, handleBatchArchive,
  setSelectedIds,
}: Props) {
  return (
    <div className="pointer-events-none fixed bottom-6 left-0 right-0 z-50 flex flex-col items-center gap-2">
      {/* Fee-petition errors are deliberately absent here — that action
          now confirms in a dialog, which shows its own error where the
          click happened rather than behind the modal. */}
      {(bulkOverpaidError || bulkReassignError) && (
        <div
          role="alert"
          className="pointer-events-auto rounded-full bg-red-600 px-3 py-1 text-[12px] font-medium text-white shadow-lg"
        >
          {bulkOverpaidError ?? bulkReassignError}
        </div>
      )}
      <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-gray-900 px-4 py-2.5 shadow-2xl ring-1 ring-white/10 dark:bg-gray-800">
        <span className="text-[13px] font-semibold text-gray-300 pr-1 border-r border-white/20 mr-1">
          {selectedIds.size} selected
        </span>
        {mode !== "closed" && isAdmin && canFinalize && (
          <button
            onClick={handleBatchFeesClosed}
            disabled={bulkCloseConfirmOpen}
            className="h-7 px-3 rounded-full text-[13px] font-semibold flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50"
          >
            <Check aria-hidden="true" className="h-3 w-3" />
            Fees Closed
          </button>
        )}
        {isAdmin && canFinalize && (
          <button
            onClick={handleBatchMarkOverpaid}
            disabled={bulkOverpaidSaving}
            className="h-7 px-3 rounded-full text-[13px] font-semibold flex items-center gap-1.5 bg-amber-600 hover:bg-amber-500 text-white transition-colors disabled:opacity-50"
          >
            {bulkOverpaidSaving ? (
              <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
            ) : (
              <Plus aria-hidden="true" className="h-3 w-3" />
            )}
            Add to Overpaid Cases
          </button>
        )}
        {/* Open to every agent, unlike the actions around it — this is the
            replacement for the old "pick Fee Petition as the Level and the
            case appears there" behaviour. Hidden in closed mode: the Fee
            Petitions page excludes closed cases, so adding one there would
            flag a case that stays invisible until it's reopened. */}
        {canAddToFeePetitions && (
          <button
            onClick={() => {
              setFeePetitionPending({
                ids: feePetitionAddableIds,
                selectedCount: selectedIds.size,
              });
              setFeePetitionConfirmOpen(true);
            }}
            disabled={bulkFeePetitionSaving || feePetitionAddableIds.length === 0}
            title={
              feePetitionAddableIds.length === 0
                ? "All selected cases are already in Fee Petitions"
                : undefined
            }
            className="h-7 px-3 rounded-full text-[13px] font-semibold flex items-center gap-1.5 bg-teal-600 hover:bg-teal-500 text-white transition-colors disabled:opacity-50"
          >
            {bulkFeePetitionSaving ? (
              <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
            ) : (
              <Receipt aria-hidden="true" className="h-3 w-3" />
            )}
            Add to Fee Petitions
            {feePetitionAddableIds.length > 0 &&
              feePetitionAddableIds.length < selectedIds.size && (
                <span className="font-normal opacity-80">
                  ({feePetitionAddableIds.length})
                </span>
              )}
          </button>
        )}
        {isAdmin && assignedOptions.length > 0 && (
          <select
            value=""
            onChange={(e) => { if (e.target.value) void handleBulkReassign(e.target.value); }}
            disabled={bulkReassignSaving}
            aria-label="Reassign selected cases"
            className="h-7 px-2 rounded-full text-[13px] font-semibold bg-blue-600 hover:bg-blue-500 text-white border-0 outline-none cursor-pointer disabled:opacity-50 transition-colors"
          >
            <option value="" disabled>
              {bulkReassignSaving ? "Reassigning…" : "Reassign to…"}
            </option>
            {assignedOptions.filter((o) => o.isActive).map((o) => (
              <option key={o.id} value={o.name}>{o.name}</option>
            ))}
          </select>
        )}
        {isAdmin && (
          <button
            onClick={handleBatchArchive}
            disabled={archiveConfirmOpen}
            className="h-7 px-3 rounded-full text-[13px] font-semibold flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 text-white transition-colors disabled:opacity-50"
          >
            <Archive aria-hidden="true" className="h-3 w-3" />
            Archive
          </button>
        )}
        <button
          onClick={() => setSelectedIds(new Set())}
          aria-label="Clear selection"
          className="h-7 w-7 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-gray-300 transition-colors ml-1"
        >
          <X aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
