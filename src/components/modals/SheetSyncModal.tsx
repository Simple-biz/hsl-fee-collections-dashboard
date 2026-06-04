"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import {
  X,
  RefreshCw,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ArrowLeft,
  ArrowRight,
  CloudDownload,
} from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import { fmtFull, fmtDate } from "@/lib/formatters";

interface SheetPreviewRow {
  clientId: number;
  caseName: string;
  caseLink: string;
  externalUrl: string | null;
  approvalDate: string | null;
  assignedTo: string | null;
  winSheetStatus: string;
  winSheetLink: string | null;
  winSheetLinkText: string | null;
  totalExpected: number;
  hasNotes: boolean;
  isSynthetic: boolean;
  status: "new" | "changed" | "unchanged";
  changedFields: { field: string; sheet: string; db: string }[];
}

interface DbOnlyRow {
  clientId: number;
  caseName: string;
  caseLink: string;
  approvalDate: string | null;
  status: "fees_closed" | "missing";
}

type Step4Filter = "all" | "new" | "changed" | "unchanged" | "fees_closed" | "missing";

type Step4PreviewRow =
  | (SheetPreviewRow & { syncable: true })
  | (DbOnlyRow & { syncable: boolean });

interface SyncPreviewResponse {
  usingMock: boolean;
  summary: {
    fetched: number;
    new: number;
    changed: number;
    unchanged: number;
    feesClosed: number;
    missing: number;
    synthetic: number;
    warnings: { row: number; message: string }[];
  };
  rows: {
    sheet: SheetPreviewRow[];
    feesClosed: DbOnlyRow[];
    missing: DbOnlyRow[];
  };
}

interface SheetSyncModalProps {
  dark: boolean;
  onClose: () => void;
  onSynced: () => Promise<void> | void;
}

type Step = 1 | 2 | 3 | 4;

const STEPS: { n: Step; title: string; subtitle: string }[] = [
  { n: 1, title: "Step 1", subtitle: "Fetch from Sheets" },
  { n: 2, title: "Step 2", subtitle: "Map Columns" },
  { n: 3, title: "Step 3", subtitle: "Compare & Preview" },
  { n: 4, title: "Step 4", subtitle: "Select & Sync" },
];

const COLUMN_MAP = [
  { sheet: "CASE LINK", db: "cases.first_name + last_name + external_id (URL)", required: true },
  { sheet: "ASSIGNED TO", db: "fee_records.assigned_to", required: false },
  { sheet: "CASE LEVEL", db: "cases.level_won", required: false },
  { sheet: "CLAIM TYPE", db: "cases.claim_type_label", required: false },
  { sheet: "APPROVAL DATE", db: "cases.approval_date", required: false },
  { sheet: "WIN SHEET STATUS", db: "fee_records.win_sheet_status", required: false },
  { sheet: "WIN SHEET LINK", db: "fee_records.win_sheet_link (URL)", required: false },
  { sheet: "FEES CONFIRMATION", db: "fee_records.fees_confirmation", required: false },
  { sheet: "CASE STATUS", db: "fee_records.case_status", required: false },
  { sheet: "APPROVED BY (OK TO CLOSE)", db: "fee_records.approved_by", required: false },
  { sheet: "T16 RETRO / FEE DUE / REC'D / PENDING / DATE", db: "fee_records.t16_*", required: false },
  { sheet: "T2 RETRO / FEE DUE / REC'D / PENDING / DATE", db: "fee_records.t2_*", required: false },
  { sheet: "RETRO AUX / AUX FEE DUE / REC'D / PENDING / DATE", db: "fee_records.aux_*", required: false },
  { sheet: "COLLECTION NOTES", db: "activity_log.message (one entry per case)", required: false },
  { sheet: "DATE ASSIGNED TO AGENT", db: "fee_records.date_assigned_to_agent", required: false },
];

const STATUS_PILL: Record<string, string> = {
  not_started: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400",
  started: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
  in_progress: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400",
  pending_payment: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400",
  partially_paid: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  paid_in_full: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  closed: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400",
};

const STATUS_BADGE: Record<string, (dark: boolean) => string> = {
  new: (dark) =>
    dark ? "bg-emerald-900/40 text-emerald-400" : "bg-emerald-100 text-emerald-700",
  changed: (dark) =>
    dark ? "bg-blue-900/40 text-blue-400" : "bg-blue-100 text-blue-700",
  unchanged: (dark) =>
    dark ? "bg-neutral-800 text-neutral-400" : "bg-neutral-100 text-neutral-600",
  fees_closed: (dark) =>
    dark ? "bg-violet-900/40 text-violet-400" : "bg-violet-100 text-violet-700",
  missing: (dark) =>
    dark ? "bg-amber-900/40 text-amber-400" : "bg-amber-100 text-amber-700",
};

const STATUS_LABEL: Record<string, string> = {
  new: "NEW",
  changed: "CHANGED",
  unchanged: "UP TO DATE",
  fees_closed: "FEES CLOSED",
  missing: "MISSING",
};

export default function SheetSyncModal({
  dark,
  onClose,
  onSynced,
}: SheetSyncModalProps) {
  const t = themeClasses(dark);
  const [step, setStep] = useState<Step>(1);
  const [fetching, setFetching] = useState(false);
  const [preview, setPreview] = useState<SyncPreviewResponse | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [allowSynthetic, setAllowSynthetic] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ inserted: number; updated: number; closed: number } | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Step4Filter>("all");

  const handleFetch = async () => {
    if (preview != null && selected.size > 0) {
      if (!window.confirm("Re-fetching will reset your current selection. Continue?")) return;
    }
    setFetching(true);
    setError(null);
    setPreview(null);

    const controller = new AbortController();
    fetchControllerRef.current = controller;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 30_000);
    try {
      const res = await fetch("/api/sheets/sync?mode=preview", {
        method: "POST",
        signal: controller.signal,
      });
      let json: Record<string, unknown> = {};
      try { json = await res.json(); } catch { /* non-JSON body */ }
      if (!res.ok)
        throw new Error((json.error as string) || `Fetch failed (${res.status})`);
      const data = json as unknown as SyncPreviewResponse;
      setPreview(data);
      setAllowSynthetic(false);
      setSelected(
        new Set([
          ...data.rows.sheet
            .filter((r) => (r.status === "new" || r.status === "changed") && !r.isSynthetic)
            .map((r) => r.clientId),
          ...data.rows.feesClosed.map((r) => r.clientId),
        ]),
      );
    } catch (e) {
      const err = e as Error;
      if (err.name === "AbortError") {
        if (timedOut) setError("Fetch timed out — please try again.");
      } else {
        setError(err.message);
      }
    } finally {
      clearTimeout(timer);
      setFetching(false);
    }
  };

  const newRows = useMemo(
    () => preview?.rows.sheet.filter((r) => r.status === "new") ?? [],
    [preview],
  );
  const changedRows = useMemo(
    () => preview?.rows.sheet.filter((r) => r.status === "changed") ?? [],
    [preview],
  );
  const unchangedRows = useMemo(
    () => preview?.rows.sheet.filter((r) => r.status === "unchanged") ?? [],
    [preview],
  );
  const syntheticRows = useMemo(
    () => preview?.rows.sheet.filter((r) => r.isSynthetic) ?? [],
    [preview],
  );

  useEffect(() => {
    if (!allowSynthetic && syntheticRows.length > 0) {
      setSelected((prev) => {
        const syntheticIds = new Set(syntheticRows.map((r) => r.clientId));
        const next = new Set(prev);
        for (const id of syntheticIds) next.delete(id);
        return next;
      });
    }
  }, [allowSynthetic, syntheticRows]);

  const step4Rows = useMemo<Step4PreviewRow[]>(() => {
    if (!preview) return [];
    return [
      ...preview.rows.sheet.map((r) => ({ ...r, syncable: true as const })),
      ...preview.rows.feesClosed.map((r) => ({ ...r, syncable: true })),
      ...preview.rows.missing.map((r) => ({ ...r, syncable: false as const })),
    ];
  }, [preview]);

  const filteredRows = useMemo(() => {
    if (!preview) return [];
    let r = step4Rows;
    if (filter !== "all") r = r.filter((x) => x.status === filter);
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(
        (x) =>
          x.caseName.toLowerCase().includes(q) ||
          String(x.clientId).includes(q) ||
          ("assignedTo" in x ? (x.assignedTo ?? "").toLowerCase().includes(q) : false),
      );
    }
    return r;
  }, [preview, step4Rows, filter, search]);

  const fetchControllerRef = useRef<AbortController | null>(null);
  const syncControllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => {
    fetchControllerRef.current?.abort();
    syncControllerRef.current?.abort();
  }, []);

  const runSync = async () => {
    if (!preview) return;
    const controller = new AbortController();
    syncControllerRef.current = controller;
    setSyncing(true);
    setError(null);
    let syncResult: { inserted: number; updated: number; closed: number } | null = null;
    try {
      const res = await fetch("/api/sheets/sync?mode=upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedClientIds: [...selected] }),
        signal: controller.signal,
      });
      let json: Record<string, unknown> = {};
      try { json = await res.json(); } catch { /* non-JSON body */ }
      if (!res.ok)
        throw new Error((json.error as string) || `Sync failed (${res.status})`);
      syncResult = {
        inserted: json.inserted as number,
        updated: json.updated as number,
        closed: (json.closed as number | undefined) ?? 0,
      };
    } catch (e) {
      const err = e as Error;
      if (err.name !== "AbortError")
        setError(err.message);
    } finally {
      setSyncing(false);
    }
    if (syncResult) {
      setResult(syncResult);
      try { await onSynced(); } catch { /* refresh failed; sync succeeded */ }
    }
  };

  const canAdvanceFromStep = (s: Step): boolean => {
    if (s === 1) return !!preview;
    if (s === 2) return !!preview;
    if (s === 3) return !!preview;
    if (s === 4) return selected.size > 0;
    return false;
  };

  const lblCls = `text-[10px] font-semibold uppercase tracking-wider ${t.textMuted}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50" />
      <div
        className={`relative w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col rounded-xl border ${t.card} mx-4`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-3 border-b ${t.borderLight}`}>
          <div className="flex items-center gap-2">
            <FileSpreadsheet
              className={`h-4 w-4 ${dark ? "text-emerald-400" : "text-emerald-600"}`}
              aria-hidden="true"
            />
            <h3 className={`text-sm font-bold ${t.text}`}>Google Sheets Sync</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className={`h-7 w-7 rounded-md flex items-center justify-center ${t.hover} ${t.textSub}`}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Stepper */}
        <div className={`grid grid-cols-4 gap-1 p-1 ${dark ? "bg-neutral-900/50" : "bg-neutral-50"}`}>
          {STEPS.map((s) => {
            const active = s.n === step;
            const completed = s.n < step;
            return (
              <button
                key={s.n}
                onClick={() => {
                  if (s.n <= step || canAdvanceFromStep(step)) setStep(s.n);
                }}
                className={`text-left px-3 py-2 rounded-md transition-colors ${
                  active
                    ? dark
                      ? "bg-neutral-100 text-neutral-900"
                      : "bg-neutral-900 text-white"
                    : completed
                      ? dark
                        ? "text-neutral-200 hover:bg-neutral-800"
                        : "text-neutral-700 hover:bg-neutral-200"
                      : dark
                        ? "text-neutral-500"
                        : "text-neutral-400"
                }`}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider">{s.title}</div>
                <div className="text-[12px] font-medium">{s.subtitle}</div>
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {error && (step === 1 || step === 4) && (
            <div
              role="alert"
              className={`mb-4 rounded-md border p-3 text-xs flex items-start justify-between gap-3 ${dark ? "bg-red-900/20 border-red-800 text-red-300" : "bg-red-50 border-red-200 text-red-700"}`}
            >
              <span>{error}</span>
              <button
                onClick={step === 1 ? handleFetch : runSync}
                className="shrink-0 underline font-semibold"
              >
                Retry
              </button>
            </div>
          )}

          {/* STEP 1: Fetch */}
          {step === 1 && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <CloudDownload className={`h-4 w-4 ${t.textSub}`} aria-hidden="true" />
                <h4 className={`text-sm font-semibold ${t.text}`}>Fetch from Google Sheets</h4>
              </div>
              <p className={`text-[11px] ${t.textMuted} mb-6`}>
                Pulls the latest rows from the MASTER LIST and Fees Closed tabs via the sync
                webhook and compares them against the cases database.
              </p>

              {!preview && !fetching && (
                <div className={`rounded-lg border-2 border-dashed p-12 text-center ${dark ? "border-neutral-700" : "border-neutral-300"}`}>
                  <FileSpreadsheet className={`h-10 w-10 mx-auto mb-3 ${t.textMuted}`} aria-hidden="true" />
                  <p className={`text-sm font-semibold ${t.text} mb-1`}>Ready to sync</p>
                  <p className={`text-[11px] ${t.textMuted} mb-5`}>
                    Click the button below to pull the latest data from Google Sheets
                  </p>
                  <button
                    onClick={handleFetch}
                    className={`h-9 px-5 rounded-lg text-xs font-semibold flex items-center gap-2 mx-auto ${t.ctaBtn} transition-colors`}
                  >
                    <CloudDownload className="h-3.5 w-3.5" aria-hidden="true" />
                    Fetch from Sheets
                  </button>
                </div>
              )}

              {fetching && (
                <div className="flex items-center justify-center py-16">
                  <RefreshCw className={`h-5 w-5 animate-spin ${t.textMuted}`} aria-hidden="true" />
                  <span className={`ml-2 text-sm ${t.textSub}`}>Fetching from Google Sheets…</span>
                </div>
              )}

              {preview && !fetching && (
                <div className="space-y-4">
                  {preview.usingMock && (
                    <div className={`rounded-md border p-3 flex items-center gap-2 text-[11px] ${dark ? "bg-amber-900/20 border-amber-800 text-amber-300" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      Using mock data — set{" "}
                      <code className="font-mono">SHEETS_SYNC_WEBHOOK_URL</code> in .env.local to
                      connect a real sheet
                    </div>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                    <Stat t={t} label="Rows fetched" value={preview.summary.fetched.toLocaleString()} />
                    <Stat
                      t={t}
                      label="New cases"
                      value={preview.summary.new.toLocaleString()}
                      accent={dark ? "text-emerald-400" : "text-emerald-600"}
                    />
                    <Stat
                      t={t}
                      label="Changed"
                      value={preview.summary.changed.toLocaleString()}
                      accent={
                        preview.summary.changed > 0
                          ? dark ? "text-blue-400" : "text-blue-600"
                          : undefined
                      }
                    />
                    <Stat
                      t={t}
                      label="Fees Closed"
                      value={preview.summary.feesClosed.toLocaleString()}
                      accent={dark ? "text-violet-400" : "text-violet-600"}
                    />
                    <Stat
                      t={t}
                      label="Missing"
                      value={preview.summary.missing.toLocaleString()}
                      accent={
                        preview.summary.missing > 0
                          ? dark ? "text-amber-400" : "text-amber-600"
                          : undefined
                      }
                    />
                    <Stat
                      t={t}
                      label="No URL"
                      value={preview.summary.synthetic.toLocaleString()}
                      accent={
                        preview.summary.synthetic > 0
                          ? dark ? "text-red-400" : "text-red-600"
                          : undefined
                      }
                    />
                  </div>
                  {preview.summary.warnings.length > 0 && (
                    <div className={`rounded-md border p-3 text-[11px] ${dark ? "bg-amber-900/20 border-amber-800 text-amber-300" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
                      <div className="flex items-center gap-1.5 font-semibold mb-1">
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                        {preview.summary.warnings.length} warning
                        {preview.summary.warnings.length === 1 ? "" : "s"}
                      </div>
                      <ul className="space-y-0.5 max-h-36 overflow-y-auto">
                        {preview.summary.warnings.slice(0, 25).map((w, i) => (
                          <li key={i}>Row {w.row}: {w.message}</li>
                        ))}
                      </ul>
                      {preview.summary.warnings.length > 25 && (
                        <p className="mt-1 opacity-70">…and {preview.summary.warnings.length - 25} more</p>
                      )}
                    </div>
                  )}
                  <button
                    onClick={handleFetch}
                    className={`h-8 px-3 rounded-md border text-xs font-medium flex items-center gap-1.5 ${t.outlineBtn} transition-colors`}
                  >
                    <RefreshCw className="h-3 w-3" aria-hidden="true" />
                    Re-fetch
                  </button>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: Map Columns */}
          {step === 2 && (
            <div>
              <h4 className={`text-sm font-semibold ${t.text} mb-1`}>Map Columns</h4>
              <p className={`text-[11px] ${t.textMuted} mb-4`}>
                The mapping below defines how Google Sheet columns write to the database. No action
                needed — all columns are mapped automatically.
              </p>
              <div className={`rounded-lg border ${t.borderLight} overflow-hidden`}>
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className={`border-b ${t.borderLight} ${dark ? "bg-neutral-900/40" : "bg-neutral-50"}`}>
                      <th className={`${lblCls} text-left px-3 py-2`}>Sheet column</th>
                      <th className={`${lblCls} text-left px-3 py-2`}>Maps to</th>
                      <th className={`${lblCls} text-center px-3 py-2 w-24`}>Required</th>
                    </tr>
                  </thead>
                  <tbody>
                    {COLUMN_MAP.map((m) => (
                      <tr key={m.sheet} className={`border-b ${t.borderLight}`}>
                        <td className={`${t.text} px-3 py-2 font-medium`}>{m.sheet}</td>
                        <td className={`${t.textSub} px-3 py-2 font-mono text-[11px]`}>{m.db}</td>
                        <td className="px-3 py-2 text-center">
                          {m.required ? (
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${dark ? "bg-red-900/40 text-red-400" : "bg-red-50 text-red-600"}`}>
                              REQUIRED
                            </span>
                          ) : (
                            <span className={`text-[10px] ${t.textMuted}`}>optional</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* STEP 3: Compare & Preview */}
          {step === 3 && preview && (
            <div>
              <h4 className={`text-sm font-semibold ${t.text} mb-1`}>Compare & Preview</h4>
              <p className={`text-[11px] ${t.textMuted} mb-4`}>
                Four categories based on where each record exists.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
                <Stat t={t} label="New" value={preview.summary.new.toLocaleString()} accent={dark ? "text-emerald-400" : "text-emerald-600"} />
                <Stat t={t} label="Changed" value={preview.summary.changed.toLocaleString()} accent={preview.summary.changed > 0 ? (dark ? "text-blue-400" : "text-blue-600") : undefined} />
                <Stat t={t} label="Up to date" value={preview.summary.unchanged.toLocaleString()} />
                <Stat t={t} label="Fees Closed" value={preview.summary.feesClosed.toLocaleString()} accent={dark ? "text-violet-400" : "text-violet-600"} />
                <Stat
                  t={t}
                  label="Missing"
                  value={preview.summary.missing.toLocaleString()}
                  accent={preview.summary.missing > 0 ? (dark ? "text-amber-400" : "text-amber-600") : undefined}
                />
              </div>
              <div className="space-y-5">
                <CategorySection
                  status="new"
                  count={preview.summary.new}
                  description="In sheet · not yet in database — will be inserted on sync"
                  dark={dark}
                  t={t}
                >
                  <SheetRowsTable
                    t={t}
                    dark={dark}
                    rows={newRows.slice(0, 100)}
                    truncated={newRows.length > 100}
                    total={newRows.length}
                  />
                </CategorySection>
                <CategorySection
                  status="changed"
                  count={preview.summary.changed}
                  description="In sheet · already in database · values have changed — will be updated on sync"
                  dark={dark}
                  t={t}
                >
                  <SheetRowsTable
                    t={t}
                    dark={dark}
                    rows={changedRows.slice(0, 100)}
                    truncated={changedRows.length > 100}
                    total={changedRows.length}
                    showChangedFields
                  />
                </CategorySection>
                <CategorySection
                  status="unchanged"
                  count={preview.summary.unchanged}
                  description="In sheet · already in database · no changes detected — skipped by default"
                  dark={dark}
                  t={t}
                >
                  <SheetRowsTable
                    t={t}
                    dark={dark}
                    rows={unchangedRows.slice(0, 100)}
                    truncated={unchangedRows.length > 100}
                    total={unchangedRows.length}
                  />
                </CategorySection>
                <CategorySection
                  status="fees_closed"
                  count={preview.summary.feesClosed}
                  description="In database · removed from MASTER LIST · found in Fees Closed sheet"
                  dark={dark}
                  t={t}
                >
                  <DbOnlyTable t={t} dark={dark} rows={preview.rows.feesClosed} />
                </CategorySection>
                <CategorySection
                  status="missing"
                  count={preview.summary.missing}
                  description="In database · not found in any sheet — may have been manually removed"
                  dark={dark}
                  t={t}
                >
                  <DbOnlyTable t={t} dark={dark} rows={preview.rows.missing} />
                </CategorySection>
              </div>
            </div>
          )}

          {/* STEP 4: Select & Sync */}
          {step === 4 && preview && !result && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className={`text-sm font-semibold ${t.text}`}>Select & Sync</h4>
                  <p className={`text-[11px] ${t.textMuted}`}>
                    Choose which rows to sync. MASTER LIST rows are inserted or updated; Fees Closed
                    rows are marked closed and moved to the Fees Closed page.
                  </p>
                </div>
                <div className={`text-[11px] ${t.textSub}`}>
                  <span className={`font-bold ${t.text}`}>{selected.size.toLocaleString()}</span>
                  {" "}/ {step4Rows.filter((r) => r.syncable).length.toLocaleString()} syncable selected
                </div>
              </div>

              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, id, agent…"
                  className={`h-8 px-3 rounded-md border text-xs outline-none flex-1 min-w-40 ${t.inputBg}`}
                />
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as typeof filter)}
                  className={`h-8 px-2 rounded-md border text-xs outline-none cursor-pointer ${t.inputBg}`}
                >
                  <option value="all">All rows</option>
                  <option value="new">New only</option>
                  <option value="changed">Changed only</option>
                  <option value="unchanged">Up to date only</option>
                  <option value="fees_closed">Fees Closed only</option>
                  <option value="missing">Missing only</option>
                </select>
                <button
                  onClick={() =>
                    setSelected(
                      new Set([
                        ...selected,
                        ...filteredRows
                          .filter((r) => r.syncable && (allowSynthetic || !("isSynthetic" in r && r.isSynthetic)))
                          .map((r) => r.clientId),
                      ]),
                    )
                  }
                  className={`h-8 px-3 rounded-md border text-xs font-medium ${t.outlineBtn} transition-colors`}
                >
                  Select shown
                </button>
                <button
                  onClick={() => {
                    const next = new Set(selected);
                    filteredRows.filter((r) => r.syncable).forEach((r) => next.delete(r.clientId));
                    setSelected(next);
                  }}
                  className={`h-8 px-3 rounded-md border text-xs font-medium ${t.outlineBtn} transition-colors`}
                >
                  Deselect shown
                </button>
              </div>

              {syntheticRows.length > 0 && (
                <div className={`rounded-md border p-3 mb-3 text-[11px] ${dark ? "bg-amber-900/20 border-amber-800 text-amber-300" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="flex-1">
                      <p className="font-semibold mb-1">
                        {syntheticRows.length} row{syntheticRows.length === 1 ? "" : "s"} {syntheticRows.length === 1 ? "has" : "have"} no valid MyCase URL
                      </p>
                      <p className="opacity-80 mb-2">
                        These rows were assigned temporary IDs and will create a duplicate record on every re-sync. Check Step 1 warnings for details.
                      </p>
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={allowSynthetic}
                          onChange={(e) => setAllowSynthetic(e.target.checked)}
                          className="h-3.5 w-3.5 cursor-pointer"
                        />
                        <span className="font-medium">Allow selection of rows without a valid MyCase link</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              <SelectionTable
                t={t}
                dark={dark}
                rows={filteredRows}
                truncated={false}
                total={filteredRows.length}
                selected={selected}
                allowSynthetic={allowSynthetic}
                onToggle={(id) => {
                  const row = step4Rows.find((r) => r.clientId === id);
                  if (!row?.syncable) return;
                  const isSynth = "isSynthetic" in row && row.isSynthetic;
                  if (isSynth && !allowSynthetic) return;
                  const next = new Set(selected);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  setSelected(next);
                }}
              />
            </div>
          )}

          {/* STEP 4 result */}
          {step === 4 && result && (
            <div className="py-12">
              <div className={`max-w-md mx-auto rounded-lg border p-5 ${dark ? "bg-emerald-900/20 border-emerald-800 text-emerald-300" : "bg-emerald-50 border-emerald-200 text-emerald-800"}`}>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0" aria-hidden="true" />
                  <div className="text-[13px]">
                    <p className="font-bold">Sync complete.</p>
                    <p className="opacity-90 mt-1">
                      <span className="font-semibold">{result.inserted.toLocaleString()}</span> new
                      case{result.inserted === 1 ? "" : "s"} inserted ·{" "}
                      <span className="font-semibold">{result.updated.toLocaleString()}</span>{" "}
                      existing record{result.updated === 1 ? "" : "s"} updated ·{" "}
                      <span className="font-semibold">{result.closed.toLocaleString()}</span>
                      {" "}case{result.closed === 1 ? "" : "s"} marked closed.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-between px-5 py-3 border-t ${t.borderLight}`}>
          <button
            onClick={() => {
              if (step === 1) onClose();
              else setStep((step - 1) as Step);
            }}
            className={`h-8 px-3 text-xs font-medium ${t.textSub} hover:underline flex items-center gap-1`}
          >
            <ArrowLeft className="h-3 w-3" aria-hidden="true" />
            {step === 1 ? "Cancel" : "Back"}
          </button>

          {step < 4 ? (
            <button
              onClick={() => canAdvanceFromStep(step) && setStep((step + 1) as Step)}
              disabled={!canAdvanceFromStep(step)}
              className={`h-8 px-4 rounded-md text-xs font-semibold flex items-center gap-1.5 ${t.ctaBtn} transition-colors disabled:opacity-50`}
            >
              Next: {STEPS[step].subtitle}
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </button>
          ) : !result ? (
            <button
              onClick={runSync}
              disabled={syncing || selected.size === 0}
              className={`h-8 px-4 rounded-md text-xs font-semibold flex items-center gap-1.5 ${t.ctaBtn} transition-colors disabled:opacity-50`}
            >
              {syncing ? (
                <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" />
              ) : (
                <FileSpreadsheet className="h-3 w-3" aria-hidden="true" />
              )}
              {syncing ? "Syncing…" : `Sync Selected (${selected.size.toLocaleString()})`}
            </button>
          ) : (
            <button onClick={onClose} className={`h-8 px-4 rounded-md text-xs font-semibold ${t.ctaBtn} transition-colors`}>
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const Stat = ({
  t,
  label,
  value,
  accent,
}: {
  t: ReturnType<typeof themeClasses>;
  label: string;
  value: string;
  accent?: string;
}) => (
  <div className={`rounded-lg border ${t.borderLight} p-3`}>
    <p className={`text-[10px] font-semibold uppercase tracking-wider ${t.textMuted}`}>{label}</p>
    <p className={`text-[18px] font-bold mt-0.5 tabular-nums ${accent ?? t.text}`}>{value}</p>
  </div>
);

const CategorySection = ({
  status,
  count,
  description,
  dark,
  t,
  children,
}: {
  status: "new" | "changed" | "unchanged" | "fees_closed" | "missing";
  count: number;
  description: string;
  dark: boolean;
  t: ReturnType<typeof themeClasses>;
  children: React.ReactNode;
}) => (
  <div>
    <div className="flex items-center gap-2 mb-2">
      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${STATUS_BADGE[status](dark)}`}>
        {STATUS_LABEL[status]}
      </span>
      <span className={`text-[11px] font-semibold tabular-nums ${t.text}`}>
        {count.toLocaleString()}
      </span>
      <span className={`text-[11px] ${t.textMuted}`}>{description}</span>
    </div>
    {count === 0 ? (
      <div className={`rounded-lg border ${t.borderLight} px-3 py-4 text-center text-[11px] ${t.textMuted}`}>
        None
      </div>
    ) : (
      children
    )}
  </div>
);

const SheetRowsTable = ({
  t,
  dark,
  rows,
  truncated,
  total,
  showChangedFields,
}: {
  t: ReturnType<typeof themeClasses>;
  dark: boolean;
  rows: SheetPreviewRow[];
  truncated: boolean;
  total: number;
  showChangedFields?: boolean;
}) => (
  <div className={`rounded-lg border ${t.borderLight} overflow-hidden`}>
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className={`border-b ${t.borderLight} ${dark ? "bg-neutral-900/40" : "bg-neutral-50"}`}>
            <Th>Case</Th>
            {showChangedFields && <Th>Changed (sheet → db)</Th>}
            <Th>Approved</Th>
            <Th>Assigned</Th>
            <Th>Win Sheet</Th>
            <Th alignRight>Expected</Th>
            <Th>Notes</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.clientId} className={`border-b ${t.borderLight}`}>
              <td className={`${t.text} px-3 py-1.5 font-medium max-w-72 truncate`} title={r.caseLink}>
                {r.caseName}
                {r.externalUrl && (
                  <a
                    href={r.externalUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className={`ml-1 inline-flex ${t.textMuted} hover:${t.text}`}
                  >
                    <ExternalLink className="h-3 w-3 inline" aria-hidden="true" />
                  </a>
                )}
              </td>
              {showChangedFields && (
                <td className="px-3 py-1.5 max-w-64">
                  <div className={`text-[10px] font-mono space-y-0.5 ${dark ? "text-blue-300" : "text-blue-700"}`}>
                    {r.changedFields.slice(0, 3).map((f) => (
                      <div key={f.field} className="leading-tight">
                        <span className="font-semibold">{f.field}</span>
                        <span className={`ml-1 ${dark ? "text-neutral-400" : "text-neutral-500"}`}>
                          {f.sheet || "∅"} → {f.db || "∅"}
                        </span>
                      </div>
                    ))}
                    {r.changedFields.length > 3 && (
                      <div className={`${dark ? "text-neutral-500" : "text-neutral-400"}`}>
                        +{r.changedFields.length - 3} more
                      </div>
                    )}
                  </div>
                </td>
              )}
              <td className={`${t.textSub} px-3 py-1.5 tabular-nums`}>{fmtDate(r.approvalDate)}</td>
              <td className={`${t.textSub} px-3 py-1.5`}>{r.assignedTo ?? "—"}</td>
              <td className="px-3 py-1.5">
                {r.winSheetLink && r.winSheetLink.startsWith("http") ? (
                  <a
                    href={r.winSheetLink}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className={`text-[11px] underline ${dark ? "text-blue-400" : "text-blue-600"} inline-flex items-center gap-1`}
                  >
                    {r.winSheetLinkText ?? "Open"}
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                ) : (
                  <span className={`text-[11px] ${t.textMuted}`}>{r.winSheetLinkText ?? "—"}</span>
                )}
              </td>
              <td className={`${t.text} px-3 py-1.5 text-right tabular-nums font-medium`}>
                {r.totalExpected > 0 ? fmtFull(r.totalExpected) : "—"}
              </td>
              <td className="px-3 py-1.5 text-center">
                {r.hasNotes ? (
                  <span className={`text-[10px] font-semibold ${dark ? "text-blue-400" : "text-blue-600"}`}>YES</span>
                ) : (
                  <span className={`text-[10px] ${t.textMuted}`}>—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {truncated && (
      <div className={`text-[11px] px-3 py-2 ${t.textMuted} ${dark ? "bg-neutral-900/40" : "bg-neutral-50"} border-t ${t.borderLight}`}>
        Showing first 100 of {total.toLocaleString()} rows.
      </div>
    )}
  </div>
);

const DbOnlyTable = ({
  t,
  dark,
  rows,
}: {
  t: ReturnType<typeof themeClasses>;
  dark: boolean;
  rows: DbOnlyRow[];
}) => (
  <div className={`rounded-lg border ${t.borderLight} overflow-hidden`}>
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className={`border-b ${t.borderLight} ${dark ? "bg-neutral-900/40" : "bg-neutral-50"}`}>
            <Th>Case</Th>
            <Th>Approved</Th>
            <Th>Case Link</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.clientId} className={`border-b ${t.borderLight}`}>
              <td className={`${t.text} px-3 py-1.5 font-medium`}>{r.caseName}</td>
              <td className={`${t.textSub} px-3 py-1.5 tabular-nums`}>{fmtDate(r.approvalDate)}</td>
              <td className={`${t.textMuted} px-3 py-1.5 text-[11px] max-w-80 truncate`} title={r.caseLink}>
                {r.caseLink || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const SelectionTable = ({
  t,
  dark,
  rows,
  truncated,
  total,
  selected,
  allowSynthetic,
  onToggle,
}: {
  t: ReturnType<typeof themeClasses>;
  dark: boolean;
  rows: Step4PreviewRow[];
  truncated: boolean;
  total: number;
  selected: Set<number>;
  allowSynthetic: boolean;
  onToggle: (id: number) => void;
}) => (
  <div className={`rounded-lg border ${t.borderLight} overflow-hidden`}>
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className={`border-b ${t.borderLight} ${dark ? "bg-neutral-900/40" : "bg-neutral-50"} sticky top-0`}>
            <Th>{""}</Th>
            <Th>Case</Th>
            <Th>Status</Th>
            <Th>Approved</Th>
            <Th>Assigned</Th>
            <Th>Win Sheet Status</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const checked = selected.has(r.clientId);
            const isSynthetic = "isSynthetic" in r && r.isSynthetic === true;
            const effectivelyDisabled = !r.syncable || (isSynthetic && !allowSynthetic);
            return (
              <tr
                key={r.clientId}
                onClick={() => !effectivelyDisabled && onToggle(r.clientId)}
                className={`border-b ${t.borderLight} ${
                  effectivelyDisabled ? "cursor-not-allowed opacity-70" : "cursor-pointer"
                } ${dark ? "hover:bg-neutral-800/40" : "hover:bg-neutral-50"}`}
              >
                <td className="px-3 py-1.5">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={effectivelyDisabled}
                    onChange={() => onToggle(r.clientId)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-3.5 w-3.5 cursor-pointer disabled:cursor-not-allowed"
                  />
                </td>
                <td className={`${t.text} px-3 py-1.5 font-medium max-w-80 truncate`} title={r.caseLink}>
                  <span className="inline-flex items-center gap-1">
                    {r.caseName}
                    {isSynthetic && (
                      <AlertTriangle
                        className={`h-3 w-3 shrink-0 ${dark ? "text-amber-400" : "text-amber-500"}`}
                        aria-hidden="true"
                      />
                    )}
                  </span>
                </td>
                <td className="px-3 py-1.5">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${STATUS_BADGE[r.status](dark)}`}>
                    {STATUS_LABEL[r.status]}
                  </span>
                </td>
                <td className={`${t.textSub} px-3 py-1.5 tabular-nums`}>{fmtDate(r.approvalDate)}</td>
                <td className={`${t.textSub} px-3 py-1.5`}>{"assignedTo" in r ? (r.assignedTo ?? "—") : "—"}</td>
                <td className="px-3 py-1.5">
                  {"winSheetStatus" in r ? (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${STATUS_PILL[r.winSheetStatus] ?? STATUS_PILL.not_started}`}>
                      {r.winSheetStatus.replace(/_/g, " ")}
                    </span>
                  ) : (
                    <span className={`text-[10px] ${t.textMuted}`}>—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    {truncated && (
      <div className={`text-[11px] px-3 py-2 ${t.textMuted} ${dark ? "bg-neutral-900/40" : "bg-neutral-50"} border-t ${t.borderLight}`}>
        Showing first 200 of {total.toLocaleString()} matching rows.
      </div>
    )}
  </div>
);

const Th = ({
  children,
  alignRight,
}: {
  children: React.ReactNode;
  alignRight?: boolean;
}) => (
  <th className={`text-[10px] font-semibold uppercase tracking-wider px-3 py-2 ${alignRight ? "text-right" : "text-left"}`}>
    {children}
  </th>
);
