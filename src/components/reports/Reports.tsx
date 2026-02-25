"use client";

import { useState, useEffect, useCallback } from "react";
import { useTheme } from "next-themes";
import {
  BarChart3,
  Download,
  RefreshCw,
  Calendar,
  Phone,
  FileText,
  Users,
  DollarSign,
  ChevronDown,
  ChevronRight,
  ArrowUpDown,
  MessageSquare,
  Clock,
  TrendingUp,
  // X,
} from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import { fmtFull, fmtDate } from "@/lib/formatters";

// ---------- types ----------
interface AgentRow {
  name: string;
  ssaCalls: number;
  clientCallsIb: number;
  clientCallsOb: number;
  totalCalls: number;
  daysActive: number;
  activityCount: number;
  casesTouched: number;
  statusChanges: number;
  casesWithPayment: number;
  collected: number;
  totalAssigned: number;
  pifCount: number;
  activeCount: number;
  pendingCount: number;
}

interface DailyRow {
  date: string;
  ssa_calls: number;
  client_calls_ib: number;
  client_calls_ob: number;
}

interface ActivityEntry {
  id: string;
  caseId: number;
  message: string;
  createdBy: string;
  createdAt: string;
  caseName: string | null;
}

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
  dailyBreakdown: DailyRow[];
  recentActivity: ActivityEntry[];
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
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [showPresets, setShowPresets] = useState(false);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports?from=${fromDate}&to=${toDate}`);
      if (!res.ok) throw new Error("Failed to load report");
      const json = await res.json();
      setData(json.data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    fetchReport();
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
      className={`h-3 w-3 inline ml-0.5 ${sortKey === col ? (dark ? "text-neutral-100" : "text-neutral-900") : ""}`}
    />
  );

  // Mini bar chart using divs
  const DailyChart = () => {
    if (!data || data.dailyBreakdown.length === 0)
      return (
        <p className={`text-xs ${t.textMuted} text-center py-6`}>
          No daily data for this range.
        </p>
      );
    const maxVal = Math.max(
      ...data.dailyBreakdown.map(
        (d) => d.ssa_calls + d.client_calls_ib + d.client_calls_ob,
      ),
      1,
    );
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxVal * f));
    return (
      <div className="flex gap-2 flex-1 min-h-0">
        {/* Y-axis labels */}
        <div className="flex flex-col justify-between py-0.5 shrink-0">
          {[...ticks].reverse().map((v, i) => (
            <span
              key={i}
              className={`text-[9px] tabular-nums ${t.textMuted} text-right w-6`}
            >
              {v}
            </span>
          ))}
        </div>
        {/* Bars area */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="relative flex items-end gap-1.5 flex-1 min-h-0">
            {/* Grid lines */}
            {[0.25, 0.5, 0.75, 1].map((f) => (
              <div
                key={f}
                className={`absolute left-0 right-0 border-t ${dark ? "border-neutral-800/40" : "border-neutral-100"}`}
                style={{ bottom: `${f * 100}%` }}
              />
            ))}
            {data.dailyBreakdown.map((d, i) => {
              const total = d.ssa_calls + d.client_calls_ib + d.client_calls_ob;
              const pct = total > 0 ? Math.max((total / maxVal) * 100, 2) : 0;
              const ssaPct = total > 0 ? (d.ssa_calls / total) * 100 : 0;
              const ibPct = total > 0 ? (d.client_calls_ib / total) * 100 : 0;
              const obPct = total > 0 ? (d.client_calls_ob / total) * 100 : 0;
              return (
                <div
                  key={i}
                  className="flex-1 h-full flex flex-col justify-end relative z-10"
                >
                  {/* Number above bar */}
                  {total > 0 && (
                    <div
                      className={`text-center text-[9px] font-bold ${t.text} mb-0.5`}
                    >
                      {total}
                    </div>
                  )}
                  <div
                    className="w-full flex flex-col-reverse rounded-t overflow-hidden"
                    style={{ height: `${pct}%` }}
                  >
                    <div
                      className="bg-indigo-500 w-full"
                      style={{ height: `${ssaPct}%` }}
                    />
                    <div
                      className={`${dark ? "bg-blue-500" : "bg-blue-400"} w-full`}
                      style={{ height: `${ibPct}%` }}
                    />
                    <div
                      className={`${dark ? "bg-violet-500" : "bg-violet-400"} w-full`}
                      style={{ height: `${obPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          {/* X-axis labels */}
          <div
            className={`flex gap-1.5 border-t ${dark ? "border-neutral-800/40" : "border-neutral-100"} pt-1 shrink-0`}
          >
            {data.dailyBreakdown.map((d, i) => {
              const dayLabel = new Date(
                d.date + "T12:00:00",
              ).toLocaleDateString("en-US", { weekday: "short" });
              const dateLabel = new Date(
                d.date + "T12:00:00",
              ).toLocaleDateString("en-US", { month: "short", day: "numeric" });
              return (
                <div key={i} className="flex-1 text-center">
                  <span className={`text-[9px] font-medium ${t.textSub} block`}>
                    {dayLabel}
                  </span>
                  <span
                    className={`text-[8px] ${t.textMuted} block leading-none`}
                  >
                    {dateLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header with date range picker */}
      <div className={`${sectionCard} p-4 md:p-5`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center ${dark ? "bg-indigo-900/40" : "bg-indigo-50"}`}
            >
              <BarChart3
                className={`h-5 w-5 ${dark ? "text-indigo-400" : "text-indigo-600"}`}
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
                <Calendar className="h-3 w-3" />
                Presets
                <ChevronDown className="h-3 w-3" />
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
                <RefreshCw className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              Run
            </button>

            <button
              onClick={exportCSV}
              disabled={!data}
              className={`h-8 px-3 rounded-md border text-xs font-medium flex items-center gap-1.5 ${t.outlineBtn} disabled:opacity-40`}
            >
              <Download className="h-3 w-3" /> CSV
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          className={`rounded-xl border p-4 flex items-center gap-3 ${dark ? "bg-red-900/20 border-red-800 text-red-400" : "bg-red-50 border-red-200 text-red-700"}`}
        >
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className={`h-5 w-5 animate-spin ${t.textMuted}`} />
          <span className={`ml-2 text-sm ${t.textSub}`}>
            Generating report...
          </span>
        </div>
      )}

      {data && !loading && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {
                label: "Total Calls",
                value: data.totals.totalCalls,
                icon: Phone,
                color: "text-indigo-500",
              },
              {
                label: "Activity Entries",
                value: data.totals.activityCount,
                icon: MessageSquare,
                color: "text-blue-500",
              },
              {
                label: "Cases Touched",
                value: data.totals.casesTouched,
                icon: FileText,
                color: "text-violet-500",
              },
              {
                label: "Collected",
                value: fmtFull(data.totals.collected),
                icon: DollarSign,
                color: "text-emerald-500",
              },
            ].map((item, i) => (
              <div key={i} className={`${sectionCard} p-3`}>
                <div className="flex items-center gap-2">
                  <item.icon className={`h-3.5 w-3.5 ${item.color}`} />
                  <p
                    className={`text-[10px] font-semibold uppercase ${t.textMuted}`}
                  >
                    {item.label}
                  </p>
                </div>
                <p className={`text-xl font-bold mt-1 ${t.text}`}>
                  {item.value}
                </p>
              </div>
            ))}
          </div>

          {/* Chart + Recent Activity side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Daily calls chart */}
            <div
              className={`${sectionCard} px-4 pt-4 pb-3 lg:col-span-2 flex flex-col`}
            >
              <div className="flex items-center justify-between mb-3">
                <h4
                  className={`text-xs font-bold ${t.text} flex items-center gap-2`}
                >
                  <TrendingUp className="h-3.5 w-3.5" /> Daily Call Volume
                </h4>
                <div className="flex items-center gap-3 text-[10px]">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded bg-indigo-500" /> SSA
                  </span>
                  <span className="flex items-center gap-1">
                    <span
                      className={`w-2 h-2 rounded ${dark ? "bg-blue-500" : "bg-blue-400"}`}
                    />{" "}
                    Client IB
                  </span>
                  <span className="flex items-center gap-1">
                    <span
                      className={`w-2 h-2 rounded ${dark ? "bg-violet-500" : "bg-violet-400"}`}
                    />{" "}
                    Client OB
                  </span>
                </div>
              </div>
              <DailyChart />
            </div>

            {/* Recent Activity feed */}
            <div className={`${sectionCard} p-4`}>
              <h4
                className={`text-xs font-bold ${t.text} flex items-center gap-2 mb-3`}
              >
                <Clock className="h-3.5 w-3.5" /> Recent Activity
                <span className={`text-[10px] font-normal ${t.textMuted}`}>
                  ({data.recentActivity.length})
                </span>
              </h4>
              <div className="space-y-2.5 max-h-70 overflow-y-auto pr-1">
                {data.recentActivity.length === 0 ? (
                  <p className={`text-xs ${t.textMuted} text-center py-6`}>
                    No activity in this range.
                  </p>
                ) : (
                  data.recentActivity.slice(0, 20).map((a) => (
                    <div
                      key={a.id}
                      className={`rounded-md p-2 ${dark ? "bg-neutral-800/40" : "bg-neutral-50"}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-semibold ${t.text}`}>
                          {a.createdBy}
                        </span>
                        {a.caseName && (
                          <span className={`text-[10px] ${t.textMuted}`}>
                            on {a.caseName}
                          </span>
                        )}
                      </div>
                      <p
                        className={`text-[11px] ${t.textSub} mt-0.5 leading-snug line-clamp-2`}
                      >
                        {a.message}
                      </p>
                      <p className={`text-[9px] ${t.textMuted} mt-0.5`}>
                        {new Date(a.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Agent table */}
          <div className={sectionCard}>
            <div
              className={`px-4 pt-4 pb-3 flex items-center justify-between border-b ${t.borderLight}`}
            >
              <h4
                className={`text-xs font-bold ${t.text} flex items-center gap-2`}
              >
                <Users className="h-3.5 w-3.5" /> Agent Breakdown
                <span className={`text-[10px] font-normal ${t.textMuted}`}>
                  ({sortedAgents.length} agents)
                </span>
              </h4>
              <p className={`text-[10px] ${t.textMuted}`}>
                {fmtDate(data.from)} — {fmtDate(data.to)}
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-250">
                <thead>
                  <tr className={`border-b ${t.borderLight}`}>
                    <th className={`${thBase} ${t.textSub} text-left w-8`} />
                    <th
                      className={`${thBase} ${t.textSub} text-left`}
                      onClick={() => handleSort("name")}
                    >
                      Agent <SortIcon col="name" />
                    </th>
                    <th
                      className={`${thBase} ${t.textSub} text-right`}
                      onClick={() => handleSort("totalCalls")}
                    >
                      Calls <SortIcon col="totalCalls" />
                    </th>
                    <th className={`${thBase} ${t.textSub} text-right`}>SSA</th>
                    <th className={`${thBase} ${t.textSub} text-right`}>IB</th>
                    <th className={`${thBase} ${t.textSub} text-right`}>OB</th>
                    <th
                      className={`${thBase} ${t.textSub} text-right`}
                      onClick={() => handleSort("activityCount")}
                    >
                      Activity <SortIcon col="activityCount" />
                    </th>
                    <th
                      className={`${thBase} ${t.textSub} text-right`}
                      onClick={() => handleSort("casesTouched")}
                    >
                      Cases <SortIcon col="casesTouched" />
                    </th>
                    <th
                      className={`${thBase} ${t.textSub} text-right`}
                      onClick={() => handleSort("statusChanges")}
                    >
                      Changes <SortIcon col="statusChanges" />
                    </th>
                    <th
                      className={`${thBase} ${t.textSub} text-right`}
                      onClick={() => handleSort("collected")}
                    >
                      Collected <SortIcon col="collected" />
                    </th>
                    <th
                      className={`${thBase} ${t.textSub} text-right`}
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
                        colSpan={11}
                        className={`${tdBase} text-center py-8 ${t.textMuted}`}
                      >
                        No agent data for this date range.
                      </td>
                    </tr>
                  ) : (
                    sortedAgents.map((agent) => {
                      const isExpanded = expandedAgent === agent.name;
                      return (
                        <tr key={agent.name} className="group">
                          <td colSpan={11} className="p-0">
                            {/* Main row */}
                            <div
                              className={`flex items-center border-b ${rowBorder} ${rowHover} transition-colors cursor-pointer`}
                              onClick={() =>
                                setExpandedAgent(isExpanded ? null : agent.name)
                              }
                            >
                              <div
                                className={`${tdBase} w-8 flex items-center justify-center`}
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-3 w-3" />
                                ) : (
                                  <ChevronRight className="h-3 w-3" />
                                )}
                              </div>
                              <div
                                className={`${tdBase} flex-1 ${t.text} font-semibold`}
                              >
                                {agent.name}
                              </div>
                              <div
                                className={`${tdBase} text-right font-semibold ${t.text}`}
                              >
                                {agent.totalCalls}
                              </div>
                              <div
                                className={`${tdBase} text-right ${t.textSub}`}
                              >
                                {agent.ssaCalls}
                              </div>
                              <div
                                className={`${tdBase} text-right ${t.textSub}`}
                              >
                                {agent.clientCallsIb}
                              </div>
                              <div
                                className={`${tdBase} text-right ${t.textSub}`}
                              >
                                {agent.clientCallsOb}
                              </div>
                              <div
                                className={`${tdBase} text-right ${t.textSub}`}
                              >
                                {agent.activityCount}
                              </div>
                              <div
                                className={`${tdBase} text-right ${t.textSub}`}
                              >
                                {agent.casesTouched}
                              </div>
                              <div
                                className={`${tdBase} text-right ${t.textSub}`}
                              >
                                {agent.statusChanges}
                              </div>
                              <div
                                className={`${tdBase} text-right ${agent.collected > 0 ? "text-emerald-500 font-semibold" : t.textMuted}`}
                              >
                                {agent.collected > 0
                                  ? fmtFull(agent.collected)
                                  : "—"}
                              </div>
                              <div
                                className={`${tdBase} text-right ${t.textSub}`}
                              >
                                {agent.totalAssigned}
                              </div>
                            </div>

                            {/* Expanded detail */}
                            {isExpanded && (
                              <div
                                className={`px-4 py-3 border-b ${rowBorder} ${dark ? "bg-neutral-800/20" : "bg-neutral-50/50"}`}
                              >
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
                                  <div>
                                    <p
                                      className={`text-[10px] font-semibold uppercase ${t.textMuted}`}
                                    >
                                      Days Active
                                    </p>
                                    <p className={`font-semibold ${t.text}`}>
                                      {agent.daysActive}
                                    </p>
                                  </div>
                                  <div>
                                    <p
                                      className={`text-[10px] font-semibold uppercase ${t.textMuted}`}
                                    >
                                      Avg Calls/Day
                                    </p>
                                    <p className={`font-semibold ${t.text}`}>
                                      {agent.daysActive > 0
                                        ? Math.round(
                                            agent.totalCalls / agent.daysActive,
                                          )
                                        : 0}
                                    </p>
                                  </div>
                                  <div>
                                    <p
                                      className={`text-[10px] font-semibold uppercase ${t.textMuted}`}
                                    >
                                      PIF Cases
                                    </p>
                                    <p className="font-semibold text-emerald-500">
                                      {agent.pifCount}
                                    </p>
                                  </div>
                                  <div>
                                    <p
                                      className={`text-[10px] font-semibold uppercase ${t.textMuted}`}
                                    >
                                      Active / Pending
                                    </p>
                                    <p className={`font-semibold ${t.text}`}>
                                      {agent.activeCount} / {agent.pendingCount}
                                    </p>
                                  </div>
                                </div>

                                {/* Agent's activity entries */}
                                {data.recentActivity.filter(
                                  (a) => a.createdBy === agent.name,
                                ).length > 0 && (
                                  <div className="mt-3">
                                    <p
                                      className={`text-[10px] font-semibold uppercase ${t.textMuted} mb-1.5`}
                                    >
                                      Recent Activity
                                    </p>
                                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                                      {data.recentActivity
                                        .filter(
                                          (a) => a.createdBy === agent.name,
                                        )
                                        .slice(0, 10)
                                        .map((a) => (
                                          <div
                                            key={a.id}
                                            className={`flex items-start gap-2 text-[11px] ${t.textSub}`}
                                          >
                                            <span
                                              className={`text-[9px] ${t.textMuted} shrink-0 w-16`}
                                            >
                                              {new Date(
                                                a.createdAt,
                                              ).toLocaleDateString("en-US", {
                                                month: "short",
                                                day: "numeric",
                                              })}
                                            </span>
                                            <span className="flex-1 leading-snug">
                                              {a.caseName && (
                                                <span
                                                  className={`font-medium ${t.text}`}
                                                >
                                                  {a.caseName}:{" "}
                                                </span>
                                              )}
                                              {a.message}
                                            </span>
                                          </div>
                                        ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}

                  {/* Totals row */}
                  {sortedAgents.length > 0 && (
                    <tr
                      className={`border-t-2 ${dark ? "border-neutral-700" : "border-neutral-300"}`}
                    >
                      <td className={`${tdBase}`} />
                      <td className={`${tdBase} font-bold ${t.text}`}>Total</td>
                      <td
                        className={`${tdBase} text-right font-bold ${t.text}`}
                      >
                        {data.totals.totalCalls}
                      </td>
                      <td
                        className={`${tdBase} text-right font-semibold ${t.textSub}`}
                      >
                        {data.totals.ssaCalls}
                      </td>
                      <td
                        className={`${tdBase} text-right font-semibold ${t.textSub}`}
                      >
                        {data.totals.clientCallsIb}
                      </td>
                      <td
                        className={`${tdBase} text-right font-semibold ${t.textSub}`}
                      >
                        {data.totals.clientCallsOb}
                      </td>
                      <td
                        className={`${tdBase} text-right font-semibold ${t.textSub}`}
                      >
                        {data.totals.activityCount}
                      </td>
                      <td
                        className={`${tdBase} text-right font-semibold ${t.textSub}`}
                      >
                        {data.totals.casesTouched}
                      </td>
                      <td
                        className={`${tdBase} text-right font-semibold ${t.textSub}`}
                      >
                        {data.totals.statusChanges}
                      </td>
                      <td
                        className={`${tdBase} text-right font-bold text-emerald-500`}
                      >
                        {data.totals.collected > 0
                          ? fmtFull(data.totals.collected)
                          : "—"}
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
    </div>
  );
};
