"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Plus, Trash2, Loader2, ChevronDown } from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import { fmtFull, fmtDate } from "@/lib/formatters";
import type { FeePayment } from "@/types";

interface FeePaymentPanelProps {
  caseId: number;
  feeType: "t16" | "t2" | "aux";
  currentTotal: number;
  mostRecentDate: string | null;
  canEdit: boolean;
  dark: boolean;
  onAdded: (amount: number, receivedDate: string) => void;
  onDeleted: (amount: number) => void;
}

export function FeePaymentPanel({
  caseId,
  feeType,
  currentTotal,
  mostRecentDate,
  canEdit,
  dark,
  onAdded,
  onDeleted,
}: FeePaymentPanelProps) {
  const t = themeClasses(dark);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [payments, setPayments] = useState<FeePayment[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [newDate, setNewDate] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newNote, setNewNote] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchPayments = useCallback((signal: AbortSignal) => {
    setLoadError(null);
    fetch(`/api/cases/${caseId}/payments?feeType=${feeType}`, { signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load payments (${res.status})`);
        return res.json();
      })
      .then((data) => setPayments(data.payments as FeePayment[]))
      .catch((err: Error) => {
        if (err.name === "AbortError") return;
        setLoadError(err.message);
      });
  }, [caseId, feeType]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetchPayments(controller.signal);
    return () => controller.abort();
  }, [open, fetchPayments]);

  // Close on click-outside and Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onMouse = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onMouse);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onMouse);
    };
  }, [open]);

  const handleOpen = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const panelWidth = 320;
    const left = Math.min(rect.left, window.innerWidth - panelWidth - 8);
    setPanelPos({ top: rect.bottom + 4, left: Math.max(8, left) });
    setOpen((v) => !v);
  };

  const handleAdd = async () => {
    const amount = parseFloat(newAmount);
    if (!newDate || isNaN(amount) || amount <= 0) {
      setAddError("Enter a valid date and positive amount.");
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch(`/api/cases/${caseId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feeType, amount, receivedDate: newDate, note: newNote || undefined }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Failed to add payment (${res.status})`);
      }
      const { payment } = await res.json();
      setPayments((prev) => [...(prev ?? []), payment]);
      onAdded(amount, newDate);
      setNewDate("");
      setNewAmount("");
      setNewNote("");
    } catch (e) {
      setAddError((e as Error).message);
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (payment: FeePayment) => {
    setDeletingId(payment.id);
    try {
      const res = await fetch(`/api/payments/${payment.id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Failed to delete (${res.status})`);
      }
      setPayments((prev) => (prev ?? []).filter((p) => p.id !== payment.id));
      onDeleted(payment.amount);
    } catch {
      // silently swallow — the list stays unchanged
    } finally {
      setDeletingId(null);
    }
  };

  const label = mostRecentDate ? fmtDate(mostRecentDate) : "—";
  const count = payments?.length;
  const displayLabel = open && count != null && count > 1 ? `${count} payments` : label;

  const panelContent = (
    <div
      ref={panelRef}
      style={{ top: panelPos.top, left: panelPos.left, width: 320, zIndex: 9999 }}
      className={`fixed rounded-xl border shadow-xl ${t.card} p-4 space-y-3`}
    >
      <div className="flex items-center justify-between">
        <span className={`text-[13px] font-semibold uppercase tracking-wide ${t.textMuted}`}>
          {feeType.toUpperCase()} Payment History
        </span>
        <span className={`text-[13px] font-medium ${t.textSub}`}>
          Total: {fmtFull(currentTotal)}
        </span>
      </div>

      {/* Payment list */}
      {!payments && !loadError && (
        <div className={`flex items-center gap-2 text-[14px] ${t.textMuted}`}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Loading…
        </div>
      )}
      {loadError && (
        <p className="text-[14px] text-red-500" role="alert">{loadError}</p>
      )}
      {payments && payments.length === 0 && (
        <p className={`text-[14px] ${t.textMuted}`}>No payment records yet.</p>
      )}
      {payments && payments.length > 0 && (
        <div className="space-y-1 max-h-52 overflow-y-auto">
          {payments.map((p) => (
            <div
              key={p.id}
              className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 ${dark ? "bg-neutral-800/60" : "bg-neutral-50"}`}
            >
              <div className="min-w-0">
                <div className={`text-[14px] font-semibold tabular-nums ${dark ? "text-emerald-400" : "text-emerald-600"}`}>
                  {fmtFull(p.amount)}
                </div>
                <div className={`text-[13px] ${t.textMuted}`}>
                  {fmtDate(p.receivedDate)}
                  {p.note && <span className="ml-1 italic">· {p.note}</span>}
                </div>
              </div>
              {canEdit && (
                <button
                  onClick={() => handleDelete(p)}
                  disabled={deletingId === p.id}
                  className={`shrink-0 rounded p-1 transition-colors ${dark ? "text-neutral-500 hover:text-red-400 hover:bg-red-900/20" : "text-neutral-400 hover:text-red-600 hover:bg-red-50"} disabled:opacity-40`}
                  aria-label={`Delete payment of ${fmtFull(p.amount)}`}
                >
                  {deletingId === p.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    : <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add payment form */}
      {canEdit && (
        <div className={`border-t pt-3 ${t.borderLight}`}>
          <p className={`text-[13px] font-semibold uppercase tracking-wide ${t.textMuted} mb-2`}>
            Add payment
          </p>
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className={`rounded-md border px-2 py-1.5 text-[14px] w-full ${t.inputBg}`}
                aria-label="Payment date"
              />
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                placeholder="Amount"
                className={`rounded-md border px-2 py-1.5 text-[14px] w-full ${t.inputBg}`}
                aria-label="Payment amount"
              />
            </div>
            <input
              type="text"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Note (optional)"
              maxLength={200}
              className={`rounded-md border px-2 py-1.5 text-[14px] w-full ${t.inputBg}`}
              aria-label="Payment note"
            />
            {addError && (
              <p className="text-[13px] text-red-500" role="alert">{addError}</p>
            )}
            <button
              onClick={handleAdd}
              disabled={adding}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[14px] font-medium transition-colors w-full justify-center ${dark ? "bg-emerald-700 hover:bg-emerald-600 text-white" : "bg-emerald-600 hover:bg-emerald-700 text-white"} disabled:opacity-50`}
            >
              {adding
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                : <Plus className="h-3.5 w-3.5" aria-hidden="true" />}
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <button
        ref={triggerRef}
        onClick={handleOpen}
        className={`flex items-center gap-1 text-[14px] rounded px-1 py-0.5 transition-colors ${t.hover} ${t.textSub}`}
        aria-label={`${feeType.toUpperCase()} payment history`}
        aria-expanded={open}
      >
        <span className="tabular-nums">{displayLabel}</span>
        <ChevronDown
          className={`h-3 w-3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && typeof document !== "undefined" && createPortal(panelContent, document.body)}
    </>
  );
}
