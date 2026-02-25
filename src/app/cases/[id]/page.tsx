"use client";

import { useState, useEffect, useCallback, memo } from "react";
import { useTheme } from "next-themes";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  Clock,
  User,
  // MapPin,
  FileText,
  DollarSign,
  CheckCircle2,
  CalendarDays,
  MessageSquare,
  Pencil,
  Save,
  X,
  Send,
} from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import {
  fmtFull,
  fmtDate,
  fmtClaim,
  STATUS_LABELS_DETAIL,
  getStatusColor,
} from "@/lib/formatters";
import type { WinSheetStatus } from "@/types";
import FeeEditModal from "@/components/cases/FeeEditModal";

// ============================================================================
// Types
// ============================================================================

interface Activity {
  id: string;
  message: string;
  createdBy: string;
  createdAt: string;
}

interface CaseDetail {
  id: number;
  externalId: string | null;
  name: string;
  firstName: string;
  lastName: string;
  claim: string;
  level: string;
  t2Decision: string | null;
  t16Decision: string | null;
  approvalDate: string | null;
  office: string;
  assigned: string;
  status: string;

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

  totalRetroDue: number;
  expected: number;
  paid: number;
  outstanding: number;
  pif: string | null;
  approvedBy: string | null;
  feeMethod: string | null;
  applicableFeeCap: number;
  feeCapApplied: boolean;
  feeComputed: boolean;
  syncStatus: string;
  daysAfterApproval: number | null;
  approvalCategory: string | null;
  activities: Activity[];
}

const currency = (v: number) => (v > 0 ? fmtFull(v) : "—");
const toStr = (v: number) => (v > 0 ? String(v) : "");
const computeFeeDue = (retro: number, cap: number) =>
  Math.min(retro * 0.25, cap);
const computePending = (due: number, received: number) =>
  Math.max(due - received, 0);

// ============================================================================
// FeeSection — extracted as stable component (fixes focus loss)
// ============================================================================

interface FeeSectionProps {
  title: string;
  color: string;
  prefix: "t16" | "t2" | "aux";
  retro: number;
  due: number;
  received: number;
  pending: number;
  dateReceived: string | null;
  feeCap: number;
  caseId: string;
  dark: boolean;
  onSaved: () => Promise<void>;
}

const FeeSection = memo(
  ({
    title,
    color,
    prefix,
    retro,
    due,
    received,
    pending,
    dateReceived,
    feeCap,
    caseId,
    dark,
    onSaved,
  }: FeeSectionProps) => {
    const t = themeClasses(dark);
    const lbl = `text-[10px] font-semibold uppercase tracking-wider ${t.textMuted}`;
    const valCls = `text-[13px] font-semibold ${t.text} mt-0.5`;
    const inpCls = `mt-1 h-7 px-2 rounded border text-[12px] outline-none w-full ${t.inputBg}`;
    const sectionCard = `rounded-xl border ${t.card} p-4 md:p-5`;

    const [inlineEdit, setInlineEdit] = useState(false);
    const [localSaving, setLocalSaving] = useState(false);
    // Use a single state object to minimize re-renders
    const [fields, setFields] = useState({ lr: "", lrcv: "", ldt: "" });

    const computedDue = computeFeeDue(parseFloat(fields.lr) || 0, feeCap);
    const computedPending = computePending(
      computedDue,
      parseFloat(fields.lrcv) || 0,
    );

    const setField = (key: "lr" | "lrcv" | "ldt", val: string) => {
      setFields((prev) => ({ ...prev, [key]: val }));
    };

    const startEdit = () => {
      setFields({
        lr: toStr(retro),
        lrcv: toStr(received),
        ldt: dateReceived || "",
      });
      setInlineEdit(true);
    };
    const cancelInlineEdit = () => {
      setInlineEdit(false);
    };

    const saveInline = async () => {
      setLocalSaving(true);
      try {
        const feeFields: Record<string, number | string | null> = {};
        const changes: string[] = [];

        const newRetro = parseFloat(fields.lr) || 0;
        const newReceived = parseFloat(fields.lrcv) || 0;
        const newDue = computeFeeDue(newRetro, feeCap);
        const newPending = computePending(newDue, newReceived);

        if (newRetro !== retro) {
          feeFields[`${prefix}Retro`] = newRetro;
          changes.push(`${title} Retro: $${retro} → $${newRetro}`);
        }
        if (newDue !== due) {
          feeFields[`${prefix}FeeDue`] = newDue;
          changes.push(`${title} Fee Due: $${due} → $${newDue} (auto)`);
        }
        if (newReceived !== received) {
          feeFields[`${prefix}FeeReceived`] = newReceived;
          changes.push(`${title} Received: $${received} → $${newReceived}`);
        }
        if (newPending !== pending) {
          feeFields[`${prefix}Pending`] = newPending;
          changes.push(`${title} Pending: $${pending} → $${newPending} (auto)`);
        }
        if (fields.ldt !== (dateReceived || "")) {
          feeFields[`${prefix}FeeReceivedDate`] = fields.ldt || null;
          changes.push(`${title} Date: ${fields.ldt || "cleared"}`);
        }

        if (changes.length === 0) {
          setInlineEdit(false);
          setLocalSaving(false);
          return;
        }

        await fetch(`/api/cases/${caseId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            feeFields,
            logMessage: changes.join("; ") + ".",
            logAuthor: "UserTest",
          }),
        });
        setInlineEdit(false);
        await onSaved();
      } catch {
        /* */
      }
      setLocalSaving(false);
    };

    return (
      <div className={sectionCard}>
        <div className="flex items-center justify-between mb-3">
          <h4 className={`text-xs font-bold ${color}`}>{title}</h4>
          {!inlineEdit ? (
            <button
              onClick={startEdit}
              className={`text-[10px] font-medium ${t.textMuted} flex items-center gap-1`}
            >
              <Pencil className="h-2.5 w-2.5" /> Edit
            </button>
          ) : (
            <div className="flex gap-1.5">
              <button
                onClick={cancelInlineEdit}
                className={`text-[10px] font-medium ${t.textMuted} flex items-center gap-0.5`}
              >
                <X className="h-2.5 w-2.5" /> Cancel
              </button>
              <button
                onClick={saveInline}
                disabled={localSaving}
                className="text-[10px] font-semibold text-emerald-500 flex items-center gap-0.5 disabled:opacity-50"
              >
                {localSaving ? (
                  <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                ) : (
                  <Save className="h-2.5 w-2.5" />
                )}{" "}
                Save
              </button>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {inlineEdit ? (
            <>
              <div>
                <p className={lbl}>Retro Amount</p>
                <input
                  type="number"
                  step="0.01"
                  value={fields.lr}
                  onChange={(e) => setField("lr", e.target.value)}
                  className={inpCls}
                />
              </div>
              <div>
                <p className={lbl}>
                  Fee Due{" "}
                  <span className="text-[8px] normal-case font-normal">
                    (auto)
                  </span>
                </p>
                <p
                  className={`${valCls} ${dark ? "text-amber-400" : "text-amber-600"}`}
                >
                  {fmtFull(computedDue)}
                </p>
              </div>
              <div>
                <p className={lbl}>Fee Received</p>
                <input
                  type="number"
                  step="0.01"
                  value={fields.lrcv}
                  onChange={(e) => setField("lrcv", e.target.value)}
                  className={inpCls}
                />
              </div>
              <div>
                <p className={lbl}>
                  Pending{" "}
                  <span className="text-[8px] normal-case font-normal">
                    (auto)
                  </span>
                </p>
                <p
                  className={`${valCls} ${computedPending > 0 ? (dark ? "text-amber-400" : "text-amber-600") : t.textMuted}`}
                >
                  {fmtFull(computedPending)}
                </p>
              </div>
              <div>
                <p className={lbl}>Date Received</p>
                <input
                  type="date"
                  value={fields.ldt}
                  onChange={(e) => setField("ldt", e.target.value)}
                  className={inpCls}
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <p className={lbl}>Retro Amount</p>
                <p className={valCls}>{currency(retro)}</p>
              </div>
              <div>
                <p className={lbl}>Fee Due</p>
                <p className={valCls}>{currency(due)}</p>
              </div>
              <div>
                <p className={lbl}>Fee Received</p>
                <p
                  className={`text-[13px] font-semibold mt-0.5 ${received > 0 ? "text-emerald-500" : t.textMuted}`}
                >
                  {currency(received)}
                </p>
              </div>
              <div>
                <p className={lbl}>Pending</p>
                <p
                  className={`text-[13px] font-semibold mt-0.5 ${pending > 0 ? (dark ? "text-amber-400" : "text-amber-600") : t.textMuted}`}
                >
                  {currency(pending)}
                </p>
              </div>
              <div>
                <p className={lbl}>Date Received</p>
                <p className={valCls}>
                  {dateReceived ? fmtDate(dateReceived) : "—"}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    );
  },
);
FeeSection.displayName = "FeeSection";

// ============================================================================
// Main Page
// ============================================================================

const CaseDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted ? resolvedTheme === "dark" : false;
  const t = themeClasses(dark);

  const [caseData, setCaseData] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editAssigned, setEditAssigned] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editApprovalDate, setEditApprovalDate] = useState("");
  const [editOffice, setEditOffice] = useState("");
  const [editLevel, setEditLevel] = useState("");
  const [editT2Decision, setEditT2Decision] = useState("");
  const [editT16Decision, setEditT16Decision] = useState("");
  const [editFeeMethod, setEditFeeMethod] = useState("");
  const [editFeeCap, setEditFeeCap] = useState("");
  const [editApprovedBy, setEditApprovedBy] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // Fee modal
  const [feeModalOpen, setFeeModalOpen] = useState(false);

  // Activity
  const [newNote, setNewNote] = useState("");
  const [noteAuthor, setNoteAuthor] = useState("UserTest");
  const [postingNote, setPostingNote] = useState(false);
  const [teamMembers, setTeamMembers] = useState<string[]>([]);

  // ---- Fetch ----

  const fetchCase = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/cases/${id}`);
      if (!res.ok)
        throw new Error(
          res.status === 404 ? "Case not found" : "Failed to load case",
        );
      const json = await res.json();
      const data = { ...json.data, activities: json.data.activities || [] };
      setCaseData(data);
      populateEditState(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const populateEditState = (d: CaseDetail) => {
    setEditFirstName(d.firstName || "");
    setEditLastName(d.lastName || "");
    setEditAssigned(d.assigned || "");
    setEditStatus(d.status || "not_started");
    setEditApprovalDate(d.approvalDate || "");
    setEditOffice(d.office === "—" ? "" : d.office);
    setEditLevel(d.level === "—" ? "" : d.level);
    setEditT2Decision(d.t2Decision || "");
    setEditT16Decision(d.t16Decision || "");
    setEditFeeMethod(d.feeMethod || "fee_agreement");
    setEditFeeCap(String(d.applicableFeeCap || 9200));
    setEditApprovedBy(d.approvedBy || "");
  };

  useEffect(() => {
    fetchCase();
  }, [fetchCase]);
  useEffect(() => {
    fetch("/api/team-members")
      .then((r) => r.json())
      .then((d) =>
        setTeamMembers((d.data || []).map((m: { name: string }) => m.name)),
      )
      .catch(() => {});
  }, []);

  // ---- Save case info ----

  const handleSave = async () => {
    if (!caseData) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const caseFields: Record<string, string | null> = {};
      const feeFields: Record<string, string | number | boolean | null> = {};
      const changes: string[] = [];

      if (editFirstName !== caseData.firstName) {
        caseFields.firstName = editFirstName;
        changes.push(`First name → ${editFirstName}`);
      }
      if (editLastName !== caseData.lastName) {
        caseFields.lastName = editLastName;
        changes.push(`Last name → ${editLastName}`);
      }
      if (editApprovalDate !== (caseData.approvalDate || "")) {
        caseFields.approvalDate = editApprovalDate || null;
        changes.push(`Approval date → ${editApprovalDate || "cleared"}`);
      }
      if (editOffice !== (caseData.office === "—" ? "" : caseData.office)) {
        caseFields.officeWithJurisdiction = editOffice || null;
        changes.push(`Office → ${editOffice || "cleared"}`);
      }
      if (editLevel !== (caseData.level === "—" ? "" : caseData.level)) {
        caseFields.levelWon = editLevel || null;
        changes.push(`Level → ${editLevel || "cleared"}`);
      }
      if (editT2Decision !== (caseData.t2Decision || "")) {
        caseFields.t2Decision = editT2Decision || null;
        changes.push(`T2 decision → ${editT2Decision || "cleared"}`);
      }
      if (editT16Decision !== (caseData.t16Decision || "")) {
        caseFields.t16Decision = editT16Decision || null;
        changes.push(`T16 decision → ${editT16Decision || "cleared"}`);
      }
      if (editAssigned !== caseData.assigned) {
        feeFields.assignedTo = editAssigned || null;
        changes.push(`Assigned → ${editAssigned || "unassigned"}`);
      }
      if (editStatus !== caseData.status) {
        feeFields.winSheetStatus = editStatus;
        changes.push(
          `Status → ${STATUS_LABELS_DETAIL[editStatus] || editStatus}`,
        );
      }
      if (editFeeMethod !== (caseData.feeMethod || "fee_agreement")) {
        feeFields.feeMethod = editFeeMethod;
        changes.push(`Fee method → ${editFeeMethod.replace("_", " ")}`);
      }
      if (editFeeCap !== String(caseData.applicableFeeCap || 9200)) {
        feeFields.applicableFeeCap = parseFloat(editFeeCap) || 9200;
        changes.push(`Fee cap → $${editFeeCap}`);
      }
      if (editApprovedBy !== (caseData.approvedBy || "")) {
        feeFields.approvedBy = editApprovedBy || null;
        changes.push(`Approved by → ${editApprovedBy || "cleared"}`);
      }

      if (changes.length === 0) {
        setEditing(false);
        setSaving(false);
        return;
      }

      const res = await fetch(`/api/cases/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseFields:
            Object.keys(caseFields).length > 0 ? caseFields : undefined,
          feeFields: Object.keys(feeFields).length > 0 ? feeFields : undefined,
          logMessage: changes.join(". ") + ".",
          logAuthor: "UserTest",
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setSaveMsg("Saved!");
      setEditing(false);
      await fetchCase();
      setTimeout(() => setSaveMsg(null), 2000);
    } catch {
      setSaveMsg("Error saving");
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    if (caseData) populateEditState(caseData);
    setEditing(false);
  };

  // ---- Mark PIF ----

  const handleMarkPIF = async () => {
    if (!caseData) return;
    setSaving(true);
    try {
      await fetch(`/api/cases/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feeFields: { pifReadyToClose: true, winSheetStatus: "paid_in_full" },
          logMessage: "Marked as Paid in Full (PIF). Ready to close.",
          logAuthor: "UserTest",
        }),
      });
      await fetchCase();
    } catch {
      /* */
    }
    setSaving(false);
  };

  // ---- Post note ----

  const handlePostNote = async () => {
    if (!newNote.trim()) return;
    setPostingNote(true);
    try {
      const res = await fetch(`/api/cases/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: newNote.trim(),
          createdBy: noteAuthor,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      if (caseData)
        setCaseData({
          ...caseData,
          activities: [data.activity, ...caseData.activities],
        });
      setNewNote("");
    } catch {
      /* */
    }
    setPostingNote(false);
  };

  // ---- Style helpers ----

  const sectionCard = `rounded-xl border ${t.card} p-4 md:p-5`;
  const lbl = `text-[10px] font-semibold uppercase tracking-wider ${t.textMuted}`;
  const val = `text-[13px] font-semibold ${t.text} mt-0.5`;
  const inp = `mt-1 h-7 px-2 rounded border text-[12px] w-full outline-none ${t.inputBg}`;

  // ---- Render ----

  return (
    <div
      className={`min-h-screen ${dark ? "bg-neutral-950" : "bg-neutral-50"}`}
    >
      {/* Fee Modal */}
      {feeModalOpen && caseData && (
        <FeeEditModal
          dark={dark}
          feeCap={caseData.applicableFeeCap}
          caseId={id}
          t16Retro={caseData.t16Retro}
          t16FeeDue={caseData.t16FeeDue}
          t16FeeReceived={caseData.t16FeeReceived}
          t16Pending={caseData.t16Pending}
          t16FeeReceivedDate={caseData.t16FeeReceivedDate}
          t2Retro={caseData.t2Retro}
          t2FeeDue={caseData.t2FeeDue}
          t2FeeReceived={caseData.t2FeeReceived}
          t2Pending={caseData.t2Pending}
          t2FeeReceivedDate={caseData.t2FeeReceivedDate}
          auxRetro={caseData.auxRetro}
          auxFeeDue={caseData.auxFeeDue}
          auxFeeReceived={caseData.auxFeeReceived}
          auxPending={caseData.auxPending}
          auxFeeReceivedDate={caseData.auxFeeReceivedDate}
          onClose={() => setFeeModalOpen(false)}
          onSaved={fetchCase}
        />
      )}

      {/* Sticky top bar */}
      <div className={`sticky top-0 z-30 ${t.bg} border-b ${t.border}`}>
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-14 flex items-center gap-3">
          <button
            onClick={() => router.push("/")}
            className={`h-8 w-8 rounded-md flex items-center justify-center ${t.hover} ${t.textSub}`}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          {caseData && (
            <>
              <h1 className={`text-sm font-bold ${t.text} truncate`}>
                {caseData.name}
              </h1>
              <span
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${t.pillBg}`}
              >
                {fmtClaim(caseData.claim)}
              </span>
              <span
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${t.pillBg}`}
              >
                {caseData.level}
              </span>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${getStatusColor(caseData.status as WinSheetStatus, dark)}`}
              >
                {STATUS_LABELS_DETAIL[caseData.status] || caseData.status}
              </span>

              <div className="ml-auto flex items-center gap-2">
                {saveMsg && (
                  <span
                    className={`text-xs font-medium ${saveMsg === "Saved!" ? "text-emerald-500" : "text-red-500"}`}
                  >
                    {saveMsg}
                  </span>
                )}

                {!editing ? (
                  <>
                    <button
                      onClick={() => setEditing(true)}
                      className={`h-8 px-3 rounded-md border text-xs font-medium flex items-center gap-1.5 ${t.outlineBtn}`}
                    >
                      <Pencil className="h-3 w-3" /> Edit
                    </button>
                    <button
                      onClick={() => setFeeModalOpen(true)}
                      className={`h-8 px-3 rounded-md border text-xs font-medium flex items-center gap-1.5 ${t.outlineBtn}`}
                    >
                      <DollarSign className="h-3 w-3" /> Edit Fees
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={cancelEdit}
                      className={`h-8 px-3 rounded-md border text-xs font-medium flex items-center gap-1.5 ${t.outlineBtn}`}
                    >
                      <X className="h-3 w-3" /> Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className={`h-8 px-3 rounded-md text-xs font-semibold flex items-center gap-1.5 ${t.ctaBtn} disabled:opacity-50`}
                    >
                      {saving ? (
                        <RefreshCw className="h-3 w-3 animate-spin" />
                      ) : (
                        <Save className="h-3 w-3" />
                      )}{" "}
                      Save
                    </button>
                  </>
                )}

                {!editing &&
                  caseData.pif !== "YES" &&
                  caseData.paid > 0 &&
                  caseData.paid >= caseData.expected && (
                    <button
                      onClick={handleMarkPIF}
                      disabled={saving}
                      className="h-8 px-3 rounded-md bg-emerald-600 text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-3 w-3" /> Mark PIF
                    </button>
                  )}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 space-y-4">
        {error && (
          <div
            className={`rounded-xl border p-4 flex items-center gap-3 ${dark ? "bg-red-900/20 border-red-800 text-red-400" : "bg-red-50 border-red-200 text-red-700"}`}
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="text-sm">{error}</span>
            <button
              onClick={() => router.push("/")}
              className="ml-auto text-xs font-medium underline"
            >
              Back to dashboard
            </button>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className={`h-6 w-6 animate-spin ${t.textMuted}`} />
          </div>
        )}

        {caseData && (
          <>
            {/* Case Info + Summary */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className={`${sectionCard} lg:col-span-2`}>
                <h4
                  className={`text-xs font-bold ${t.text} mb-3 flex items-center gap-2`}
                >
                  <FileText className="h-3.5 w-3.5" /> Case Information
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <p className={lbl}>Case ID</p>
                    <p className={val}>#{caseData.id}</p>
                  </div>
                  <div>
                    <p className={lbl}>External ID</p>
                    <p className={val}>{caseData.externalId || "—"}</p>
                  </div>
                  <div>
                    <p className={lbl}>First Name</p>
                    {editing ? (
                      <input
                        value={editFirstName}
                        onChange={(e) => setEditFirstName(e.target.value)}
                        className={inp}
                      />
                    ) : (
                      <p className={val}>{caseData.firstName || "—"}</p>
                    )}
                  </div>
                  <div>
                    <p className={lbl}>Last Name</p>
                    {editing ? (
                      <input
                        value={editLastName}
                        onChange={(e) => setEditLastName(e.target.value)}
                        className={inp}
                      />
                    ) : (
                      <p className={val}>{caseData.lastName || "—"}</p>
                    )}
                  </div>
                  <div>
                    <p className={lbl}>Assigned To</p>
                    {editing ? (
                      <select
                        value={editAssigned}
                        onChange={(e) => setEditAssigned(e.target.value)}
                        className={inp}
                      >
                        <option value="">Unassigned</option>
                        {teamMembers.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className={`${val} flex items-center gap-1`}>
                        <User className="h-3 w-3" /> {caseData.assigned}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className={lbl}>Office</p>
                    {editing ? (
                      <input
                        value={editOffice}
                        onChange={(e) => setEditOffice(e.target.value)}
                        className={inp}
                      />
                    ) : (
                      <p className={val}>{caseData.office || "—"}</p>
                    )}
                  </div>
                  <div>
                    <p className={lbl}>Approval Date</p>
                    {editing ? (
                      <input
                        type="date"
                        value={editApprovalDate}
                        onChange={(e) => setEditApprovalDate(e.target.value)}
                        className={inp}
                      />
                    ) : (
                      <p className={`${val} flex items-center gap-1`}>
                        <CalendarDays className="h-3 w-3" />{" "}
                        {caseData.approvalDate
                          ? fmtDate(caseData.approvalDate)
                          : "—"}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className={lbl}>Claim Type</p>
                    <p className={val}>{fmtClaim(caseData.claim)}</p>
                  </div>
                  <div>
                    <p className={lbl}>Level Won</p>
                    {editing ? (
                      <select
                        value={editLevel}
                        onChange={(e) => setEditLevel(e.target.value)}
                        className={inp}
                      >
                        <option value="">—</option>
                        <option value="INITIAL">Initial</option>
                        <option value="RECON">Reconsideration</option>
                        <option value="HEARING">Hearing</option>
                        <option value="AC">Appeals Council</option>
                        <option value="FEDERAL_COURT">Federal Court</option>
                      </select>
                    ) : (
                      <p className={val}>{caseData.level || "—"}</p>
                    )}
                  </div>
                  <div>
                    <p className={lbl}>T2 Decision</p>
                    {editing ? (
                      <input
                        value={editT2Decision}
                        onChange={(e) => setEditT2Decision(e.target.value)}
                        placeholder="e.g. fully_favorable"
                        className={inp}
                      />
                    ) : (
                      <p className={val}>{caseData.t2Decision || "—"}</p>
                    )}
                  </div>
                  <div>
                    <p className={lbl}>T16 Decision</p>
                    {editing ? (
                      <input
                        value={editT16Decision}
                        onChange={(e) => setEditT16Decision(e.target.value)}
                        placeholder="e.g. fully_favorable"
                        className={inp}
                      />
                    ) : (
                      <p className={val}>{caseData.t16Decision || "—"}</p>
                    )}
                  </div>
                  <div>
                    <p className={lbl}>Fee Method</p>
                    {editing ? (
                      <select
                        value={editFeeMethod}
                        onChange={(e) => setEditFeeMethod(e.target.value)}
                        className={inp}
                      >
                        <option value="fee_agreement">Fee Agreement</option>
                        <option value="fee_petition">Fee Petition</option>
                      </select>
                    ) : (
                      <p className={val}>
                        {(caseData.feeMethod || "fee_agreement").replace(
                          "_",
                          " ",
                        ) || "—"}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className={lbl}>Fee Cap</p>
                    {editing ? (
                      <input
                        type="number"
                        step="0.01"
                        value={editFeeCap}
                        onChange={(e) => setEditFeeCap(e.target.value)}
                        className={inp}
                      />
                    ) : (
                      <p className={val}>
                        {fmtFull(caseData.applicableFeeCap)}
                        {caseData.feeCapApplied ? " (applied)" : ""}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className={lbl}>Approved By</p>
                    {editing ? (
                      <input
                        value={editApprovedBy}
                        onChange={(e) => setEditApprovedBy(e.target.value)}
                        className={inp}
                      />
                    ) : (
                      <p className={val}>{caseData.approvedBy || "—"}</p>
                    )}
                  </div>
                  <div>
                    <p className={lbl}>Win Sheet Status</p>
                    {editing ? (
                      <select
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value)}
                        className={inp}
                      >
                        <option value="not_started">Not Started</option>
                        <option value="started">Started</option>
                        <option value="in_progress">In Progress</option>
                        <option value="pending_payment">Pending Payment</option>
                        <option value="partially_paid">Partially Paid</option>
                        <option value="paid_in_full">Paid in Full</option>
                        <option value="closed">Closed</option>
                      </select>
                    ) : (
                      <p className={val}>
                        {STATUS_LABELS_DETAIL[caseData.status] ||
                          caseData.status ||
                          "—"}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Financial Summary — computed */}
              <div className={sectionCard}>
                <h4
                  className={`text-xs font-bold ${t.text} mb-3 flex items-center gap-2`}
                >
                  <DollarSign className="h-3.5 w-3.5" /> Financial Summary
                  <span className={`text-[9px] font-normal ${t.textMuted}`}>
                    (computed)
                  </span>
                </h4>
                <div className="space-y-3">
                  <div>
                    <p className={lbl}>Total Retro Due</p>
                    <p className={val}>{fmtFull(caseData.totalRetroDue)}</p>
                  </div>
                  <div>
                    <p className={lbl}>Expected Fees</p>
                    <p className={val}>{fmtFull(caseData.expected)}</p>
                  </div>
                  <div>
                    <p className={lbl}>Paid</p>
                    <p
                      className={`text-[13px] font-semibold mt-0.5 ${caseData.paid > 0 ? "text-emerald-500" : t.textMuted}`}
                    >
                      {fmtFull(caseData.paid)}
                    </p>
                  </div>
                  <div>
                    <p className={lbl}>Outstanding</p>
                    <p
                      className={`text-[13px] font-semibold mt-0.5 ${caseData.outstanding > 0 ? (dark ? "text-red-400" : "text-red-600") : "text-emerald-500"}`}
                    >
                      {fmtFull(caseData.outstanding)}
                    </p>
                  </div>
                  {caseData.expected > 0 && (
                    <div className="pt-1">
                      <div
                        className={`h-2 rounded-full ${dark ? "bg-neutral-800" : "bg-neutral-200"}`}
                      >
                        <div
                          className="h-2 rounded-full bg-emerald-500 transition-all"
                          style={{
                            width: `${Math.min(100, (caseData.paid / caseData.expected) * 100)}%`,
                          }}
                        />
                      </div>
                      <p className={`text-[10px] ${t.textMuted} mt-1`}>
                        {Math.round((caseData.paid / caseData.expected) * 100)}%
                        collected
                      </p>
                    </div>
                  )}
                  <div className="flex items-center gap-2 pt-1">
                    <p className={lbl}>PIF</p>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        caseData.pif === "YES"
                          ? dark
                            ? "bg-emerald-900/40 text-emerald-400"
                            : "bg-emerald-50 text-emerald-700"
                          : caseData.pif === "PENDING"
                            ? dark
                              ? "bg-amber-900/40 text-amber-400"
                              : "bg-amber-50 text-amber-700"
                            : dark
                              ? "bg-red-900/40 text-red-400"
                              : "bg-red-50 text-red-700"
                      }`}
                    >
                      {caseData.pif === "YES" && (
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                      )}
                      {caseData.pif || "NO"}
                    </span>
                  </div>
                  {caseData.daysAfterApproval !== null && (
                    <div className="flex items-center gap-2">
                      <p className={lbl}>Aging</p>
                      <span
                        className={`text-[12px] font-semibold ${caseData.approvalCategory === ">60" ? (dark ? "text-red-400" : "text-red-600") : dark ? "text-emerald-400" : "text-emerald-600"}`}
                      >
                        <Clock className="h-3 w-3 inline mr-1" />
                        {caseData.daysAfterApproval}d (
                        {caseData.approvalCategory})
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Fee Breakdown — inline editable */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FeeSection
                title="T16 (SSI)"
                color={dark ? "text-indigo-400" : "text-indigo-600"}
                prefix="t16"
                dark={dark}
                retro={caseData.t16Retro}
                due={caseData.t16FeeDue}
                received={caseData.t16FeeReceived}
                pending={caseData.t16Pending}
                dateReceived={caseData.t16FeeReceivedDate}
                feeCap={caseData.applicableFeeCap}
                caseId={id}
                onSaved={fetchCase}
              />
              <FeeSection
                title="T2 (SSDI)"
                color={dark ? "text-blue-400" : "text-blue-600"}
                prefix="t2"
                dark={dark}
                retro={caseData.t2Retro}
                due={caseData.t2FeeDue}
                received={caseData.t2FeeReceived}
                pending={caseData.t2Pending}
                dateReceived={caseData.t2FeeReceivedDate}
                feeCap={caseData.applicableFeeCap}
                caseId={id}
                onSaved={fetchCase}
              />
              <FeeSection
                title="AUX (Auxiliary)"
                color={dark ? "text-violet-400" : "text-violet-600"}
                prefix="aux"
                dark={dark}
                retro={caseData.auxRetro}
                due={caseData.auxFeeDue}
                received={caseData.auxFeeReceived}
                pending={caseData.auxPending}
                dateReceived={caseData.auxFeeReceivedDate}
                feeCap={caseData.applicableFeeCap}
                caseId={id}
                onSaved={fetchCase}
              />
            </div>

            {/* Activity Log */}
            <div className={sectionCard}>
              <h4
                className={`text-xs font-bold ${t.text} mb-4 flex items-center gap-2`}
              >
                <MessageSquare className="h-3.5 w-3.5" /> Activity Log
                <span className={`ml-1 text-[10px] font-normal ${t.textMuted}`}>
                  ({caseData.activities?.length ?? 0}{" "}
                  {caseData.activities?.length === 1 ? "entry" : "entries"})
                </span>
              </h4>
              <div
                className={`mb-4 rounded-lg border p-3 ${dark ? "bg-neutral-800/40 border-neutral-700" : "bg-neutral-50 border-neutral-200"}`}
              >
                <div className="flex gap-2 mb-2">
                  <select
                    value={noteAuthor}
                    onChange={(e) => setNoteAuthor(e.target.value)}
                    className={`h-7 px-2 rounded border text-[11px] outline-none ${t.inputBg}`}
                  >
                    <option value="UserTest">UserTest</option>
                    {teamMembers.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                    <option value="System">System</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <input
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handlePostNote()}
                    placeholder="Add a note or status update..."
                    className={`flex-1 h-8 px-3 rounded-md border text-[12px] outline-none ${t.inputBg}`}
                  />
                  <button
                    onClick={handlePostNote}
                    disabled={!newNote.trim() || postingNote}
                    className={`h-8 px-3 rounded-md text-xs font-semibold flex items-center gap-1.5 ${t.ctaBtn} disabled:opacity-40`}
                  >
                    {postingNote ? (
                      <RefreshCw className="h-3 w-3 animate-spin" />
                    ) : (
                      <Send className="h-3 w-3" />
                    )}{" "}
                    Post
                  </button>
                </div>
              </div>
              {!caseData.activities || caseData.activities.length === 0 ? (
                <p className={`text-sm ${t.textMuted} text-center py-8`}>
                  No activity recorded yet.
                </p>
              ) : (
                <div className="relative">
                  <div
                    className={`absolute left-2.75 top-2 bottom-2 w-px ${dark ? "bg-neutral-800" : "bg-neutral-200"}`}
                  />
                  <div className="space-y-4">
                    {caseData.activities.map((a) => (
                      <div key={a.id} className="flex gap-3 relative">
                        <div
                          className={`w-5.75 h-5.75 rounded-full border-2 flex items-center justify-center shrink-0 z-10 ${dark ? "bg-neutral-900 border-neutral-700" : "bg-white border-neutral-300"}`}
                        >
                          <div
                            className={`w-2 h-2 rounded-full ${dark ? "bg-neutral-500" : "bg-neutral-400"}`}
                          />
                        </div>
                        <div className="flex-1 min-w-0 pb-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[11px] font-semibold ${t.text}`}
                            >
                              {a.createdBy}
                            </span>
                            <span className={`text-[10px] ${t.textMuted}`}>
                              {new Date(a.createdAt).toLocaleDateString(
                                "en-US",
                                {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                },
                              )}
                            </span>
                          </div>
                          <p
                            className={`text-[12px] ${t.textSub} mt-0.5 leading-relaxed`}
                          >
                            {a.message}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CaseDetailPage;
