"use client";

import { useTheme } from "next-themes";
import {
  FolderOpen,
  DollarSign,
  CheckCircle,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
} from "lucide-react";
import { Sparkline } from "@/components/charts/Sparkline";
import { themeClasses } from "@/lib/theme-classes";
import { fmt } from "@/lib/formatters";
import type { DashboardSummary, MonthlyData } from "@/types";

interface StatCardsProps {
  stats: DashboardSummary;
  // Optional — when supplied, the Fees Expected + Fees Collected cards
  // render a real 6-month sparkline and a real month-over-month delta
  // instead of decorative placeholders. The Total Cases and MyCase Sync
  // cards intentionally have no sparkline since no historical data exists
  // for those metrics yet.
  monthlyData?: MonthlyData[];
}

// Month-over-month % change from the last two non-zero buckets. Returns
// null when we don't have enough data to compare honestly (e.g. only one
// month, or the prior month had zero activity — "infinite growth" isn't a
// signal worth displaying).
const monthOverMonth = (
  series: number[],
): { delta: number; positive: boolean } | null => {
  if (series.length < 2) return null;
  const last = series[series.length - 1];
  const prev = series[series.length - 2];
  if (!prev) return null;
  const delta = ((last - prev) / prev) * 100;
  return { delta, positive: delta >= 0 };
};

const formatPct = (n: number): string => {
  const abs = Math.abs(n);
  const sign = n >= 0 ? "+" : "−";
  return `${sign}${abs.toFixed(1)}%`;
};

export const StatCards = ({ stats, monthlyData }: StatCardsProps) => {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const t = themeClasses(dark);

  const expectedSeries = monthlyData?.map((m) => m.expected) ?? [];
  const collectedSeries = monthlyData?.map((m) => m.collected) ?? [];
  // Only the Fees Expected card surfaces a MoM percentage. Fees Collected
  // already shows outstanding/overpaid (a more useful comparison than
  // another raw % delta) — the sparkline alone covers the trend.
  const expectedMoM = monthOverMonth(expectedSeries);

  // "Outstanding" is expected − paid. When negative, the case set is
  // overpaid — flag that as a warning (amber) rather than the misleading
  // red-down arrow + "$X outstanding" text from the previous design.
  const outstanding = stats.outstanding;
  const isOverpaid = outstanding < 0;
  const collectedDetail = isOverpaid
    ? `${fmt(Math.abs(outstanding))} overpaid`
    : outstanding > 0
      ? `${fmt(outstanding)} outstanding`
      : "Fully collected";

  type CardSpec = {
    icon: typeof FolderOpen;
    label: string;
    value: string;
    sub?: string;
    sparkData?: number[];
    sparkColor?: string;
    detail: string;
    detailTone: "up" | "down" | "warn" | "neutral";
  };

  const cards: CardSpec[] = [
    {
      icon: FolderOpen,
      label: "Total Cases",
      value: String(stats.totalCases),
      sub: "Active (non-closed)",
      detail: `${stats.pif} marked PIF`,
      detailTone: "neutral",
    },
    {
      icon: DollarSign,
      label: "Fees Expected",
      value: fmt(stats.expected),
      sub: monthlyData ? "Last 6 months" : undefined,
      sparkData: expectedSeries.length > 1 ? expectedSeries : undefined,
      sparkColor: "#6366f1",
      detail: expectedMoM
        ? `${formatPct(expectedMoM.delta)} vs prev month`
        : "No trend data",
      detailTone: expectedMoM
        ? expectedMoM.positive
          ? "up"
          : "down"
        : "neutral",
    },
    {
      icon: CheckCircle,
      label: "Fees Collected",
      value: fmt(stats.paid),
      sub: monthlyData ? "Last 6 months" : undefined,
      sparkData: collectedSeries.length > 1 ? collectedSeries : undefined,
      sparkColor: "#10b981",
      detail: collectedDetail,
      detailTone: isOverpaid ? "warn" : outstanding > 0 ? "down" : "up",
    },
    {
      icon: RefreshCw,
      label: "MyCase Sync",
      value: `${stats.synced}/${stats.totalCases}`,
      sub: "Cases synced",
      detail:
        stats.syncErrors > 0 ? `${stats.syncErrors} error(s)` : "All clear",
      detailTone: stats.syncErrors > 0 ? "down" : "up",
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
    if (tone === "up") return <TrendingUp className="h-3 w-3" />;
    if (tone === "down") return <TrendingDown className="h-3 w-3" />;
    if (tone === "warn") return <AlertTriangle className="h-3 w-3" />;
    return null;
  };

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
              {s.sub && (
                <div className={`text-[11px] ${t.textMuted} mt-0.5`}>
                  {s.sub}
                </div>
              )}
            </div>
            {s.sparkData && s.sparkData.length > 1 && (
              <Sparkline data={s.sparkData} color={s.sparkColor ?? "#6366f1"} />
            )}
          </div>
          <div
            className={`mt-3 pt-2 border-t ${t.borderLight} flex items-center justify-between`}
          >
            <span className={`text-[11px] ${t.textSub} font-medium`}>
              Details
            </span>
            <span
              className={`text-[11px] font-semibold flex items-center gap-0.5 ${toneClass(
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
