"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import {
  X,
  RefreshCw,
  FileText,
  DollarSign,
  CalendarDays,
  CheckCircle2,
  Shield,
  ChevronRight,
  ExternalLink,
  User,
  MapPin,
  Phone,
  Database,
  AlertTriangle,
  Pencil,
  Check,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { themeClasses } from "@/lib/theme-classes";
import { MyCaseDocumentsDialog } from "@/components/cases/MyCaseDocumentsDialog";
import {
  fmtFull,
  fmtDate,
  fmtClaim,
  STATUS_LABELS_DETAIL,
  getStatusColor,
} from "@/lib/formatters";
import type {
  WinSheetStatus,
  CaseDetailData,
  UserDetails,
  ApprovedByOption,
} from "@/types";
import type { DropdownOptionsByCategory } from "@/hooks/useDashboard";
import { Listbox } from "@/components/shared/Listbox";
import { buildListboxOptions } from "@/lib/listbox-options";
import { caseLevelVisual } from "@/lib/case-level-icons";

interface CaseDetailSheetProps {
  caseId: number;
  isOpen: boolean;
  onClose: () => void;
  // Admin-managed option lists (claim_type, case_level, …) so the edit
  // dropdowns match the dashboard table instead of hardcoding values.
  dropdownOptions?: DropdownOptionsByCategory;
}

const currency = (v: number) => (v > 0 ? fmtFull(v) : "—");
const dateStr = (d: string | null | undefined) => (d ? fmtDate(d) : "—");

// Render <option>s from an admin-managed list, preserving the row's current
// value as a fallback option when it isn't in the (active) list.
const dropdownOptionEls = (options: ApprovedByOption[], current: string) => (
  <>
    <option value="">—</option>
    {current && !options.some((o) => o.name === current) && (
      <option value={current}>{current}</option>
    )}
    {options
      .filter((o) => o.isActive || o.name === current)
      .map((o) => (
        <option key={o.id} value={o.name}>
          {o.name}
        </option>
      ))}
  </>
);
const displayDecision = (mc?: string | null, local?: string | null) => {
  const d = mc && mc !== "unknown" ? mc : local;
  return d && d !== "unknown" ? d.replace(/_/g, " ") : "—";
};

type MyCaseData = {
  caseStage: string | null;
  approvalDate: string | null;
  assignedTo: string | null;
  winSheetStatus: string;
  claimTypeLabel: string | null;
  levelWon: string | null;
  t16Retro: string;
  t16FeeDue: string;
  t16FeeReceived: string;
  t16Pending: string;
  t16FeeReceivedDate: string | null;
  t2Retro: string;
  t2FeeDue: string;
  t2FeeReceived: string;
  t2Pending: string;
  t2FeeReceivedDate: string | null;
  feesConfirmation: string | null;
  t2Decision: string;
  t16Decision: string;
  notes: string | null;
  chronicleLink: string | null;
  ssnLast4: string | null;
};

function ClientDetailsSection({
  ud,
  textMuted,
  lbl,
  val,
  sectionCls,
}: {
  ud: UserDetails;
  textMuted: string;
  lbl: string;
  val: string;
  sectionCls: string;
}) {
  const addressParts = [ud.addressLine1, ud.addressLine2, ud.city, ud.state, ud.zipCode, ud.country].filter(Boolean);
  const address = addressParts.length > 0 ? addressParts.join(", ") : null;

  const hasAny = ud.fullName || address || ud.cellPhone || ud.email || ud.ssn ||
    ud.dateOfBirth || ud.ageAtApproval != null || ud.placeOfBirth || ud.mothersName || ud.fathersName;

  if (!hasAny) return null;

  return (
    <div className={sectionCls}>
      <h4 className={`text-[10px] font-bold uppercase tracking-widest ${textMuted} mb-3 flex items-center gap-1.5`}>
        <User aria-hidden="true" className="h-3 w-3" /> Client Details
      </h4>
      <div className="space-y-3">
        {ud.fullName && (
          <div>
            <p className={lbl}>Full Name</p>
            <p className={val}>{ud.fullName}</p>
          </div>
        )}
        {address && (
          <div>
            <p className={`${lbl} flex items-center gap-1`}><MapPin aria-hidden="true" className="h-3 w-3" /> Address</p>
            <p className={`${val} text-wrap leading-snug`}>{address}</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          {ud.cellPhone && (
            <div>
              <p className={`${lbl} flex items-center gap-1`}><Phone aria-hidden="true" className="h-3 w-3" /> Cell Phone</p>
              <a href={`tel:${ud.cellPhone}`} className={`${val} hover:underline`}>{ud.cellPhone}</a>
            </div>
          )}
          {ud.email && (
            <div>
              <p className={lbl}>Email</p>
              <a
                href={`mailto:${ud.email}`}
                className={`${val} truncate hover:underline block`}
                title={ud.email}
              >
                {ud.email}
              </a>
            </div>
          )}
          {ud.ssn && (
            <div>
              <p className={lbl}>SSN</p>
              <p className={val}>{ud.ssn}</p>
            </div>
          )}
          {ud.dateOfBirth && (
            <div>
              <p className={lbl}>Date of Birth</p>
              <p className={val}>{ud.dateOfBirth}</p>
            </div>
          )}
          {ud.ageAtApproval != null && (
            <div>
              <p className={lbl}>Age at Approval</p>
              <p className={val}>{ud.ageAtApproval}</p>
            </div>
          )}
          {ud.placeOfBirth && (
            <div>
              <p className={lbl}>Place of Birth</p>
              <p className={val}>{ud.placeOfBirth}</p>
            </div>
          )}
        </div>
        {ud.mothersName && (
          <div>
            <p className={lbl}>Mother&apos;s First & Maiden Name</p>
            <p className={val}>{ud.mothersName}</p>
          </div>
        )}
        {ud.fathersName && (
          <div>
            <p className={lbl}>Father&apos;s First & Last Name</p>
            <p className={val}>{ud.fathersName}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CaseDetailSheet({
  caseId,
  isOpen,
  onClose,
  dropdownOptions = {},
}: CaseDetailSheetProps) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const t = themeClasses(dark);
  const router = useRouter();

  const claimTypeOptions = dropdownOptions.claim_type ?? [];
  const caseLevelOptions = dropdownOptions.case_level ?? [];

  const [data, setData] = useState<CaseDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myCaseData, setMyCaseData] = useState<MyCaseData | null>(null);
  const [myCaseLoading, setMyCaseLoading] = useState(false);
  const [myCaseError, setMyCaseError] = useState<string | null>(null);
  const [docsOpen, setDocsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState({
    approvalDate: "",
    t2Decision: "",
    t16Decision: "",
    levelWon: "",
    claimTypeLabel: "",
    ssnLast4: "",
    chronicleId: "",
    externalId: "",
    t16Retro: "",
    t16FeeDue: "",
    t16FeeReceived: "",
    t16FeeReceivedDate: "",
    t2Retro: "",
    t2FeeDue: "",
    t2FeeReceived: "",
    t2FeeReceivedDate: "",
    auxRetro: "",
    auxFeeDue: "",
    auxFeeReceived: "",
    auxFeeReceivedDate: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const myCaseAbortRef = useRef<AbortController | null>(null);
  const saveAbortRef = useRef<AbortController | null>(null);

  const fetchCase = useCallback(async () => {
    if (!caseId) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/cases/${caseId}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Failed to load case details (${res.status})`);
      const json = await res.json();
      setData(json.data);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError((err as Error).message);
    } finally {
      if (abortRef.current === controller) {
        setLoading(false);
      }
    }
  }, [caseId]);

  const fetchMyCaseData = useCallback(async () => {
    if (!caseId) return;
    myCaseAbortRef.current?.abort();
    const controller = new AbortController();
    myCaseAbortRef.current = controller;

    setMyCaseLoading(true);
    setMyCaseError(null);
    try {
      const res = await fetch(`/api/mycase/cases/${caseId}/details`, {
        signal: controller.signal,
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json.error as string) || `Failed to load MyCase data (${res.status})`);
      }
      const json = await res.json();
      setMyCaseData(json.data);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setMyCaseError((err as Error).message);
    } finally {
      if (myCaseAbortRef.current === controller) {
        setMyCaseLoading(false);
      }
    }
  }, [caseId]);

  const handleRefresh = useCallback(() => {
    fetchCase();
    fetchMyCaseData();
  }, [fetchCase, fetchMyCaseData]);

  useEffect(() => {
    if (isOpen) {
      fetchCase();
      fetchMyCaseData();
    } else {
      setData(null);
      setMyCaseData(null);
      setMyCaseError(null);
      setIsEditing(false);
      setSaveError(null);
    }
    return () => {
      abortRef.current?.abort();
      myCaseAbortRef.current?.abort();
    };
  }, [isOpen, fetchCase, fetchMyCaseData]);

  useEffect(() => {
    if (data && !isEditing) {
      setEditValues({
        approvalDate: data.approvalDate ?? "",
        t2Decision: data.t2Decision ?? "",
        t16Decision: data.t16Decision ?? "",
        levelWon: data.level === "—" ? "" : (data.level ?? ""),
        claimTypeLabel: data.claim ?? "",
        ssnLast4: myCaseData?.ssnLast4 ?? "",
        chronicleId: data.userDetails?.chronicleId != null ? String(data.userDetails.chronicleId) : "",
        externalId: data.externalId ?? "",
        t16Retro: data.t16Retro > 0 ? String(data.t16Retro) : "",
        t16FeeDue: data.t16FeeDue > 0 ? String(data.t16FeeDue) : "",
        t16FeeReceived: data.t16FeeReceived > 0 ? String(data.t16FeeReceived) : "",
        t16FeeReceivedDate: data.t16FeeReceivedDate ?? "",
        t2Retro: data.t2Retro > 0 ? String(data.t2Retro) : "",
        t2FeeDue: data.t2FeeDue > 0 ? String(data.t2FeeDue) : "",
        t2FeeReceived: data.t2FeeReceived > 0 ? String(data.t2FeeReceived) : "",
        t2FeeReceivedDate: data.t2FeeReceivedDate ?? "",
        auxRetro: data.auxRetro > 0 ? String(data.auxRetro) : "",
        auxFeeDue: data.auxFeeDue > 0 ? String(data.auxFeeDue) : "",
        auxFeeReceived: data.auxFeeReceived > 0 ? String(data.auxFeeReceived) : "",
        auxFeeReceivedDate: data.auxFeeReceivedDate ?? "",
      });
    }
  }, [data, myCaseData, isEditing]);

  // Backfill ssnLast4 if myCaseData arrives after the user already entered edit mode.
  useEffect(() => {
    if (!isEditing || !myCaseData?.ssnLast4) return;
    setEditValues(prev => {
      if (prev.ssnLast4 !== "") return prev;
      return { ...prev, ssnLast4: myCaseData.ssnLast4! };
    });
  }, [isEditing, myCaseData]);

  const handleSave = useCallback(async () => {
    if (!data) return;
    const caseFields: Record<string, string | null> = {};
    const userDetailsFields: Record<string, string | number | null> = {};

    if (editValues.approvalDate !== (data.approvalDate ?? ""))
      caseFields.approvalDate = editValues.approvalDate || null;
    if (editValues.t2Decision !== (data.t2Decision ?? ""))
      caseFields.t2Decision = editValues.t2Decision || null;
    if (editValues.t16Decision !== (data.t16Decision ?? ""))
      caseFields.t16Decision = editValues.t16Decision || null;
    if (editValues.levelWon !== (data.level === "—" ? "" : (data.level ?? "")))
      caseFields.levelWon = editValues.levelWon || null;
    if (editValues.claimTypeLabel !== (data.claim ?? ""))
      caseFields.claimTypeLabel = editValues.claimTypeLabel || null;
    if (editValues.externalId !== (data.externalId ?? ""))
      caseFields.externalId = editValues.externalId || null;

    const origSsn = myCaseData?.ssnLast4 ?? "";
    if (editValues.ssnLast4 !== origSsn)
      userDetailsFields.ssnLast4 = editValues.ssnLast4 || null;

    const origChronicle = data.userDetails?.chronicleId != null ? String(data.userDetails.chronicleId) : "";
    if (editValues.chronicleId !== origChronicle) {
      const n = Number(editValues.chronicleId);
      userDetailsFields.chronicleId = editValues.chronicleId && Number.isFinite(n) ? n : null;
    }

    const feeFields: Record<string, number | string | null> = {};
    const feeNumFields = [
      ["t16Retro", data.t16Retro],
      ["t16FeeDue", data.t16FeeDue],
      ["t16FeeReceived", data.t16FeeReceived],
      ["t2Retro", data.t2Retro],
      ["t2FeeDue", data.t2FeeDue],
      ["t2FeeReceived", data.t2FeeReceived],
      ["auxRetro", data.auxRetro],
      ["auxFeeDue", data.auxFeeDue],
      ["auxFeeReceived", data.auxFeeReceived],
    ] as const;
    for (const [key, orig] of feeNumFields) {
      const edited = editValues[key];
      const editedNum = edited === "" ? 0 : Number(edited);
      if (!Number.isFinite(editedNum)) continue;
      if (editedNum !== orig) feeFields[key] = editedNum;
    }
    const feeDateFields = [
      ["t16FeeReceivedDate", data.t16FeeReceivedDate],
      ["t2FeeReceivedDate", data.t2FeeReceivedDate],
      ["auxFeeReceivedDate", data.auxFeeReceivedDate],
    ] as const;
    for (const [key, orig] of feeDateFields) {
      const edited = editValues[key];
      if (edited !== (orig ?? "")) feeFields[key] = edited || null;
    }

    if (!Object.keys(caseFields).length && !Object.keys(userDetailsFields).length && !Object.keys(feeFields).length) {
      setIsEditing(false);
      return;
    }

    saveAbortRef.current?.abort();
    const controller = new AbortController();
    saveAbortRef.current = controller;

    setIsSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseFields, feeFields, userDetailsFields }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Failed to save (${res.status})`);
      setIsEditing(false);
      fetchCase();
      fetchMyCaseData();
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setSaveError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  }, [data, myCaseData, editValues, caseId, fetchCase, fetchMyCaseData]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setSaveError(null);
  }, []);

  const lbl = `text-[10px] font-semibold uppercase tracking-wider ${t.textMuted}`;
  const val = `text-[13px] font-semibold ${t.text} mt-0.5`;
  const inp = `mt-1 h-7 px-2 rounded border text-[12px] w-full outline-none ${t.inputBg}`;
  const sectionCls = `p-4 border-b ${t.borderLight}`;

  const chronicleLink = data
    ? (myCaseData?.chronicleLink ?? (data.userDetails?.chronicleId != null
        ? `https://app.chroniclelegal.com/dashboard/clients/${data.userDetails.chronicleId}`
        : null))
    : null;

  return (
    <>
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        overlayClassName="bg-black/0 backdrop-blur-none"
        className={`w-full sm:max-w-md p-0 overflow-y-auto ${t.bg} border-l ${t.border} shadow-2xl transition-[transform,opacity] duration-300 ease-in-out scrollbar-none select-text`}
      >
        <SheetHeader className={`sticky top-0 p-4 border-b ${t.borderLight} ${t.bg} z-10`}>
          <div className="flex items-center justify-between">
            <SheetTitle className={`text-sm font-bold ${t.text}`}>
              Win Sheet Quick Look
            </SheetTitle>
            <div className="flex items-center gap-1">
              {!isEditing ? (
                <>
                  <button
                    onClick={handleRefresh}
                    disabled={loading || myCaseLoading}
                    aria-label="Refresh"
                    className={`h-7 w-7 rounded-md flex items-center justify-center ${t.hover} ${t.textSub} disabled:opacity-40`}
                  >
                    <RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${(loading || myCaseLoading) ? "animate-spin" : ""}`} />
                  </button>
                  {data && (
                    <button
                      onClick={() => { setIsEditing(true); setSaveError(null); }}
                      aria-label="Edit local details"
                      className={`h-7 w-7 rounded-md flex items-center justify-center ${t.hover} ${t.textSub}`}
                    >
                      <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    aria-label="Save changes"
                    className={`h-7 px-2 rounded-md flex items-center gap-1 text-[11px] font-semibold ${dark ? "bg-indigo-600 hover:bg-indigo-500 text-white" : "bg-indigo-600 hover:bg-indigo-700 text-white"} disabled:opacity-50`}
                  >
                    <Check aria-hidden="true" className="h-3 w-3" />
                    {isSaving ? "Saving…" : "Save"}
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    aria-label="Cancel edit"
                    className={`h-7 w-7 rounded-md flex items-center justify-center ${t.hover} ${t.textSub}`}
                  >
                    <X aria-hidden="true" className="h-4 w-4" />
                  </button>
                </>
              )}
              {!isEditing && (
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className={`h-7 w-7 rounded-md flex items-center justify-center ${t.hover} ${t.textSub}`}
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          <SheetDescription className={`text-[11px] ${t.textMuted}`}>
            {isEditing ? "Edit local DB fields — changes write to the app database." : "Details needed for processing the win sheet for this case."}
          </SheetDescription>
          {saveError && (
            <p role="alert" className="text-[11px] text-red-500 mt-1">{saveError}</p>
          )}
        </SheetHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <RefreshCw aria-hidden="true" className={`h-6 w-6 animate-spin ${t.textMuted}`} />
            <span className={`text-xs ${t.textSub}`}>Loading case details...</span>
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <p role="alert" className="text-sm text-red-500 mb-4">{error}</p>
            <button
              onClick={fetchCase}
              className={`h-8 px-4 rounded-md border text-xs font-medium ${t.outlineBtn}`}
            >
              Retry
            </button>
          </div>
        ) : data ? (
          <div className="flex flex-col">
            {/* Case Header Info */}
            <div className={`${sectionCls} bg-neutral-50/50 dark:bg-neutral-900/30`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className={`text-base font-bold ${t.text} truncate`}>
                    {data.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${t.pillBg}`}>
                      {fmtClaim(data.claim)}
                    </span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${t.pillBg}`}>
                      {data.level}
                    </span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${getStatusColor(data.status as WinSheetStatus, dark)}`}
                    >
                      {STATUS_LABELS_DETAIL[data.status] || data.status}
                    </span>
                  </div>
                  {(chronicleLink || isEditing) && (
                    <div className="mt-2">
                      <p className={lbl}>Chronicle ID</p>
                      {isEditing ? (
                        <input
                          type="number"
                          value={editValues.chronicleId}
                          onChange={(e) => setEditValues((v) => ({ ...v, chronicleId: e.target.value }))}
                          placeholder="e.g. 12345"
                          className={inp}
                        />
                      ) : (
                        <p className={`${val} text-sky-500`}>{chronicleLink!.split("/").pop() ?? "—"}</p>
                      )}
                    </div>
                  )}
                  {(myCaseData?.ssnLast4 || isEditing) && (
                    <div className="mt-2">
                      <p className={lbl}>SSN (last 4)</p>
                      {isEditing ? (
                        <input
                          type="text"
                          maxLength={4}
                          value={editValues.ssnLast4}
                          onChange={(e) => setEditValues((v) => ({ ...v, ssnLast4: e.target.value.replace(/\D/g, "") }))}
                          placeholder="e.g. 1234"
                          className={inp}
                        />
                      ) : (
                        <p className={val}>***-**-{myCaseData!.ssnLast4}</p>
                      )}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0 flex flex-col items-end gap-3">
                  <div>
                    <p className={lbl}>Case ID</p>
                    <p className={`${val} text-indigo-500`}>#{data.id}</p>
                  </div>
                  <a
                    href={data.externalId || `https://rgdr.mycase.com/court_cases/${data.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase transition-colors ${dark ? "bg-indigo-900/30 text-indigo-400 hover:bg-indigo-900/50" : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"}`}
                  >
                    MyCase <ExternalLink aria-hidden="true" className="h-3 w-3" />
                  </a>
                  <button
                    type="button"
                    onClick={() => setDocsOpen(true)}
                    className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase transition-colors ${dark ? "bg-emerald-900/30 text-emerald-400 hover:bg-emerald-900/50" : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"}`}
                  >
                    Documents <FileText aria-hidden="true" className="h-3 w-3" />
                  </button>
                  {chronicleLink && (
                    <a
                      href={chronicleLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase transition-colors ${dark ? "bg-sky-900/30 text-sky-400 hover:bg-sky-900/50" : "bg-sky-50 text-sky-600 hover:bg-sky-100"}`}
                    >
                      Chronicle <ExternalLink aria-hidden="true" className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Core Identification */}
            <div className={sectionCls}>
              <h4 className={`text-[10px] font-bold uppercase tracking-widest ${t.textMuted} mb-3 flex items-center gap-1.5`}>
                <Shield aria-hidden="true" className="h-3 w-3" /> Identity & Verification
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className={lbl}>Approval Date</p>
                  {isEditing ? (
                    <input
                      type="date"
                      value={editValues.approvalDate}
                      onChange={(e) => setEditValues((v) => ({ ...v, approvalDate: e.target.value }))}
                      className={inp}
                    />
                  ) : (
                    <p className={`${val} flex items-center gap-1`}>
                      <CalendarDays aria-hidden="true" className="h-3 w-3 text-indigo-500" /> {dateStr(myCaseData?.approvalDate ?? data.approvalDate)}
                    </p>
                  )}
                </div>
                <div>
                  <p className={lbl}>Aging</p>
                  <p className={`${val} ${data.approvalCategory === ">60" ? "text-red-500" : "text-emerald-500"}`}>
                    {data.daysAfterApproval != null ? `${data.daysAfterApproval} days` : "—"}
                  </p>
                </div>
              </div>
              <div className="mt-3">
                <p className={lbl}>MyCase Link</p>
                {isEditing ? (
                  <input
                    type="url"
                    value={editValues.externalId}
                    onChange={(e) => setEditValues((v) => ({ ...v, externalId: e.target.value }))}
                    placeholder="https://..."
                    className={inp}
                  />
                ) : data.externalId ? (
                  <a
                    href={data.externalId}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${val} flex items-center gap-1 hover:underline text-indigo-500 truncate`}
                  >
                    {data.externalId} <ExternalLink aria-hidden="true" className="h-3 w-3 shrink-0" />
                  </a>
                ) : (
                  <p className={val}>—</p>
                )}
              </div>
            </div>

            {/* Client Details */}
            {data.userDetails && (
              <ClientDetailsSection ud={data.userDetails} textMuted={t.textMuted} lbl={lbl} val={val} sectionCls={sectionCls} />
            )}

            {/* Decisions */}
            <div className={sectionCls}>
              <h4 className={`text-[10px] font-bold uppercase tracking-widest ${t.textMuted} mb-3 flex items-center gap-1.5`}>
                <FileText aria-hidden="true" className="h-3 w-3" /> Decisions
              </h4>
              <div className="space-y-3">
                {isEditing ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className={lbl}>Claim Type</p>
                      <select
                        value={editValues.claimTypeLabel}
                        onChange={(e) => setEditValues((v) => ({ ...v, claimTypeLabel: e.target.value }))}
                        className={inp}
                      >
                        {dropdownOptionEls(claimTypeOptions, editValues.claimTypeLabel)}
                      </select>
                    </div>
                    <div>
                      <p className={lbl}>Level Won</p>
                      <Listbox
                        value={editValues.levelWon}
                        onChange={(v) => setEditValues((val) => ({ ...val, levelWon: v }))}
                        dark={dark}
                        t={t}
                        aria-label="Level Won"
                        className="mt-1 w-full"
                        options={buildListboxOptions(
                          caseLevelOptions,
                          editValues.levelWon,
                          (name) => {
                            const visual = caseLevelVisual(name, dark);
                            return visual
                              ? { icon: visual.Icon, iconBg: visual.bg, iconFg: visual.fg }
                              : undefined;
                          },
                        )}
                      />
                    </div>
                    <div>
                      <p className={lbl}>T2 Decision</p>
                      <select
                        value={editValues.t2Decision}
                        onChange={(e) => setEditValues((v) => ({ ...v, t2Decision: e.target.value }))}
                        className={inp}
                      >
                        <option value="">—</option>
                        <option value="fully_favorable">Fully Favorable</option>
                        <option value="partially_favorable">Partially Favorable</option>
                        <option value="unfavorable">Unfavorable</option>
                        <option value="dismissed">Dismissed</option>
                        <option value="remand">Remand</option>
                        <option value="unknown">Unknown</option>
                      </select>
                    </div>
                    <div>
                      <p className={lbl}>T16 Decision</p>
                      <select
                        value={editValues.t16Decision}
                        onChange={(e) => setEditValues((v) => ({ ...v, t16Decision: e.target.value }))}
                        className={inp}
                      >
                        <option value="">—</option>
                        <option value="fully_favorable">Fully Favorable</option>
                        <option value="partially_favorable">Partially Favorable</option>
                        <option value="unfavorable">Unfavorable</option>
                        <option value="dismissed">Dismissed</option>
                        <option value="remand">Remand</option>
                        <option value="unknown">Unknown</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  <>
                    {[
                      { label: "T2 (SSDI) Decision", mc: myCaseData?.t2Decision, local: data.t2Decision },
                      { label: "T16 (SSI) Decision", mc: myCaseData?.t16Decision, local: data.t16Decision },
                    ].map((row) => (
                      <div key={row.label} className="flex items-center justify-between">
                        <p className={lbl}>{row.label}</p>
                        {myCaseLoading ? (
                          <RefreshCw aria-hidden="true" className={`h-3 w-3 animate-spin ${t.textMuted}`} />
                        ) : (
                          <p className={`${val} capitalize`}>
                            {displayDecision(row.mc, row.local)}
                          </p>
                        )}
                      </div>
                    ))}
                  </>
                )}
                <div className="flex items-center justify-between">
                  <p className={lbl}>Win Sheet Status</p>
                  <p className={val}>{STATUS_LABELS_DETAIL[data.status] || data.status}</p>
                </div>
                {data.winSheetLink && (
                  <div className="flex items-center justify-between">
                    <p className={lbl}>Win Sheet Link</p>
                    <a
                      href={data.winSheetLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[12px] font-medium text-blue-500 hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      {data.winSheetLinkText || "Open"}
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Financial Totals */}
            <div className={sectionCls}>
              <h4 className={`text-[10px] font-bold uppercase tracking-widest ${t.textMuted} mb-3 flex items-center gap-1.5`}>
                <DollarSign aria-hidden="true" className="h-3 w-3" /> Financial Summary
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className={lbl}>Total Retro Due</p>
                  <p className={`${val} text-lg`}>{currency(data.totalRetroDue)}</p>
                </div>
                <div>
                  <p className={lbl}>PIF Status</p>
                  <div className="mt-1">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        data.pif === "YES"
                          ? dark ? "bg-emerald-900/40 text-emerald-400" : "bg-emerald-50 text-emerald-700"
                          : data.pif === "PENDING"
                          ? dark ? "bg-amber-900/40 text-amber-400" : "bg-amber-50 text-amber-700"
                          : dark ? "bg-red-900/40 text-red-400" : "bg-red-50 text-red-700"
                      }`}
                    >
                      {data.pif === "YES" && <CheckCircle2 aria-hidden="true" className="h-3 w-3 mr-1" />}
                      {data.pif || "NO"}
                    </span>
                  </div>
                </div>
                <div>
                  <p className={lbl}>Expected Fees</p>
                  <p className={val}>{currency(data.expected)}</p>
                </div>
                <div>
                  <p className={lbl}>Outstanding</p>
                  <p className={`${val} ${data.outstanding > 0 ? "text-red-500" : "text-emerald-500"}`}>
                    {currency(data.outstanding)}
                  </p>
                </div>
              </div>
            </div>

            {/* Detailed Fee Breakdown */}
            <div className={sectionCls}>
              <h4 className={`text-[10px] font-bold uppercase tracking-widest ${t.textMuted} mb-3`}>
                Fee Breakdown
              </h4>
              <div className="space-y-4">
                {(
                  [
                    { key: "t16", label: "T16 (SSI)", titleColor: "text-indigo-500", received: data.t16FeeReceived, retro: data.t16Retro, pending: data.t16Pending, due: data.t16FeeDue, receivedDate: data.t16FeeReceivedDate },
                    { key: "t2",  label: "T2 (SSDI)",  titleColor: "text-blue-500",    received: data.t2FeeReceived,  retro: data.t2Retro,  pending: data.t2Pending,  due: data.t2FeeDue,  receivedDate: data.t2FeeReceivedDate  },
                    { key: "aux", label: "AUX",         titleColor: "text-violet-500",  received: data.auxFeeReceived, retro: data.auxRetro, pending: data.auxPending, due: data.auxFeeDue, receivedDate: data.auxFeeReceivedDate },
                  ] as const
                ).map((b) => (
                  <div key={b.key} className={`p-3 rounded-lg border ${t.borderLight} bg-neutral-50/30 dark:bg-neutral-900/20`}>
                    <p className={`text-[11px] font-bold uppercase ${b.titleColor} mb-2`}>{b.label}</p>
                    {isEditing ? (
                      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                        {(
                          [
                            { label: "Retro",     field: `${b.key}Retro`            as keyof typeof editValues },
                            { label: "Fee Due",   field: `${b.key}FeeDue`           as keyof typeof editValues },
                            { label: "Received",  field: `${b.key}FeeReceived`      as keyof typeof editValues },
                          ] as const
                        ).map(({ label, field }) => (
                          <div key={field}>
                            <p className={lbl}>{label}</p>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={editValues[field]}
                              onChange={(e) => setEditValues((v) => ({ ...v, [field]: e.target.value }))}
                              placeholder="0"
                              className={inp}
                            />
                          </div>
                        ))}
                        <div>
                          <p className={lbl}>Rec&apos;d Date</p>
                          <input
                            type="date"
                            value={editValues[`${b.key}FeeReceivedDate` as keyof typeof editValues]}
                            onChange={(e) => setEditValues((v) => ({ ...v, [`${b.key}FeeReceivedDate`]: e.target.value }))}
                            className={inp}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className={lbl}>Retro</p>
                          <p className="text-xs font-semibold">{currency(b.retro)}</p>
                        </div>
                        <div>
                          <p className={lbl}>Received</p>
                          <p className="text-xs font-semibold text-emerald-500">{currency(b.received)}</p>
                        </div>
                        <div>
                          <p className={lbl}>Pending</p>
                          <p className={`text-xs font-semibold ${b.pending > 0 ? "text-amber-500" : ""}`}>{currency(b.pending)}</p>
                        </div>
                        {b.receivedDate && (
                          <div>
                            <p className={lbl}>Rec&apos;d Date</p>
                            <p className="text-xs font-semibold">{dateStr(b.receivedDate)}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Live from MyCase */}
            <div className={sectionCls}>
              <h4 className={`text-[10px] font-bold uppercase tracking-widest ${t.textMuted} mb-3 flex items-center gap-1.5`}>
                <Database aria-hidden="true" className="h-3 w-3" /> Live from MyCase
              </h4>
              {myCaseLoading ? (
                <div className="flex items-center gap-2 py-2">
                  <RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 animate-spin ${t.textMuted}`} />
                  <span className={`text-[11px] ${t.textMuted}`}>Fetching from MyCase…</span>
                </div>
              ) : myCaseError ? (
                <div
                  role="alert"
                  className={`flex items-start gap-2 rounded-md p-2 text-[11px] ${dark ? "bg-amber-900/20 text-amber-400" : "bg-amber-50 text-amber-700"}`}
                >
                  <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span className="flex-1">{myCaseError}</span>
                  <button onClick={fetchMyCaseData} className="shrink-0 underline font-semibold">
                    Retry
                  </button>
                </div>
              ) : myCaseData ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className={lbl}>Approval Date</p>
                      <p className={val}>{dateStr(myCaseData.approvalDate)}</p>
                    </div>
                    <div>
                      <p className={lbl}>Case Stage</p>
                      <p className={`${val} text-[11px] leading-tight`}>{myCaseData.caseStage ?? "—"}</p>
                    </div>
                    <div>
                      <p className={lbl}>Assigned To</p>
                      <p className={val}>{myCaseData.assignedTo ?? "—"}</p>
                    </div>
                    <div>
                      <p className={lbl}>Win Sheet Status</p>
                      <p className={val}>{myCaseData.winSheetStatus.replace(/_/g, " ")}</p>
                    </div>
                    {data?.winSheetLink && (
                      <div>
                        <p className={lbl}>Win Sheet Link</p>
                        <a
                          href={data.winSheetLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[12px] font-medium text-blue-500 hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          {data.winSheetLinkText || "Open"}
                        </a>
                      </div>
                    )}
                    {myCaseData.claimTypeLabel && (
                      <div>
                        <p className={lbl}>Claim Type</p>
                        <p className={val}>{myCaseData.claimTypeLabel.replace(/_/g, " / ")}</p>
                      </div>
                    )}
                    {myCaseData.levelWon && (
                      <div>
                        <p className={lbl}>Level Won</p>
                        <p className={val}>{myCaseData.levelWon.replace(/_/g, " ")}</p>
                      </div>
                    )}
                  </div>
                  {[
                    { key: "t16", label: "T16 (SSI)", color: "text-indigo-500", retro: myCaseData.t16Retro, due: myCaseData.t16FeeDue, received: myCaseData.t16FeeReceived, pending: myCaseData.t16Pending, receivedDate: myCaseData.t16FeeReceivedDate },
                    { key: "t2", label: "T2 (SSDI)", color: "text-blue-500", retro: myCaseData.t2Retro, due: myCaseData.t2FeeDue, received: myCaseData.t2FeeReceived, pending: myCaseData.t2Pending, receivedDate: myCaseData.t2FeeReceivedDate },
                  ].map((b) => (
                    <div key={b.key} className={`p-3 rounded-lg border ${t.borderLight} bg-neutral-50/30 dark:bg-neutral-900/20`}>
                      <p className={`text-[11px] font-bold uppercase ${b.color} mb-2`}>{b.label}</p>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { label: "Retro", val: b.retro },
                          { label: "Fee Due", val: b.due },
                          { label: "Received", val: b.received },
                          { label: "Pending", val: b.pending },
                        ].map((f) => (
                          <div key={f.label}>
                            <p className={lbl}>{f.label}</p>
                            <p className="text-xs font-semibold">{Number(f.val) > 0 ? fmtFull(Number(f.val)) : "—"}</p>
                          </div>
                        ))}
                        {b.receivedDate && (
                          <div className="col-span-2">
                            <p className={lbl}>Fee Received Date</p>
                            <p className="text-xs font-semibold">{dateStr(b.receivedDate)}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "T2 Decision", val: myCaseData.t2Decision },
                      { label: "T16 Decision", val: myCaseData.t16Decision },
                    ].map((f) => f.val && f.val !== "unknown" ? (
                      <div key={f.label}>
                        <p className={lbl}>{f.label}</p>
                        <p className={val}>{f.val.replace(/_/g, " ")}</p>
                      </div>
                    ) : null)}
                  </div>
                  {myCaseData.feesConfirmation && (
                    <div>
                      <p className={lbl}>Fees Confirmation</p>
                      <p className={`${val} text-[11px] leading-snug`}>{myCaseData.feesConfirmation}</p>
                    </div>
                  )}
                  {myCaseData.notes && (
                    <div>
                      <p className={lbl}>Collection Notes</p>
                      <p className={`${val} text-[11px] leading-snug whitespace-pre-wrap`}>{myCaseData.notes}</p>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {/* Actions */}
            <div className="p-4 mt-auto">
              <button
                onClick={() => router.push(`/cases/${data.id}`)}
                className={`w-full h-10 rounded-xl flex items-center justify-center gap-2 text-sm font-bold transition-colors ${t.ctaBtn} shadow-lg shadow-indigo-500/20`}
              >
                Go to Case Page <ChevronRight aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
    {data && (
      <MyCaseDocumentsDialog
        open={docsOpen}
        onOpenChange={setDocsOpen}
        caseId={data.id}
        caseName={data.name}
      />
    )}
    </>
  );
}
