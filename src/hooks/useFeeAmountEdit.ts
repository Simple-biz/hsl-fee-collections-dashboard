"use client";

import { useState, useRef, useEffect } from "react";
import type { CaseRow } from "@/types";
import { fmtFull, parseCurrencyInput } from "@/lib/formatters";

export type FeeAmountField =
  | "t16Retro" | "t16FeeDue"
  | "t2Retro"  | "t2FeeDue"
  | "auxRetro" | "auxFeeDue";

// Mirrors the feeOverrides state shape in FeeRecordsTable so setFeeOverrides
// flows in without a cast.
type FeeOverrideKey =
  | "t16Retro" | "t16FeeDue" | "t16FeeReceived" | "t16FeeReceivedDate"
  | "t2Retro"  | "t2FeeDue"  | "t2FeeReceived"  | "t2FeeReceivedDate"
  | "auxRetro" | "auxFeeDue" | "auxFeeReceived"  | "auxFeeReceivedDate";

interface Params {
  setFeeOverrides: React.Dispatch<
    React.SetStateAction<Record<number, Partial<Pick<CaseRow, FeeOverrideKey>>>>
  >;
}

export interface FeeAmountEditState {
  feeAmountEdit: { caseId: number; field: FeeAmountField; draft: string } | null;
  setFeeAmountEdit: React.Dispatch<
    React.SetStateAction<{ caseId: number; field: FeeAmountField; draft: string } | null>
  >;
  feeAmountSaving: boolean;
  feeAmountError: string | null;
  setFeeAmountError: (msg: string | null) => void;
  handleFeeAmountSave: () => Promise<void>;
}

const LABEL_MAP: Record<FeeAmountField, string> = {
  t16Retro: "T16 Retro", t16FeeDue: "T16 Fee Due",
  t2Retro:  "T2 Retro",  t2FeeDue:  "T2 Fee Due",
  auxRetro: "AUX Retro", auxFeeDue: "AUX Fee Due",
};

export function useFeeAmountEdit({ setFeeOverrides }: Params): FeeAmountEditState {
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const [feeAmountEdit, setFeeAmountEdit] = useState<{
    caseId: number;
    field: FeeAmountField;
    draft: string;
  } | null>(null);
  const [feeAmountSaving, setFeeAmountSaving] = useState(false);
  const [feeAmountError, setFeeAmountError] = useState<string | null>(null);

  const handleFeeAmountSave = async () => {
    if (!feeAmountEdit || feeAmountSaving) return;
    const { caseId, field } = feeAmountEdit;
    // Fee Due is the only field where null is a meaningful, distinct value
    // ("never touched", renders "—") from an explicit $0.00 — Retro fields
    // still default to 0 at the DB level, so a bare "-" there is just invalid
    // input, not a clear-to-null gesture.
    const isFeeDue = field.endsWith("FeeDue");
    const clearing = isFeeDue && feeAmountEdit.draft.trim() === "-";
    const parsed = parseCurrencyInput(feeAmountEdit.draft);
    if (!clearing && (isNaN(parsed) || parsed < 0)) {
      setFeeAmountError(
        isFeeDue
          ? 'Enter a valid amount (0 or more), or "-" to clear.'
          : "Enter a valid amount (0 or more).",
      );
      return;
    }
    const amount: number | null = clearing ? null : parsed;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setFeeAmountSaving(true);
    setFeeAmountError(null);
    try {
      const res = await fetch(`/api/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feeFields: { [field]: amount },
          logMessage: clearing
            ? `${LABEL_MAP[field]} cleared`
            : `${LABEL_MAP[field]} updated to ${fmtFull(parsed)}`,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `Save failed (${res.status})`);
      }
      setFeeOverrides((prev) => ({
        ...prev,
        [caseId]: { ...prev[caseId], [field]: amount },
      }));
      setFeeAmountEdit(null);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setFeeAmountError((err as Error).message);
    } finally {
      if (!controller.signal.aborted) setFeeAmountSaving(false);
    }
  };

  return {
    feeAmountEdit,
    setFeeAmountEdit,
    feeAmountSaving,
    feeAmountError,
    setFeeAmountError,
    handleFeeAmountSave,
  };
}
