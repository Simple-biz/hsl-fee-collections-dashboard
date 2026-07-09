"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { Download, DatabaseBackup, Upload, Loader2, AlertCircle } from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import { RestoreBackupModal } from "./RestoreBackupModal";

export function BackupRestorePanel() {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const t = themeClasses(dark);

  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRestore, setShowRestore] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/backup/export");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? "hsl-backup.xlsx";

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className={`rounded-xl border ${t.card} p-4 md:p-5 space-y-4`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${dark ? "bg-violet-900/40" : "bg-violet-50"}`}>
            <DatabaseBackup className={`h-5 w-5 ${dark ? "text-violet-400" : "text-violet-600"}`} aria-hidden="true" />
          </div>
          <div>
            <h3 className={`text-sm font-bold ${t.text}`}>Backup &amp; Restore</h3>
            <p className={`text-[13px] ${t.textMuted} mt-0.5`}>
              Export every case, fee, and petition record to a single Excel file you can keep as a backup.
            </p>
          </div>
        </div>

        {error && (
          <div
            className={`rounded-lg border p-3 flex items-center gap-2 text-[13px] ${dark ? "bg-red-900/20 border-red-800 text-red-400" : "bg-red-50 border-red-200 text-red-700"}`}
            role="alert"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}

        <button
          onClick={handleExport}
          disabled={exporting}
          className={`h-9 px-4 rounded-md text-[13px] font-semibold flex items-center gap-2 ${t.ctaBtn} disabled:opacity-50`}
        >
          {exporting
            ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            : <Download className="h-4 w-4" aria-hidden="true" />}
          {exporting ? "Preparing export…" : "Export All Data"}
        </button>

        <p className={`text-[12px] ${t.textMuted}`}>
          Downloads a dated .xlsx file with one tab per data table.
        </p>

        <div className={`h-px ${t.borderLight} border-t`} />

        <button
          onClick={() => setShowRestore(true)}
          className={`h-9 px-4 rounded-md text-[13px] font-semibold flex items-center gap-2 border ${t.outlineBtn}`}
        >
          <Upload className="h-4 w-4" aria-hidden="true" />
          Restore from Backup
        </button>
        <p className={`text-[12px] ${t.textMuted}`}>
          Upload a previously exported .xlsx file to bring its data back into
          the database. You&apos;ll see exactly what would change before
          anything is written.
        </p>
      </div>

      {showRestore && <RestoreBackupModal onClose={() => setShowRestore(false)} />}
    </div>
  );
}
