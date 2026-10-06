"use client";

import { useState, useRef, useEffect } from "react";
import type { CaseRow } from "@/types";

interface Params {
  onRefresh: () => void;
}

export interface WinSheetEditState {
  winSheetEditing: number | null;
  setWinSheetEditing: (id: number | null) => void;
  winSheetDraft: { url: string; text: string };
  setWinSheetDraft: React.Dispatch<React.SetStateAction<{ url: string; text: string }>>;
  winSheetSaving: number | null;
  winSheetError: string | null;
  setWinSheetError: (msg: string | null) => void;
  handleWinSheetSave: (c: CaseRow) => Promise<void>;
}

export function useWinSheetEdit({ onRefresh }: Params): WinSheetEditState {
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const [winSheetEditing, setWinSheetEditing] = useState<number | null>(null);
  const [winSheetDraft, setWinSheetDraft] = useState<{ url: string; text: string }>({ url: "", text: "" });
  const [winSheetSaving, setWinSheetSaving] = useState<number | null>(null);
  const [winSheetError, setWinSheetError] = useState<string | null>(null);

  const handleWinSheetSave = async (c: CaseRow) => {
    if (winSheetSaving != null) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setWinSheetSaving(c.id);
    setWinSheetError(null);
    try {
      const res = await fetch(`/api/cases/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feeFields: {
            winSheetLink: winSheetDraft.url ?? null,
            winSheetLinkText: winSheetDraft.text ?? null,
          },
          logMessage: "Win Sheet link updated.",
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `Save failed (${res.status})`);
      }
      setWinSheetEditing(null);
      onRefresh();
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setWinSheetError((err as Error).message);
    } finally {
      if (!controller.signal.aborted) setWinSheetSaving(null);
    }
  };

  return {
    winSheetEditing,
    setWinSheetEditing,
    winSheetDraft,
    setWinSheetDraft,
    winSheetSaving,
    winSheetError,
    setWinSheetError,
    handleWinSheetSave,
  };
}
