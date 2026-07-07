"use client";

import { useState } from "react";
import { RefreshCw, Save, X } from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";

const toStr = (v: number) => (v > 0 ? String(v) : "");
// Fee Due can be null (never touched) as well as a real 0 — collapse both
// to an empty box (matches toStr's "0 shows blank" convention for the
// other fields) but keep the type honest.
const toStrFeeDue = (v: number | null) => ((v ?? 0) > 0 ? String(v) : "");

interface FeeEditModalProps {
  dark: boolean;
  caseId: string;
  t16Retro: number;
  t16FeeDue: number | null;
  t16FeeReceived: number;
  t16FeeReceivedDate: string | null;
  t2Retro: number;
  t2FeeDue: number | null;
  t2FeeReceived: number;
  t2FeeReceivedDate: string | null;
  auxRetro: number;
  auxFeeDue: number | null;
  auxFeeReceived: number;
  auxFeeReceivedDate: string | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

export default function FeeEditModal({
  dark,
  caseId,
  onClose,
  onSaved,
  ...orig
}: FeeEditModalProps) {
  const t = themeClasses(dark);

  // Single flat state object — one setState call per keystroke, no nested components
  const [f, setF] = useState({
    t16Retro: toStr(orig.t16Retro),
    t16Due: toStrFeeDue(orig.t16FeeDue),
    t16Rcv: toStr(orig.t16FeeReceived),
    t16Dt: orig.t16FeeReceivedDate || "",
    t2Retro: toStr(orig.t2Retro),
    t2Due: toStrFeeDue(orig.t2FeeDue),
    t2Rcv: toStr(orig.t2FeeReceived),
    t2Dt: orig.t2FeeReceivedDate || "",
    auxRetro: toStr(orig.auxRetro),
    auxDue: toStrFeeDue(orig.auxFeeDue),
    auxRcv: toStr(orig.auxFeeReceived),
    auxDt: orig.auxFeeReceivedDate || "",
  });
  const [saving, setSaving] = useState(false);

  const set =
    (key: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setF((prev) => ({ ...prev, [key]: e.target.value }));

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
      // Fee Due needs the raw box string, not the pre-parsed number — an
      // empty box means "didn't touch it" (keep whatever it was, null or
      // not), while an explicit "0" is a real, distinct value that a plain
      // numeric diff can't tell apart from null (JS coerces null to 0 in
      // arithmetic, which would silently swallow an intentional $0.00 edit).
      const chkFeeDue = (rawStr: string, ov: number | null, key: string, label: string) => {
        const touched = rawStr.trim() !== "";
        const nv = touched ? parseFloat(rawStr) || 0 : ov;
        if (nv !== ov) {
          feeFields[key] = nv;
          changes.push(`${label}: ${ov == null ? "—" : `$${ov}`} → $${nv}`);
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
      chkFeeDue(f.t16Due, orig.t16FeeDue, "t16FeeDue", "T16 Fee Due");
      chk(parseFloat(f.t16Rcv) || 0, orig.t16FeeReceived, "t16FeeReceived", "T16 Received");
      chkDt(f.t16Dt, orig.t16FeeReceivedDate, "t16FeeReceivedDate", "T16 Date");

      chk(parseFloat(f.t2Retro) || 0, orig.t2Retro, "t2Retro", "T2 Retro");
      chkFeeDue(f.t2Due, orig.t2FeeDue, "t2FeeDue", "T2 Fee Due");
      chk(parseFloat(f.t2Rcv) || 0, orig.t2FeeReceived, "t2FeeReceived", "T2 Received");
      chkDt(f.t2Dt, orig.t2FeeReceivedDate, "t2FeeReceivedDate", "T2 Date");

      chk(parseFloat(f.auxRetro) || 0, orig.auxRetro, "auxRetro", "AUX Retro");
      chkFeeDue(f.auxDue, orig.auxFeeDue, "auxFeeDue", "AUX Fee Due");
      chk(parseFloat(f.auxRcv) || 0, orig.auxFeeReceived, "auxFeeReceived", "AUX Received");
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
  const lbl = `text-[12px] font-semibold uppercase tracking-wider ${t.textMuted}`;
  const inpCls = `mt-1 h-7 px-2 rounded border text-[14px] outline-none w-full ${t.inputBg}`;

  const field = (label: string, value: string, onChange: (e: React.ChangeEvent<HTMLInputElement>) => void, type: "number" | "date" = "number") => (
    <div>
      <p className={lbl}>{label}</p>
      <input
        type={type}
        step={type === "number" ? "0.01" : undefined}
        value={value}
        onChange={onChange}
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
            <p className={`text-[12px] ${t.textMuted} mt-0.5`}>
              Retro, Fee Due, and Fee Received are independently editable. Pending is auto-calculated (Fee Due − Received).
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
              {field("Retro Amount", f.t16Retro, set("t16Retro"))}
              {field("Fee Due", f.t16Due, set("t16Due"))}
              {field("Fee Received", f.t16Rcv, set("t16Rcv"))}
              {field("Date Received", f.t16Dt, set("t16Dt"), "date")}
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
              {field("Retro Amount", f.t2Retro, set("t2Retro"))}
              {field("Fee Due", f.t2Due, set("t2Due"))}
              {field("Fee Received", f.t2Rcv, set("t2Rcv"))}
              {field("Date Received", f.t2Dt, set("t2Dt"), "date")}
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
              {field("Retro Amount", f.auxRetro, set("auxRetro"))}
              {field("Fee Due", f.auxDue, set("auxDue"))}
              {field("Fee Received", f.auxRcv, set("auxRcv"))}
              {field("Date Received", f.auxDt, set("auxDt"), "date")}
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
