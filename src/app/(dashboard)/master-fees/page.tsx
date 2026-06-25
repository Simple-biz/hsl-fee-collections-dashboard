"use client";

import { useTheme } from "next-themes";
import { FeeRecordsTable } from "@/components/cases/FeeRecordsTable";
import { useDashboard } from "@/hooks/useDashboard";
import { useDateRange } from "@/lib/date-range-context";
import { themeClasses } from "@/lib/theme-classes";
import { RefreshCw, AlertCircle } from "lucide-react";

export default function MasterFeesPage() {
  const {
    cases,
    approvedByOptions,
    dropdownOptions,
    casesLoading,
    error,
    refresh,
  } = useDashboard();
  const { dateRange } = useDateRange();
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const t = themeClasses(dark);

  if (error) {
    return (
      <div
        className={`rounded-xl border p-4 flex items-center gap-3 ${dark ? "bg-red-900/20 border-red-800 text-red-400" : "bg-red-50 border-red-200 text-red-700"}`}
        role="alert"
      >
        <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span className="text-sm">Failed to load data: {error}</span>
        <button onClick={refresh} className="ml-auto text-xs font-medium underline">
          Retry
        </button>
      </div>
    );
  }

  if (casesLoading) {
    return (
      <div className={`rounded-xl border ${t.card} flex items-center justify-center py-16`}>
        <RefreshCw aria-hidden="true" className={`h-5 w-5 animate-spin ${t.textMuted}`} />
        <span className={`ml-3 text-sm ${t.textSub}`}>Loading cases...</span>
      </div>
    );
  }

  const nonPetitionCases = cases.filter((c) => c.level !== "FEE_PETITION");

  return (
    <FeeRecordsTable
      cases={nonPetitionCases}
      dateRange={dateRange}
      onImported={refresh}
      approvedByOptions={approvedByOptions}
      dropdownOptions={dropdownOptions}
    />
  );
}
