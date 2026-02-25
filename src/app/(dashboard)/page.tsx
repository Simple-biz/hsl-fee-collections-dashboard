"use client";

import { useTheme } from "next-themes";
import { StatCards } from "@/components/cases/StatCards";
import { CollectionsPanel } from "@/components/cases/CollectionsPanel";
import { RevenuePanel } from "@/components/cases/RevenuePanel";
import { FeeRecordsTable } from "@/components/cases/FeeRecordsTable";
import { useDashboard } from "@/hooks/useDashboard";
import { useDateRange } from "@/lib/date-range-context";
import { themeClasses } from "@/lib/theme-classes";
import { RefreshCw, AlertCircle } from "lucide-react";

export default function OverviewPage() {
  const { cases, summary, monthlyData, loading, error, refresh } =
    useDashboard();
  const { dateRange } = useDateRange();
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const t = themeClasses(dark);

  if (error) {
    return (
      <div
        className={`rounded-xl border p-4 flex items-center gap-3 ${dark ? "bg-red-900/20 border-red-800 text-red-400" : "bg-red-50 border-red-200 text-red-700"}`}
      >
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span className="text-sm">Failed to load dashboard data: {error}</span>
        <button
          onClick={refresh}
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
          Loading dashboard...
        </span>
      </div>
    );
  }

  return (
    <>
      <StatCards stats={summary} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
        <CollectionsPanel data={monthlyData} />
        <RevenuePanel stats={summary} cases={cases} />
      </div>
      <FeeRecordsTable cases={cases} dateRange={dateRange} />
    </>
  );
}
