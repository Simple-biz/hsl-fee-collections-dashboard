"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useTheme } from "next-themes";
import {
  BarChart3,
  Download,
  RefreshCw,
  Calendar,
  Users,
  ChevronDown,
  ArrowUpDown,
  Phone,
} from "lucide-react";
import { ScoreboardTracker } from "@/components/reports/ScoreboardTracker";
import {
  ScoreboardSummaryCards,
  type ScoreboardSummary,
} from "@/components/scoreboard/ScoreboardSummaryCards";
import { themeClasses } from "@/lib/theme-classes";
import { fmtFull, fmtDate } from "@/lib/formatters";
import type { AgentRow } from "@/types";

// ---------- types ----------

interface Totals {
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
  agents: AgentRow[];
  totals: Totals;
  noFeesCasesCount: number;
}

// ---------- helpers ----------
const toISO = (d: Date) => d.toISOString().slice(0, 10);

const startOfWeek = (d: Date) => {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
};

const PRESETS = [
  {
    label: "This Week",
    from: () => startOfWeek(new Date()),
    to: () => new Date(),
  },
  {
    label: "Last 7 Days",
    from: () => {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      return d;
    },
    to: () => new Date(),
  },
  {
    label: "Last 30 Days",
    from: () => {
      const d = new Date();
      d.setDate(d.getDate() - 29);
      return d;
    },
    to: () => new Date(),
  },
  {
    label: "This Month",
    from: () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    to: () => new Date(),
  },
  {
    label: "Last Month",
    from: () =>
      new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1),
    to: () => new Date(new Date().getFullYear(), new Date().getMonth(), 0),
  },
];

type SortKey =
  | "name"
  | "totalCalls"
  | "activityCount"
  | "casesTouched"
  | "statusChanges"
  | "collected"
  | "totalAssigned";

// ---------- component ----------
export const Reports = () => {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted ? resolvedTheme === "dark" : false;
  const t = themeClasses(dark);

  const now = new Date();
  const [fromDate, setFromDate] = useState(toISO(startOfWeek(now)));
  const [toDate, setToDate] = useState(toISO(now));
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("totalCalls");
  const [sortAsc, setSortAsc] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [activeTab, setActiveTab] = useState<"breakdown" | "tracking">("breakdown");

  const fetchAbortRef = useRef<AbortController | null>(null);
  const summaryAbortRef = useRef<AbortController | null>(null);
  const [summary, setSummary] = useState<ScoreboardSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    summaryAbortRef.current?.abort();
    const controller = new AbortController();
    summaryAbortRef.current = controller;
    const monday = toISO(startOfWeek(new Date()));
    fetch(`/api/scoreboard?week=${monday}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load summary (${res.status})`);
        return res.json() as Promise<{ summary: ScoreboardSummary }>;
      })
      .then((json) => { if (!cancelled) setSummary(json.summary ?? null); })
      .catch((err: Error) => {
        if (err.name === "AbortError" || cancelled) return;
        console.error("Reports summary fetch error:", err);
      });
    return () => { cancelled = true; summaryAbortRef.current?.abort(); };
  }, []);

  const fetchReport = useCallback(async () => {
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports?from=${fromDate}&to=${toDate}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`Failed to load report (${res.status})`);
      const json = await res.json();
      if (controller.signal.aborted) return;
      setData(json.data);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      if (!controller.signal.aborted) setError((err as Error).message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    fetchReport();
    return () => fetchAbortRef.current?.abort();
  }, [fetchReport]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const sortedAgents = data
    ? [...data.agents].sort((a, b) => {
        const av = a[sortKey],
          bv = b[sortKey];
        if (typeof av === "string")
          return sortAsc
            ? av.localeCompare(bv as string)
            : (bv as string).localeCompare(av);
        return sortAsc
          ? (av as number) - (bv as number)
          : (bv as number) - (av as number);
      })
    : [];

  // CSV export
  const exportCSV = () => {
    if (!data) return;
    const headers = [
      "Agent",
      "SSA Calls",
      "Client IB",
      "Client OB",
      "Total Calls",
      "Days Active",
      "Activity Log Entries",
      "Cases Touched",
      "Status Changes",
      "Collected",
      "Total Assigned",
      "PIF",
      "Active",
      "Pending",
    ];
    const rows = sortedAgents.map((a) => [
      a.name,
      a.ssaCalls,
      a.clientCallsIb,
      a.clientCallsOb,
      a.totalCalls,
      a.daysActive,
      a.activityCount,
      a.casesTouched,
      a.statusChanges,
      a.collected.toFixed(2),
      a.totalAssigned,
      a.pifCount,
      a.activeCount,
      a.pendingCount,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fee-collections-report_${fromDate}_to_${toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sectionCard = `rounded-xl border ${t.card}`;
  const thBase = `py-2.5 px-3 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap cursor-pointer select-none`;
  const tdBase = `py-2.5 px-3 text-[12px] whitespace-nowrap`;
  const rowBorder = dark ? "border-neutral-800/50" : "border-neutral-100";
  const rowHover = dark ? "hover:bg-neutral-800/40" : "hover:bg-neutral-50/80";

  const SortIcon = ({ col }: { col: SortKey }) => (
    <ArrowUpDown
      aria-hidden="true"
      className={`h-3 w-3 inline ml-0.5 ${sortKey === col ? (dark ? "text-neutral-100" : "text-neutral-900") : ""}`}
    />
  );

  const TABS: { key: "breakdown" | "tracking"; label: string; icon: React.ElementType }[] = [
    { key: "breakdown", label: "Activity Report", icon: BarChart3 },
    { key: "tracking",  label: "Agent Tracking",  icon: Phone },
  ];

  return (
    <div className="space-y-4">
      {/* Tab switcher */}
      <div className={`flex gap-1 p-1 rounded-lg border w-fit ${dark ? "bg-neutral-900 border-neutral-800" : "bg-neutral-100/60 border-neutral-200"}`}>
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`h-8 px-3 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${
              activeTab === key
                ? dark
                  ? "bg-neutral-800 text-neutral-100"
                  : "bg-white text-neutral-900 shadow-sm"
                : dark
                  ? "text-neutral-400 hover:text-neutral-200"
                  : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === "breakdown" && <>
      {/* Header with date range picker */}
      <div className={`${sectionCard} p-4 md:p-5`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center ${dark ? "bg-indigo-900/40" : "bg-indigo-50"}`}
            >
              <BarChart3
                className={`h-5 w-5 ${dark ? "text-indigo-400" : "text-indigo-600"}`}
                aria-hidden="true"
              />
            </div>
            <div>
              <h3 className={`text-sm font-bold ${t.text}`}>
                Agent Activity Report
              </h3>
              <p className={`text-[11px] ${t.textMuted} mt-0.5`}>
                Daily calls, cases touched, status changes, and collections
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Preset picker */}
            <div className="relative">
              <button
                onClick={() => setShowPresets(!showPresets)}
                className={`h-8 px-3 rounded-md border text-xs font-medium flex items-center gap-1.5 ${t.outlineBtn}`}
              >
                <Calendar className="h-3 w-3" aria-hidden="true" />
                Presets
                <ChevronDown className="h-3 w-3" aria-hidden="true" />
              </button>
              {showPresets && (
                <div
                  className={`absolute right-0 top-9 z-20 rounded-lg border shadow-lg py-1 min-w-35 ${dark ? "bg-neutral-900 border-neutral-700" : "bg-white border-neutral-200"}`}
                >
                  {PRESETS.map((p) => (
                    <button
                      key={p.label}
                      onClick={() => {
                        setFromDate(toISO(p.from()));
                        setToDate(toISO(p.to()));
                        setShowPresets(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs ${t.textSub} ${t.hover} transition-colors`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* From */}
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className={`h-8 px-2 rounded-md border text-xs outline-none ${t.inputBg}`}
            />
            <span className={`text-xs ${t.textMuted}`}>to</span>
            {/* To */}
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className={`h-8 px-2 rounded-md border text-xs outline-none ${t.inputBg}`}
            />

            <button
              onClick={fetchReport}
              disabled={loading}
              className={`h-8 px-3 rounded-md text-xs font-semibold flex items-center gap-1.5 ${t.ctaBtn} disabled:opacity-50`}
            >
              {loading ? (
                <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-3 w-3" aria-hidden="true" />
              )}
              Run
            </button>

            <button
              onClick={exportCSV}
              disabled={!data}
              className={`h-8 px-3 rounded-md border text-xs font-medium flex items-center gap-1.5 ${t.outlineBtn} disabled:opacity-40`}
            >
              <Download className="h-3 w-3" aria-hidden="true" /> CSV
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          role="alert"
          className={`rounded-xl border p-4 flex items-center gap-3 ${dark ? "bg-red-900/20 border-red-800 text-red-400" : "bg-red-50 border-red-200 text-red-700"}`}
        >
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className={`h-5 w-5 animate-spin ${t.textMuted}`} aria-hidden="true" />
          <span className={`ml-2 text-sm ${t.textSub}`}>
            Generating report...
          </span>
        </div>
      )}

      {summary && (
        <ScoreboardSummaryCards
          summary={summary}
          teams={[]}
          label=""
          dark={dark}
          t={t}
        />
      )}

      {data && !loading && data.noFeesCasesCount > 0 && (
        <div className={`${sectionCard} px-4 py-3 flex items-center gap-3`}>
          <div className={`w-2 h-2 rounded-full shrink-0 ${dark ? "bg-amber-400" : "bg-amber-500"}`} aria-hidden="true" />
          <p className={`text-[12px] ${t.textSub}`}>
            <span className={`font-semibold ${dark ? "text-amber-400" : "text-amber-600"}`}>{data.noFeesCasesCount}</span>
            {" "}active {data.noFeesCasesCount === 1 ? "case has" : "cases have"} no fee data (all T16, T2, and AUX amounts are zero).
          </p>
        </div>
      )}

      {data && !loading && (
        <>
          {/* Agent table */}
          <div className={sectionCard}>
            <div
              className={`px-4 pt-4 pb-3 flex items-center justify-between border-b ${t.borderLight}`}
            >
              <h4
                className={`text-xs font-bold ${t.text} flex items-center gap-2`}
              >
                <Users className="h-3.5 w-3.5" aria-hidden="true" /> Agent Breakdown
                <span className={`text-[10px] font-normal ${t.textMuted}`}>
                  ({sortedAgents.length} agents)
                </span>
              </h4>
              <p className={`text-[10px] ${t.textMuted}`}>
                {fmtDate(data.from)} — {fmtDate(data.to)}
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-300">
                <thead>
                  <tr className={`border-b ${t.borderLight}`}>
                    <th
                      className={`${thBase} ${t.textSub} text-left cursor-pointer select-none`}
                      onClick={() => handleSort("name")}
                    >
                      Agent <SortIcon col="name" />
                    </th>
                    <th
                      className={`${thBase} ${t.textSub} text-right cursor-pointer select-none`}
                      onClick={() => handleSort("totalCalls")}
                    >
                      Calls <SortIcon col="totalCalls" />
                    </th>
                    <th className={`${thBase} ${t.textSub} text-right`}>SSA</th>
                    <th className={`${thBase} ${t.textSub} text-right`}>IB</th>
                    <th className={`${thBase} ${t.textSub} text-right`}>OB</th>
                    <th className={`${thBase} ${t.textSub} text-right`}>Days</th>
                    <th className={`${thBase} ${t.textSub} text-right`}>Avg/Day</th>
                    <th
                      className={`${thBase} ${t.textSub} text-right cursor-pointer select-none`}
                      onClick={() => handleSort("activityCount")}
                    >
                      Activity <SortIcon col="activityCount" />
                    </th>
                    <th
                      className={`${thBase} ${t.textSub} text-right cursor-pointer select-none`}
                      onClick={() => handleSort("casesTouched")}
                    >
                      Cases <SortIcon col="casesTouched" />
                    </th>
                    <th
                      className={`${thBase} ${t.textSub} text-right cursor-pointer select-none`}
                      onClick={() => handleSort("statusChanges")}
                    >
                      Changes <SortIcon col="statusChanges" />
                    </th>
                    <th className={`${thBase} ${t.textSub} text-right`}>PIF</th>
                    <th className={`${thBase} ${t.textSub} text-right`}>Act/Pend</th>
                    <th
                      className={`${thBase} ${t.textSub} text-right cursor-pointer select-none`}
                      onClick={() => handleSort("collected")}
                    >
                      Collected <SortIcon col="collected" />
                    </th>
                    <th
                      className={`${thBase} ${t.textSub} text-right cursor-pointer select-none`}
                      onClick={() => handleSort("totalAssigned")}
                    >
                      Assigned <SortIcon col="totalAssigned" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedAgents.length === 0 ? (
                    <tr>
                      <td
                        colSpan={14}
                        className={`${tdBase} text-center py-8 ${t.textMuted}`}
                      >
                        No agent data for this date range.
                      </td>
                    </tr>
                  ) : (
                    sortedAgents.map((agent) => (
                      <tr
                        key={agent.name}
                        className={`border-b ${rowBorder} ${rowHover} transition-colors`}
                      >
                        <td className={`${tdBase} ${t.text} font-semibold`}>{agent.name}</td>
                        <td className={`${tdBase} text-right font-semibold ${t.text}`}>{agent.totalCalls}</td>
                        <td className={`${tdBase} text-right ${t.textSub}`}>{agent.ssaCalls}</td>
                        <td className={`${tdBase} text-right ${t.textSub}`}>{agent.clientCallsIb}</td>
                        <td className={`${tdBase} text-right ${t.textSub}`}>{agent.clientCallsOb}</td>
                        <td className={`${tdBase} text-right ${t.textSub}`}>{agent.daysActive}</td>
                        <td className={`${tdBase} text-right ${t.textSub}`}>
                          {agent.daysActive > 0 ? Math.round(agent.totalCalls / agent.daysActive) : 0}
                        </td>
                        <td className={`${tdBase} text-right ${t.textSub}`}>{agent.activityCount}</td>
                        <td className={`${tdBase} text-right ${t.textSub}`}>{agent.casesTouched}</td>
                        <td className={`${tdBase} text-right ${t.textSub}`}>{agent.statusChanges}</td>
                        <td className={`${tdBase} text-right font-semibold text-emerald-500`}>
                          {agent.pifCount > 0 ? agent.pifCount : <span className={t.textMuted}>—</span>}
                        </td>
                        <td className={`${tdBase} text-right ${t.textSub}`}>
                          {agent.activeCount} / {agent.pendingCount}
                        </td>
                        <td className={`${tdBase} text-right ${agent.collected > 0 ? "text-emerald-500 font-semibold" : t.textMuted}`}>
                          {agent.collected > 0 ? fmtFull(agent.collected) : "—"}
                        </td>
                        <td className={`${tdBase} text-right ${t.textSub}`}>{agent.totalAssigned}</td>
                      </tr>
                    ))
                  )}

                  {/* Totals row */}
                  {sortedAgents.length > 0 && (
                    <tr className={`border-t-2 ${dark ? "border-neutral-700" : "border-neutral-300"}`}>
                      <td className={`${tdBase} font-bold ${t.text}`}>Total</td>
                      <td className={`${tdBase} text-right font-bold ${t.text}`}>{data.totals.totalCalls}</td>
                      <td className={`${tdBase} text-right font-semibold ${t.textSub}`}>{data.totals.ssaCalls}</td>
                      <td className={`${tdBase} text-right font-semibold ${t.textSub}`}>{data.totals.clientCallsIb}</td>
                      <td className={`${tdBase} text-right font-semibold ${t.textSub}`}>{data.totals.clientCallsOb}</td>
                      <td className={`${tdBase}`} />
                      <td className={`${tdBase}`} />
                      <td className={`${tdBase} text-right font-semibold ${t.textSub}`}>{data.totals.activityCount}</td>
                      <td className={`${tdBase} text-right font-semibold ${t.textSub}`}>{data.totals.casesTouched}</td>
                      <td className={`${tdBase} text-right font-semibold ${t.textSub}`}>{data.totals.statusChanges}</td>
                      <td className={`${tdBase}`} />
                      <td className={`${tdBase}`} />
                      <td className={`${tdBase} text-right font-bold text-emerald-500`}>
                        {data.totals.collected > 0 ? fmtFull(data.totals.collected) : "—"}
                      </td>
                      <td className={`${tdBase}`} />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      </>}

      {activeTab === "tracking" && <ScoreboardTracker dark={dark} t={t} />}
    </div>
  );
};
