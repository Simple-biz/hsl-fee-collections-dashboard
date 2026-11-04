"use client";

import { useState, useEffect } from "react";
import { Phone, DollarSign, Briefcase, AlertCircle } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { DateRangeButton } from "@/components/layout/DateRangeButton";
import { themeClasses } from "@/lib/theme-classes";
import { fmt } from "@/lib/formatters";
import type { DateRange } from "@/lib/date-range-context";

interface DailyBreakdown {
  date: string;
  ssa_calls: number;
  client_calls_ib: number;
  client_calls_ob: number;
}

interface ReportTotals {
  ssaCalls: number;
  clientCallsIb: number;
  clientCallsOb: number;
  totalCalls: number;
  activityCount: number;
  casesTouched: number;
  statusChanges: number;
  collected: number;
}

interface ReportData {
  from: string;
  to: string;
  dailyBreakdown: DailyBreakdown[];
  totals: ReportTotals;
}

interface ReportsDashboardProps {
  dark: boolean;
  t: ReturnType<typeof themeClasses>;
}

const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function defaultRange(): DateRange {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 6);
  return { from: toISO(from), to: toISO(now) };
}

export function ReportsDashboard({ dark, t }: ReportsDashboardProps) {
  const [dateRange, setDateRange] = useState<DateRange | null>(defaultRange());
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!dateRange) return;
    let cancelled = false;
    const controller = new AbortController();

    const timer = setTimeout(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);

      fetch(`/api/reports?from=${dateRange.from}&to=${dateRange.to}`, {
        signal: controller.signal,
      })
        .then((res) => {
          if (!res.ok) throw new Error(`Failed to load report (${res.status})`);
          return res.json();
        })
        .then((json) => {
          if (!cancelled) setData(json.data as ReportData);
        })
        .catch((err) => {
          if (err.name === "AbortError") return;
          if (!cancelled) setError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [dateRange]);

  const chartData = (data?.dailyBreakdown ?? []).map((d) => ({
    date: new Date(d.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    "SSA Calls": d.ssa_calls,
    "Client IB": d.client_calls_ib,
    "Client OB": d.client_calls_ob,
  }));

  const totals = data?.totals;

  const statCards = [
    {
      icon: Phone,
      label: "Total Calls",
      value: totals?.totalCalls ?? 0,
      format: (v: number) => String(v),
      accent: dark ? "text-indigo-400" : "text-indigo-600",
    },
    {
      icon: DollarSign,
      label: "Fees Collected",
      value: totals?.collected ?? 0,
      format: fmt,
      accent: dark ? "text-emerald-400" : "text-emerald-600",
    },
    {
      icon: Briefcase,
      label: "Cases Touched",
      value: totals?.casesTouched ?? 0,
      format: (v: number) => String(v),
      accent: dark ? "text-amber-400" : "text-amber-600",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Date filter */}
      <div className={`rounded-xl border ${t.card} px-4 py-3 flex items-center justify-between gap-4`}>
        <span className={`text-sm font-medium ${t.textSub}`}>Date Range</span>
        <DateRangeButton
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          dark={dark}
          t={t}
          align="right"
        />
      </div>

      {/* Error */}
      {error != null && (
        <div
          role="alert"
          className={`rounded-xl border px-4 py-3 flex items-center gap-2 text-sm ${dark ? "border-red-800/50 bg-red-900/20 text-red-400" : "border-red-200 bg-red-50 text-red-700"}`}
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        {statCards.map((s) => (
          <div key={s.label} className={`rounded-xl border ${t.card} p-4`}>
            <div className={`flex items-center gap-1.5 text-xs ${t.textSub} font-medium`}>
              <s.icon className={`h-3.5 w-3.5 ${s.accent}`} aria-hidden="true" />
              {s.label}
            </div>
            <div className={`text-2xl font-extrabold ${t.text} mt-1`}>
              {loading ? (
                <span className={`inline-block h-7 w-24 rounded ${dark ? "bg-neutral-800" : "bg-neutral-100"} animate-pulse`} />
              ) : (
                s.format(s.value)
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Daily calls chart */}
      <div className={`rounded-xl border ${t.card} p-4`}>
        <p className={`text-sm font-semibold ${t.text} mb-4`}>Daily Calls</p>
        {loading ? (
          <div className={`h-56 rounded-lg ${dark ? "bg-neutral-800" : "bg-neutral-100"} animate-pulse`} />
        ) : chartData.length === 0 ? (
          <div className={`h-56 flex items-center justify-center text-sm ${t.textMuted}`}>
            No call data for this period.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={224}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={dark ? "#262626" : "#e5e7eb"}
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: dark ? "#a3a3a3" : "#6b7280" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: dark ? "#a3a3a3" : "#6b7280" }}
                axisLine={false}
                tickLine={false}
                width={32}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: dark ? "#171717" : "#ffffff",
                  border: `1px solid ${dark ? "#404040" : "#e5e7eb"}`,
                  borderRadius: "8px",
                  fontSize: 12,
                  color: dark ? "#e5e5e5" : "#171717",
                }}
                cursor={{ fill: dark ? "#ffffff0d" : "#00000008" }}
              />
              <Legend
                wrapperStyle={{ fontSize: 12, paddingTop: 12, color: dark ? "#a3a3a3" : "#6b7280" }}
              />
              <Bar dataKey="SSA Calls" stackId="calls" fill={dark ? "#818cf8" : "#6366f1"} radius={[0, 0, 0, 0]} />
              <Bar dataKey="Client IB" stackId="calls" fill={dark ? "#34d399" : "#10b981"} radius={[0, 0, 0, 0]} />
              <Bar dataKey="Client OB" stackId="calls" fill={dark ? "#fb923c" : "#f97316"} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
