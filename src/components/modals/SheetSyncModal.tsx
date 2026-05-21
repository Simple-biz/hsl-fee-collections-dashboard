"use client";

import { useMemo, useState } from "react";
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

interface SyncPreviewRow {
  clientId: number;
  caseName: string;
  caseLink: string;
  externalUrl: string | null;
  approvalDate: string | null;
  assignedTo: string | null;
  winSheetStatus: string;
  winSheetLink: string | null;
  winSheetLinkText: string | null;
  levelWon: string | null;
  claimType: string | null;
  totalExpected: number;
  hasNotes: boolean;
  isNew: boolean;
}

interface SyncPreviewResponse {
  usingMock: boolean;
  summary: {
    fetched: number;
    new: number;
    existing: number;
    warnings: { row: number; message: string }[];
  };
  rows: SyncPreviewRow[];
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
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    inserted: number;
    updated: number;
  } | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "new" | "existing">("all");

  const handleFetch = async () => {
    if (preview != null && selected.size > 0) {
      if (!window.confirm("Re-fetching will reset your current selection. Continue?")) return;
    }
    setFetching(true);
    setError(null);
    setPreview(null);

    const controller = new AbortController();
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
      setSelected(new Set(data.rows.map((r) => r.clientId)));
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

  const filteredRows = useMemo(() => {
    if (!preview) return [];
    let r = preview.rows;
    if (filter === "new") r = r.filter((x) => x.isNew);
    if (filter === "existing") r = r.filter((x) => !x.isNew);
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(
        (x) =>
          x.caseName.toLowerCase().includes(q) ||
          String(x.clientId).includes(q) ||
          (x.assignedTo ?? "").toLowerCase().includes(q),
      );
    }
    return r;
  }, [preview, filter, search]);

  const runSync = async () => {
    if (!preview) return;
    setSyncing(true);
    setError(null);
    let syncResult: { inserted: number; updated: number } | null = null;
    try {
      const res = await fetch("/api/sheets/sync?mode=upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedClientIds: [...selected] }),
        signal: AbortSignal.timeout(60_000),
      });
      let json: Record<string, unknown> = {};
      try { json = await res.json(); } catch { /* non-JSON body */ }
      if (!res.ok)
        throw new Error((json.error as string) || `Sync failed (${res.status})`);
      syncResult = { inserted: json.inserted as number, updated: json.updated as number };
    } catch (e) {
      const err = e as Error;
      setError(err.name === "AbortError" ? "Sync timed out — please try again." : err.message);
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
        <div
          className={`flex items-center justify-between px-5 py-3 border-b ${t.borderLight}`}
        >
          <div className="flex items-center gap-2">
            <FileSpreadsheet
              className={`h-4 w-4 ${dark ? "text-emerald-400" : "text-emerald-600"}`}
              aria-hidden="true"
            />
            <h3 className={`text-sm font-bold ${t.text}`}>
              Google Sheets Sync
            </h3>
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
        <div
          className={`grid grid-cols-4 gap-1 p-1 ${dark ? "bg-neutral-900/50" : "bg-neutral-50"}`}
        >
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
                <div className="text-[10px] font-bold uppercase tracking-wider">
                  {s.title}
                </div>
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
                <h4 className={`text-sm font-semibold ${t.text}`}>
                  Fetch from Google Sheets
                </h4>
              </div>
              <p className={`text-[11px] ${t.textMuted} mb-6`}>
                Pulls the latest rows from the connected Google Sheet via the
                sync webhook and compares them against the cases database.
              </p>

              {!preview && !fetching && (
                <div
                  className={`rounded-lg border-2 border-dashed p-12 text-center ${dark ? "border-neutral-700" : "border-neutral-300"}`}
                >
                  <FileSpreadsheet
                    className={`h-10 w-10 mx-auto mb-3 ${t.textMuted}`}
                    aria-hidden="true"
                  />
                  <p className={`text-sm font-semibold ${t.text} mb-1`}>
                    Ready to sync
                  </p>
                  <p className={`text-[11px] ${t.textMuted} mb-5`}>
                    Click the button below to pull the latest data from Google
                    Sheets
                  </p>
                  <button
                    onClick={handleFetch}
                    className={`h-9 px-5 rounded-lg text-xs font-semibold flex items-center gap-2 mx-auto ${t.ctaBtn}`}
                  >
                    <CloudDownload className="h-3.5 w-3.5" aria-hidden="true" />
                    Fetch from Sheets
                  </button>
                </div>
              )}

              {fetching && (
                <div className="flex items-center justify-center py-16">
                  <RefreshCw
                    className={`h-5 w-5 animate-spin ${t.textMuted}`}
                    aria-hidden="true"
                  />
                  <span className={`ml-2 text-sm ${t.textSub}`}>
                    Fetching from Google Sheets…
                  </span>
                </div>
              )}

              {preview && !fetching && (
                <div className="space-y-4">
                  {preview.usingMock && (
                    <div
                      className={`rounded-md border p-3 flex items-center gap-2 text-[11px] ${dark ? "bg-amber-900/20 border-amber-800 text-amber-300" : "bg-amber-50 border-amber-200 text-amber-700"}`}
                    >
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      Using mock data — set{" "}
                      <code className="font-mono">SHEETS_SYNC_WEBHOOK_URL</code>{" "}
                      in .env.local to connect a real sheet
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-3">
                    <Stat
                      t={t}
                      label="Rows fetched"
                      value={preview.summary.fetched.toLocaleString()}
                    />
                    <Stat
                      t={t}
                      label="New cases"
                      value={preview.summary.new.toLocaleString()}
                      accent={dark ? "text-emerald-400" : "text-emerald-600"}
                    />
                    <Stat
                      t={t}
                      label="Existing (will update)"
                      value={preview.summary.existing.toLocaleString()}
                      accent={dark ? "text-blue-400" : "text-blue-600"}
                    />
                  </div>
                  {preview.summary.warnings.length > 0 && (
                    <div
                      className={`rounded-md border p-3 text-[11px] ${dark ? "bg-amber-900/20 border-amber-800 text-amber-300" : "bg-amber-50 border-amber-200 text-amber-800"}`}
                    >
                      <div className="flex items-center gap-1.5 font-semibold mb-1">
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                        {preview.summary.warnings.length} warning
                        {preview.summary.warnings.length === 1 ? "" : "s"}
                      </div>
                      <ul className="space-y-0.5 max-h-24 overflow-y-auto">
                        {preview.summary.warnings.slice(0, 10).map((w, i) => (
                          <li key={i}>
                            Row {w.row}: {w.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <button
                    onClick={handleFetch}
                    className={`h-8 px-3 rounded-md border text-xs font-medium flex items-center gap-1.5 ${t.outlineBtn}`}
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
              <h4 className={`text-sm font-semibold ${t.text} mb-1`}>
                Map Columns
              </h4>
              <p className={`text-[11px] ${t.textMuted} mb-4`}>
                The mapping below defines how Google Sheet columns write to the
                database. No action needed — all columns are mapped automatically.
              </p>
              <div
                className={`rounded-lg border ${t.borderLight} overflow-hidden`}
              >
                <table className="w-full text-[12px]">
                  <thead>
                    <tr
                      className={`border-b ${t.borderLight} ${dark ? "bg-neutral-900/40" : "bg-neutral-50"}`}
                    >
                      <th className={`${lblCls} text-left px-3 py-2`}>
                        Sheet column
                      </th>
                      <th className={`${lblCls} text-left px-3 py-2`}>
                        Maps to
                      </th>
                      <th
                        className={`${lblCls} text-center px-3 py-2 w-24`}
                      >
                        Required
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {COLUMN_MAP.map((m) => (
                      <tr key={m.sheet} className={`border-b ${t.borderLight}`}>
                        <td className={`${t.text} px-3 py-2 font-medium`}>
                          {m.sheet}
                        </td>
                        <td
                          className={`${t.textSub} px-3 py-2 font-mono text-[11px]`}
                        >
                          {m.db}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {m.required ? (
                            <span
                              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${dark ? "bg-red-900/40 text-red-400" : "bg-red-50 text-red-600"}`}
                            >
                              REQUIRED
                            </span>
                          ) : (
                            <span className={`text-[10px] ${t.textMuted}`}>
                              optional
                            </span>
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
              <h4 className={`text-sm font-semibold ${t.text} mb-1`}>
                Compare & Preview
              </h4>
              <p className={`text-[11px] ${t.textMuted} mb-3`}>
                Rows already in the database are marked{" "}
                <span
                  className={`font-semibold ${dark ? "text-blue-400" : "text-blue-600"}`}
                >
                  EXISTS
                </span>{" "}
                — syncing will update their fee record. New rows are marked{" "}
                <span
                  className={`font-semibold ${dark ? "text-emerald-400" : "text-emerald-600"}`}
                >
                  NEW
                </span>
                .
              </p>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <Stat
                  t={t}
                  label="Total rows"
                  value={preview.summary.fetched.toLocaleString()}
                />
                <Stat
                  t={t}
                  label="New"
                  value={preview.summary.new.toLocaleString()}
                  accent={dark ? "text-emerald-400" : "text-emerald-600"}
                />
                <Stat
                  t={t}
                  label="Existing"
                  value={preview.summary.existing.toLocaleString()}
                  accent={dark ? "text-blue-400" : "text-blue-600"}
                />
              </div>
              <PreviewTable
                t={t}
                dark={dark}
                rows={preview.rows.slice(0, 100)}
                truncated={preview.rows.length > 100}
                total={preview.rows.length}
              />
            </div>
          )}

          {/* STEP 4: Select & Sync */}
          {step === 4 && preview && !result && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className={`text-sm font-semibold ${t.text}`}>
                    Select & Sync
                  </h4>
                  <p className={`text-[11px] ${t.textMuted}`}>
                    Choose which rows to sync. By default all rows are selected.
                  </p>
                </div>
                <div className={`text-[11px] ${t.textSub}`}>
                  <span className={`font-bold ${t.text}`}>
                    {selected.size.toLocaleString()}
                  </span>{" "}
                  / {preview.rows.length.toLocaleString()} selected
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
                  onChange={(e) =>
                    setFilter(e.target.value as typeof filter)
                  }
                  className={`h-8 px-2 rounded-md border text-xs outline-none cursor-pointer ${t.inputBg}`}
                >
                  <option value="all">All rows</option>
                  <option value="new">New only</option>
                  <option value="existing">Existing only</option>
                </select>
                <button
                  onClick={() =>
                    setSelected(
                      new Set([
                        ...selected,
                        ...filteredRows.map((r) => r.clientId),
                      ]),
                    )
                  }
                  className={`h-8 px-3 rounded-md border text-xs font-medium ${t.outlineBtn}`}
                >
                  Select shown
                </button>
                <button
                  onClick={() => {
                    const next = new Set(selected);
                    filteredRows.forEach((r) => next.delete(r.clientId));
                    setSelected(next);
                  }}
                  className={`h-8 px-3 rounded-md border text-xs font-medium ${t.outlineBtn}`}
                >
                  Deselect shown
                </button>
              </div>

              <SelectionTable
                t={t}
                dark={dark}
                rows={filteredRows.slice(0, 200)}
                truncated={filteredRows.length > 200}
                total={filteredRows.length}
                selected={selected}
                onToggle={(id) => {
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
              <div
                className={`max-w-md mx-auto rounded-lg border p-5 ${dark ? "bg-emerald-900/20 border-emerald-800 text-emerald-300" : "bg-emerald-50 border-emerald-200 text-emerald-800"}`}
              >
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0" aria-hidden="true" />
                  <div className="text-[13px]">
                    <p className="font-bold">Sync complete.</p>
                    <p className="opacity-90 mt-1">
                      <span className="font-semibold">
                        {result.inserted.toLocaleString()}
                      </span>{" "}
                      new case{result.inserted === 1 ? "" : "s"} inserted ·{" "}
                      <span className="font-semibold">
                        {result.updated.toLocaleString()}
                      </span>{" "}
                      existing record{result.updated === 1 ? "" : "s"} updated.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className={`flex items-center justify-between px-5 py-3 border-t ${t.borderLight}`}
        >
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
              onClick={() =>
                canAdvanceFromStep(step) && setStep((step + 1) as Step)
              }
              disabled={!canAdvanceFromStep(step)}
              className={`h-8 px-4 rounded-md text-xs font-semibold flex items-center gap-1.5 ${t.ctaBtn} disabled:opacity-50`}
            >
              Next: {STEPS[step].subtitle}
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </button>
          ) : !result ? (
            <button
              onClick={runSync}
              disabled={syncing || selected.size === 0}
              className={`h-8 px-4 rounded-md text-xs font-semibold flex items-center gap-1.5 ${t.ctaBtn} disabled:opacity-50`}
            >
              {syncing ? (
                <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" />
              ) : (
                <FileSpreadsheet className="h-3 w-3" aria-hidden="true" />
              )}
              {syncing
                ? "Syncing…"
                : `Sync Selected (${selected.size.toLocaleString()})`}
            </button>
          ) : (
            <button
              onClick={onClose}
              className={`h-8 px-4 rounded-md text-xs font-semibold ${t.ctaBtn}`}
            >
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
    <p
      className={`text-[10px] font-semibold uppercase tracking-wider ${t.textMuted}`}
    >
      {label}
    </p>
    <p
      className={`text-[18px] font-bold mt-0.5 tabular-nums ${accent ?? t.text}`}
    >
      {value}
    </p>
  </div>
);

const PreviewTable = ({
  t,
  dark,
  rows,
  truncated,
  total,
}: {
  t: ReturnType<typeof themeClasses>;
  dark: boolean;
  rows: SyncPreviewRow[];
  truncated: boolean;
  total: number;
}) => (
  <div className={`rounded-lg border ${t.borderLight} overflow-hidden`}>
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr
            className={`border-b ${t.borderLight} ${dark ? "bg-neutral-900/40" : "bg-neutral-50"}`}
          >
            <Th>Status</Th>
            <Th>Case</Th>
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
              <td className="px-3 py-1.5">
                <span
                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                    r.isNew
                      ? dark
                        ? "bg-emerald-900/40 text-emerald-400"
                        : "bg-emerald-100 text-emerald-700"
                      : dark
                        ? "bg-blue-900/40 text-blue-400"
                        : "bg-blue-100 text-blue-700"
                  }`}
                >
                  {r.isNew ? "NEW" : "EXISTS"}
                </span>
              </td>
              <td
                className={`${t.text} px-3 py-1.5 font-medium max-w-72 truncate`}
                title={r.caseLink}
              >
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
              <td className={`${t.textSub} px-3 py-1.5 tabular-nums`}>
                {fmtDate(r.approvalDate)}
              </td>
              <td className={`${t.textSub} px-3 py-1.5`}>
                {r.assignedTo ?? "—"}
              </td>
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
                  <span className={`text-[11px] ${t.textMuted}`}>
                    {r.winSheetLinkText ?? "—"}
                  </span>
                )}
              </td>
              <td
                className={`${t.text} px-3 py-1.5 text-right tabular-nums font-medium`}
              >
                {r.totalExpected > 0 ? fmtFull(r.totalExpected) : "—"}
              </td>
              <td className="px-3 py-1.5 text-center">
                {r.hasNotes ? (
                  <span
                    className={`text-[10px] font-semibold ${dark ? "text-blue-400" : "text-blue-600"}`}
                  >
                    YES
                  </span>
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
      <div
        className={`text-[11px] px-3 py-2 ${t.textMuted} ${dark ? "bg-neutral-900/40" : "bg-neutral-50"} border-t ${t.borderLight}`}
      >
        Showing first 100 of {total.toLocaleString()} rows. All will be
        processed on sync.
      </div>
    )}
  </div>
);

const SelectionTable = ({
  t,
  dark,
  rows,
  truncated,
  total,
  selected,
  onToggle,
}: {
  t: ReturnType<typeof themeClasses>;
  dark: boolean;
  rows: SyncPreviewRow[];
  truncated: boolean;
  total: number;
  selected: Set<number>;
  onToggle: (id: number) => void;
}) => (
  <div className={`rounded-lg border ${t.borderLight} overflow-hidden`}>
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr
            className={`border-b ${t.borderLight} ${dark ? "bg-neutral-900/40" : "bg-neutral-50"} sticky top-0`}
          >
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
            return (
              <tr
                key={r.clientId}
                onClick={() => onToggle(r.clientId)}
                className={`border-b ${t.borderLight} cursor-pointer ${dark ? "hover:bg-neutral-800/40" : "hover:bg-neutral-50"}`}
              >
                <td className="px-3 py-1.5">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(r.clientId)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-3.5 w-3.5 cursor-pointer"
                  />
                </td>
                <td
                  className={`${t.text} px-3 py-1.5 font-medium max-w-80 truncate`}
                  title={r.caseLink}
                >
                  {r.caseName}
                </td>
                <td className="px-3 py-1.5">
                  <span
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                      r.isNew
                        ? dark
                          ? "bg-emerald-900/40 text-emerald-400"
                          : "bg-emerald-100 text-emerald-700"
                        : dark
                          ? "bg-blue-900/40 text-blue-400"
                          : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {r.isNew ? "NEW" : "EXISTS"}
                  </span>
                </td>
                <td className={`${t.textSub} px-3 py-1.5 tabular-nums`}>
                  {fmtDate(r.approvalDate)}
                </td>
                <td className={`${t.textSub} px-3 py-1.5`}>
                  {r.assignedTo ?? "—"}
                </td>
                <td className="px-3 py-1.5">
                  <span
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${STATUS_PILL[r.winSheetStatus] ?? STATUS_PILL.not_started}`}
                  >
                    {r.winSheetStatus.replace(/_/g, " ")}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    {truncated && (
      <div
        className={`text-[11px] px-3 py-2 ${t.textMuted} ${dark ? "bg-neutral-900/40" : "bg-neutral-50"} border-t ${t.borderLight}`}
      >
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
  <th
    className={`text-[10px] font-semibold uppercase tracking-wider px-3 py-2 ${alignRight ? "text-right" : "text-left"}`}
  >
    {children}
  </th>
);
