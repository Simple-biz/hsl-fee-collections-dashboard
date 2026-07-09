"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { X, Upload, AlertTriangle, CheckCircle2, Loader2, FileSpreadsheet } from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";

interface ChangedField {
  field: string;
  backup: string;
  db: string;
}

interface TablePreview {
  key: string;
  label: string;
  sheetMissing: boolean;
  counts: { new: number; changed: number; unchanged: number; missingInBackup: number; invalid: number };
  sample: { key: string; status: "new" | "changed"; changedFields: ChangedField[] }[];
  moreChanged: number;
  unmappedHeaders?: string[];
}

interface PreviewResponse {
  mode: "preview";
  schemaVersion: number;
  tables: TablePreview[];
}

export function RestoreBackupModal({ onClose }: { onClose: () => void }) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const t = themeClasses(dark);

  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [included, setIncluded] = useState<Set<string>>(new Set());
  const [applied, setApplied] = useState<Record<string, { inserted: number; updated: number }> | null>(null);

  const previewControllerRef = useRef<AbortController | null>(null);
  const applyControllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => {
    previewControllerRef.current?.abort();
    applyControllerRef.current?.abort();
  }, []);

  const handlePreview = async () => {
    if (!file) return;
    const controller = new AbortController();
    previewControllerRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/backup/restore?mode=preview", {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Preview failed (${res.status})`);
      const data = body as PreviewResponse;
      setPreview(data);
      setIncluded(
        new Set(data.tables.filter((tb) => tb.counts.new > 0 || tb.counts.changed > 0).map((tb) => tb.key)),
      );
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!file || included.size === 0) return;
    const controller = new AbortController();
    applyControllerRef.current = controller;
    setApplying(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("includeTables", JSON.stringify(Array.from(included)));
      const res = await fetch("/api/admin/backup/restore?mode=apply", {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Restore failed (${res.status})`);
      setApplied(body.applied);
      toast.success("Restore complete");
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError((err as Error).message);
    } finally {
      setApplying(false);
    }
  };

  const toggleTable = (key: string) => {
    setIncluded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const totalSelectedChanges =
    preview?.tables
      .filter((tb) => included.has(tb.key))
      .reduce((sum, tb) => sum + tb.counts.new + tb.counts.changed, 0) ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className={`relative w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col rounded-xl border ${t.card} mx-4`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between px-5 py-3 border-b ${t.borderLight}`}>
          <div className="flex items-center gap-2">
            <FileSpreadsheet className={`h-4 w-4 ${dark ? "text-amber-400" : "text-amber-600"}`} aria-hidden="true" />
            <h3 className={`text-sm font-bold ${t.text}`}>Restore from Backup</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className={`h-7 w-7 rounded-md flex items-center justify-center ${t.hover} ${t.textSub}`}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {error && (
            <div
              className={`rounded-lg border p-3 flex items-center gap-2 text-[13px] ${dark ? "bg-red-900/20 border-red-800 text-red-400" : "bg-red-50 border-red-200 text-red-700"}`}
              role="alert"
            >
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </div>
          )}

          {applied ? (
            <div className="space-y-3">
              <div
                className={`rounded-lg border p-3 flex items-center gap-2 text-[13px] ${dark ? "bg-emerald-900/20 border-emerald-800 text-emerald-400" : "bg-emerald-50 border-emerald-200 text-emerald-700"}`}
                role="alert"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                Restore complete.
              </div>
              <ul className={`text-[13px] ${t.textSub} space-y-1`}>
                {Object.entries(applied).map(([key, r]) => (
                  <li key={key}>
                    {key}: {r.inserted} added, {r.updated} updated
                  </li>
                ))}
              </ul>
              <button
                onClick={onClose}
                className={`h-9 px-4 rounded-md text-[13px] font-semibold ${t.ctaBtn}`}
              >
                Done
              </button>
            </div>
          ) : !preview ? (
            <div className="space-y-3">
              <p className={`text-[13px] ${t.textSub}`}>
                Upload a backup .xlsx file exported from this page. Every table is compared
                against the current database before anything changes — nothing is written
                until you review the summary and confirm. Restore never deletes rows.
              </p>
              <input
                type="file"
                accept=".xlsx"
                aria-label="Backup file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className={`block w-full text-[13px] ${t.textSub}`}
              />
              <button
                onClick={handlePreview}
                disabled={!file || loading}
                className={`h-9 px-4 rounded-md text-[13px] font-semibold flex items-center gap-2 ${t.ctaBtn} disabled:opacity-50`}
              >
                {loading
                  ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  : <Upload className="h-4 w-4" aria-hidden="true" />}
                {loading ? "Reading file…" : "Preview"}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className={`text-[13px] ${t.textSub}`}>
                Check the tables to restore. Only rows marked <b>new</b> or <b>changed</b> are
                written; unchanged rows and rows only in the database (not in the backup) are
                left alone.
              </p>
              <div className={`rounded-lg border ${t.borderLight} divide-y ${dark ? "divide-neutral-800" : "divide-neutral-100"}`}>
                {preview.tables.map((tb) => (
                  <div key={tb.key} className="p-3">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={included.has(tb.key)}
                        onChange={() => toggleTable(tb.key)}
                        disabled={tb.sheetMissing || (tb.counts.new === 0 && tb.counts.changed === 0)}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <div className={`text-[13px] font-semibold ${t.text}`}>{tb.label}</div>
                        {tb.sheetMissing ? (
                          <div className={`text-[12px] ${t.textMuted}`}>Not present in this file — skipped.</div>
                        ) : (
                          <div className={`text-[12px] ${t.textSub}`}>
                            {tb.counts.new} new · {tb.counts.changed} changed · {tb.counts.unchanged} unchanged
                            {tb.counts.missingInBackup > 0 && ` · ${tb.counts.missingInBackup} not in backup (kept as-is)`}
                            {tb.counts.invalid > 0 && ` · ${tb.counts.invalid} skipped (missing key field)`}
                          </div>
                        )}
                        {tb.sample.length > 0 && (
                          <ul className={`mt-1 text-[11px] ${t.textMuted} space-y-0.5`}>
                            {tb.sample.slice(0, 5).map((r) => (
                              <li key={r.key}>
                                {r.status === "new" ? "+ " : "~ "}
                                {r.key}
                                {r.status === "changed" && r.changedFields.length > 0 &&
                                  ` (${r.changedFields.map((f) => f.field).join(", ")})`}
                              </li>
                            ))}
                            {tb.moreChanged > 0 && <li>+ {tb.moreChanged} more…</li>}
                          </ul>
                        )}
                      </div>
                    </label>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleApply}
                  disabled={applying || included.size === 0}
                  className={`h-9 px-4 rounded-md text-[13px] font-semibold flex items-center gap-2 ${t.ctaBtn} disabled:opacity-50`}
                >
                  {applying && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {applying ? "Restoring…" : `Restore ${totalSelectedChanges} rows across ${included.size} tables`}
                </button>
                <button
                  onClick={() => setPreview(null)}
                  disabled={applying}
                  className={`h-9 px-4 rounded-md text-[13px] font-semibold border ${t.outlineBtn} disabled:opacity-50`}
                >
                  Back
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
