"use client";

import { useRef, useState } from "react";
import { Upload, FileSpreadsheet, RefreshCw, AlertTriangle, CheckCircle2, X } from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";

type Mode = "append" | "replace";

interface PreviewResult {
  parsed: number;
  new: number;
  duplicates: number;
  warnings: { row: number; message: string }[];
}

interface ImportResult extends PreviewResult {
  inserted: number;
  activityLogEntries?: number;
}

interface ImportCasesModalProps {
  dark: boolean;
  onClose: () => void;
  onImported: () => Promise<void> | void;
}

export default function ImportCasesModal({
  dark,
  onClose,
  onImported,
}: ImportCasesModalProps) {
  const t = themeClasses(dark);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState<"preview" | Mode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async (mode: "preview" | Mode) => {
    if (!file) return;
    setBusy(mode);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/import/cases?mode=${mode}`, {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Import failed (${res.status})`);
      if (mode === "preview") setPreview(json);
      else {
        setResult(json);
        await onImported();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setPreview(null);
    setResult(null);
    setError(null);
    if (!f) return;
    setBusy("preview");
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/import/cases?mode=preview", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Preview failed (${res.status})`);
      setPreview(json);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const lbl = `text-[10px] font-semibold uppercase tracking-wider ${t.textMuted}`;
  const valCls = `text-[18px] font-bold ${t.text} mt-0.5 tabular-nums`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50" />
      <div
        className={`relative w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-xl border ${t.card} p-6 mx-4`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className={`text-sm font-bold ${t.text}`}>Import Cases</h3>
            <p className={`text-[10px] ${t.textMuted} mt-0.5`}>
              Upload a Master Fees worksheet (.xlsx). Existing cases (matched by
              MyCase ID) are skipped unless you choose Replace All.
            </p>
          </div>
          <button
            onClick={onClose}
            className={`h-7 w-7 rounded-md flex items-center justify-center ${t.hover} ${t.textSub}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* File picker */}
        {!result && (
          <div
            className={`rounded-lg border-2 border-dashed p-6 text-center cursor-pointer ${dark ? "border-neutral-700 hover:border-neutral-500" : "border-neutral-300 hover:border-neutral-400"}`}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={handleFileChange}
            />
            <FileSpreadsheet
              className={`h-8 w-8 mx-auto mb-2 ${t.textMuted}`}
            />
            <p className={`text-xs font-medium ${t.text}`}>
              {file ? file.name : "Click to choose .xlsx file"}
            </p>
            <p className={`text-[10px] mt-1 ${t.textMuted}`}>
              {file
                ? `${(file.size / 1024).toFixed(0)} KB`
                : "Drag & drop is not supported — click to browse"}
            </p>
          </div>
        )}

        {/* Preview */}
        {preview && !result && (
          <div className="mt-5 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className={`rounded-lg border ${t.borderLight} p-3`}>
                <p className={lbl}>Rows in file</p>
                <p className={valCls}>{preview.parsed.toLocaleString()}</p>
              </div>
              <div className={`rounded-lg border ${t.borderLight} p-3`}>
                <p className={lbl}>New</p>
                <p className={`${valCls} ${dark ? "text-emerald-400" : "text-emerald-600"}`}>
                  {preview.new.toLocaleString()}
                </p>
              </div>
              <div className={`rounded-lg border ${t.borderLight} p-3`}>
                <p className={lbl}>Duplicates</p>
                <p className={`${valCls} ${dark ? "text-amber-400" : "text-amber-600"}`}>
                  {preview.duplicates.toLocaleString()}
                </p>
              </div>
            </div>
            {preview.warnings.length > 0 && (
              <div
                className={`rounded-md border p-3 text-[11px] ${dark ? "bg-amber-900/20 border-amber-800 text-amber-300" : "bg-amber-50 border-amber-200 text-amber-800"}`}
              >
                <div className="flex items-center gap-1.5 font-semibold mb-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {preview.warnings.length} warning{preview.warnings.length === 1 ? "" : "s"}
                </div>
                <ul className="space-y-0.5 max-h-24 overflow-y-auto">
                  {preview.warnings.slice(0, 8).map((w, i) => (
                    <li key={i}>
                      Row {w.row}: {w.message}
                    </li>
                  ))}
                  {preview.warnings.length > 8 && (
                    <li className="opacity-70">
                      …and {preview.warnings.length - 8} more
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="mt-5 space-y-3">
            <div
              className={`rounded-md border p-3 text-[12px] ${dark ? "bg-emerald-900/20 border-emerald-800 text-emerald-300" : "bg-emerald-50 border-emerald-200 text-emerald-800"} flex items-start gap-2`}
            >
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">
                  Imported {result.inserted.toLocaleString()} case
                  {result.inserted === 1 ? "" : "s"}.
                </p>
                <p className="opacity-90 mt-0.5">
                  {result.duplicates.toLocaleString()} duplicate
                  {result.duplicates === 1 ? "" : "s"} skipped ·{" "}
                  {(result.activityLogEntries ?? 0).toLocaleString()} note
                  {(result.activityLogEntries ?? 0) === 1 ? "" : "s"} added.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            className={`mt-5 rounded-md border p-3 text-[12px] ${dark ? "bg-red-900/20 border-red-800 text-red-300" : "bg-red-50 border-red-200 text-red-700"}`}
          >
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-current/10">
          {!result ? (
            <>
              <button
                onClick={onClose}
                className={`h-8 px-4 rounded-md border text-xs font-medium ${t.outlineBtn}`}
              >
                Cancel
              </button>
              <button
                onClick={() => send("replace")}
                disabled={!file || !preview || busy !== null}
                className={`h-8 px-4 rounded-md border text-xs font-medium flex items-center gap-1.5 ${dark ? "border-red-800 text-red-400 hover:bg-red-900/20" : "border-red-300 text-red-600 hover:bg-red-50"} disabled:opacity-50`}
                title="Truncate the cases table and import everything from the file"
              >
                {busy === "replace" ? <RefreshCw className="h-3 w-3 animate-spin" /> : null}
                Replace All
              </button>
              <button
                onClick={() => send("append")}
                disabled={!file || !preview || preview.new === 0 || busy !== null}
                className={`h-8 px-4 rounded-md text-xs font-semibold flex items-center gap-1.5 ${t.ctaBtn} disabled:opacity-50`}
              >
                {busy === "append" ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : (
                  <Upload className="h-3 w-3" />
                )}
                Import {preview ? preview.new.toLocaleString() : ""} new
              </button>
            </>
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
