"use client";

import { useRef, useState } from "react";
import {
  X,
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import { parseCsvText, applyMapping, autoMapColumns } from "@/lib/import/csv-parser";

export interface ColumnDef {
  key: string;
  /** Label exactly as it appears in the dashboard table header. */
  label: string;
  required?: boolean;
  hint?: string;
}

export interface ImportResult {
  imported: number;
  failed: number;
  rowErrors: Array<{ row: number; error: string }>;
}

interface ParsedRow {
  rowNumber: number;
  raw: Record<string, string>;
  errors: string[];
}

interface CsvImportModalProps {
  dark: boolean;
  title: string;
  description: string;
  /** Each entry corresponds to a dashboard field (same labels as table headers). */
  columns: ColumnDef[];
  templateFilename: string;
  templateCsv: string;
  /** Client-side row validator; receives a row keyed by dashboard field keys. */
  validateRow: (mapped: Record<string, string>, rowNumber: number) => string[];
  /** Called with valid mapped rows; wraps the server action. */
  onImport: (validRows: Record<string, string>[]) => Promise<ImportResult>;
  onClose: () => void;
  onSuccess: () => void;
  /**
   * Which row (1-indexed) contains the column headers.
   * Rows above it are treated as metadata and ignored.
   * Defaults to 1.
   */
  defaultHeaderRow?: number;
}

type Step = "upload" | "map" | "preview" | "importing" | "done";

export default function CsvImportModal({
  dark,
  title,
  description,
  columns,
  templateFilename,
  templateCsv,
  validateRow,
  onImport,
  onClose,
  onSuccess,
  defaultHeaderRow = 1,
}: CsvImportModalProps) {
  const t = themeClasses(dark);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [headerRow, setHeaderRow] = useState(defaultHeaderRow);
  // Keep the raw file text so we can re-parse when headerRow changes
  const [fileText, setFileText] = useState<string | null>(null);

  // Raw CSV data
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);

  // Mapping: dashboardFieldKey → csvHeader (or "" to skip)
  const [mapping, setMapping] = useState<Record<string, string>>({});

  // Validated rows after mapping applied
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);

  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const validRows = parsedRows.filter((r) => r.errors.length === 0);
  const errorRows = parsedRows.filter((r) => r.errors.length > 0);

  // ── file handling ──────────────────────────────────────────────────────────

  const parseAndAdvance = (text: string, row: number) => {
    const { headers, rows } = parseCsvText(text, row - 1); // prop is 1-indexed
    if (!headers.length) { setParseError("No header row found at that position."); return; }
    if (!rows.length) { setParseError("File has no data rows after the header."); return; }
    setParseError(null);
    setCsvHeaders(headers);
    setCsvRows(rows);
    const suggested = autoMapColumns(
      columns.map((c) => c.key),
      columns.map((c) => c.label),
      headers,
    );
    setMapping(suggested);
    setStep("map");
  };

  const readFile = (file: File) => {
    if (!/\.csv$/i.test(file.name)) {
      setParseError("Only .csv files are supported.");
      return;
    }
    setParseError(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text !== "string") { setParseError("Could not read file."); return; }
      setFileText(text);
      parseAndAdvance(text, headerRow);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) readFile(file);
  };

  // ── apply mapping → validate ───────────────────────────────────────────────

  const FOOTER_LABELS = new Set([
    "total", "total amount", "grand total", "subtotal", "sum", "totals",
  ]);

  const applyAndPreview = () => {
    const mapped = applyMapping(csvRows, mapping);
    const parsed: ParsedRow[] = [];
    mapped.forEach((row, i) => {
      // Silently skip blank padding rows
      if (Object.values(row).every((v) => !v)) return;
      // Silently skip aggregate footer rows (e.g. "TOTAL AMOUNT" summary row)
      if (Object.values(row).some((v) => FOOTER_LABELS.has(v.trim().toLowerCase()))) return;
      parsed.push({
        rowNumber: i + 1,
        raw: row,
        errors: validateRow(row, i + 1),
      });
    });
    setParsedRows(parsed);
    setServerError(null);
    setStep("preview");
  };

  // ── import ─────────────────────────────────────────────────────────────────

  const handleImport = async () => {
    if (!validRows.length) return;
    setStep("importing");
    setServerError(null);
    try {
      const result = await onImport(validRows.map((r) => r.raw));
      setImportResult(result);
      setStep("done");
      if (result.imported > 0) onSuccess();
    } catch (err) {
      setServerError((err as Error).message ?? "Import failed");
      setStep("preview");
    }
  };

  // ── helpers ────────────────────────────────────────────────────────────────

  const downloadTemplate = () => {
    const blob = new Blob([templateCsv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = templateFilename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const requiredUnmapped = columns.filter(
    (c) => c.required && !mapping[c.key],
  );

  const STEPS: { id: Step; label: string }[] = [
    { id: "upload", label: "Upload" },
    { id: "map", label: "Map columns" },
    { id: "preview", label: "Preview" },
  ];
  const activeStepIndex = STEPS.findIndex((s) => s.id === step);

  const lblCls = `text-[10px] font-semibold uppercase tracking-wider ${t.textMuted}`;
  const errBg = dark
    ? "bg-red-900/20 border-red-800 text-red-300"
    : "bg-red-50 border-red-200 text-red-700";
  const warnBg = dark
    ? "bg-amber-900/20 border-amber-800 text-amber-300"
    : "bg-amber-50 border-amber-200 text-amber-700";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50" />
      <div
        className={`relative w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col rounded-xl border ${t.card} mx-4`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-3 border-b ${t.borderLight}`}>
          <div>
            <h3 className={`text-sm font-bold ${t.text}`}>{title}</h3>
            <p className={`text-[11px] ${t.textMuted} mt-0.5`}>{description}</p>
          </div>
          <button
            onClick={onClose}
            className={`h-7 w-7 rounded-md flex items-center justify-center ${t.hover} ${t.textSub}`}
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Step indicator */}
        {(step === "upload" || step === "map" || step === "preview") && (
          <div className={`grid grid-cols-3 gap-1 p-1.5 ${dark ? "bg-neutral-900/50" : "bg-neutral-50"} border-b ${t.borderLight}`}>
            {STEPS.map((s, idx) => {
              const isActive = s.id === step;
              const isDone = idx < activeStepIndex;
              return (
                <div
                  key={s.id}
                  className={`text-center py-1.5 rounded-md text-[11px] font-medium transition-colors ${
                    isActive
                      ? dark ? "bg-neutral-100 text-neutral-900" : "bg-neutral-900 text-white"
                      : isDone
                        ? dark ? "text-neutral-300" : "text-neutral-500"
                        : dark ? "text-neutral-600" : "text-neutral-300"
                  }`}
                >
                  {idx + 1}. {s.label}
                </div>
              );
            })}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* ── STEP 1: UPLOAD ── */}
          {step === "upload" && (
            <>
              {parseError && (
                <div role="alert" className={`rounded-md border p-3 text-xs ${errBg}`}>
                  {parseError}
                </div>
              )}

              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={`rounded-lg border-2 border-dashed p-10 text-center cursor-pointer transition-colors ${
                  dragOver
                    ? dark ? "border-blue-500 bg-blue-900/10" : "border-blue-400 bg-blue-50"
                    : dark ? "border-neutral-700 hover:border-neutral-500" : "border-neutral-300 hover:border-neutral-400"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); }}
                />
                <FileText className={`h-8 w-8 mx-auto mb-3 ${t.textMuted}`} aria-hidden="true" />
                <p className={`text-sm font-semibold ${t.text}`}>
                  {fileName ?? "Drag & drop a CSV file, or click to browse"}
                </p>
                <p className={`text-[11px] mt-1 ${t.textMuted}`}>Only .csv files. Any column names — you'll map them in the next step.</p>
              </div>

              {/* Header row selector */}
              <div className={`flex items-center gap-3 px-1`}>
                <label className={`text-[11px] font-medium ${t.textSub} shrink-0`}>
                  Column headers are on row:
                </label>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => {
                        setHeaderRow(n);
                        if (fileText) parseAndAdvance(fileText, n);
                      }}
                      className={`h-7 w-7 rounded-md border text-[11px] font-semibold transition-colors ${
                        headerRow === n
                          ? dark ? "bg-neutral-100 text-neutral-900 border-neutral-100" : "bg-neutral-900 text-white border-neutral-900"
                          : `${t.outlineBtn}`
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <p className={`text-[11px] ${t.textMuted}`}>
                  {headerRow > 1 ? `Rows 1–${headerRow - 1} will be skipped as metadata.` : "Row 1 is the header row."}
                </p>
              </div>

              <div className={`rounded-lg border ${t.borderLight} overflow-hidden`}>
                <div className={`px-3 py-2 border-b ${t.borderLight} flex items-center justify-between`}>
                  <span className={lblCls}>Dashboard fields available for import</span>
                  <button
                    onClick={downloadTemplate}
                    className={`text-[11px] font-medium underline ${t.textSub} hover:opacity-80`}
                  >
                    Download template
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className={`border-b ${t.borderLight} ${dark ? "bg-neutral-900/40" : "bg-neutral-50"}`}>
                        <th className={`${lblCls} text-left px-3 py-2`}>Field</th>
                        <th className={`${lblCls} text-left px-3 py-2`}>Notes</th>
                        <th className={`${lblCls} text-center px-3 py-2 w-20`}>Required</th>
                      </tr>
                    </thead>
                    <tbody>
                      {columns.map((col) => (
                        <tr key={col.key} className={`border-b last:border-b-0 ${t.borderLight}`}>
                          <td className={`${t.text} px-3 py-1.5 font-medium`}>{col.label}</td>
                          <td className={`${t.textSub} px-3 py-1.5`}>{col.hint ?? "—"}</td>
                          <td className="px-3 py-1.5 text-center">
                            {col.required ? (
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${dark ? "bg-red-900/40 text-red-400" : "bg-red-50 text-red-600"}`}>
                                YES
                              </span>
                            ) : (
                              <span className={`text-[10px] ${t.textMuted}`}>opt</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* ── STEP 2: MAP COLUMNS ── */}
          {step === "map" && (
            <>
              <div className={`rounded-md border p-3 text-[11px] ${dark ? "bg-neutral-800/60 border-neutral-700 text-neutral-300" : "bg-neutral-50 border-neutral-200 text-neutral-600"}`}>
                <p>
                  Your file has <span className="font-semibold">{csvHeaders.length} columns</span> and{" "}
                  <span className="font-semibold">{csvRows.length} rows</span>.
                  For each dashboard field below, pick the matching column from your CSV.
                  Leave optional fields on <span className="font-semibold">— Skip —</span> to ignore them.
                </p>
              </div>

              {requiredUnmapped.length > 0 && (
                <div role="alert" className={`rounded-md border p-3 text-[11px] flex items-start gap-2 ${warnBg}`}>
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>
                    Required field{requiredUnmapped.length !== 1 ? "s" : ""} not yet mapped:{" "}
                    <span className="font-semibold">{requiredUnmapped.map((c) => c.label).join(", ")}</span>
                  </span>
                </div>
              )}

              <div className={`rounded-lg border ${t.borderLight} overflow-hidden`}>
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className={`border-b ${t.borderLight} ${dark ? "bg-neutral-900/40" : "bg-neutral-50"}`}>
                      <th className={`${lblCls} text-left px-3 py-2`}>Dashboard field</th>
                      <th className={`${lblCls} text-left px-3 py-2 hidden sm:table-cell`}>Notes</th>
                      <th className={`${lblCls} text-left px-3 py-2`}>Your CSV column</th>
                    </tr>
                  </thead>
                  <tbody>
                    {columns.map((col) => {
                      const isMapped = !!mapping[col.key];
                      const isReqUnmapped = col.required && !isMapped;
                      return (
                        <tr key={col.key} className={`border-b last:border-b-0 ${t.borderLight}`}>
                          <td className={`px-3 py-2 font-medium ${isReqUnmapped ? (dark ? "text-red-400" : "text-red-600") : t.text}`}>
                            {col.label}
                            {col.required && (
                              <span className="ml-1 text-red-500" aria-label="required">*</span>
                            )}
                          </td>
                          <td className={`px-3 py-2 ${t.textMuted} text-[11px] hidden sm:table-cell`}>
                            {col.hint ?? "—"}
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={mapping[col.key] ?? ""}
                              onChange={(e) =>
                                setMapping((prev) => ({ ...prev, [col.key]: e.target.value }))
                              }
                              className={`w-full h-7 px-2 rounded-md border text-[11px] outline-none cursor-pointer ${
                                isReqUnmapped
                                  ? dark ? "border-red-700 bg-neutral-900 text-red-300" : "border-red-300 bg-white text-red-700"
                                  : t.inputBg
                              }`}
                            >
                              <option value="">— Skip —</option>
                              {csvHeaders.map((h, i) => (
                                <option key={`${h}-${i}`} value={h}>{h}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* CSV header preview */}
              <div className={`text-[11px] ${t.textMuted}`}>
                Columns detected in your file:{" "}
                {csvHeaders.map((h, i) => (
                  <span key={`${h}-${i}`}>
                    <span className={`font-mono ${t.textSub}`}>{h}</span>
                    {i < csvHeaders.length - 1 ? ", " : ""}
                  </span>
                ))}
              </div>
            </>
          )}

          {/* ── STEP 3: PREVIEW ── */}
          {step === "preview" && (
            <>
              {serverError && (
                <div role="alert" className={`rounded-md border p-3 text-xs ${errBg}`}>{serverError}</div>
              )}

              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Total rows", value: parsedRows.length, color: t.text },
                  { label: "Valid", value: validRows.length, color: dark ? "text-emerald-400" : "text-emerald-600" },
                  { label: "Errors", value: errorRows.length, color: errorRows.length ? (dark ? "text-red-400" : "text-red-600") : t.textMuted },
                ].map((s) => (
                  <div key={s.label} className={`rounded-lg border ${t.borderLight} p-3`}>
                    <p className={lblCls}>{s.label}</p>
                    <p className={`text-lg font-bold tabular-nums mt-0.5 ${s.color}`}>{s.value}</p>
                  </div>
                ))}
              </div>

              {errorRows.length > 0 && (
                <div className={`rounded-md border p-3 text-[11px] ${warnBg}`}>
                  <div className="flex items-center gap-1.5 font-semibold mb-1">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                    {errorRows.length} row{errorRows.length !== 1 ? "s" : ""} will be skipped
                  </div>
                  <ul className="space-y-0.5 max-h-28 overflow-y-auto">
                    {errorRows.slice(0, 15).map((r) => (
                      <li key={r.rowNumber}>Row {r.rowNumber}: {r.errors.join("; ")}</li>
                    ))}
                    {errorRows.length > 15 && (
                      <li className="opacity-60">…and {errorRows.length - 15} more</li>
                    )}
                  </ul>
                </div>
              )}

              <div className={`rounded-lg border ${t.borderLight} overflow-hidden`}>
                <div className="overflow-x-auto max-h-72 overflow-y-auto">
                  <table className="w-full text-[11px]">
                    <thead className="sticky top-0">
                      <tr className={`border-b ${t.borderLight} ${dark ? "bg-neutral-900" : "bg-neutral-50"}`}>
                        <th className={`${lblCls} text-left px-3 py-2 w-10`}>#</th>
                        <th className={`${lblCls} text-left px-3 py-2 w-16`}>Status</th>
                        {/* Show first 4 mapped fields as preview columns */}
                        {columns
                          .filter((c) => mapping[c.key])
                          .slice(0, 4)
                          .map((col) => (
                            <th key={col.key} className={`${lblCls} text-left px-3 py-2`}>
                              {col.label}
                            </th>
                          ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsedRows.slice(0, 200).map((row) => {
                        const hasError = row.errors.length > 0;
                        return (
                          <tr
                            key={row.rowNumber}
                            title={hasError ? row.errors.join("; ") : undefined}
                            className={`border-b last:border-b-0 ${t.borderLight} ${
                              hasError
                                ? dark ? "bg-red-900/10" : "bg-red-50/60"
                                : ""
                            }`}
                          >
                            <td className={`px-3 py-1.5 ${t.textMuted} tabular-nums`}>{row.rowNumber}</td>
                            <td className="px-3 py-1.5">
                              {hasError ? (
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${dark ? "bg-red-900/40 text-red-400" : "bg-red-100 text-red-700"}`}>
                                  ERR
                                </span>
                              ) : (
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${dark ? "bg-emerald-900/40 text-emerald-400" : "bg-emerald-100 text-emerald-700"}`}>
                                  OK
                                </span>
                              )}
                            </td>
                            {columns
                              .filter((c) => mapping[c.key])
                              .slice(0, 4)
                              .map((col) => (
                                <td key={col.key} className={`px-3 py-1.5 ${t.textSub} max-w-40 truncate`}>
                                  {row.raw[col.key] || "—"}
                                </td>
                              ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {parsedRows.length > 200 && (
                  <div className={`px-3 py-2 text-[11px] ${t.textMuted} border-t ${t.borderLight} ${dark ? "bg-neutral-900/40" : "bg-neutral-50"}`}>
                    Showing first 200 of {parsedRows.length} rows. All valid rows will be imported.
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── IMPORTING ── */}
          {step === "importing" && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <RefreshCw className={`h-6 w-6 animate-spin ${t.textMuted}`} aria-hidden="true" />
              <p className={`text-sm ${t.textSub}`}>
                Importing {validRows.length} row{validRows.length !== 1 ? "s" : ""}…
              </p>
            </div>
          )}

          {/* ── DONE ── */}
          {step === "done" && importResult && (
            <div className="py-8">
              <div className={`max-w-md mx-auto rounded-lg border p-5 ${
                importResult.imported > 0
                  ? dark ? "bg-emerald-900/20 border-emerald-800 text-emerald-300" : "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : dark ? "bg-amber-900/20 border-amber-800 text-amber-300" : "bg-amber-50 border-amber-200 text-amber-800"
              }`}>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0" aria-hidden="true" />
                  <div className="text-[13px]">
                    <p className="font-bold">
                      {importResult.imported} row{importResult.imported !== 1 ? "s" : ""} imported.
                    </p>
                    {importResult.failed > 0 && (
                      <p className="opacity-90 mt-1">
                        {importResult.failed} row{importResult.failed !== 1 ? "s" : ""} failed.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {importResult.rowErrors.length > 0 && (
                <div className={`mt-3 max-w-md mx-auto rounded-md border p-3 text-[11px] ${warnBg}`}>
                  <p className="font-semibold mb-1">Row errors:</p>
                  <ul className="space-y-0.5 max-h-32 overflow-y-auto">
                    {importResult.rowErrors.map((e, i) => (
                      <li key={i}>Row {e.row}: {e.error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-between px-5 py-3 border-t ${t.borderLight}`}>
          {/* Left: back / cancel */}
          <div>
            {step === "map" && (
              <button
                onClick={() => setStep("upload")}
                className={`h-8 px-3 text-xs font-medium flex items-center gap-1 ${t.textSub} hover:underline`}
              >
                <ArrowLeft className="h-3 w-3" aria-hidden="true" />
                Back
              </button>
            )}
            {step === "preview" && (
              <button
                onClick={() => setStep("map")}
                className={`h-8 px-3 text-xs font-medium flex items-center gap-1 ${t.textSub} hover:underline`}
              >
                <ArrowLeft className="h-3 w-3" aria-hidden="true" />
                Back
              </button>
            )}
            {step === "upload" && (
              <button
                onClick={onClose}
                className={`h-8 px-4 rounded-md text-xs font-medium border ${t.outlineBtn}`}
              >
                Cancel
              </button>
            )}
          </div>

          {/* Right: next / import / done */}
          <div>
            {step === "map" && (
              <button
                onClick={applyAndPreview}
                disabled={requiredUnmapped.length > 0}
                className={`h-8 px-4 rounded-md text-xs font-semibold flex items-center gap-1.5 ${t.ctaBtn} disabled:opacity-50`}
              >
                Preview
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </button>
            )}

            {step === "preview" && (
              <button
                onClick={handleImport}
                disabled={validRows.length === 0}
                className={`h-8 px-4 rounded-md text-xs font-semibold flex items-center gap-1.5 ${t.ctaBtn} disabled:opacity-50`}
              >
                <Upload className="h-3 w-3" aria-hidden="true" />
                Import {validRows.length} row{validRows.length !== 1 ? "s" : ""}
              </button>
            )}

            {step === "done" && (
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
    </div>
  );
}
