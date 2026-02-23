"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Trophy,
  Phone,
  Users,
  AlertCircle,
} from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import { fmt } from "@/lib/formatters";

interface AgentScore {
  agent: string;
  casesAssigned: number;
  completedWinSheets: number;
  unpaidT2Over60: number;
  unpaidT16Over60: number;
  unpaidConcOver60: number;
  totalCollected: number;
  casesFullFee: number;
  weekSsaCalls: number;
  weekClientCalls: number;
}

interface Summary {
  totalCasesAssigned: number;
  totalCompletedWinSheets: number;
  totalUnpaidT2Over60: number;
  totalUnpaidT16Over60: number;
  totalUnpaidConcOver60: number;
  totalCollected: number;
  totalCasesFullFee: number;
  totalSsaCalls: number;
  totalClientCalls: number;
}

interface ScoreboardData {
  week: string;
  summary: Summary;
  agents: AgentScore[];
}

const getMonday = (offset = 0): string => {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) + offset * 7;
  d.setDate(diff);
  return d.toISOString().split("T")[0];
};

const formatWeekLabel = (monday: string): string => {
  const start = new Date(monday + "T00:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 4);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${start.toLocaleDateString("en-US", opts)} – ${end.toLocaleDateString("en-US", { ...opts, year: "numeric" })}`;
};

export const Scoreboard = () => {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const t = themeClasses(dark);

  const [weekOffset, setWeekOffset] = useState(0);
  const [data, setData] = useState<ScoreboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const monday = getMonday(weekOffset);

  useEffect(() => {
    const fetchScoreboard = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/scoreboard?week=${monday}`);
        if (!res.ok) throw new Error("Failed to fetch scoreboard");
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };
    fetchScoreboard();
  }, [monday]);

  const thBase = `py-2.5 px-3 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap`;
  const tdBase = `py-2.5 px-3 text-[12px] whitespace-nowrap tabular-nums`;
  const rowBorder = dark ? "border-neutral-800/50" : "border-neutral-100";
  const rowHover = dark ? "hover:bg-neutral-800/40" : "hover:bg-neutral-50/80";

  return (
    <div className={`rounded-xl border ${t.card}`}>
      {/* Header */}
      <div
        className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b ${t.borderLight}`}
      >
        <div className="flex items-center gap-3">
          <Trophy
            className={`h-5 w-5 ${dark ? "text-amber-400" : "text-amber-500"}`}
          />
          <div>
            <h3 className={`text-sm font-bold ${t.text}`}>Weekly Scoreboard</h3>
            <p className={`text-[11px] ${t.textMuted} mt-0.5`}>
              {formatWeekLabel(monday)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekOffset(weekOffset - 1)}
            className={`h-8 w-8 rounded-md flex items-center justify-center ${t.hover} ${t.textSub}`}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setWeekOffset(0)}
            className={`h-8 px-3 rounded-md text-xs font-medium ${dark ? "bg-neutral-800 text-neutral-300" : "bg-neutral-100 text-neutral-700"}`}
          >
            This Week
          </button>
          <button
            onClick={() => setWeekOffset(weekOffset + 1)}
            className={`h-8 w-8 rounded-md flex items-center justify-center ${t.hover} ${t.textSub}`}
            disabled={weekOffset >= 0}
          >
            <ChevronRight
              className={`h-4 w-4 ${weekOffset >= 0 ? "opacity-30" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          className={`m-4 rounded-lg border p-3 flex items-center gap-2 ${dark ? "bg-red-900/20 border-red-800 text-red-400" : "bg-red-50 border-red-200 text-red-700"}`}
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="text-xs">{error}</span>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className={`h-5 w-5 animate-spin ${t.textMuted}`} />
          <span className={`ml-2 text-sm ${t.textSub}`}>
            Loading scoreboard...
          </span>
        </div>
      ) : (
        data && (
          <>
            {/* Summary cards */}
            <div
              className={`grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-3 p-4 border-b ${t.borderLight}`}
            >
              {[
                {
                  label: "Cases Assigned",
                  value: data.summary.totalCasesAssigned,
                  icon: null,
                },
                {
                  label: "Win Sheets",
                  value: data.summary.totalCompletedWinSheets,
                  icon: null,
                },
                {
                  label: "T2 >60d",
                  value: data.summary.totalUnpaidT2Over60,
                  icon: null,
                },
                {
                  label: "T16 >60d",
                  value: data.summary.totalUnpaidT16Over60,
                  icon: null,
                },
                {
                  label: "Conc >60d",
                  value: data.summary.totalUnpaidConcOver60,
                  icon: null,
                },
                {
                  label: "Collected",
                  value: fmt(data.summary.totalCollected),
                  icon: null,
                },
                {
                  label: "Full Fee",
                  value: data.summary.totalCasesFullFee,
                  icon: null,
                },
                {
                  label: "SSA Calls",
                  value: data.summary.totalSsaCalls,
                  icon: Phone,
                },
                {
                  label: "Client Calls",
                  value: data.summary.totalClientCalls,
                  icon: Users,
                },
              ].map((item, i) => (
                <div key={i} className={`rounded-lg border p-3 ${t.card}`}>
                  <p
                    className={`text-[10px] font-medium ${t.textMuted} uppercase`}
                  >
                    {item.label}
                  </p>
                  <p className={`text-lg font-bold ${t.text} mt-1`}>
                    {item.value}
                  </p>
                </div>
              ))}
            </div>

            {/* Agent table */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-225">
                <thead>
                  <tr className={`border-b ${t.borderLight}`}>
                    <th className={`${thBase} ${t.textSub} text-left`}>
                      Agent
                    </th>
                    <th className={`${thBase} ${t.textSub} text-right`}>
                      Cases
                    </th>
                    <th className={`${thBase} ${t.textSub} text-right`}>
                      Win Sheets
                    </th>
                    <th
                      className={`${thBase} ${t.textSub} text-right ${dark ? "text-red-400" : "text-red-600"}`}
                    >
                      T2 &gt;60d
                    </th>
                    <th
                      className={`${thBase} ${t.textSub} text-right ${dark ? "text-red-400" : "text-red-600"}`}
                    >
                      T16 &gt;60d
                    </th>
                    <th
                      className={`${thBase} ${t.textSub} text-right ${dark ? "text-red-400" : "text-red-600"}`}
                    >
                      Conc &gt;60d
                    </th>
                    <th className={`${thBase} ${t.textSub} text-right`}>
                      Collected
                    </th>
                    <th className={`${thBase} ${t.textSub} text-right`}>
                      Full Fee
                    </th>
                    <th className={`${thBase} ${t.textSub} text-right`}>
                      SSA Calls
                    </th>
                    <th className={`${thBase} ${t.textSub} text-right`}>
                      Client Calls
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.agents.map((a) => (
                    <tr
                      key={a.agent}
                      className={`border-b ${rowBorder} ${rowHover} transition-colors`}
                    >
                      <td className={`${tdBase} ${t.text} font-semibold`}>
                        {a.agent}
                      </td>
                      <td className={`${tdBase} text-right ${t.text}`}>
                        {a.casesAssigned}
                      </td>
                      <td className={`${tdBase} text-right ${t.text}`}>
                        {a.completedWinSheets}
                      </td>
                      <td
                        className={`${tdBase} text-right ${a.unpaidT2Over60 > 0 ? (dark ? "text-red-400 font-medium" : "text-red-600 font-medium") : t.textMuted}`}
                      >
                        {a.unpaidT2Over60}
                      </td>
                      <td
                        className={`${tdBase} text-right ${a.unpaidT16Over60 > 0 ? (dark ? "text-red-400 font-medium" : "text-red-600 font-medium") : t.textMuted}`}
                      >
                        {a.unpaidT16Over60}
                      </td>
                      <td
                        className={`${tdBase} text-right ${a.unpaidConcOver60 > 0 ? (dark ? "text-red-400 font-medium" : "text-red-600 font-medium") : t.textMuted}`}
                      >
                        {a.unpaidConcOver60}
                      </td>
                      <td
                        className={`${tdBase} text-right font-semibold ${a.totalCollected > 0 ? "text-emerald-500" : t.textMuted}`}
                      >
                        {a.totalCollected > 0 ? fmt(a.totalCollected) : "—"}
                      </td>
                      <td className={`${tdBase} text-right ${t.text}`}>
                        {a.casesFullFee}
                      </td>
                      <td className={`${tdBase} text-right ${t.text}`}>
                        {a.weekSsaCalls || "—"}
                      </td>
                      <td className={`${tdBase} text-right ${t.text}`}>
                        {a.weekClientCalls || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* Totals row */}
                <tfoot>
                  <tr
                    className={`${dark ? "bg-neutral-800/60" : "bg-neutral-50"}`}
                  >
                    <td className={`${tdBase} font-bold ${t.text}`}>TOTAL</td>
                    <td className={`${tdBase} text-right font-bold ${t.text}`}>
                      {data.summary.totalCasesAssigned}
                    </td>
                    <td className={`${tdBase} text-right font-bold ${t.text}`}>
                      {data.summary.totalCompletedWinSheets}
                    </td>
                    <td
                      className={`${tdBase} text-right font-bold ${dark ? "text-red-400" : "text-red-600"}`}
                    >
                      {data.summary.totalUnpaidT2Over60}
                    </td>
                    <td
                      className={`${tdBase} text-right font-bold ${dark ? "text-red-400" : "text-red-600"}`}
                    >
                      {data.summary.totalUnpaidT16Over60}
                    </td>
                    <td
                      className={`${tdBase} text-right font-bold ${dark ? "text-red-400" : "text-red-600"}`}
                    >
                      {data.summary.totalUnpaidConcOver60}
                    </td>
                    <td
                      className={`${tdBase} text-right font-bold text-emerald-500`}
                    >
                      {fmt(data.summary.totalCollected)}
                    </td>
                    <td className={`${tdBase} text-right font-bold ${t.text}`}>
                      {data.summary.totalCasesFullFee}
                    </td>
                    <td className={`${tdBase} text-right font-bold ${t.text}`}>
                      {data.summary.totalSsaCalls}
                    </td>
                    <td className={`${tdBase} text-right font-bold ${t.text}`}>
                      {data.summary.totalClientCalls}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )
      )}
    </div>
  );
};
