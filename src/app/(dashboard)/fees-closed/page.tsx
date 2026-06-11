"use client";

import { useCallback, useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";
import { FeeRecordsTable } from "@/components/cases/FeeRecordsTable";
import { useDateRange } from "@/lib/date-range-context";
import { themeClasses } from "@/lib/theme-classes";
import type { CaseRow } from "@/types";

export default function FeesClosedPage() {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const t = themeClasses(dark);
  const { dateRange } = useDateRange();

  const [cases, setCases] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchClosed = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cases?isClosed=true&limit=2000");
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const json = await res.json();
      setCases(json.data || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClosed();
  }, [fetchClosed]);

  const sectionCard = `rounded-xl border ${t.card}`;

  if (error) {
    return (
      <div
        className={`rounded-xl border p-4 flex items-center gap-3 ${dark ? "bg-red-900/20 border-red-800 text-red-400" : "bg-red-50 border-red-200 text-red-700"}`}
      >
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span className="text-sm">Failed to load closed fees: {error}</span>
        <button
          onClick={fetchClosed}
          className="ml-auto text-xs font-medium underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className={`h-6 w-6 animate-spin ${t.textMuted}`} />
        <span className={`ml-3 text-sm ${t.textSub}`}>
          Loading closed fees...
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={`${sectionCard} p-4 md:p-5`}>
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center ${dark ? "bg-emerald-900/40" : "bg-emerald-50"}`}
          >
            <CheckCircle2
              aria-hidden="true"
              className={`h-5 w-5 ${dark ? "text-emerald-400" : "text-emerald-600"}`}
            />
          </div>
          <div>
            <h3 className={`text-sm font-bold ${t.text}`}>Fees Closed</h3>
            <p className={`text-[11px] ${t.textMuted} mt-0.5`}>
              Cases acknowledged and marked closed from the dashboard
            </p>
          </div>
        </div>
      </div>

      <FeeRecordsTable
        cases={cases}
        dateRange={dateRange}
        mode="closed"
        onImported={fetchClosed}
      />
    </div>
  );
}
