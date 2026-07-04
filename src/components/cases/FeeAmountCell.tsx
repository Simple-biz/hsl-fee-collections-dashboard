"use client";

import { Check, Loader2, Pencil, X } from "lucide-react";
import { fmtFull } from "@/lib/formatters";

const currency = (v: number) => (v > 0 ? fmtFull(v) : "—");

export interface FeeAmountCellProps {
  active: boolean;
  value: number;
  draft: string;
  saving: boolean;
  error: string | null;
  canEdit: boolean;
  saveLabel: string;
  inputBg: string;
  hoverCls: string;
  textMuted: string;
  onEdit: () => void;
  onDraftChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  // Class applied to the pencil button's hover-reveal wrapper — defaults to
  // an unnamed `group`/`group-hover`. Pass e.g. "opacity-0 group-hover/row:opacity-100"
  // when the ancestor row uses a named group (Tailwind's group/<name> syntax).
  pencilRevealClass?: string;
}

export function FeeAmountCell({
  active, value, draft, saving, error, canEdit,
  saveLabel, inputBg, hoverCls, textMuted,
  onEdit, onDraftChange, onSave, onCancel,
  pencilRevealClass = "opacity-0 group-hover:opacity-100",
}: FeeAmountCellProps) {
  if (active) {
    return (
      <div className="flex flex-col items-end gap-1 min-w-[110px]">
        <div className="flex items-center gap-0.5">
          <input
            type="number" min="0" step="0.01" value={draft} autoFocus
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onSave(); if (e.key === "Escape") onCancel(); }}
            className={`h-6 px-1.5 rounded border text-[11px] outline-none w-24 text-right ${inputBg}`}
          />
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin ml-0.5" aria-hidden="true" />
          ) : (
            <>
              <button type="button" onClick={onSave} className="p-0.5 rounded text-emerald-500 hover:bg-emerald-500/10 transition-colors" aria-label={`Save ${saveLabel}`}>
                <Check className="h-3 w-3" aria-hidden="true" />
              </button>
              <button type="button" onClick={onCancel} className={`p-0.5 rounded transition-colors ${hoverCls}`} aria-label="Cancel">
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </>
          )}
        </div>
        {error && <p role="alert" className="text-[10px] text-red-500">{error}</p>}
      </div>
    );
  }
  return (
    <div className="flex items-center justify-end gap-1">
      <span>{currency(value)}</span>
      {canEdit && (
        <button type="button" onClick={onEdit} className={`${pencilRevealClass} transition-colors p-0.5 rounded ${hoverCls}`} aria-label={`Edit ${saveLabel}`}>
          <Pencil className={`h-3 w-3 ${textMuted}`} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
