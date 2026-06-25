"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { useTheme } from "next-themes";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Trophy,
  Phone,
  Search,
  AlertTriangle,
  AlertCircle,
  Pencil,
  Save,
  X,
  Check,
} from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import { fmt } from "@/lib/formatters";
import { ScoreboardSummaryCards } from "./ScoreboardSummaryCards";
import type { ScoreboardSummary, ScoreboardTeam } from "./ScoreboardSummaryCards";

// ============================================================================
// Types
// ============================================================================

interface AgentScore {
  agent: string;
  team: string | null;
  casesAssigned: number;
  openCases: number;
  casesClosed: number;
  completedWinSheets: number;
  winSheetsCreated: number;
  unpaidT2Over60: number;
  unpaidT16Over60: number;
  unpaidConcOver60: number;
  totalCollected: number;
  feesCollectedInWindow: number;
  casesFullFee: number;
  weekSsaCalls: number;
  weekClientCalls: number;
}

type TeamScore = ScoreboardTeam;
type Summary = ScoreboardSummary;

interface DailyEntry {
  agent: string;
  date: string;
  ssaCalls: number;
  clientCallsIb: number;
  clientCallsOb: number;
  winSheetsCreated: number;
  notes: string | null;
}

interface ScoreboardData {
  week: string;
  summary: Summary;
  agents: AgentScore[];
  teams: TeamScore[];
  daily: DailyEntry[];
}

// Cell value for the entry grid
type CellKey = `${string}|${string}`;
interface CellValues {
  ssaCalls: string;
  clientCallsIb: string;
  clientCallsOb: string;
  winSheetsCreated: string;
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

// Client-side monitoring filters (operate on the loaded week's agents).
type MetricFocus = "all" | "aging" | "calls" | "fees";

const FOCUS_OPTIONS: { value: MetricFocus; label: string }[] = [
  { value: "all", label: "All metrics" },
  { value: "aging", label: "Aging (>60d)" },
  { value: "calls", label: "Calls" },
  { value: "fees", label: "Fees" },
];

// Which focus modes each agent-table column belongs to (besides "all", which
// shows everything). The Agent column is always shown.
const COL_FOCUS: Record<string, MetricFocus[]> = {
  cases: ["aging", "fees"],
  winsheets: ["fees"],
  t2: ["aging"],
  t16: ["aging"],
  conc: ["aging"],
  collected: ["fees"],
  fullfee: ["fees"],
  ssa: ["calls"],
  client: ["calls"],
};

const hasOverdue = (a: AgentScore): boolean =>
  a.unpaidT2Over60 + a.unpaidT16Over60 + a.unpaidConcOver60 > 0;

// Date window mode for the board. Only the call columns are windowed by date.
type DateMode = "week" | "month" | "range";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const firstDayOfMonth = (year: number, month0: number): string =>
  `${year}-${String(month0 + 1).padStart(2, "0")}-01`;

const lastDayOfMonth = (year: number, month0: number): string =>
  new Date(Date.UTC(year, month0 + 1, 0)).toISOString().split("T")[0];

const fmtRangeDate = (iso: string): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

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

  // Monitoring filters (client-side, over the loaded week's agents)
  const [agentSearch, setAgentSearch] = useState("");
  const [needsAttention, setNeedsAttention] = useState(false);
  const [metricFocus, setMetricFocus] = useState<MetricFocus>("all");

  // Date window mode (week nav / month / custom range). Only the call columns
  // are date-windowed server-side; case columns are current-state snapshots.
  const [dateMode, setDateMode] = useState<DateMode>("week");
  const nowForInit = new Date();
  const [monthSel, setMonthSel] = useState(nowForInit.getMonth());
  const [yearSel, setYearSel] = useState(nowForInit.getFullYear());
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");

  const currentYear = nowForInit.getFullYear();
  const yearOptions = useMemo(
    () => Array.from({ length: 5 }, (_, i) => currentYear - i),
    [currentYear],
  );

  // Switching mode closes the (week-only) call-entry panel.
  const changeDateMode = (m: DateMode) => {
    setDateMode(m);
    if (m !== "week") setEntryOpen(false);
  };

  const showCol = (key: string) =>
    metricFocus === "all" || (COL_FOCUS[key] ?? []).includes(metricFocus);

  // Agents after search + needs-attention filters
  const filteredAgents = useMemo(() => {
    const q = agentSearch.trim().toLowerCase();
    return (data?.agents ?? []).filter((a) => {
      if (q && !a.agent.toLowerCase().includes(q)) return false;
      if (needsAttention && !hasOverdue(a)) return false;
      return true;
    });
  }, [data, agentSearch, needsAttention]);

  // Totals recomputed from the filtered set so cards + footer track the filter.
  const filteredSummary = useMemo(
    () => ({
      totalCasesAssigned: filteredAgents.reduce((s, a) => s + a.casesAssigned, 0),
      totalOpenCases: filteredAgents.reduce((s, a) => s + a.openCases, 0),
      totalCasesClosed: filteredAgents.reduce((s, a) => s + a.casesClosed, 0),
      totalCompletedWinSheets: filteredAgents.reduce((s, a) => s + a.completedWinSheets, 0),
      totalWinSheetsCreated: filteredAgents.reduce((s, a) => s + a.winSheetsCreated, 0),
      totalUnpaidT2Over60: filteredAgents.reduce((s, a) => s + a.unpaidT2Over60, 0),
      totalUnpaidT16Over60: filteredAgents.reduce((s, a) => s + a.unpaidT16Over60, 0),
      totalUnpaidConcOver60: filteredAgents.reduce((s, a) => s + a.unpaidConcOver60, 0),
      totalCollected: filteredAgents.reduce((s, a) => s + a.totalCollected, 0),
      totalFeesCollectedInWindow: filteredAgents.reduce((s, a) => s + a.feesCollectedInWindow, 0),
      totalCasesFullFee: filteredAgents.reduce((s, a) => s + a.casesFullFee, 0),
      totalSsaCalls: filteredAgents.reduce((s, a) => s + a.weekSsaCalls, 0),
      totalClientCalls: filteredAgents.reduce((s, a) => s + a.weekClientCalls, 0),
    }),
    [filteredAgents],
  );

  // Call entry state
  const [entryOpen, setEntryOpen] = useState(false);
  const [cells, setCells] = useState<Map<CellKey, CellValues>>(new Map());
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const entryRef = useRef<HTMLDivElement>(null);

  const monday = getMonday(weekOffset);
  const weekDays = getWeekDays(monday);

  // Resolve the active date window → API query string + readiness + label.
  const monthStart = firstDayOfMonth(yearSel, monthSel);
  const monthEnd = lastDayOfMonth(yearSel, monthSel);
  const { query: scoreboardQuery, ready: windowReady } = (() => {
    if (dateMode === "month")
      return { query: `from=${monthStart}&to=${monthEnd}`, ready: true };
    if (dateMode === "range")
      return rangeFrom && rangeTo && rangeFrom <= rangeTo
        ? { query: `from=${rangeFrom}&to=${rangeTo}`, ready: true }
        : { query: "", ready: false };
    return { query: `week=${monday}`, ready: true };
  })();

  const windowLabel =
    dateMode === "month"
      ? `${MONTH_NAMES[monthSel]} ${yearSel}`
      : dateMode === "range"
        ? windowReady
          ? `${fmtRangeDate(rangeFrom)} – ${fmtRangeDate(rangeTo)}`
          : "Select a date range"
        : formatWeekLabel(monday);

  // Fetch scoreboard data
  const fetchAbortRef = useRef<AbortController | null>(null);

  const fetchScoreboard = useCallback(async () => {
    if (!windowReady) {
      setLoading(false);
      return;
    }
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/scoreboard?${scoreboardQuery}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`Failed to fetch scoreboard (${res.status})`);
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
            winSheetsCreated: d.winSheetsCreated > 0 ? String(d.winSheetsCreated) : "",
          });
        }
      }
      setCells(map);
      setDirty(false);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [scoreboardQuery, windowReady]);

  useEffect(() => {
    fetchScoreboard();
    return () => fetchAbortRef.current?.abort();
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

  // Cell accessors
  const EMPTY_CELL: CellValues = { ssaCalls: "", clientCallsIb: "", clientCallsOb: "", winSheetsCreated: "" };

  const getCell = (agent: string, date: string): CellValues =>
    cells.get(cellKey(agent, date)) ?? { ...EMPTY_CELL };

  const setCell = (
    agent: string,
    date: string,
    field: keyof CellValues,
    value: string,
  ) => {
    setCells((prev) => {
      const next = new Map(prev);
      const existing = next.get(cellKey(agent, date)) ?? { ...EMPTY_CELL };
      next.set(cellKey(agent, date), { ...existing, [field]: value });
      return next;
    });
    setDirty(true);
    setSaveMsg(null);
  };

  // Agent weekly totals from cells
  const agentCellTotals = (agent: string) => {
    let ssa = 0, ib = 0, ob = 0, ws = 0;
    for (const day of weekDays) {
      const c = getCell(agent, day.date);
      ssa += parseInt(c.ssaCalls) || 0;
      ib += parseInt(c.clientCallsIb) || 0;
      ob += parseInt(c.clientCallsOb) || 0;
      ws += parseInt(c.winSheetsCreated) || 0;
    }
    return { ssa, ib, ob, ws, total: ssa + ib + ob };
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
        winSheetsCreated: number;
      }[] = [];

      if (data) {
        for (const agent of data.agents) {
          for (const day of weekDays) {
            const c = getCell(agent.agent, day.date);
            const ssa = parseInt(c.ssaCalls) || 0;
            const ib = parseInt(c.clientCallsIb) || 0;
            const ob = parseInt(c.clientCallsOb) || 0;
            const ws = parseInt(c.winSheetsCreated) || 0;
            if (
              ssa > 0 ||
              ib > 0 ||
              ob > 0 ||
              ws > 0 ||
              cells.has(cellKey(agent.agent, day.date))
            ) {
              entries.push({
                agent: agent.agent,
                date: day.date,
                ssaCalls: ssa,
                clientCallsIb: ib,
                clientCallsOb: ob,
                winSheetsCreated: ws,
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

      if (!res.ok) throw new Error(`Failed to save (${res.status})`);

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
              <h3 className={`text-sm font-bold ${t.text}`}>Scoreboard</h3>
              <p className={`text-[11px] ${t.textMuted} mt-0.5`}>
                {windowLabel}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Log Calls is week-only (entry grid is per-day for one week) */}
            {dateMode === "week" && (
              <>
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
              </>
            )}

            {/* Period mode */}
            <select
              value={dateMode}
              onChange={(e) => changeDateMode(e.target.value as DateMode)}
              aria-label="Date period"
              className={`h-8 px-2 rounded-md border text-xs outline-none cursor-pointer ${t.inputBg}`}
            >
              <option value="week">Week</option>
              <option value="month">Month</option>
              <option value="range">Range</option>
            </select>

            {dateMode === "week" && (
              <>
                <button
                  onClick={() => setWeekOffset(weekOffset - 1)}
                  className={`h-8 w-8 rounded-md flex items-center justify-center ${t.hover} ${t.textSub}`}
                  aria-label="Previous week"
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
                  aria-label="Next week"
                >
                  <ChevronRight
                    className={`h-4 w-4 ${weekOffset >= 0 ? "opacity-30" : ""}`}
                  />
                </button>
              </>
            )}

            {dateMode === "month" && (
              <>
                <select
                  value={monthSel}
                  onChange={(e) => setMonthSel(Number(e.target.value))}
                  aria-label="Month"
                  className={`h-8 px-2 rounded-md border text-xs outline-none cursor-pointer ${t.inputBg}`}
                >
                  {MONTH_NAMES.map((m, i) => (
                    <option key={m} value={i}>
                      {m}
                    </option>
                  ))}
                </select>
                <select
                  value={yearSel}
                  onChange={(e) => setYearSel(Number(e.target.value))}
                  aria-label="Year"
                  className={`h-8 px-2 rounded-md border text-xs outline-none cursor-pointer ${t.inputBg}`}
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </>
            )}

            {dateMode === "range" && (
              <>
                <input
                  type="date"
                  value={rangeFrom}
                  onChange={(e) => setRangeFrom(e.target.value)}
                  aria-label="From date"
                  className={`h-8 px-2 rounded-md border text-xs outline-none cursor-pointer ${t.inputBg}`}
                />
                <span className={`text-[11px] ${t.textMuted}`}>to</span>
                <input
                  type="date"
                  value={rangeTo}
                  onChange={(e) => setRangeTo(e.target.value)}
                  aria-label="To date"
                  className={`h-8 px-2 rounded-md border text-xs outline-none cursor-pointer ${t.inputBg}`}
                />
              </>
            )}
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

        {/* Range mode with no/invalid dates picked yet */}
        {!windowReady ? (
          <div
            className={`flex items-center justify-center py-16 text-sm ${t.textMuted}`}
          >
            Pick a start and end date to view the range.
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className={`h-5 w-5 animate-spin ${t.textMuted}`} />
            <span className={`ml-2 text-sm ${t.textSub}`}>
              Loading scoreboard...
            </span>
          </div>
        ) : (
          data && (
            <>
              {/* Summary cards + team breakdown */}
              <div className={`p-4 border-b ${t.borderLight} space-y-4`}>
                <ScoreboardSummaryCards
                  summary={filteredSummary}
                  teams={data.teams ?? []}
                  label={windowLabel}
                  dark={dark}
                  t={t}
                />
              </div>

              {/* Monitoring filters (client-side, current week) */}
              <div
                className={`flex flex-wrap items-center gap-2 px-4 py-3 border-b ${t.borderLight}`}
              >
                <div className="relative">
                  <Search
                    aria-hidden="true"
                    className={`absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 ${t.textMuted}`}
                  />
                  <input
                    value={agentSearch}
                    onChange={(e) => setAgentSearch(e.target.value)}
                    placeholder="Search agent…"
                    className={`h-8 w-44 pl-8 pr-3 rounded-md border text-xs outline-none ${t.inputBg}`}
                  />
                </div>
                <select
                  value={metricFocus}
                  onChange={(e) => setMetricFocus(e.target.value as MetricFocus)}
                  aria-label="Metric focus"
                  className={`h-8 px-2 rounded-md border text-xs outline-none cursor-pointer ${t.inputBg}`}
                >
                  {FOCUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setNeedsAttention((v) => !v)}
                  aria-pressed={needsAttention}
                  className={`h-8 px-3 rounded-md border text-xs font-medium flex items-center gap-1.5 transition-colors ${
                    needsAttention
                      ? dark
                        ? "bg-red-900/30 border-red-700 text-red-300"
                        : "bg-red-50 border-red-300 text-red-700"
                      : `${t.outlineBtn} border`
                  }`}
                >
                  <AlertTriangle aria-hidden="true" className="h-3 w-3" />
                  Needs attention
                </button>
                <span className={`ml-auto text-[11px] ${t.textMuted}`}>
                  {filteredAgents.length} of {data.agents.length} agents
                </span>
              </div>

              {/* Agent table */}
              <div className="overflow-x-auto">
                <table className="w-full min-w-225">
                  <thead>
                    <tr className={`border-b ${t.borderLight}`}>
                      <th className={`${thBase} ${t.textSub} text-left`}>
                        Agent
                      </th>
                      {showCol("cases") && (
                        <th className={`${thBase} ${t.textSub} text-right`}>
                          Cases
                        </th>
                      )}
                      {showCol("winsheets") && (
                        <th className={`${thBase} ${t.textSub} text-right`}>
                          Win Sheets
                        </th>
                      )}
                      {showCol("t2") && (
                        <th
                          className={`${thBase} ${t.textSub} text-right ${dark ? "text-red-400" : "text-red-600"}`}
                        >
                          T2 &gt;60d
                        </th>
                      )}
                      {showCol("t16") && (
                        <th
                          className={`${thBase} ${t.textSub} text-right ${dark ? "text-red-400" : "text-red-600"}`}
                        >
                          T16 &gt;60d
                        </th>
                      )}
                      {showCol("conc") && (
                        <th
                          className={`${thBase} ${t.textSub} text-right ${dark ? "text-red-400" : "text-red-600"}`}
                        >
                          Conc &gt;60d
                        </th>
                      )}
                      {showCol("collected") && (
                        <th className={`${thBase} ${t.textSub} text-right`}>
                          Collected
                        </th>
                      )}
                      {showCol("fullfee") && (
                        <th className={`${thBase} ${t.textSub} text-right`}>
                          Full Fee
                        </th>
                      )}
                      {showCol("ssa") && (
                        <th className={`${thBase} ${t.textSub} text-right`}>
                          SSA Calls
                        </th>
                      )}
                      {showCol("client") && (
                        <th className={`${thBase} ${t.textSub} text-right`}>
                          Client Calls
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAgents.length === 0 ? (
                      <tr>
                        <td
                          colSpan={10}
                          className={`${tdBase} text-center ${t.textMuted} py-8`}
                        >
                          No agents match the current filters.
                        </td>
                      </tr>
                    ) : (
                      filteredAgents.map((a) => (
                        <tr
                          key={a.agent}
                          className={`border-b ${rowBorder} ${rowHover} transition-colors`}
                        >
                          <td className={`${tdBase} ${t.text} font-semibold`}>
                            {a.agent}
                          </td>
                          {showCol("cases") && (
                            <td className={`${tdBase} text-right ${t.text}`}>
                              {a.casesAssigned}
                            </td>
                          )}
                          {showCol("winsheets") && (
                            <td className={`${tdBase} text-right ${t.text}`}>
                              {a.completedWinSheets}
                            </td>
                          )}
                          {showCol("t2") && (
                            <td
                              className={`${tdBase} text-right ${a.unpaidT2Over60 > 0 ? (dark ? "text-red-400 font-medium" : "text-red-600 font-medium") : t.textMuted}`}
                            >
                              {a.unpaidT2Over60}
                            </td>
                          )}
                          {showCol("t16") && (
                            <td
                              className={`${tdBase} text-right ${a.unpaidT16Over60 > 0 ? (dark ? "text-red-400 font-medium" : "text-red-600 font-medium") : t.textMuted}`}
                            >
                              {a.unpaidT16Over60}
                            </td>
                          )}
                          {showCol("conc") && (
                            <td
                              className={`${tdBase} text-right ${a.unpaidConcOver60 > 0 ? (dark ? "text-red-400 font-medium" : "text-red-600 font-medium") : t.textMuted}`}
                            >
                              {a.unpaidConcOver60}
                            </td>
                          )}
                          {showCol("collected") && (
                            <td
                              className={`${tdBase} text-right font-semibold ${a.totalCollected > 0 ? "text-emerald-500" : t.textMuted}`}
                            >
                              {a.totalCollected > 0 ? fmt(a.totalCollected) : "—"}
                            </td>
                          )}
                          {showCol("fullfee") && (
                            <td className={`${tdBase} text-right ${t.text}`}>
                              {a.casesFullFee}
                            </td>
                          )}
                          {showCol("ssa") && (
                            <td
                              className={`${tdBase} text-right ${a.weekSsaCalls > 0 ? t.text : t.textMuted}`}
                            >
                              {a.weekSsaCalls || "—"}
                            </td>
                          )}
                          {showCol("client") && (
                            <td
                              className={`${tdBase} text-right ${a.weekClientCalls > 0 ? t.text : t.textMuted}`}
                            >
                              {a.weekClientCalls || "—"}
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr
                      className={`${dark ? "bg-neutral-800/60" : "bg-neutral-50"}`}
                    >
                      <td className={`${tdBase} font-bold ${t.text}`}>TOTAL</td>
                      {showCol("cases") && (
                        <td className={`${tdBase} text-right font-bold ${t.text}`}>
                          {filteredSummary.totalCasesAssigned}
                        </td>
                      )}
                      {showCol("winsheets") && (
                        <td className={`${tdBase} text-right font-bold ${t.text}`}>
                          {filteredSummary.totalCompletedWinSheets}
                        </td>
                      )}
                      {showCol("t2") && (
                        <td
                          className={`${tdBase} text-right font-bold ${dark ? "text-red-400" : "text-red-600"}`}
                        >
                          {filteredSummary.totalUnpaidT2Over60}
                        </td>
                      )}
                      {showCol("t16") && (
                        <td
                          className={`${tdBase} text-right font-bold ${dark ? "text-red-400" : "text-red-600"}`}
                        >
                          {filteredSummary.totalUnpaidT16Over60}
                        </td>
                      )}
                      {showCol("conc") && (
                        <td
                          className={`${tdBase} text-right font-bold ${dark ? "text-red-400" : "text-red-600"}`}
                        >
                          {filteredSummary.totalUnpaidConcOver60}
                        </td>
                      )}
                      {showCol("collected") && (
                        <td
                          className={`${tdBase} text-right font-bold text-emerald-500`}
                        >
                          {fmt(filteredSummary.totalCollected)}
                        </td>
                      )}
                      {showCol("fullfee") && (
                        <td className={`${tdBase} text-right font-bold ${t.text}`}>
                          {filteredSummary.totalCasesFullFee}
                        </td>
                      )}
                      {showCol("ssa") && (
                        <td className={`${tdBase} text-right font-bold ${t.text}`}>
                          {filteredSummary.totalSsaCalls}
                        </td>
                      )}
                      {showCol("client") && (
                        <td className={`${tdBase} text-right font-bold ${t.text}`}>
                          {filteredSummary.totalClientCalls}
                        </td>
                      )}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )
        )}
      </div>

      {/* Daily Call Entry Panel — week mode only */}
      {entryOpen && data && dateMode === "week" && (
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
                          rowSpan={4}
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
                      <tr className={rowBorder}>
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
                      {/* Row 4: Win Sheets Created */}
                      <tr className={`border-b ${rowBorder}`}>
                        <td
                          className={`px-2 py-1.5 text-[10px] font-medium ${dark ? "text-violet-400" : "text-violet-600"} whitespace-nowrap`}
                        >
                          Win Sheets
                        </td>
                        {weekDays.map((day) => (
                          <td key={day.date} className="px-1 py-1 text-center">
                            <input
                              type="number"
                              min="0"
                              value={getCell(agent.agent, day.date).winSheetsCreated}
                              onChange={(e) =>
                                setCell(agent.agent, day.date, "winSheetsCreated", e.target.value)
                              }
                              placeholder="0"
                              className={miniInput}
                            />
                          </td>
                        ))}
                        <td
                          className={`px-2 py-1 text-center text-[11px] font-semibold tabular-nums ${totals.ws > 0 ? (dark ? "text-violet-400" : "text-violet-600") : t.textMuted}`}
                        >
                          {totals.ws || "—"}
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
