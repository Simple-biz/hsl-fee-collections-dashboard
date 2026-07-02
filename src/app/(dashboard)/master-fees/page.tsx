"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { FeeRecordsTable } from "@/components/cases/FeeRecordsTable";
import { useDashboard } from "@/hooks/useDashboard";
import { useDateRange } from "@/lib/date-range-context";
import { themeClasses } from "@/lib/theme-classes";
import { RefreshCw, AlertCircle } from "lucide-react";

type AgingFilter = "all" | "unpaid_60" | "unpaid_90";

const AGING_OPTIONS: { value: AgingFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unpaid_60", label: "Unpaid >60d" },
  { value: "unpaid_90", label: "Unpaid >90d" },
];

export default function MasterFeesPage() {
  const {
    cases,
    team,
    approvedByOptions,
    dropdownOptions,
    casesLoading,
    error,
    refresh,
  } = useDashboard();
  const teamMembers = team.map((m) => ({
    name: m.name,
    team: m.team,
    role: m.role,
  }));
  const { dateRange } = useDateRange();
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const t = themeClasses(dark);

  const [agingFilter, setAgingFilter] = useState<AgingFilter>("all");
  const [approverFilter, setApproverFilter] = useState("all");

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

  const agingFiltered =
    agingFilter === "all"
      ? cases
      : cases.filter(
          (c) =>
            c.paid === 0 &&
            c.daysAfterApproval != null &&
            c.daysAfterApproval > (agingFilter === "unpaid_60" ? 60 : 90),
        );

  const displayCases =
    approverFilter === "all"
      ? agingFiltered
      : agingFiltered.filter((c) =>
          c.approvedBy?.toLowerCase().includes(approverFilter),
        );

  const presetBase = `px-3 py-1 rounded-full text-[11px] font-medium border transition-colors`;
  const presetActive = dark
    ? "bg-amber-700 border-amber-600 text-white"
    : "bg-amber-100 border-amber-400 text-amber-800";
  const presetInactive = dark
    ? "border-neutral-700 text-neutral-400 hover:border-neutral-500"
    : "border-neutral-200 text-neutral-500 hover:border-neutral-400";

  return (
    <div className="space-y-3">
      <div className={`rounded-xl border ${t.card} px-4 py-2.5 flex items-center gap-2 flex-wrap`}>
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${t.textMuted} shrink-0`}>
          Aging:
        </span>
        {AGING_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setAgingFilter(value)}
            aria-pressed={agingFilter === value}
            className={`${presetBase} ${agingFilter === value ? presetActive : presetInactive}`}
          >
            {label}
          </button>
        ))}
        {agingFilter !== "all" && (
          <span className={`ml-auto text-[11px] ${t.textMuted}`}>
            {displayCases.length} case{displayCases.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      <FeeRecordsTable
        cases={displayCases}
        dateRange={dateRange}
        onImported={refresh}
        approvedByOptions={approvedByOptions}
        dropdownOptions={dropdownOptions}
        teamMembers={teamMembers}
        approverFilter={approverFilter}
        onApproverFilterChange={setApproverFilter}
      />
    </div>
  );
}
