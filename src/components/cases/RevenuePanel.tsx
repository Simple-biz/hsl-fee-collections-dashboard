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
  const dark = resolvedTheme === "dark";
  const t = themeClasses(dark);

  // Collection rate = paid / expected. It's a standing ratio (not a delta),
  // so no "+" prefix; color reflects how much of the expected fees are in.
  const hasExpected = stats.expected > 0;
  const rate = hasExpected ? (stats.paid / stats.expected) * 100 : 0;
  const rateTone = !hasExpected
    ? t.textMuted
    : rate >= 80
      ? "text-emerald-500"
      : rate >= 40
        ? dark
          ? "text-amber-400"
          : "text-amber-600"
        : dark
          ? "text-red-400"
          : "text-red-500";

  return (
    <div className={`rounded-xl border p-4 md:p-5 ${t.card}`}>
      <h3 className={`text-sm font-bold ${t.text}`}>Revenue by Claim Type</h3>
      <div className={`text-2xl font-extrabold ${t.text} mt-1`}>
        {fmtFull(stats.paid)}
      </div>
      <div className={`text-[13px] font-medium mt-0.5 ${rateTone}`}>
        {hasExpected
          ? `${rate.toFixed(1)}% collection rate`
          : "No fees expected yet"}
      </div>

      <div className="mt-4">
        <ClaimTypeBarChart cases={cases} />
      </div>
      <div className="mt-3 flex items-center gap-4 justify-center">
        <span className={`flex items-center gap-1.5 text-[12px] ${t.textSub}`}>
          <span className="w-2.5 h-2.5 rounded-sm bg-indigo-400 opacity-30" />{" "}
          Expected
        </span>
        <span className={`flex items-center gap-1.5 text-[12px] ${t.textSub}`}>
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Collected
        </span>
      </div>
    </div>
  );
};
