"use client";

import { useState, Suspense } from "react";
import { useTheme } from "next-themes";
import { FeeRecordsTable } from "@/components/cases/FeeRecordsTable";
import { useDashboard } from "@/hooks/useDashboard";
import { useDateRange } from "@/lib/date-range-context";
import { themeClasses } from "@/lib/theme-classes";

type AgingFilter = "all" | "unpaid_60" | "unpaid_90";

const AGING_OPTIONS: { value: AgingFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unpaid_60", label: "Unpaid >60d" },
  { value: "unpaid_90", label: "Unpaid >90d" },
];

export default function MasterFeesPage() {
  const { team, approvedByOptions, dropdownOptions, refresh } = useDashboard();
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

  const presetBase = `px-3 py-1 rounded-full text-[13px] font-medium border transition-colors`;
  const presetActive = dark
    ? "bg-amber-700 border-amber-600 text-white"
    : "bg-amber-100 border-amber-400 text-amber-800";
  const presetInactive = dark
    ? "border-neutral-700 text-neutral-400 hover:border-neutral-500"
    : "border-neutral-200 text-neutral-500 hover:border-neutral-400";

  return (
    <div className="space-y-3">
      <div className={`rounded-xl border ${t.card} px-4 py-2.5 flex items-center gap-2 flex-wrap`}>
        <span className={`text-[12px] font-semibold uppercase tracking-wider ${t.textMuted} shrink-0`}>
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
      </div>
      <Suspense>
        <FeeRecordsTable
          serverPaginated
          agingFilter={agingFilter}
          dateRange={dateRange}
          onImported={refresh}
          approvedByOptions={approvedByOptions}
          dropdownOptions={dropdownOptions}
          teamMembers={teamMembers}
        />
      </Suspense>
    </div>
  );
}
