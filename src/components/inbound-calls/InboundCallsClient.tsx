"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { useSession } from "next-auth/react";
import {
  PhoneIncoming,
  Plus,
  Save,
  RefreshCw,
  AlertCircle,
  Trash2,
  ChevronDown,
  Check,
  Upload,
} from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import CsvImportModal, { type ColumnDef, type ImportResult } from "@/components/modals/CsvImportModal";
import { bulkImportInboundCalls } from "@/app/(dashboard)/inbound-calls/actions";
import { parseBool, parseDate } from "@/lib/import/csv-parser";

// ── helpers ──────────────────────────────────────────────────────────────────

// All "today" and week-start logic is anchored to Eastern Time so the week
// boundaries are consistent regardless of where the browser is running.
const ET = "America/New_York";

function todayEasternIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ET }).format(new Date());
}

function isoToParts(dateStr: string): [number, number, number] {
  const [y, m, d] = dateStr.split("-").map(Number);
  return [y, m, d];
}

function partsToIso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function getMondayOf(dateStr: string): string {
  // Construct via numeric parts so the Date is always local midnight —
  // new Date("YYYY-MM-DDT00:00:00") does the same, but toISOString() then
  // converts back to UTC and shifts the date for timezones ahead of UTC.
  const [y, m, d] = isoToParts(dateStr);
  const date = new Date(y, m - 1, d);
  const dow = date.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  date.setDate(date.getDate() + diff);
  return partsToIso(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function currentWeekStart(): string {
  return getMondayOf(todayEasternIso());
}

function addWeeks(weekStart: string, delta: number): string {
  const [y, m, d] = isoToParts(weekStart);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + delta * 7);
  return partsToIso(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function weekLabel(weekStart: string): string {
  const d = new Date(weekStart + "T00:00:00");
  const month = d.toLocaleString("en-US", { month: "long" });
  const weekNum = Math.ceil(d.getDate() / 7);
  return `${month} Week ${weekNum}`;
}

function isCurrentWeek(weekStart: string): boolean {
  return weekStart === currentWeekStart();
}

const DAYS = [
  { num: 1, label: "Monday" },
  { num: 2, label: "Tuesday" },
  { num: 3, label: "Wednesday" },
  { num: 4, label: "Thursday" },
  { num: 5, label: "Friday" },
];

// ── types ─────────────────────────────────────────────────────────────────────

interface CallRecord {
  id: number;
  callDate: string;
  number: string;
  transcript: string;
  caseLink: string;
  specialistAssigned: string;
  calledBackResolved: boolean;
}

interface PocAssignments {
  1: string[];
  2: string[];
  3: string[];
  4: string[];
  5: string[];
}

// ── component ─────────────────────────────────────────────────────────────────

export function InboundCallsClient({ teamMembers }: { teamMembers: string[] }) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const t = themeClasses(dark);
  const { data: session } = useSession();
  const role = session?.user?.role;
  const isAdmin = role === "admin" || role === "system_admin";

  // Week selection
  const [selectedWeek, setSelectedWeek] = useState<string>(currentWeekStart());
  const [availableWeeks, setAvailableWeeks] = useState<string[]>([]);
  const [weekMenuOpen, setWeekMenuOpen] = useState(false);
  const weekMenuRef = useRef<HTMLDivElement>(null);

  // POC
  const [pocAssignments, setPocAssignments] = useState<PocAssignments>({ 1: [], 2: [], 3: [], 4: [], 5: [] });
  const [pocDraft, setPocDraft] = useState<PocAssignments>({ 1: [], 2: [], 3: [], 4: [], 5: [] });
  const [pocEditMode, setPocEditMode] = useState(false);
  const [pocSaving, setPocSaving] = useState(false);
  const [pocError, setPocError] = useState<string | null>(null);

  // Records
  const [records, setRecords] = useState<CallRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsError, setRecordsError] = useState<string | null>(null);
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [addingRow, setAddingRow] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  const [csvImportOpen, setCsvImportOpen] = useState(false);

  const recordsControllerRef = useRef<AbortController | null>(null);
  const pocControllerRef = useRef<AbortController | null>(null);
  const pocSaveControllerRef = useRef<AbortController | null>(null);
  const fetchCancelledRef = useRef(false);

  // ── fetch available weeks ───────────────────────────────────────────────────

  useEffect(() => {
    const cur = currentWeekStart();
    const weeks: string[] = [];
    for (let i = 0; i < 8; i++) {
      weeks.push(addWeeks(cur, -i));
    }
    setAvailableWeeks(weeks);
  }, []);

  // ── fetch POC ──────────────────────────────────────────────────────────────

  const fetchPoc = useCallback(async (week: string) => {
    pocControllerRef.current?.abort();
    const controller = new AbortController();
    pocControllerRef.current = controller;
    setPocError(null);
    try {
      const res = await fetch(`/api/inbound-calls/poc?week=${week}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`Failed to load POC (${res.status})`);
      const json = await res.json();
      if (fetchCancelledRef.current) return;
      setPocAssignments(json.assignments ?? { 1: [], 2: [], 3: [], 4: [], 5: [] });
    } catch (e) {
      if (fetchCancelledRef.current) return;
      if ((e as Error).name !== "AbortError") setPocError((e as Error).message);
    }
  }, []);

  // ── fetch records ──────────────────────────────────────────────────────────

  const fetchRecords = useCallback(async (week: string) => {
    recordsControllerRef.current?.abort();
    const controller = new AbortController();
    recordsControllerRef.current = controller;
    setRecordsLoading(true);
    setRecordsError(null);
    try {
      const res = await fetch(`/api/inbound-calls?week=${week}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`Failed to load call records (${res.status})`);
      const json = await res.json();
      if (fetchCancelledRef.current) return;
      setRecords(json.data ?? []);
    } catch (e) {
      if (fetchCancelledRef.current) return;
      if ((e as Error).name !== "AbortError") setRecordsError((e as Error).message);
    } finally {
      if (!fetchCancelledRef.current) setRecordsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCancelledRef.current = false;
    setPendingDelete(null);
    fetchPoc(selectedWeek);
    fetchRecords(selectedWeek);
    return () => {
      fetchCancelledRef.current = true;
      pocControllerRef.current?.abort();
      recordsControllerRef.current?.abort();
    };
  }, [selectedWeek, fetchPoc, fetchRecords]);

  // ── week menu close on outside click ───────────────────────────────────────

  useEffect(() => {
    if (!weekMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (weekMenuRef.current && !weekMenuRef.current.contains(e.target as Node)) {
        setWeekMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [weekMenuOpen]);

  // ── POC save ───────────────────────────────────────────────────────────────

  const savePoc = async () => {
    pocSaveControllerRef.current?.abort();
    const controller = new AbortController();
    pocSaveControllerRef.current = controller;
    setPocSaving(true);
    setPocError(null);
    try {
      const res = await fetch("/api/inbound-calls/poc", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart: selectedWeek, assignments: pocDraft }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Failed to save POC assignments (${res.status})`);
      if (controller.signal.aborted) return;
      setPocAssignments({ ...pocDraft });
      setPocEditMode(false);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setPocError((e as Error).message);
    } finally {
      if (!controller.signal.aborted) setPocSaving(false);
    }
  };

  // ── record field update ────────────────────────────────────────────────────

  const updateRecord = async (id: number, field: string, value: string | boolean | null) => {
    setSaving((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await fetch(`/api/inbound-calls/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
    } catch {
      // silently fail — row stays with local edit
    } finally {
      setSaving((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleFieldChange = (id: number, field: keyof CallRecord, value: string | boolean) => {
    setRecords((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
    );
  };

  // ── add row ────────────────────────────────────────────────────────────────

  const addRow = async () => {
    setAddingRow(true);
    try {
      const res = await fetch("/api/inbound-calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekStart: selectedWeek,
          callDate: todayEasternIso(),
        }),
      });
      if (!res.ok) throw new Error(`Failed to add row (${res.status})`);
      const row = await res.json();
      setRecords((prev) => [...prev, row]);
    } catch {
      // silently fail
    } finally {
      setAddingRow(false);
    }
  };

  // ── delete row ─────────────────────────────────────────────────────────────

  const confirmDelete = async (id: number) => {
    setPendingDelete(null);
    setRecords((prev) => prev.filter((r) => r.id !== id));
    try {
      await fetch(`/api/inbound-calls/${id}`, { method: "DELETE" });
    } catch {
      if (!fetchCancelledRef.current) fetchRecords(selectedWeek);
    }
  };

  // ── styles ─────────────────────────────────────────────────────────────────

  const card = `rounded-xl border ${t.card}`;
  const inputCls = `w-full text-xs bg-transparent border-0 outline-none focus:ring-1 focus:ring-blue-500 rounded px-1.5 py-1 ${t.text} placeholder:${t.textMuted}`;
  const thCls = `px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider ${t.textMuted} whitespace-nowrap`;
  const tdCls = `px-2 py-1.5 align-top`;

  // ── render ─────────────────────────────────────────────────────────────────

  const IC_CSV_COLUMNS: ColumnDef[] = [
    { key: "call_date", label: "Call Date", required: true, hint: "YYYY-MM-DD or MM/DD/YYYY (week_start is derived automatically)" },
    { key: "number", label: "Number", hint: "Phone number (optional)" },
    { key: "transcript", label: "Transcript", hint: "Call notes (optional)" },
    { key: "case_link", label: "Case Link", hint: "URL or case ID (optional)" },
    { key: "specialist_assigned", label: "Specialist Assigned", hint: "Name (optional)" },
    { key: "called_back_resolved", label: "Called Back / Resolved", hint: "true/false/yes/no/1/0" },
  ];

  const IC_TEMPLATE_CSV =
    "call_date,number,transcript,case_link,specialist_assigned,called_back_resolved\n" +
    "2024-01-15,555-1234,Caller asked about status,https://...,Jane Smith,false\n";

  const validateIcRow = (raw: Record<string, string>): string[] => {
    const errors: string[] = [];
    if (!raw["call_date"]?.trim() || !parseDate(raw["call_date"])) errors.push("Invalid or missing call_date");
    if (raw["called_back_resolved"]?.trim() && parseBool(raw["called_back_resolved"]) === null) {
      errors.push("Invalid called_back_resolved value");
    }
    return errors;
  };

  const handleIcImport = async (validRows: Record<string, string>[]): Promise<ImportResult> => {
    return bulkImportInboundCalls(validRows);
  };

  return (
    <div className="space-y-4">
      {csvImportOpen && (
        <CsvImportModal
          dark={dark}
          title="Import Inbound Calls"
          description="Upload a CSV to bulk-insert call records. Each row creates a new record (no deduplication)."
          columns={IC_CSV_COLUMNS}
          templateFilename="inbound-calls-template.csv"
          templateCsv={IC_TEMPLATE_CSV}
          validateRow={validateIcRow}
          onImport={handleIcImport}
          onClose={() => setCsvImportOpen(false)}
          onSuccess={() => void fetchRecords(selectedWeek)}
          defaultHeaderRow={2}
        />
      )}
      {/* ── header bar ── */}
      <div className={`${card} px-4 py-3 flex items-center justify-between gap-3 flex-wrap`}>
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${dark ? "bg-blue-900/40" : "bg-blue-50"}`}>
            <PhoneIncoming aria-hidden="true" className={`h-4 w-4 ${dark ? "text-blue-400" : "text-blue-600"}`} />
          </div>
          <div>
            <h2 className={`text-sm font-bold ${t.text}`}>Inbound Call History</h2>
            <p className={`text-[11px] ${t.textMuted}`}>POC schedule and call log by week</p>
          </div>
        </div>

        {/* week picker */}
        <div className="relative" ref={weekMenuRef}>
          <button
            onClick={() => setWeekMenuOpen((v) => !v)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${dark ? "border-neutral-700 text-neutral-200 hover:border-neutral-500" : "border-neutral-200 text-neutral-700 hover:border-neutral-400"}`}
          >
            {weekLabel(selectedWeek)}
            {isCurrentWeek(selectedWeek) && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${dark ? "bg-blue-900/50 text-blue-300" : "bg-blue-100 text-blue-600"}`}>
                This week
              </span>
            )}
            <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 opacity-60" />
          </button>
          {weekMenuOpen && (
            <div className={`absolute right-0 mt-1 z-20 w-52 rounded-xl border shadow-lg overflow-hidden ${dark ? "bg-neutral-800 border-neutral-700" : "bg-white border-neutral-200"}`}>
              {availableWeeks.map((w) => (
                <button
                  key={w}
                  onClick={() => { setSelectedWeek(w); setWeekMenuOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between transition-colors ${
                    w === selectedWeek
                      ? dark ? "bg-blue-900/40 text-blue-300" : "bg-blue-50 text-blue-700"
                      : dark ? "hover:bg-neutral-700 text-neutral-200" : "hover:bg-neutral-50 text-neutral-700"
                  }`}
                >
                  <span>{weekLabel(w)}</span>
                  {isCurrentWeek(w) && <span className={`text-[10px] ${dark ? "text-blue-400" : "text-blue-500"}`}>Now</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── POC grid ── */}
      <div className={card}>
        <div className={`px-4 py-3 border-b ${dark ? "border-neutral-700/60" : "border-neutral-100"} flex items-center justify-between gap-3`}>
          <span className={`text-xs font-semibold ${t.text}`}>Point of Contact — {weekLabel(selectedWeek)}</span>
          {isAdmin && !pocEditMode && (
            <button
              onClick={() => { setPocDraft({ ...pocAssignments }); setPocEditMode(true); }}
              className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors ${dark ? "border-neutral-600 text-neutral-300 hover:border-neutral-400" : "border-neutral-200 text-neutral-600 hover:border-neutral-400"}`}
            >
              Edit schedule
            </button>
          )}
          {isAdmin && pocEditMode && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPocEditMode(false)}
                className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors ${dark ? "border-neutral-600 text-neutral-400 hover:border-neutral-400" : "border-neutral-200 text-neutral-500 hover:border-neutral-400"}`}
              >
                Cancel
              </button>
              <button
                onClick={savePoc}
                disabled={pocSaving}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
              >
                {pocSaving && <RefreshCw aria-hidden="true" className="h-3 w-3 animate-spin" />}
                <Save aria-hidden="true" className="h-3 w-3" />
                Save
              </button>
            </div>
          )}
        </div>

        {pocError && (
          <div className={`mx-4 mt-3 rounded-lg px-3 py-2 flex items-center gap-2 text-xs ${dark ? "bg-red-900/20 border border-red-800 text-red-400" : "bg-red-50 border border-red-200 text-red-600"}`} role="alert">
            <AlertCircle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            {pocError}
          </div>
        )}

        <div className="px-4 py-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {DAYS.map(({ num, label }) => {
            const assigned = pocAssignments[num as keyof PocAssignments] ?? [];
            const draft = pocDraft[num as keyof PocAssignments] ?? [];

            return (
              <div
                key={num}
                className={`rounded-lg border p-3 min-h-[90px] ${dark ? "border-neutral-700 bg-neutral-800/40" : "border-neutral-200 bg-neutral-50/60"}`}
              >
                <p className={`text-[11px] font-semibold mb-2 ${t.textMuted}`}>{label}</p>
                {pocEditMode && isAdmin ? (
                  <div className="space-y-1.5">
                    {teamMembers.map((name) => {
                      const checked = draft.includes(name);
                      return (
                        <label key={name} className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setPocDraft((prev) => ({
                                ...prev,
                                [num]: checked
                                  ? prev[num as keyof PocAssignments].filter((n) => n !== name)
                                  : [...prev[num as keyof PocAssignments], name],
                              }));
                            }}
                            className="h-3 w-3 rounded accent-blue-500"
                          />
                          <span className={`text-[11px] ${t.text} truncate`}>{name}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : assigned.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {assigned.map((name) => (
                      <span
                        key={name}
                        className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${dark ? "bg-blue-900/40 text-blue-300" : "bg-blue-100 text-blue-700"}`}
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className={`text-[11px] italic ${t.textMuted}`}>No POC assigned</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── call records table ── */}
      <div className={card}>
        <div className={`px-4 py-3 border-b ${dark ? "border-neutral-700/60" : "border-neutral-100"} flex items-center justify-between gap-3`}>
          <span className={`text-xs font-semibold ${t.text}`}>
            Call Log
            {records.length > 0 && (
              <span className={`ml-2 text-[11px] font-normal ${t.textMuted}`}>{records.length} record{records.length !== 1 ? "s" : ""}</span>
            )}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCsvImportOpen(true)}
              className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg border transition-colors ${dark ? "border-neutral-600 text-neutral-300 hover:border-neutral-400" : "border-neutral-200 text-neutral-600 hover:border-neutral-400"}`}
              aria-label="Import call records from CSV"
            >
              <Upload aria-hidden="true" className="h-3 w-3" />
              Import CSV
            </button>
            <button
              onClick={addRow}
              disabled={addingRow}
              className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {addingRow
                ? <RefreshCw aria-hidden="true" className="h-3 w-3 animate-spin" />
                : <Plus aria-hidden="true" className="h-3 w-3" />
              }
              Add row
            </button>
          </div>
        </div>

        {recordsError && (
          <div className={`mx-4 mt-3 rounded-lg px-3 py-2 flex items-center gap-2 text-xs ${dark ? "bg-red-900/20 border border-red-800 text-red-400" : "bg-red-50 border border-red-200 text-red-600"}`} role="alert">
            <AlertCircle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            {recordsError}
          </div>
        )}

        <div className="overflow-x-auto">
          {recordsLoading ? (
            <div className="flex items-center justify-center py-14">
              <RefreshCw aria-hidden="true" className={`h-5 w-5 animate-spin ${t.textMuted}`} />
              <span className={`ml-3 text-sm ${t.textSub}`}>Loading...</span>
            </div>
          ) : records.length === 0 ? (
            <div className={`text-center py-14 text-sm ${t.textMuted}`}>
              No call records for {weekLabel(selectedWeek)}. Add one above.
            </div>
          ) : (
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className={`border-b ${dark ? "border-neutral-700/60" : "border-neutral-100"}`}>
                  <th className={thCls} style={{ width: 110 }}>Date</th>
                  <th className={thCls} style={{ width: 130 }}>Number</th>
                  <th className={thCls}>Transcript</th>
                  <th className={thCls} style={{ width: 160 }}>Case Link</th>
                  <th className={thCls} style={{ width: 180 }}>Collection Specialist</th>
                  <th className={`${thCls} text-center`} style={{ width: 80 }}>Resolved</th>
                  <th className={thCls} style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {records.map((row) => (
                  <tr
                    key={row.id}
                    className={`border-b last:border-0 transition-colors ${dark ? "border-neutral-700/40 hover:bg-neutral-800/40" : "border-neutral-100 hover:bg-neutral-50/60"} ${saving[row.id] ? "opacity-70" : ""}`}
                  >
                    {/* Date */}
                    <td className={tdCls}>
                      <input
                        type="date"
                        value={row.callDate}
                        onChange={(e) => handleFieldChange(row.id, "callDate", e.target.value)}
                        onBlur={(e) => updateRecord(row.id, "callDate", e.target.value)}
                        className={inputCls}
                      />
                    </td>
                    {/* Number */}
                    <td className={tdCls}>
                      <input
                        type="text"
                        value={row.number}
                        placeholder="Phone number"
                        onChange={(e) => handleFieldChange(row.id, "number", e.target.value)}
                        onBlur={(e) => updateRecord(row.id, "number", e.target.value || null)}
                        className={inputCls}
                      />
                    </td>
                    {/* Transcript */}
                    <td className={tdCls}>
                      <textarea
                        value={row.transcript}
                        placeholder="Call notes"
                        rows={2}
                        onChange={(e) => handleFieldChange(row.id, "transcript", e.target.value)}
                        onBlur={(e) => updateRecord(row.id, "transcript", e.target.value || null)}
                        className={`${inputCls} resize-none`}
                      />
                    </td>
                    {/* Case Link */}
                    <td className={tdCls}>
                      <input
                        type="text"
                        value={row.caseLink}
                        placeholder="URL or case ID"
                        onChange={(e) => handleFieldChange(row.id, "caseLink", e.target.value)}
                        onBlur={(e) => updateRecord(row.id, "caseLink", e.target.value || null)}
                        className={inputCls}
                      />
                    </td>
                    {/* Specialist */}
                    <td className={tdCls}>
                      <select
                        value={row.specialistAssigned}
                        onChange={(e) => {
                          handleFieldChange(row.id, "specialistAssigned", e.target.value);
                          updateRecord(row.id, "specialistAssigned", e.target.value || null);
                        }}
                        className={`${inputCls} cursor-pointer`}
                      >
                        <option value="">— Assign —</option>
                        {teamMembers.map((name) => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    </td>
                    {/* Called back / Resolved */}
                    <td className={`${tdCls} text-center`}>
                      <button
                        onClick={() => {
                          const next = !row.calledBackResolved;
                          handleFieldChange(row.id, "calledBackResolved", next);
                          updateRecord(row.id, "calledBackResolved", next);
                        }}
                        aria-label={row.calledBackResolved ? "Mark unresolved" : "Mark resolved"}
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center mx-auto transition-colors ${
                          row.calledBackResolved
                            ? "bg-emerald-500 border-emerald-500"
                            : dark ? "border-neutral-500 hover:border-neutral-400" : "border-neutral-300 hover:border-neutral-400"
                        }`}
                      >
                        {row.calledBackResolved && <Check aria-hidden="true" className="h-3 w-3 text-white" />}
                      </button>
                    </td>
                    {/* Delete */}
                    <td className={tdCls}>
                      {pendingDelete === row.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => confirmDelete(row.id)}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-red-500 text-white hover:bg-red-600 transition-colors"
                          >
                            Delete
                          </button>
                          <button
                            onClick={() => setPendingDelete(null)}
                            className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${dark ? "border-neutral-600 text-neutral-400 hover:border-neutral-400" : "border-neutral-200 text-neutral-500 hover:border-neutral-400"}`}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setPendingDelete(row.id)}
                          aria-label="Delete row"
                          className={`p-1 rounded transition-colors ${dark ? "text-neutral-500 hover:text-red-400" : "text-neutral-400 hover:text-red-500"}`}
                        >
                          <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
