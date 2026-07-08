"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Phone,
  Search,
  AlertTriangle,
  AlertCircle,
  Pencil,
  Save,
  X,
  Check,
  ExternalLink,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { themeClasses } from "@/lib/theme-classes";
import { fmt, fmtDate, namesMatch, getMonday, formatWeekLabel } from "@/lib/formatters";
import { teamBadgeClasses } from "@/lib/team-colors";
import { useCapabilities } from "@/hooks/useCapabilities";
import {
  ScoreboardSummaryCards,
  ScoreboardSummary,
  ScoreboardTeam,
} from "@/components/scoreboard/ScoreboardSummaryCards";

// ---------- types ----------

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
  unpaidT2Over90: number;
  unpaidT16Over90: number;
  unpaidConcOver90: number;
  totalCollected: number;
  feesCollectedInWindow: number;
  casesFullFee: number;
  weekSsaCalls: number;
  weekClientCalls: number;
  weekFaxSent: number;
  openNoFees: number;
  openPartial: number;
  openPif: number;
}

interface DailyEntry {
  agent: string;
  date: string;
  ssaCalls: number;
  clientCallsIb: number;
  clientCallsOb: number;
  winSheetsCreated: number;
  faxSent: number;
  notes: string | null;
}

interface NoFeesCaseRow {
  id: number;
  name: string;
  externalId: string | null;
  assigned: string;
  claim: string;
  approvalDate: string | null;
  daysSinceApproval: number;
}

interface TrackerData {
  agents: AgentScore[];
  daily: DailyEntry[];
  summary: ScoreboardSummary | null;
  teams: ScoreboardTeam[];
  openCasesFeesStatus: { noFees: number };
  noFeesAging: { over60: number; over90: number };
  noFeesCases: NoFeesCaseRow[];
}

type CellKey = `${string}|${string}`;
interface CellValues {
  ssaCalls: string;
  clientCallsIb: string;
  clientCallsOb: string;
  winSheetsCreated: string;
  faxSent: string;
}

type MetricFocus = "all" | "aging" | "fees";

const FOCUS_OPTIONS: { value: MetricFocus; label: string }[] = [
  { value: "all",   label: "All metrics"  },
  { value: "aging", label: "Aging (>60d)" },
  { value: "fees",  label: "Fees"         },
];

const COL_FOCUS: Record<string, MetricFocus[]> = {
  cases:        ["aging", "fees"],
  closedcases:  ["aging", "fees"],
  ssacalls:    [],
  clientcalls: [],
  faxsent:     [],
  winsheets:   ["fees"],
  collected:   ["fees"],
  opennofees:  ["fees"],
};

type DateMode = "week" | "month" | "range" | "day";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ---------- helpers ----------

// Local getters, never toISOString() — that converts to UTC and rolls the
// date back a day for anyone east of UTC (e.g. Philippines, UTC+8) on any
// local date built via setDate()/local-midnight parsing.
const toLocalIso = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

const getWeekDays = (monday: string) => {
  return ["Mon", "Tue", "Wed", "Thu", "Fri"].map((dayName, i) => {
    const d = new Date(monday + "T00:00:00");
    d.setDate(d.getDate() + i);
    return {
      date: toLocalIso(d),
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      dayName,
    };
  });
};

const firstDayOfMonth = (year: number, month0: number): string =>
  `${year}-${String(month0 + 1).padStart(2, "0")}-01`;

const lastDayOfMonth = (year: number, month0: number): string =>
  new Date(Date.UTC(year, month0 + 1, 0)).toISOString().split("T")[0];

const fmtRangeDate = (iso: string): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });

const cellKey = (agent: string, date: string): CellKey => `${agent}|${date}`;
const EMPTY_CELL: CellValues = { ssaCalls: "", clientCallsIb: "", clientCallsOb: "", winSheetsCreated: "", faxSent: "" };

const hasOverdue = (a: AgentScore, t2d: 60 | 90, t16d: 60 | 90, concd: 60 | 90) =>
  (t2d === 60 ? a.unpaidT2Over60 : a.unpaidT2Over90) +
  (t16d === 60 ? a.unpaidT16Over60 : a.unpaidT16Over90) +
  (concd === 60 ? a.unpaidConcOver60 : a.unpaidConcOver90) > 0;

// ---------- component ----------

interface ScoreboardTrackerProps {
  dark: boolean;
  t: ReturnType<typeof themeClasses>;
}

export function ScoreboardTracker({ dark, t }: ScoreboardTrackerProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [data, setData] = useState<TrackerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [agentSearch, setAgentSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("all");
  // The T2/T16/Conc aging columns (and their 60d/90d toggle buttons) were
  // removed from the table, but "Needs attention" still checks these
  // thresholds under the hood — fixed at 60d since there's no UI to change it.
  const t2Days: 60 | 90 = 60;
  const t16Days: 60 | 90 = 60;
  const concDays: 60 | 90 = 60;
  const [needsAttention, setNeedsAttention] = useState(false);
  const [metricFocus, setMetricFocus] = useState<MetricFocus>("all");

  const [dateMode, setDateMode] = useState<DateMode>("week");
  const nowForInit = new Date();
  const [monthSel, setMonthSel] = useState(nowForInit.getMonth());
  const [yearSel, setYearSel] = useState(nowForInit.getFullYear());
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [daySel, setDaySel] = useState(() =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date()),
  );

  const [entryOpen, setEntryOpen] = useState(false);
  const [cells, setCells] = useState<Map<CellKey, CellValues>>(new Map());
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const entryRef = useRef<HTMLDivElement>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const saveAbortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);

  const { data: session } = useSession();
  const userName = session?.user?.name;
  const { can } = useCapabilities();
  const canEditAgent = (agentName: string) =>
    can("dailyMetrics.editOthers") || namesMatch(agentName, userName);

  const currentYear = nowForInit.getFullYear();
  const yearOptions = useMemo(
    () => Array.from({ length: 5 }, (_, i) => currentYear - i),
    [currentYear],
  );

  const changeDateMode = (m: DateMode) => {
    setDateMode(m);
    if (m !== "week" && m !== "day") setEntryOpen(false);
  };

  const showCol = (key: string) =>
    metricFocus === "all" || (COL_FOCUS[key] ?? []).includes(metricFocus);

  const monday = getMonday(weekOffset);
  const weekDays = getWeekDays(monday);

  const todayEt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());

  // Days shown in the entry panel — 5 weekdays in week mode, one day in day mode.
  const entryDays =
    dateMode === "day" && daySel
      ? [{
          date: daySel,
          label: new Date(daySel + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
          dayName: new Date(daySel + "T00:00:00").toLocaleDateString("en-US", { weekday: "short" }),
        }]
      : weekDays;

  const monthStart = firstDayOfMonth(yearSel, monthSel);
  const monthEnd = lastDayOfMonth(yearSel, monthSel);

  const { query: scoreboardQuery, ready: windowReady } = (() => {
    if (dateMode === "day")
      return daySel
        ? { query: `from=${daySel}&to=${daySel}`, ready: true }
        : { query: "", ready: false };
    if (dateMode === "month")
      return { query: `from=${monthStart}&to=${monthEnd}`, ready: true };
    if (dateMode === "range")
      return rangeFrom && rangeTo && rangeFrom <= rangeTo
        ? { query: `from=${rangeFrom}&to=${rangeTo}`, ready: true }
        : { query: "", ready: false };
    return { query: `week=${monday}`, ready: true };
  })();

  const windowLabel =
    dateMode === "day"
      ? daySel
        ? fmtRangeDate(daySel) + (daySel === todayEt ? " (Today)" : "")
        : "Select a date"
      : dateMode === "month"
        ? `${MONTH_NAMES[monthSel]} ${yearSel}`
        : dateMode === "range"
          ? windowReady
            ? `${fmtRangeDate(rangeFrom)} – ${fmtRangeDate(rangeTo)}`
            : "Select a date range"
          : formatWeekLabel(monday);

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
      if (!res.ok) throw new Error(`Failed to fetch agent tracking (${res.status})`);
      const json = await res.json();
      if (cancelledRef.current) return;
      setData({
        // Team leads are counted in data.teams' financial rollups (computed
        // server-side from the full roster) but excluded from this per-agent
        // breakdown — they aren't scored individually like line agents.
        agents: (json.agents ?? [])
          .filter((a: AgentScore & { role?: string | null }) => a.role !== "team_lead")
          .map((a: AgentScore) => ({
          ...a,
          unpaidT2Over90:   a.unpaidT2Over90   ?? 0,
          unpaidT16Over90:  a.unpaidT16Over90  ?? 0,
          unpaidConcOver90: a.unpaidConcOver90 ?? 0,
          weekFaxSent:      a.weekFaxSent      ?? 0,
          openNoFees:       a.openNoFees       ?? 0,
          openPartial:      a.openPartial      ?? 0,
          openPif:          a.openPif          ?? 0,
        })),
        daily: json.daily ?? [],
        summary: json.summary ?? null,
        teams: json.teams ?? [],
        openCasesFeesStatus: json.openCasesFeesStatus ?? { noFees: 0 },
        noFeesAging: json.noFeesAging ?? { over60: 0, over90: 0 },
        noFeesCases: json.noFeesCases ?? [],
      });
      const map = new Map<CellKey, CellValues>();
      for (const d of (json.daily ?? []) as DailyEntry[]) {
        map.set(cellKey(d.agent, d.date), {
          ssaCalls:        d.ssaCalls        > 0 ? String(d.ssaCalls)        : "",
          clientCallsIb:   d.clientCallsIb   > 0 ? String(d.clientCallsIb)   : "",
          clientCallsOb:   d.clientCallsOb   > 0 ? String(d.clientCallsOb)   : "",
          winSheetsCreated: d.winSheetsCreated > 0 ? String(d.winSheetsCreated) : "",
          faxSent:         d.faxSent         > 0 ? String(d.faxSent)         : "",
        });
      }
      setCells(map);
      setDirty(false);
    } catch (err) {
      if ((err as Error).name === "AbortError" || cancelledRef.current) return;
      setError((err as Error).message);
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, [scoreboardQuery, windowReady]);

  useEffect(() => {
    cancelledRef.current = false;
    fetchScoreboard();
    return () => {
      cancelledRef.current = true;
      fetchAbortRef.current?.abort();
      saveAbortRef.current?.abort();
    };
  }, [fetchScoreboard]);

  useEffect(() => {
    if (entryOpen && entryRef.current) {
      const timer = setTimeout(() => entryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
      return () => clearTimeout(timer);
    }
  }, [entryOpen]);

  const filteredAgents = useMemo(() => {
    const q = agentSearch.trim().toLowerCase();
    return (data?.agents ?? [])
      .filter((a) => {
        if (q && !a.agent.toLowerCase().includes(q)) return false;
        if (teamFilter !== "all" && a.team !== teamFilter) return false;
        if (needsAttention && !hasOverdue(a, t2Days, t16Days, concDays)) return false;
        return true;
      })
      // Alphabetical by name — the underlying query orders by team then
      // name, which left agents with no team (a handful of departed staff)
      // clustered at the very bottom instead of sorted in with everyone else.
      .sort((a, b) => a.agent.localeCompare(b.agent));
  }, [data, agentSearch, teamFilter, t2Days, t16Days, concDays, needsAttention]);

  const filteredTotals = useMemo(() => ({
    casesAssigned:      filteredAgents.reduce((s, a) => s + a.casesAssigned, 0),
    openCases:          filteredAgents.reduce((s, a) => s + a.openCases, 0),
    casesClosed:        filteredAgents.reduce((s, a) => s + a.casesClosed, 0),
    weekSsaCalls:       filteredAgents.reduce((s, a) => s + a.weekSsaCalls, 0),
    weekClientCalls:    filteredAgents.reduce((s, a) => s + a.weekClientCalls, 0),
    weekFaxSent:        filteredAgents.reduce((s, a) => s + a.weekFaxSent, 0),
    completedWinSheets: filteredAgents.reduce((s, a) => s + a.completedWinSheets, 0),
    unpaidT2Over60:     filteredAgents.reduce((s, a) => s + a.unpaidT2Over60, 0),
    unpaidT16Over60:    filteredAgents.reduce((s, a) => s + a.unpaidT16Over60, 0),
    unpaidConcOver60:   filteredAgents.reduce((s, a) => s + a.unpaidConcOver60, 0),
    unpaidT2Over90:     filteredAgents.reduce((s, a) => s + a.unpaidT2Over90, 0),
    unpaidT16Over90:    filteredAgents.reduce((s, a) => s + a.unpaidT16Over90, 0),
    unpaidConcOver90:   filteredAgents.reduce((s, a) => s + a.unpaidConcOver90, 0),
    totalCollected:     filteredAgents.reduce((s, a) => s + a.totalCollected, 0),
    feesCollectedInWindow: filteredAgents.reduce((s, a) => s + a.feesCollectedInWindow, 0),
    casesFullFee:       filteredAgents.reduce((s, a) => s + a.casesFullFee, 0),
    openNoFees:         filteredAgents.reduce((s, a) => s + a.openNoFees, 0),
    openPartial:        filteredAgents.reduce((s, a) => s + a.openPartial, 0),
    openPif:            filteredAgents.reduce((s, a) => s + a.openPif, 0),
  }), [filteredAgents]);

  const getCell = (agent: string, date: string): CellValues =>
    cells.get(cellKey(agent, date)) ?? { ...EMPTY_CELL };

  const setCell = (agent: string, date: string, field: keyof CellValues, value: string) => {
    setCells((prev) => {
      const next = new Map(prev);
      const existing = next.get(cellKey(agent, date)) ?? { ...EMPTY_CELL };
      next.set(cellKey(agent, date), { ...existing, [field]: value });
      return next;
    });
    setDirty(true);
    setSaveMsg(null);
  };

  const agentCellTotals = (agent: string) => {
    let ssa = 0, ib = 0, ob = 0, ws = 0, fax = 0;
    for (const day of entryDays) {
      const c = getCell(agent, day.date);
      ssa += parseInt(c.ssaCalls) || 0;
      ib  += parseInt(c.clientCallsIb) || 0;
      ob  += parseInt(c.clientCallsOb) || 0;
      ws  += parseInt(c.winSheetsCreated) || 0;
      fax += parseInt(c.faxSent) || 0;
    }
    return { ssa, ib, ob, ws, fax, total: ssa + ib + ob };
  };

  const handleSave = async () => {
    saveAbortRef.current?.abort();
    const controller = new AbortController();
    saveAbortRef.current = controller;
    setSaving(true);
    setSaveMsg(null);
    try {
      const entries: {
        agent: string; date: string;
        ssaCalls: number; clientCallsIb: number; clientCallsOb: number; winSheetsCreated: number; faxSent: number;
      }[] = [];
      if (data) {
        for (const agent of data.agents.filter((a) => canEditAgent(a.agent))) {
          for (const day of entryDays) {
            const c = getCell(agent.agent, day.date);
            const ssa = parseInt(c.ssaCalls) || 0;
            const ib  = parseInt(c.clientCallsIb) || 0;
            const ob  = parseInt(c.clientCallsOb) || 0;
            const ws  = parseInt(c.winSheetsCreated) || 0;
            const fax = parseInt(c.faxSent) || 0;
            if (ssa > 0 || ib > 0 || ob > 0 || ws > 0 || fax > 0 || cells.has(cellKey(agent.agent, day.date))) {
              entries.push({ agent: agent.agent, date: day.date, ssaCalls: ssa, clientCallsIb: ib, clientCallsOb: ob, winSheetsCreated: ws, faxSent: fax });
            }
          }
        }
      }
      if (entries.length === 0) { setSaveMsg("Nothing to save"); setSaving(false); return; }
      const res = await fetch("/api/daily-metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
        signal: saveAbortRef.current.signal,
      });
      if (!res.ok) throw new Error(`Failed to save (${res.status})`);
      const json = await res.json();
      setSaveMsg(`Saved ${json.count ?? entries.length} entries`);
      setDirty(false);
      await fetchScoreboard();
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setSaveMsg("Error saving: " + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const adjustDay = (delta: number) => {
    const [y, m, d] = daySel.split("-").map(Number);
    const date = new Date(y, m - 1, d + delta);
    setDaySel(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`);
  };

  const thBase = `py-2.5 px-3 text-[12px] font-semibold uppercase tracking-wider whitespace-nowrap`;
  const tdBase = `py-2.5 px-3 text-[14px] whitespace-nowrap tabular-nums`;
  const rowBorder = dark ? "border-neutral-800/50" : "border-neutral-100";
  const rowHover  = dark ? "hover:bg-neutral-800/40" : "hover:bg-neutral-50/80";
  const miniInput = `w-12 h-6 px-1 text-center text-[13px] rounded border outline-none tabular-nums ${t.inputBg}`;

  return (
    <div className="space-y-4">
      {/* Team statistics — rendered once data arrives */}
      {data?.summary && data.teams.length > 0 && (
        <div className={`rounded-xl border p-4 space-y-4 ${t.card}`}>
          <ScoreboardSummaryCards
            summary={data.summary}
            teams={data.teams}
            label={windowLabel}
            dark={dark}
            t={t}
            showMiniCards={false}
          />
        </div>
      )}

      {/* Open Cases — Fees Status */}
      {data?.openCasesFeesStatus && (
        <div className={`rounded-xl border ${t.card} overflow-hidden`}>
          <div className={`px-4 py-2.5 text-center text-xs font-bold ${t.text} border-b ${t.borderLight}`}>
            Open Cases (Fees Status)
          </div>
          <div className={`grid grid-cols-3 divide-x divide-dashed ${dark ? "divide-neutral-700" : "divide-neutral-200"}`}>
            {[
              { label: "No Fees",              value: data.openCasesFeesStatus.noFees, tone: dark ? "text-amber-400" : "text-amber-600" },
              { label: "No Fees 60–90 Days",    value: data.noFeesAging.over60,         tone: dark ? "text-orange-400" : "text-orange-600" },
              { label: "No Fees Over 90 Days",  value: data.noFeesAging.over90,         tone: dark ? "text-red-400"   : "text-red-600"   },
            ].map(({ label, value, tone }) => (
              <div key={label} className="py-3 text-center">
                <div className={`text-[12px] font-semibold uppercase tracking-wider ${t.textMuted} mb-1`}>{label}</div>
                <div className={`text-xl font-extrabold tabular-nums ${tone}`}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Fees Cases — actual aging cases, for reporting */}
      {data?.noFeesAging && (
        <div className={`rounded-xl border ${t.card} overflow-hidden`}>
          <div className={`px-4 py-2.5 flex items-center justify-between border-b ${t.borderLight}`}>
            <span className={`text-xs font-bold ${t.text}`}>No Fees Cases</span>
            <span className="text-[13px] font-medium tabular-nums">
              <span className={dark ? "text-amber-400" : "text-amber-600"}>{data.noFeesAging.over60} 60–90 days</span>
              <span className={t.textMuted}> · </span>
              <span className={dark ? "text-red-400" : "text-red-600"}>{data.noFeesAging.over90} over 90 days</span>
            </span>
          </div>
          {data.noFeesCases.length === 0 ? (
            <div className={`py-6 text-center text-xs ${t.textMuted}`}>No aging no-fee cases.</div>
          ) : (
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full">
                <thead>
                  <tr className={`border-b ${t.borderLight}`}>
                    <th className={`${thBase} ${t.textSub} text-left`}>Case Name</th>
                    <th className={`${thBase} ${t.textSub} text-left`}>Assigned</th>
                    <th className={`${thBase} ${t.textSub} text-left`}>Claim</th>
                    <th className={`${thBase} ${t.textSub} text-left`}>Approval</th>
                    <th className={`${thBase} ${t.textSub} text-right`}>Days</th>
                  </tr>
                </thead>
                <tbody>
                  {data.noFeesCases.map((c) => (
                    <tr key={c.id} className={`border-b ${rowBorder} ${rowHover}`}>
                      <td className={`${tdBase} ${t.text} font-medium`}>
                        {c.externalId ? (
                          <a
                            href={c.externalId}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 hover:underline"
                          >
                            {c.name}
                            <ExternalLink className="h-3 w-3 opacity-50" aria-hidden="true" />
                          </a>
                        ) : (
                          c.name
                        )}
                      </td>
                      <td className={`${tdBase} ${t.textSub}`}>{c.assigned}</td>
                      <td className={`${tdBase} ${t.textSub}`}>{c.claim}</td>
                      <td className={`${tdBase} ${t.textSub}`}>{fmtDate(c.approvalDate)}</td>
                      <td
                        className={`${tdBase} text-right font-semibold ${
                          c.daysSinceApproval > 90
                            ? dark ? "text-red-400" : "text-red-600"
                            : dark ? "text-amber-400" : "text-amber-600"
                        }`}
                      >
                        {c.daysSinceApproval}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Agent tracking card */}
      <div className={`rounded-xl border ${t.card}`}>
        {/* Header */}
        <div className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b ${t.borderLight}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${dark ? "bg-amber-900/40" : "bg-amber-50"}`}>
              <Phone className={`h-5 w-5 ${dark ? "text-amber-400" : "text-amber-600"}`} aria-hidden="true" />
            </div>
            <div>
              <h3 className={`text-sm font-bold ${t.text}`}>Agent Tracking</h3>
              <p className={`text-[13px] ${t.textMuted} mt-0.5`}>{windowLabel}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(dateMode === "week" || dateMode === "day") && (
              <>
                <button
                  onClick={() => setEntryOpen(!entryOpen)}
                  className={`h-8 px-3 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${
                    entryOpen
                      ? dark
                        ? "bg-indigo-900/40 text-indigo-300 border border-indigo-700"
                        : "bg-indigo-50 text-indigo-700 border border-indigo-200"
                      : `${t.outlineBtn} border`
                  }`}
                >
                  <Pencil className="h-3 w-3" aria-hidden="true" />
                  {entryOpen ? "Close Entry" : "Log Calls"}
                </button>
                <div className={`h-6 w-px ${dark ? "bg-neutral-700" : "bg-neutral-200"}`} />
              </>
            )}

            <select
              value={dateMode}
              onChange={(e) => changeDateMode(e.target.value as DateMode)}
              aria-label="Date period"
              className={`h-8 px-2 rounded-md border text-xs outline-none cursor-pointer ${t.inputBg}`}
            >
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
              <option value="range">Range</option>
            </select>

            {dateMode === "day" && (
              <>
                <button
                  onClick={() => adjustDay(-1)}
                  className={`h-8 w-8 rounded-md flex items-center justify-center ${t.hover} ${t.textSub}`}
                  aria-label="Previous day"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </button>
                <input
                  type="date"
                  value={daySel}
                  max={todayEt}
                  onChange={(e) => setDaySel(e.target.value)}
                  aria-label="Select date"
                  className={`h-8 px-2 rounded-md border text-xs outline-none ${t.inputBg}`}
                />
                {daySel !== todayEt && (
                  <button
                    onClick={() => setDaySel(todayEt)}
                    className={`h-8 px-3 rounded-md text-xs font-medium ${dark ? "bg-neutral-800 text-neutral-300" : "bg-neutral-100 text-neutral-700"}`}
                  >
                    Today
                  </button>
                )}
                <button
                  onClick={() => adjustDay(1)}
                  disabled={daySel >= todayEt}
                  className={`h-8 w-8 rounded-md flex items-center justify-center ${t.hover} ${t.textSub}`}
                  aria-label="Next day"
                >
                  <ChevronRight className={`h-4 w-4 ${daySel >= todayEt ? "opacity-30" : ""}`} aria-hidden="true" />
                </button>
              </>
            )}

            {dateMode === "week" && (
              <>
                <button
                  onClick={() => setWeekOffset(weekOffset - 1)}
                  className={`h-8 w-8 rounded-md flex items-center justify-center ${t.hover} ${t.textSub}`}
                  aria-label="Previous week"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  onClick={() => setWeekOffset(0)}
                  className={`h-8 px-3 rounded-md text-xs font-medium ${dark ? "bg-neutral-800 text-neutral-300" : "bg-neutral-100 text-neutral-700"}`}
                >
                  This Week
                </button>
                <button
                  onClick={() => setWeekOffset(weekOffset + 1)}
                  disabled={weekOffset >= 0}
                  className={`h-8 w-8 rounded-md flex items-center justify-center ${t.hover} ${t.textSub}`}
                  aria-label="Next week"
                >
                  <ChevronRight className={`h-4 w-4 ${weekOffset >= 0 ? "opacity-30" : ""}`} aria-hidden="true" />
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
                    <option key={m} value={i}>{m}</option>
                  ))}
                </select>
                <select
                  value={yearSel}
                  onChange={(e) => setYearSel(Number(e.target.value))}
                  aria-label="Year"
                  className={`h-8 px-2 rounded-md border text-xs outline-none cursor-pointer ${t.inputBg}`}
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>{y}</option>
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
                  className={`h-8 px-2 rounded-md border text-xs outline-none ${t.inputBg}`}
                />
                <span className={`text-[13px] ${t.textMuted}`}>to</span>
                <input
                  type="date"
                  value={rangeTo}
                  onChange={(e) => setRangeTo(e.target.value)}
                  aria-label="To date"
                  className={`h-8 px-2 rounded-md border text-xs outline-none ${t.inputBg}`}
                />
              </>
            )}
          </div>
        </div>

        {error && (
          <div
            className={`m-4 rounded-lg border p-3 flex items-center gap-2 ${dark ? "bg-red-900/20 border-red-800 text-red-400" : "bg-red-50 border-red-200 text-red-700"}`}
            role="alert"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="text-xs">{error}</span>
          </div>
        )}

        {!windowReady ? (
          <div className={`flex items-center justify-center py-16 text-sm ${t.textMuted}`}>
            Pick a start and end date to view the range.
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className={`h-5 w-5 animate-spin ${t.textMuted}`} aria-hidden="true" />
            <span className={`ml-2 text-sm ${t.textSub}`}>Loading agent tracking...</span>
          </div>
        ) : data && (
          <>
            {/* Monitoring filters */}
            <div className={`flex flex-wrap items-center gap-2 px-4 py-3 border-b ${t.borderLight}`}>
              <div className="relative">
                <Search aria-hidden="true" className={`absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 ${t.textMuted}`} />
                <input
                  value={agentSearch}
                  onChange={(e) => setAgentSearch(e.target.value)}
                  placeholder="Search agent…"
                  className={`h-8 w-44 pl-8 pr-3 rounded-md border text-xs outline-none ${t.inputBg}`}
                />
              </div>
              <select
                value={teamFilter}
                onChange={(e) => setTeamFilter(e.target.value)}
                aria-label="Team filter"
                className={`h-8 px-2 rounded-md border text-xs outline-none cursor-pointer ${t.inputBg}`}
              >
                <option value="all">All Teams</option>
                <option value="T2">T2</option>
                <option value="T16">T16</option>
                <option value="Concurrent">Concurrent</option>
              </select>
              <select
                value={metricFocus}
                onChange={(e) => setMetricFocus(e.target.value as MetricFocus)}
                aria-label="Metric focus"
                className={`h-8 px-2 rounded-md border text-xs outline-none cursor-pointer ${t.inputBg}`}
              >
                {FOCUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
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
              <span className={`ml-auto text-[13px] ${t.textMuted}`}>
                {filteredAgents.length} of {data.agents.length} agents
              </span>
            </div>

            {/* Agent table */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-225">
                <thead>
                  <tr className={`border-b ${t.borderLight}`}>
                    <th className={`${thBase} ${t.textSub} text-left`}>Agent</th>
                    {showCol("cases")       && <th className={`${thBase} ${t.textSub} text-right`}>Open</th>}
                    {showCol("closedcases") && <th className={`${thBase} ${t.textSub} text-right`}>Closed</th>}
                    {showCol("opennofees")  && <th className={`${thBase} text-right ${dark ? "text-amber-400" : "text-amber-600"}`}>No Fees</th>}
                    {showCol("collected")   && <th className={`${thBase} ${t.textSub} text-right`}>Collected</th>}
                    {showCol("ssacalls")    && <th className={`${thBase} text-right border-l ${t.borderLight} ${dark ? "text-sky-400" : "text-sky-600"}`}>SSA Calls</th>}
                    {showCol("clientcalls") && <th className={`${thBase} text-right ${dark ? "text-indigo-400" : "text-indigo-600"}`}>Client Calls</th>}
                    {showCol("faxsent")     && <th className={`${thBase} ${t.textSub} text-right`}>Fax Sent</th>}
                    {showCol("winsheets")   && <th className={`${thBase} ${t.textSub} text-right`}>Win Sheets</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredAgents.length === 0 ? (
                    <tr>
                      <td colSpan={9} className={`${tdBase} text-center ${t.textMuted} py-8`}>
                        No agents match the current filters.
                      </td>
                    </tr>
                  ) : filteredAgents.map((a) => (
                    <tr key={a.agent} className={`border-b ${rowBorder} ${rowHover} transition-colors`}>
                      <td className={`${tdBase} ${t.text} font-semibold`}>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 ${teamBadgeClasses(a.team, dark)}`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" aria-hidden="true" />
                          {a.agent}
                        </span>
                      </td>
                      {showCol("cases")       && <td className={`${tdBase} text-right ${t.text}`}>{a.openCases}</td>}
                      {showCol("closedcases") && <td className={`${tdBase} text-right ${t.textSub}`}>{a.casesClosed}</td>}
                      {showCol("opennofees")  && <td className={`${tdBase} text-right ${a.openNoFees  > 0 ? (dark ? "text-amber-400"   : "text-amber-600")   : t.textMuted}`}>{a.openNoFees}</td>}
                      {showCol("collected") && (
                        <td className={`${tdBase} text-right font-semibold ${a.feesCollectedInWindow > 0 ? "text-emerald-500" : t.textMuted}`}>
                          {a.feesCollectedInWindow > 0 ? fmt(a.feesCollectedInWindow) : "—"}
                        </td>
                      )}
                      {showCol("ssacalls")    && <td className={`${tdBase} text-right border-l ${t.borderLight} ${dark ? "text-sky-400" : "text-sky-600"}`}>{a.weekSsaCalls}</td>}
                      {showCol("clientcalls") && <td className={`${tdBase} text-right ${dark ? "text-indigo-400" : "text-indigo-600"}`}>{a.weekClientCalls}</td>}
                      {showCol("faxsent")     && <td className={`${tdBase} text-right ${t.textSub}`}>{a.weekFaxSent}</td>}
                      {showCol("winsheets")   && <td className={`${tdBase} text-right ${t.text}`}>{a.completedWinSheets}</td>}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className={dark ? "bg-neutral-800/60" : "bg-neutral-50"}>
                    <td className={`${tdBase} font-bold ${t.text}`}>TOTAL</td>
                    {showCol("cases")       && <td className={`${tdBase} text-right font-bold ${t.text}`}>{filteredTotals.openCases}</td>}
                    {showCol("closedcases") && <td className={`${tdBase} text-right font-bold ${t.textSub}`}>{filteredTotals.casesClosed}</td>}
                    {showCol("opennofees")  && <td className={`${tdBase} text-right font-bold ${dark ? "text-amber-400"   : "text-amber-600"}`}>{filteredTotals.openNoFees}</td>}
                    {showCol("collected")   && <td className={`${tdBase} text-right font-bold text-emerald-500`}>{fmt(filteredTotals.feesCollectedInWindow)}</td>}
                    {showCol("ssacalls")    && <td className={`${tdBase} text-right font-bold border-l ${t.borderLight} ${dark ? "text-sky-400" : "text-sky-600"}`}>{filteredTotals.weekSsaCalls}</td>}
                    {showCol("clientcalls") && <td className={`${tdBase} text-right font-bold ${dark ? "text-indigo-400" : "text-indigo-600"}`}>{filteredTotals.weekClientCalls}</td>}
                    {showCol("faxsent")     && <td className={`${tdBase} text-right font-bold ${t.textSub}`}>{filteredTotals.weekFaxSent}</td>}
                    {showCol("winsheets")   && <td className={`${tdBase} text-right font-bold ${t.text}`}>{filteredTotals.completedWinSheets}</td>}
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Daily Call Entry Panel — week and day mode */}
      {entryOpen && data && (dateMode === "week" || dateMode === "day") && (
        <div ref={entryRef} className={`rounded-xl border ${t.card}`}>
          <div className={`p-4 flex items-center justify-between border-b ${t.borderLight}`}>
            <div className="flex items-center gap-3">
              <Phone className={`h-4 w-4 ${dark ? "text-indigo-400" : "text-indigo-500"}`} aria-hidden="true" />
              <div>
                <h3 className={`text-sm font-bold ${t.text}`}>Daily Call Log</h3>
                <p className={`text-[13px] ${t.textMuted} mt-0.5`}>
                  {windowLabel} — Enter SSA &amp; client call counts per agent
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {saveMsg && (
                <span role="alert" className={`text-xs font-medium flex items-center gap-1 ${saveMsg.startsWith("Error") ? "text-red-500" : "text-emerald-500"}`}>
                  {!saveMsg.startsWith("Error") && <Check className="h-3 w-3" aria-hidden="true" />}
                  {saveMsg}
                </span>
              )}
              <button
                onClick={handleSave}
                disabled={saving || !dirty}
                className={`h-8 px-3 rounded-md text-xs font-semibold flex items-center gap-1.5 ${t.ctaBtn} disabled:opacity-40`}
              >
                {saving
                  ? <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" />
                  : <Save className="h-3 w-3" aria-hidden="true" />}
                Save All
              </button>
              <button
                onClick={() => setEntryOpen(false)}
                className={`h-8 w-8 rounded-md flex items-center justify-center ${t.hover} ${t.textSub}`}
                aria-label="Close call log"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-200">
              <thead>
                <tr className={`border-b ${t.borderLight}`}>
                  <th className={`${thBase} ${t.textSub} text-left w-36`}>Agent</th>
                  <th className={`${thBase} ${t.textSub} text-center w-20`}>Type</th>
                  {entryDays.map((day) => (
                    <th key={day.date} className={`${thBase} ${t.textSub} text-center`}>
                      <div>{day.dayName}</div>
                      <div className={`text-[11px] font-normal ${t.textMuted}`}>{day.label}</div>
                    </th>
                  ))}
                  {entryDays.length > 1 && <th className={`${thBase} ${t.textSub} text-center`}>Total</th>}
                </tr>
              </thead>
              <tbody>
                {data.agents.map((agent) => {
                  const totals = agentCellTotals(agent.agent);
                  const editable = canEditAgent(agent.agent);
                  return (
                    <React.Fragment key={agent.agent}>
                      {/* SSA Calls */}
                      <tr className={rowBorder}>
                        <td className={`${tdBase} ${t.text} font-semibold align-middle`} rowSpan={5}>
                          <div className="flex items-center gap-2">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold ${dark ? "bg-neutral-700 text-neutral-300" : "bg-neutral-200 text-neutral-600"}`}>
                              {agent.agent[0]}
                            </div>
                            {agent.agent}
                            {!editable && (
                              <span className={`text-[11px] font-normal ${t.textMuted}`}>(read-only)</span>
                            )}
                          </div>
                        </td>
                        <td className={`px-2 py-1.5 text-[12px] font-medium whitespace-nowrap ${dark ? "text-blue-400" : "text-blue-600"}`}>SSA</td>
                        {entryDays.map((day) => (
                          <td key={day.date} className="px-1 py-1 text-center">
                            <input type="number" min="0" placeholder="0" className={miniInput}
                              disabled={!editable}
                              value={getCell(agent.agent, day.date).ssaCalls}
                              onChange={(e) => setCell(agent.agent, day.date, "ssaCalls", e.target.value)}
                            />
                          </td>
                        ))}
                        {entryDays.length > 1 && (
                          <td className={`px-2 py-1 text-center text-[13px] font-semibold tabular-nums ${totals.ssa > 0 ? (dark ? "text-blue-400" : "text-blue-600") : t.textMuted}`}>
                            {totals.ssa || "—"}
                          </td>
                        )}
                      </tr>
                      {/* Client IB */}
                      <tr className={rowBorder}>
                        <td className={`px-2 py-1.5 text-[12px] font-medium whitespace-nowrap ${dark ? "text-emerald-400" : "text-emerald-600"}`}>Client IB</td>
                        {entryDays.map((day) => (
                          <td key={day.date} className="px-1 py-1 text-center">
                            <input type="number" min="0" placeholder="0" className={miniInput}
                              disabled={!editable}
                              value={getCell(agent.agent, day.date).clientCallsIb}
                              onChange={(e) => setCell(agent.agent, day.date, "clientCallsIb", e.target.value)}
                            />
                          </td>
                        ))}
                        {entryDays.length > 1 && (
                          <td className={`px-2 py-1 text-center text-[13px] font-semibold tabular-nums ${totals.ib > 0 ? (dark ? "text-emerald-400" : "text-emerald-600") : t.textMuted}`}>
                            {totals.ib || "—"}
                          </td>
                        )}
                      </tr>
                      {/* Client OB */}
                      <tr className={rowBorder}>
                        <td className={`px-2 py-1.5 text-[12px] font-medium whitespace-nowrap ${dark ? "text-amber-400" : "text-amber-600"}`}>Client OB</td>
                        {entryDays.map((day) => (
                          <td key={day.date} className="px-1 py-1 text-center">
                            <input type="number" min="0" placeholder="0" className={miniInput}
                              disabled={!editable}
                              value={getCell(agent.agent, day.date).clientCallsOb}
                              onChange={(e) => setCell(agent.agent, day.date, "clientCallsOb", e.target.value)}
                            />
                          </td>
                        ))}
                        {entryDays.length > 1 && (
                          <td className={`px-2 py-1 text-center text-[13px] font-semibold tabular-nums ${totals.ob > 0 ? (dark ? "text-amber-400" : "text-amber-600") : t.textMuted}`}>
                            {totals.ob || "—"}
                          </td>
                        )}
                      </tr>
                      {/* Win Sheets */}
                      <tr className={rowBorder}>
                        <td className={`px-2 py-1.5 text-[12px] font-medium whitespace-nowrap ${dark ? "text-violet-400" : "text-violet-600"}`}>Win Sheets</td>
                        {entryDays.map((day) => (
                          <td key={day.date} className="px-1 py-1 text-center">
                            <input type="number" min="0" placeholder="0" className={miniInput}
                              disabled={!editable}
                              value={getCell(agent.agent, day.date).winSheetsCreated}
                              onChange={(e) => setCell(agent.agent, day.date, "winSheetsCreated", e.target.value)}
                            />
                          </td>
                        ))}
                        {entryDays.length > 1 && (
                          <td className={`px-2 py-1 text-center text-[13px] font-semibold tabular-nums ${totals.ws > 0 ? (dark ? "text-violet-400" : "text-violet-600") : t.textMuted}`}>
                            {totals.ws || "—"}
                          </td>
                        )}
                      </tr>
                      {/* Fax Sent */}
                      <tr className={`border-b ${rowBorder}`}>
                        <td className={`px-2 py-1.5 text-[12px] font-medium whitespace-nowrap ${dark ? "text-rose-400" : "text-rose-600"}`}>Fax Sent</td>
                        {entryDays.map((day) => (
                          <td key={day.date} className="px-1 py-1 text-center">
                            <input type="number" min="0" placeholder="0" className={miniInput}
                              disabled={!editable}
                              value={getCell(agent.agent, day.date).faxSent}
                              onChange={(e) => setCell(agent.agent, day.date, "faxSent", e.target.value)}
                            />
                          </td>
                        ))}
                        {entryDays.length > 1 && (
                          <td className={`px-2 py-1 text-center text-[13px] font-semibold tabular-nums ${totals.fax > 0 ? (dark ? "text-rose-400" : "text-rose-600") : t.textMuted}`}>
                            {totals.fax || "—"}
                          </td>
                        )}
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className={dark ? "bg-neutral-800/60" : "bg-neutral-50"}>
                  <td className={`${tdBase} font-bold ${t.text}`}>TOTAL</td>
                  <td className={`px-2 py-1.5 text-[12px] font-bold ${t.textSub}`}>All</td>
                  {entryDays.map((day) => {
                    const dayTotal = data.agents.reduce((sum, a) => {
                      const c = getCell(a.agent, day.date);
                      return sum + (parseInt(c.ssaCalls) || 0) + (parseInt(c.clientCallsIb) || 0) + (parseInt(c.clientCallsOb) || 0);
                    }, 0);
                    return (
                      <td key={day.date} className={`px-2 py-1.5 text-center text-[13px] font-bold tabular-nums ${dayTotal > 0 ? t.text : t.textMuted}`}>
                        {dayTotal || "—"}
                      </td>
                    );
                  })}
                  {entryDays.length > 1 && (
                    <td className={`px-2 py-1.5 text-center text-[13px] font-bold tabular-nums ${t.text}`}>
                      {data.agents.reduce((sum, a) => sum + agentCellTotals(a.agent).total, 0) || "—"}
                    </td>
                  )}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
