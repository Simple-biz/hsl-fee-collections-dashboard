"use client";

import { useTheme } from "next-themes";
import {
  FolderOpen,
  DollarSign,
  CheckCircle,
  RefreshCw,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { Sparkline } from "@/components/charts/Sparkline";
import { themeClasses } from "@/lib/theme-classes";
import { fmt } from "@/lib/formatters";
import type { DashboardSummary } from "@/types";

interface StatCardsProps {
  stats: DashboardSummary;
}

export const StatCards = ({ stats }: StatCardsProps) => {
  const { resolvedTheme } = useTheme();
  const t = themeClasses(resolvedTheme === "dark");

  const cards = [
    {
      icon: FolderOpen,
      label: "Total Cases",
      value: String(stats.totalCases),
      sub: "Since Last week",
      sparkData: [3, 5, 4, 7, 6, 8],
      sparkColor: "#6366f1",
      detail: `${stats.pif} PIF`,
      detailUp: true,
    },
    {
      icon: DollarSign,
      label: "Fees Expected",
      value: fmt(stats.expected),
      sub: "Since Last week",
      sparkData: [1810, 6675, 7000, 9200, 9600, 3900],
      sparkColor: "#6366f1",
      detail: "15.54%",
      detailUp: true,
    },
    {
      icon: CheckCircle,
      label: "Fees Collected",
      value: fmt(stats.paid),
      sub: "Since Last week",
      sparkData: [0, 2050, 9050, 18250, 18250, 18250],
      sparkColor: "#10b981",
      detail: `${fmt(stats.outstanding)} outstanding`,
      detailUp: false,
    },
    {
      icon: RefreshCw,
      label: "MyCase Sync",
      value: `${stats.synced}/${stats.totalCases}`,
      sub: "Cases synced",
      sparkData: [0, 0, 1, 1, 2, 2],
      sparkColor: stats.syncErrors > 0 ? "#ef4444" : "#10b981",
      detail:
        stats.syncErrors > 0 ? `${stats.syncErrors} error(s)` : "All clear",
      detailUp: stats.syncErrors === 0,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
      {cards.map((s, i) => (
        <div key={i} className={`rounded-xl border p-4 ${t.card}`}>
          <div className="flex items-start justify-between">
            <div>
              <div
                className={`flex items-center gap-1.5 text-xs ${t.textSub} font-medium`}
              >
                <s.icon className="h-3.5 w-3.5" /> {s.label}
              </div>
              <div className={`text-2xl font-extrabold ${t.text} mt-1`}>
                {s.value}
              </div>
              <div className={`text-[11px] ${t.textMuted} mt-0.5`}>{s.sub}</div>
            </div>
            <Sparkline data={s.sparkData} color={s.sparkColor} />
          </div>
          <div
            className={`mt-3 pt-2 border-t ${t.borderLight} flex items-center justify-between`}
          >
            <span className={`text-[11px] ${t.textSub} font-medium`}>
              Details
            </span>
            <span
              className={`text-[11px] font-semibold flex items-center gap-0.5 ${s.detailUp ? "text-emerald-500" : "text-red-500"}`}
            >
              {s.detail}{" "}
              {s.detailUp ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};
