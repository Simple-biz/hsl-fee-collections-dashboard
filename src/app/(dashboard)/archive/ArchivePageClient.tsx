"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { RefreshCw, AlertCircle, Archive as ArchiveIcon } from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import { ArchiveTable } from "@/components/cases/ArchiveTable";
import type { ArchiveRow } from "@/components/cases/ArchiveTable";

export function ArchivePageClient() {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const t = themeClasses(dark);

  const [rows, setRows] = useState<ArchiveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const fetchArchive = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/archive/cases?limit=500", { signal: controller.signal });
      if (!res.ok) throw new Error(`Failed to load archive (${res.status})`);
      const json = await res.json();
      setRows(json.data ?? []);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchArchive();
    return () => { controllerRef.current?.abort(); };
  }, [fetchArchive]);

  const sectionCard = `rounded-xl border ${t.card}`;

  if (error) {
    return (
      <div
        role="alert"
        className={`rounded-xl border p-4 flex items-center gap-3 ${dark ? "bg-red-900/20 border-red-800 text-red-400" : "bg-red-50 border-red-200 text-red-700"}`}
      >
        <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span className="text-sm">Failed to load archive: {error}</span>
        <button onClick={fetchArchive} className="ml-auto text-xs font-medium underline">
          Retry
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw aria-hidden="true" className={`h-6 w-6 animate-spin ${t.textMuted}`} />
        <span className={`ml-3 text-sm ${t.textSub}`}>Loading archive...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={`${sectionCard} p-4 md:p-5`}>
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center ${dark ? "bg-amber-900/40" : "bg-amber-50"}`}
          >
            <ArchiveIcon
              aria-hidden="true"
              className={`h-5 w-5 ${dark ? "text-amber-400" : "text-amber-600"}`}
            />
          </div>
          <div className="flex-1">
            <h3 className={`text-sm font-bold ${t.text}`}>Archive</h3>
            <p className={`text-[11px] ${t.textMuted} mt-0.5`}>
              Cases removed from reconciliation — not found in the Master List or Fees Closed sheet
            </p>
          </div>
          {rows.length > 0 && (
            <span
              className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${dark ? "bg-neutral-700 text-neutral-300" : "bg-neutral-100 text-neutral-600"}`}
            >
              {rows.length}
            </span>
          )}
        </div>
      </div>

      <ArchiveTable
        rows={rows}
        dark={dark}
        t={t}
        onReopened={fetchArchive}
      />
    </div>
  );
}
