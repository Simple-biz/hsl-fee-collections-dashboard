"use client";

import { useState } from "react";
import { RefreshCw, Save, X } from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import { fmtFull } from "@/lib/formatters";

const computeFeeDue = (retro: number, cap: number) =>
  Math.min(retro * 0.25, cap);
const computePending = (due: number, received: number) =>
  Math.max(due - received, 0);
const toStr = (v: number) => (v > 0 ? String(v) : "");

// Fee Due/Pending auto-calculate from Retro/Received, but a case can already
// carry a value that doesn't match the formula (a negotiated fee, an old
// sheet import) — start those in "override" mode instead of silently
// snapping them to the computed number when the modal opens.
type OverrideKey =
  | "t16DueOverride" | "t16PendOverride"
  | "t2DueOverride" | "t2PendOverride"
  | "auxDueOverride" | "auxPendOverride";
const initOverride = (savedValue: number, autoValue: number) =>
  Math.abs(savedValue - autoValue) > 0.001 ? savedValue.toFixed(2) : null;

interface FeeEditModalProps {
  dark: boolean;
  feeCap: number;
  caseId: string;
  t16Retro: number;
  t16FeeDue: number;
  t16FeeReceived: number;
  t16Pending: number;
  t16FeeReceivedDate: string | null;
  t2Retro: number;
  t2FeeDue: number;
  t2FeeReceived: number;
  t2Pending: number;
  t2FeeReceivedDate: string | null;
  auxRetro: number;
  auxFeeDue: number;
  auxFeeReceived: number;
  auxPending: number;
  auxFeeReceivedDate: string | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

export default function FeeEditModal({
  dark,
  feeCap,
  caseId,
  onClose,
  onSaved,
  ...orig
}: FeeEditModalProps) {
  const t = themeClasses(dark);

  // Single flat state object — one setState call per keystroke, no nested components
  const [f, setF] = useState({
    t16Retro: toStr(orig.t16Retro),
    t16Rcv: toStr(orig.t16FeeReceived),
    t16Dt: orig.t16FeeReceivedDate || "",
    t16DueOverride: initOverride(orig.t16FeeDue, computeFeeDue(orig.t16Retro, feeCap)),
    t16PendOverride: initOverride(orig.t16Pending, computePending(orig.t16FeeDue, orig.t16FeeReceived)),
    t2Retro: toStr(orig.t2Retro),
    t2Rcv: toStr(orig.t2FeeReceived),
    t2Dt: orig.t2FeeReceivedDate || "",
    t2DueOverride: initOverride(orig.t2FeeDue, computeFeeDue(orig.t2Retro, feeCap)),
    t2PendOverride: initOverride(orig.t2Pending, computePending(orig.t2FeeDue, orig.t2FeeReceived)),
    auxRetro: toStr(orig.auxRetro),
    auxRcv: toStr(orig.auxFeeReceived),
    auxDt: orig.auxFeeReceivedDate || "",
    auxDueOverride: initOverride(orig.auxFeeDue, computeFeeDue(orig.auxRetro, feeCap)),
    auxPendOverride: initOverride(orig.auxPending, computePending(orig.auxFeeDue, orig.auxFeeReceived)),
  });
  const [saving, setSaving] = useState(false);

  const set =
    (key: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setF((prev) => ({ ...prev, [key]: e.target.value }));
  const resetOverride = (key: OverrideKey) => () =>
    setF((prev) => ({ ...prev, [key]: null }));

  // Computed — each falls back to the formula unless the user has directly
  // edited that field (tracked by its *Override string being non-null).
  const t16DueAuto = computeFeeDue(parseFloat(f.t16Retro) || 0, feeCap);
  const t16Due = f.t16DueOverride != null ? parseFloat(f.t16DueOverride) || 0 : t16DueAuto;
  const t16PendAuto = computePending(t16Due, parseFloat(f.t16Rcv) || 0);
  const t16Pend = f.t16PendOverride != null ? parseFloat(f.t16PendOverride) || 0 : t16PendAuto;

  const t2DueAuto = computeFeeDue(parseFloat(f.t2Retro) || 0, feeCap);
  const t2Due = f.t2DueOverride != null ? parseFloat(f.t2DueOverride) || 0 : t2DueAuto;
  const t2PendAuto = computePending(t2Due, parseFloat(f.t2Rcv) || 0);
  const t2Pend = f.t2PendOverride != null ? parseFloat(f.t2PendOverride) || 0 : t2PendAuto;

  const auxDueAuto = computeFeeDue(parseFloat(f.auxRetro) || 0, feeCap);
  const auxDue = f.auxDueOverride != null ? parseFloat(f.auxDueOverride) || 0 : auxDueAuto;
  const auxPendAuto = computePending(auxDue, parseFloat(f.auxRcv) || 0);
  const auxPend = f.auxPendOverride != null ? parseFloat(f.auxPendOverride) || 0 : auxPendAuto;

  const handleSave = async () => {
    setSaving(true);
    try {
      const feeFields: Record<string, number | string | null> = {};
      const changes: string[] = [];

      const chk = (nv: number, ov: number, key: string, label: string) => {
        if (Math.abs(nv - ov) > 0.001) {
          feeFields[key] = nv;
          changes.push(`${label}: $${ov} → $${nv}`);
        }
      };
      const chkDt = (
        nv: string,
        ov: string | null,
        key: string,
        label: string,
      ) => {
        if (nv !== (ov || "")) {
          feeFields[key] = nv || null;
          changes.push(`${label}: ${nv || "cleared"}`);
        }
      };

      chk(parseFloat(f.t16Retro) || 0, orig.t16Retro, "t16Retro", "T16 Retro");
      chk(t16Due, orig.t16FeeDue, "t16FeeDue", "T16 Fee Due");
      chk(
        parseFloat(f.t16Rcv) || 0,
        orig.t16FeeReceived,
        "t16FeeReceived",
        "T16 Received",
      );
      chk(t16Pend, orig.t16Pending, "t16Pending", "T16 Pending");
      chkDt(f.t16Dt, orig.t16FeeReceivedDate, "t16FeeReceivedDate", "T16 Date");

      chk(parseFloat(f.t2Retro) || 0, orig.t2Retro, "t2Retro", "T2 Retro");
      chk(t2Due, orig.t2FeeDue, "t2FeeDue", "T2 Fee Due");
      chk(
        parseFloat(f.t2Rcv) || 0,
        orig.t2FeeReceived,
        "t2FeeReceived",
        "T2 Received",
      );
      chk(t2Pend, orig.t2Pending, "t2Pending", "T2 Pending");
      chkDt(f.t2Dt, orig.t2FeeReceivedDate, "t2FeeReceivedDate", "T2 Date");

      chk(parseFloat(f.auxRetro) || 0, orig.auxRetro, "auxRetro", "AUX Retro");
      chk(auxDue, orig.auxFeeDue, "auxFeeDue", "AUX Fee Due");
      chk(
        parseFloat(f.auxRcv) || 0,
        orig.auxFeeReceived,
        "auxFeeReceived",
        "AUX Received",
      );
      chk(auxPend, orig.auxPending, "auxPending", "AUX Pending");
      chkDt(f.auxDt, orig.auxFeeReceivedDate, "auxFeeReceivedDate", "AUX Date");

      if (changes.length === 0) {
        onClose();
        return;
      }

      const res = await fetch(`/api/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feeFields,
          logMessage: "Fee update: " + changes.join("; ") + ".",
        }),
      });
      if (!res.ok) throw new Error("Failed");
      onClose();
      await onSaved();
    } catch {
      /* */
    } finally {
      setSaving(false);
    }
  };

  // Styles
  const lbl = `text-[10px] font-semibold uppercase tracking-wider ${t.textMuted}`;
  const inpCls = `mt-1 h-7 px-2 rounded border text-[12px] outline-none w-full ${t.inputBg}`;
  const amber = dark ? "text-amber-400" : "text-amber-600";

  // Fee Due/Pending default to the formula but stay editable — typing into
  // one switches it to "override" mode (its value sticks even if Retro or
  // Received changes) until reset back to auto.
  const autoField = (
    label: string,
    overrideKey: OverrideKey,
    overrideVal: string | null,
    autoVal: number,
  ) => (
    <div>
      <p className={lbl}>
        {label}{" "}
        {overrideVal == null ? (
          <span className="text-[8px] normal-case font-normal">(auto)</span>
        ) : (
          <button
            type="button"
            onClick={resetOverride(overrideKey)}
            className={`text-[8px] normal-case font-normal underline ${amber}`}
          >
            reset to auto
          </button>
        )}
      </p>
      <input
        type="number"
        step="0.01"
        value={overrideVal ?? autoVal.toFixed(2)}
        onChange={set(overrideKey)}
        className={inpCls}
      />
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50" />
      <div
        className={`relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl border ${t.card} p-6 mx-4`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className={`text-sm font-bold ${t.text}`}>Edit Fee Amounts</h3>
            <p className={`text-[10px] ${t.textMuted} mt-0.5`}>
              Fee Due = MIN(Retro × 25%, {fmtFull(feeCap)}) · Pending = Fee Due
              − Received — both editable; edits stick until reset to auto
            </p>
          </div>
          <button
            onClick={onClose}
            className={`h-7 w-7 rounded-md flex items-center justify-center ${t.hover} ${t.textSub}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5">
          {/* T16 */}
          <div className="space-y-2">
            <h4
              className={`text-xs font-bold ${dark ? "text-indigo-400" : "text-indigo-600"}`}
            >
              T16 (SSI)
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <p className={lbl}>Retro Amount</p>
                <input
                  type="number"
                  step="0.01"
                  value={f.t16Retro}
                  onChange={set("t16Retro")}
                  className={inpCls}
                />
              </div>
              {autoField("Fee Due", "t16DueOverride", f.t16DueOverride, t16DueAuto)}
              <div>
                <p className={lbl}>Fee Received</p>
                <input
                  type="number"
                  step="0.01"
                  value={f.t16Rcv}
                  onChange={set("t16Rcv")}
                  className={inpCls}
                />
              </div>
              {autoField("Pending", "t16PendOverride", f.t16PendOverride, t16PendAuto)}
              <div>
                <p className={lbl}>Date Received</p>
                <input
                  type="date"
                  value={f.t16Dt}
                  onChange={set("t16Dt")}
                  className={inpCls}
                />
              </div>
            </div>
          </div>

          {/* T2 */}
          <div className="space-y-2">
            <h4
              className={`text-xs font-bold ${dark ? "text-blue-400" : "text-blue-600"}`}
            >
              T2 (SSDI)
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <p className={lbl}>Retro Amount</p>
                <input
                  type="number"
                  step="0.01"
                  value={f.t2Retro}
                  onChange={set("t2Retro")}
                  className={inpCls}
                />
              </div>
              {autoField("Fee Due", "t2DueOverride", f.t2DueOverride, t2DueAuto)}
              <div>
                <p className={lbl}>Fee Received</p>
                <input
                  type="number"
                  step="0.01"
                  value={f.t2Rcv}
                  onChange={set("t2Rcv")}
                  className={inpCls}
                />
              </div>
              {autoField("Pending", "t2PendOverride", f.t2PendOverride, t2PendAuto)}
              <div>
                <p className={lbl}>Date Received</p>
                <input
                  type="date"
                  value={f.t2Dt}
                  onChange={set("t2Dt")}
                  className={inpCls}
                />
              </div>
            </div>
          </div>

          {/* AUX */}
          <div className="space-y-2">
            <h4
              className={`text-xs font-bold ${dark ? "text-violet-400" : "text-violet-600"}`}
            >
              AUX (Auxiliary)
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <p className={lbl}>Retro Amount</p>
                <input
                  type="number"
                  step="0.01"
                  value={f.auxRetro}
                  onChange={set("auxRetro")}
                  className={inpCls}
                />
              </div>
              {autoField("Fee Due", "auxDueOverride", f.auxDueOverride, auxDueAuto)}
              <div>
                <p className={lbl}>Fee Received</p>
                <input
                  type="number"
                  step="0.01"
                  value={f.auxRcv}
                  onChange={set("auxRcv")}
                  className={inpCls}
                />
              </div>
              {autoField("Pending", "auxPendOverride", f.auxPendOverride, auxPendAuto)}
              <div>
                <p className={lbl}>Date Received</p>
                <input
                  type="date"
                  value={f.auxDt}
                  onChange={set("auxDt")}
                  className={inpCls}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-current/10">
          <button
            onClick={onClose}
            className={`h-8 px-4 rounded-md border text-xs font-medium ${t.outlineBtn}`}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`h-8 px-4 rounded-md text-xs font-semibold flex items-center gap-1.5 ${t.ctaBtn} disabled:opacity-50`}
          >
            {saving ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : (
              <Save className="h-3 w-3" />
            )}{" "}
            Save All Fees
          </button>
        </div>
      </div>
    </div>
  );
}
