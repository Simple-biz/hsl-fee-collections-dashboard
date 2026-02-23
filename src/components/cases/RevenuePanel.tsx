"use client";

import { useTheme } from "next-themes";
import { ClaimTypeBarChart } from "@/components/charts/ClaimTypeBarChart";
import { themeClasses } from "@/lib/theme-classes";
import { fmtFull } from "@/lib/formatters";
import type { CaseRow, DashboardSummary } from "@/types";

interface RevenuePanelProps {
  stats: DashboardSummary;
  cases: CaseRow[];
}

export const RevenuePanel = ({ stats, cases }: RevenuePanelProps) => {
  const { resolvedTheme } = useTheme();
  const t = themeClasses(resolvedTheme === "dark");
  const collectionRate =
    stats.expected > 0
      ? ((stats.paid / stats.expected) * 100).toFixed(1)
      : "0.0";

  return (
    <div className={`rounded-xl border p-4 md:p-5 ${t.card}`}>
      <h3 className={`text-sm font-bold ${t.text}`}>Revenue by Claim Type</h3>
      <div className={`text-2xl font-extrabold ${t.text} mt-1`}>
        {fmtFull(stats.paid)}
      </div>
      <div className="text-[11px] text-emerald-500 font-medium mt-0.5">
        +{collectionRate}% collection rate
      </div>

      <div className="mt-4">
        <ClaimTypeBarChart cases={cases} />
      </div>
      <div className="mt-3 flex items-center gap-4 justify-center">
        <span className={`flex items-center gap-1.5 text-[10px] ${t.textSub}`}>
          <span className="w-2.5 h-2.5 rounded-sm bg-indigo-400 opacity-30" />{" "}
          Expected
        </span>
        <span className={`flex items-center gap-1.5 text-[10px] ${t.textSub}`}>
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Collected
        </span>
      </div>
    </div>
  );
};
