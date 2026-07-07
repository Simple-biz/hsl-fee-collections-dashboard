"use client";

import { Check, Loader2, Pencil, X } from "lucide-react";
import { fmtFull } from "@/lib/formatters";

// allowExplicitZero distinguishes "never touched" (null, renders "—") from
// an explicitly-entered $0.00 (renders "$0.00") — currently only Fee Due
// tracks that distinction at the database level. Every other field using
// this cell (Retro, Fees Requested/Received) still collapses null and 0 to
// the same "—", matching their existing behavior.
const currency = (v: number | null, allowExplicitZero?: boolean) =>
  allowExplicitZero
    ? v == null ? "—" : fmtFull(v)
    : (v ?? 0) > 0 ? fmtFull(v as number) : "—";

export interface FeeAmountCellProps {
  active: boolean;
  value: number | null;
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
  // See currency() above — set for Fee Due cells only.
  allowExplicitZero?: boolean;
}

export function FeeAmountCell({
  active, value, draft, saving, error, canEdit,
  saveLabel, inputBg, hoverCls, textMuted,
  onEdit, onDraftChange, onSave, onCancel,
  pencilRevealClass = "opacity-0 group-hover:opacity-100",
  allowExplicitZero,
}: FeeAmountCellProps) {
  if (active) {
    return (
      <div className="flex flex-col items-end gap-1 min-w-[110px]">
        <div className="flex items-center gap-0.5">
          {/* Fee Due uses type="text" — a native number input sanitizes a
              bare "-" straight to "" before onChange ever sees it, which
              would silently break the clear-to-null gesture below. */}
          <input
            {...(allowExplicitZero
              ? { type: "text" as const, inputMode: "decimal" as const }
              : { type: "number" as const, min: "0", step: "0.01" })}
            value={draft} autoFocus
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onSave(); if (e.key === "Escape") onCancel(); }}
            title={allowExplicitZero ? 'Type "-" to clear back to blank' : undefined}
            className={`h-6 px-1.5 rounded border text-[13px] outline-none w-24 text-right ${inputBg}`}
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
        {error && <p role="alert" className="text-[12px] text-red-500">{error}</p>}
      </div>
    );
  }
  return (
    <div className="flex items-center justify-end gap-1">
      <span>{currency(value, allowExplicitZero)}</span>
      {canEdit && (
        <button type="button" onClick={onEdit} className={`${pencilRevealClass} transition-colors p-0.5 rounded ${hoverCls}`} aria-label={`Edit ${saveLabel}`}>
          <Pencil className={`h-3 w-3 ${textMuted}`} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
