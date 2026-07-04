"use client";

import { useTheme } from "next-themes";
import {
  FolderOpen,
  DollarSign,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CalendarCheck,
} from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import { fmt } from "@/lib/formatters";
import type { DashboardSummary } from "@/types";

interface StatCardsProps {
  stats: DashboardSummary;
}


export const StatCards = ({ stats }: StatCardsProps) => {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const t = themeClasses(dark);

  type CardSpec = {
    icon: typeof FolderOpen;
    label: string;
    value: string;
    sub?: string;
    detail: string;
    detailTone: "up" | "down" | "warn" | "neutral";
    accent: string;
  };

  const cards: CardSpec[] = [
    {
      icon: FolderOpen,
      label: "Total Cases",
      value: String(stats.totalCases),
      sub: "Active (non-closed)",
      detail: `${stats.pif} marked PIF`,
      detailTone: "neutral",
      accent: "#7c3aed",
    },
    {
      icon: DollarSign,
      label: "Fees Collected (MTD)",
      value: fmt(stats.feesCollectedMTD),
      sub: "Current calendar month",
      detail: stats.feesCollectedMTD > 0 ? "Collected this month" : "None yet this month",
      detailTone: stats.feesCollectedMTD > 0 ? "up" : "neutral",
      accent: "#059669",
    },
    {
      icon: CalendarCheck,
      label: "Cases Closed (MTD)",
      value: String(stats.casesClosedMTD),
      sub: "Current calendar month",
      detail: stats.casesClosedMTD > 0 ? "Closed this month" : "None yet this month",
      detailTone: stats.casesClosedMTD > 0 ? "up" : "neutral",
      accent: "#d97706",
    },
    {
      icon: RefreshCw,
      label: "MyCase Sync",
      value: `${stats.synced}/${stats.totalCases}`,
      sub: "Cases synced",
      detail:
        stats.syncErrors > 0 ? `${stats.syncErrors} error(s)` : "All clear",
      detailTone: stats.syncErrors > 0 ? "down" : "up",
      accent: "#0284c7",
    },
  ];

  const toneClass = (tone: CardSpec["detailTone"]) => {
    if (tone === "up") return "text-emerald-500";
    if (tone === "down") return "text-red-500";
    if (tone === "warn")
      return dark ? "text-amber-400" : "text-amber-600";
    return t.textSub;
  };
  const ToneIcon = ({ tone }: { tone: CardSpec["detailTone"] }) => {
    if (tone === "up") return <TrendingUp className="h-3 w-3" aria-hidden="true" />;
    if (tone === "down") return <TrendingDown className="h-3 w-3" aria-hidden="true" />;
    if (tone === "warn") return <AlertTriangle className="h-3 w-3" aria-hidden="true" />;
    return null;
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
      {cards.map((s, i) => (
        <div
          key={i}
          className={`rounded-xl border p-4 border-l-[3px] ${t.card}`}
          style={{ borderLeftColor: s.accent }}
        >
          <div className="flex items-start justify-between">
            <div>
              <div
                className={`flex items-center gap-1.5 text-xs ${t.textSub} font-medium`}
              >
                <s.icon className="h-3.5 w-3.5" style={{ color: s.accent }} aria-hidden="true" /> {s.label}
              </div>
              <div className={`text-2xl font-extrabold ${t.text} mt-1`}>
                {s.value}
              </div>
              {s.sub && (
                <div className={`text-[13px] ${t.textMuted} mt-0.5`}>
                  {s.sub}
                </div>
              )}
            </div>
          </div>
          <div
            className={`mt-3 pt-2 border-t ${t.borderLight} flex items-center justify-between`}
          >
            <span className={`text-[13px] ${t.textSub} font-medium`}>
              Details
            </span>
            <span
              className={`text-[13px] font-semibold flex items-center gap-0.5 ${toneClass(
                s.detailTone,
              )}`}
            >
              {s.detail} <ToneIcon tone={s.detailTone} />
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};
