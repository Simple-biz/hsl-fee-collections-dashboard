"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useTheme } from "next-themes";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Trophy,
  Phone,
  // Users,
  AlertCircle,
  Pencil,
  Save,
  X,
  Check,
} from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import { fmt } from "@/lib/formatters";

// ============================================================================
// Types
// ============================================================================

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

interface DailyEntry {
  agent: string;
  date: string;
  ssaCalls: number;
  clientCallsIb: number;
  clientCallsOb: number;
  notes: string | null;
}

interface ScoreboardData {
  week: string;
  summary: Summary;
  agents: AgentScore[];
  daily: DailyEntry[];
}

// Cell value for the entry grid: [ssaCalls, clientCallsIb, clientCallsOb]
type CellKey = `${string}|${string}`;
interface CellValues {
  ssaCalls: string;
  clientCallsIb: string;
  clientCallsOb: string;
}

// ============================================================================
// Helpers
// ============================================================================

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

const getWeekDays = (
  monday: string,
): { date: string; label: string; dayName: string }[] => {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  return days.map((dayName, i) => {
    const d = new Date(monday + "T00:00:00");
    d.setDate(d.getDate() + i);
    const date = d.toISOString().split("T")[0];
    const label = d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    return { date, label, dayName };
  });
};

const cellKey = (agent: string, date: string): CellKey => `${agent}|${date}`;

// ============================================================================
// Component
// ============================================================================

export const Scoreboard = () => {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted ? resolvedTheme === "dark" : false;
  const t = themeClasses(dark);

  const [weekOffset, setWeekOffset] = useState(0);
  const [data, setData] = useState<ScoreboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Call entry state
  const [entryOpen, setEntryOpen] = useState(false);
  const [cells, setCells] = useState<Map<CellKey, CellValues>>(new Map());
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const entryRef = useRef<HTMLDivElement>(null);

  const monday = getMonday(weekOffset);
  const weekDays = getWeekDays(monday);

  // Fetch scoreboard data
  const fetchScoreboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/scoreboard?week=${monday}`);
      if (!res.ok) throw new Error("Failed to fetch scoreboard");
      const json = await res.json();
      setData(json);

      // Pre-populate cells from existing daily data
      const map = new Map<CellKey, CellValues>();
      if (json.daily) {
        for (const d of json.daily as DailyEntry[]) {
          map.set(cellKey(d.agent, d.date), {
            ssaCalls: d.ssaCalls > 0 ? String(d.ssaCalls) : "",
            clientCallsIb: d.clientCallsIb > 0 ? String(d.clientCallsIb) : "",
            clientCallsOb: d.clientCallsOb > 0 ? String(d.clientCallsOb) : "",
          });
        }
      }
      setCells(map);
      setDirty(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [monday]);

  useEffect(() => {
    fetchScoreboard();
  }, [fetchScoreboard]);

  // Auto-scroll to entry panel when opened
  useEffect(() => {
    if (entryOpen && entryRef.current) {
      setTimeout(() => {
        entryRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 50);
    }
  }, [entryOpen]);

  useEffect(() => {
    if (!data) return;

    console.log("FULL SCOREBOARD DATA:", data);
    console.log("Agents:", data.agents);
    console.log("Daily:", data.daily);
    console.log("Summary:", data.summary);
  }, [data]);

  // Cell accessors
  const getCell = (agent: string, date: string): CellValues => {
    return (
      cells.get(cellKey(agent, date)) || {
        ssaCalls: "",
        clientCallsIb: "",
        clientCallsOb: "",
      }
    );
  };

  const setCell = (
    agent: string,
    date: string,
    field: keyof CellValues,
    value: string,
  ) => {
    setCells((prev) => {
      const next = new Map(prev);
      const existing = next.get(cellKey(agent, date)) || {
        ssaCalls: "",
        clientCallsIb: "",
        clientCallsOb: "",
      };
      next.set(cellKey(agent, date), { ...existing, [field]: value });
      return next;
    });
    setDirty(true);
    setSaveMsg(null);
  };

  // Agent weekly totals from cells
  const agentCellTotals = (agent: string) => {
    let ssa = 0,
      ib = 0,
      ob = 0;
    for (const day of weekDays) {
      const c = getCell(agent, day.date);
      ssa += parseInt(c.ssaCalls) || 0;
      ib += parseInt(c.clientCallsIb) || 0;
      ob += parseInt(c.clientCallsOb) || 0;
    }
    return { ssa, ib, ob, total: ssa + ib + ob };
  };

  // Save all cells
  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const entries: {
        agent: string;
        date: string;
        ssaCalls: number;
        clientCallsIb: number;
        clientCallsOb: number;
      }[] = [];

      if (data) {
        for (const agent of data.agents) {
          for (const day of weekDays) {
            const c = getCell(agent.agent, day.date);
            const ssa = parseInt(c.ssaCalls) || 0;
            const ib = parseInt(c.clientCallsIb) || 0;
            const ob = parseInt(c.clientCallsOb) || 0;
            // Only send if there's any value (or if there was previously a value — to allow clearing)
            if (
              ssa > 0 ||
              ib > 0 ||
              ob > 0 ||
              cells.has(cellKey(agent.agent, day.date))
            ) {
              entries.push({
                agent: agent.agent,
                date: day.date,
                ssaCalls: ssa,
                clientCallsIb: ib,
                clientCallsOb: ob,
              });
            }
          }
        }
      }

      if (entries.length === 0) {
        setSaveMsg("Nothing to save");
        setSaving(false);
        return;
      }

      const res = await fetch("/api/daily-metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      });

      if (!res.ok) throw new Error("Failed to save");

      setSaveMsg(`Saved ${entries.length} entries`);
      setDirty(false);
      // Refresh scoreboard to update weekly totals
      await fetchScoreboard();
    } catch (err) {
      setSaveMsg("Error saving: " + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // Style helpers
  const thBase = `py-2.5 px-3 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap`;
  const tdBase = `py-2.5 px-3 text-[12px] whitespace-nowrap tabular-nums`;
  const rowBorder = dark ? "border-neutral-800/50" : "border-neutral-100";
  const rowHover = dark ? "hover:bg-neutral-800/40" : "hover:bg-neutral-50/80";
  const miniInput = `w-12 h-6 px-1 text-center text-[11px] rounded border outline-none tabular-nums ${t.inputBg}`;

  return (
    <div className="space-y-4">
      {/* Main scoreboard card */}
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
              <h3 className={`text-sm font-bold ${t.text}`}>
                Weekly Scoreboard
              </h3>
              <p className={`text-[11px] ${t.textMuted} mt-0.5`}>
                {formatWeekLabel(monday)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEntryOpen(!entryOpen)}
              className={`h-8 px-3 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${
                entryOpen
                  ? dark
                    ? "bg-indigo-900/40 text-indigo-300 border border-indigo-700"
                    : "bg-indigo-50 text-indigo-700 border border-indigo-200"
                  : t.outlineBtn + " border"
              }`}
            >
              <Pencil className="h-3 w-3" />
              {entryOpen ? "Close Entry" : "Log Calls"}
            </button>
            <div
              className={`h-6 w-px ${dark ? "bg-neutral-700" : "bg-neutral-200"}`}
            />
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
                  },
                  {
                    label: "Win Sheets",
                    value: data.summary.totalCompletedWinSheets,
                  },
                  { label: "T2 >60d", value: data.summary.totalUnpaidT2Over60 },
                  {
                    label: "T16 >60d",
                    value: data.summary.totalUnpaidT16Over60,
                  },
                  {
                    label: "Conc >60d",
                    value: data.summary.totalUnpaidConcOver60,
                  },
                  {
                    label: "Collected",
                    value: fmt(data.summary.totalCollected),
                  },
                  { label: "Full Fee", value: data.summary.totalCasesFullFee },
                  { label: "SSA Calls", value: data.summary.totalSsaCalls },
                  {
                    label: "Client Calls",
                    value: data.summary.totalClientCalls,
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
                        <td
                          className={`${tdBase} text-right ${a.weekSsaCalls > 0 ? t.text : t.textMuted}`}
                        >
                          {a.weekSsaCalls || "—"}
                        </td>
                        <td
                          className={`${tdBase} text-right ${a.weekClientCalls > 0 ? t.text : t.textMuted}`}
                        >
                          {a.weekClientCalls || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr
                      className={`${dark ? "bg-neutral-800/60" : "bg-neutral-50"}`}
                    >
                      <td className={`${tdBase} font-bold ${t.text}`}>TOTAL</td>
                      <td
                        className={`${tdBase} text-right font-bold ${t.text}`}
                      >
                        {data.summary.totalCasesAssigned}
                      </td>
                      <td
                        className={`${tdBase} text-right font-bold ${t.text}`}
                      >
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
                      <td
                        className={`${tdBase} text-right font-bold ${t.text}`}
                      >
                        {data.summary.totalCasesFullFee}
                      </td>
                      <td
                        className={`${tdBase} text-right font-bold ${t.text}`}
                      >
                        {data.summary.totalSsaCalls}
                      </td>
                      <td
                        className={`${tdBase} text-right font-bold ${t.text}`}
                      >
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

      {/* Daily Call Entry Panel */}
      {entryOpen && data && (
        <div ref={entryRef} className={`rounded-xl border ${t.card}`}>
          {/* Entry header */}
          <div
            className={`p-4 flex items-center justify-between border-b ${t.borderLight}`}
          >
            <div className="flex items-center gap-3">
              <Phone
                className={`h-4 w-4 ${dark ? "text-indigo-400" : "text-indigo-500"}`}
              />
              <div>
                <h3 className={`text-sm font-bold ${t.text}`}>
                  Daily Call Log
                </h3>
                <p className={`text-[11px] ${t.textMuted} mt-0.5`}>
                  {formatWeekLabel(monday)} — Enter daily SSA &amp; client call
                  counts per agent
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {saveMsg && (
                <span
                  className={`text-xs font-medium ${saveMsg.startsWith("Error") ? "text-red-500" : "text-emerald-500"} flex items-center gap-1`}
                >
                  {!saveMsg.startsWith("Error") && (
                    <Check className="h-3 w-3" />
                  )}
                  {saveMsg}
                </span>
              )}
              <button
                onClick={handleSave}
                disabled={saving || !dirty}
                className={`h-8 px-3 rounded-md text-xs font-semibold flex items-center gap-1.5 ${t.ctaBtn} disabled:opacity-40`}
              >
                {saving ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : (
                  <Save className="h-3 w-3" />
                )}
                Save All
              </button>
              <button
                onClick={() => setEntryOpen(false)}
                className={`h-8 w-8 rounded-md flex items-center justify-center ${t.hover} ${t.textSub}`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Entry grid — single table, 3 rows per agent */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-200">
              <thead>
                <tr className={`border-b ${t.borderLight}`}>
                  <th className={`${thBase} ${t.textSub} text-left w-36`}>
                    Agent
                  </th>
                  <th className={`${thBase} ${t.textSub} text-center w-20`}>
                    Type
                  </th>
                  {weekDays.map((day) => (
                    <th
                      key={day.date}
                      className={`${thBase} ${t.textSub} text-center`}
                    >
                      <div>{day.dayName}</div>
                      <div className={`text-[9px] font-normal ${t.textMuted}`}>
                        {day.label}
                      </div>
                    </th>
                  ))}
                  <th className={`${thBase} ${t.textSub} text-center`}>Week</th>
                </tr>
              </thead>
              <tbody>
                {data.agents.map((agent) => {
                  const totals = agentCellTotals(agent.agent);
                  return (
                    <React.Fragment key={agent.agent}>
                      {/* Row 1: SSA Calls */}
                      <tr className={rowBorder}>
                        <td
                          className={`${tdBase} ${t.text} font-semibold align-middle`}
                          rowSpan={3}
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${dark ? "bg-neutral-700 text-neutral-300" : "bg-neutral-200 text-neutral-600"}`}
                            >
                              {agent.agent[0]}
                            </div>
                            {agent.agent}
                          </div>
                        </td>
                        <td
                          className={`px-2 py-1.5 text-[10px] font-medium ${dark ? "text-blue-400" : "text-blue-600"} whitespace-nowrap`}
                        >
                          SSA
                        </td>
                        {weekDays.map((day) => (
                          <td key={day.date} className="px-1 py-1 text-center">
                            <input
                              type="number"
                              min="0"
                              value={getCell(agent.agent, day.date).ssaCalls}
                              onChange={(e) =>
                                setCell(
                                  agent.agent,
                                  day.date,
                                  "ssaCalls",
                                  e.target.value,
                                )
                              }
                              placeholder="0"
                              className={miniInput}
                            />
                          </td>
                        ))}
                        <td
                          className={`px-2 py-1 text-center text-[11px] font-semibold tabular-nums ${totals.ssa > 0 ? (dark ? "text-blue-400" : "text-blue-600") : t.textMuted}`}
                        >
                          {totals.ssa || "—"}
                        </td>
                      </tr>
                      {/* Row 2: Client IB */}
                      <tr className={rowBorder}>
                        <td
                          className={`px-2 py-1.5 text-[10px] font-medium ${dark ? "text-emerald-400" : "text-emerald-600"} whitespace-nowrap`}
                        >
                          Client IB
                        </td>
                        {weekDays.map((day) => (
                          <td key={day.date} className="px-1 py-1 text-center">
                            <input
                              type="number"
                              min="0"
                              value={
                                getCell(agent.agent, day.date).clientCallsIb
                              }
                              onChange={(e) =>
                                setCell(
                                  agent.agent,
                                  day.date,
                                  "clientCallsIb",
                                  e.target.value,
                                )
                              }
                              placeholder="0"
                              className={miniInput}
                            />
                          </td>
                        ))}
                        <td
                          className={`px-2 py-1 text-center text-[11px] font-semibold tabular-nums ${totals.ib > 0 ? (dark ? "text-emerald-400" : "text-emerald-600") : t.textMuted}`}
                        >
                          {totals.ib || "—"}
                        </td>
                      </tr>
                      {/* Row 3: Client OB */}
                      <tr className={`border-b ${rowBorder}`}>
                        <td
                          className={`px-2 py-1.5 text-[10px] font-medium ${dark ? "text-amber-400" : "text-amber-600"} whitespace-nowrap`}
                        >
                          Client OB
                        </td>
                        {weekDays.map((day) => (
                          <td key={day.date} className="px-1 py-1 text-center">
                            <input
                              type="number"
                              min="0"
                              value={
                                getCell(agent.agent, day.date).clientCallsOb
                              }
                              onChange={(e) =>
                                setCell(
                                  agent.agent,
                                  day.date,
                                  "clientCallsOb",
                                  e.target.value,
                                )
                              }
                              placeholder="0"
                              className={miniInput}
                            />
                          </td>
                        ))}
                        <td
                          className={`px-2 py-1 text-center text-[11px] font-semibold tabular-nums ${totals.ob > 0 ? (dark ? "text-amber-400" : "text-amber-600") : t.textMuted}`}
                        >
                          {totals.ob || "—"}
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
              {/* Grand totals */}
              <tfoot>
                <tr
                  className={`${dark ? "bg-neutral-800/60" : "bg-neutral-50"}`}
                >
                  <td className={`${tdBase} font-bold ${t.text}`}>TOTAL</td>
                  <td
                    className={`px-2 py-1.5 text-[10px] font-bold ${t.textSub}`}
                  >
                    All
                  </td>
                  {weekDays.map((day) => {
                    let dayTotal = 0;
                    for (const agent of data.agents) {
                      const c = getCell(agent.agent, day.date);
                      dayTotal +=
                        (parseInt(c.ssaCalls) || 0) +
                        (parseInt(c.clientCallsIb) || 0) +
                        (parseInt(c.clientCallsOb) || 0);
                    }
                    return (
                      <td
                        key={day.date}
                        className={`px-2 py-1.5 text-center text-[11px] font-bold tabular-nums ${dayTotal > 0 ? t.text : t.textMuted}`}
                      >
                        {dayTotal || "—"}
                      </td>
                    );
                  })}
                  <td
                    className={`px-2 py-1.5 text-center text-[11px] font-bold tabular-nums ${t.text}`}
                  >
                    {data.agents.reduce(
                      (sum, a) => sum + agentCellTotals(a.agent).total,
                      0,
                    ) || "—"}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
