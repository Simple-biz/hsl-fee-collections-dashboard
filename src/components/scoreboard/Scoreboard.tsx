"use client";

import { useState, useReducer, useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import { RefreshCw, ChevronLeft, ChevronRight, Upload, Trophy, Clipboard, Check, Table2, MessageSquare, type LucideIcon } from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import CsvImportModal, { type ColumnDef } from "@/components/modals/CsvImportModal";
import { bulkImportDailyMetrics } from "@/app/(dashboard)/scoreboard/actions";
import { parseDate, parseNonNegativeInt } from "@/lib/import/csv-parser";
import { teamHeaderBg } from "@/lib/team-colors";
import { useCapabilities } from "@/hooks/useCapabilities";
import { getMonday, toChatBlock } from "@/lib/formatters";

type CopyFormat = "sheets" | "chat";
const COPY_FORMATS: { format: CopyFormat; Icon: LucideIcon; label: string; ariaLabel: string; title: string }[] = [
  { format: "sheets", Icon: Table2, label: "Sheets", ariaLabel: "Copy scoreboard for Google Sheets", title: "Copy for Google Sheets (tab-separated)" },
  { format: "chat", Icon: MessageSquare, label: "Chat", ariaLabel: "Copy scoreboard for Google Chat", title: "Copy for Google Chat (monospace code block)" },
];

type PeriodMode = "week" | "month";

// ---------- types ----------

interface AgentPeriodData {
  agent: string;
  team: string;
  role: string | null;
  casesClosed: number;
}

interface PeriodSlot {
  key: string;
  label: string;
  agents: AgentPeriodData[];
}

// ---------- helpers ----------

const weekRangeLabel = (monday: string): string => {
  const start = new Date(monday + "T12:00:00");
  const end = new Date(monday + "T12:00:00");
  end.setDate(start.getDate() + 4);
  const mo: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${start.toLocaleDateString("en-US", mo)} – ${end.toLocaleDateString("en-US", { day: "numeric" })}`;
};

// First/last day (YYYY-MM-DD) of the calendar month `offset` months from the
// current one, plus a short display label — e.g. offset -1 from August gives
// July ("Jul 2026").
const getMonthRange = (offset: number): { from: string; to: string; shortLabel: string } => {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return {
    from: iso(first),
    to: iso(lastDay),
    shortLabel: first.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
  };
};

const thisPeriodCellColor = (value: number, max: number): string => {
  if (value === 0) return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
  const ratio = max > 0 ? value / max : 0;
  if (ratio >= 0.75) return "bg-green-500 text-white";
  if (ratio >= 0.5)  return "bg-green-400 text-white";
  if (ratio >= 0.25) return "bg-green-200 text-green-900";
  return "bg-green-100 text-green-800";
};

const TEAMS = [
  { key: "Concurrent", label: "Concurrent Team", headerBg: teamHeaderBg("Concurrent") },
  { key: "T2",         label: "T2 Team",         headerBg: teamHeaderBg("T2") },
  { key: "T16",        label: "T16 Team",         headerBg: teamHeaderBg("T16") },
];

// ---------- state ----------

type FetchState = { periods: PeriodSlot[]; loading: boolean; error: string | null };
type FetchAction =
  | { type: "start" }
  | { type: "success"; periods: PeriodSlot[] }
  | { type: "error"; message: string };

function fetchReducer(state: FetchState, action: FetchAction): FetchState {
  switch (action.type) {
    case "start":   return { ...state, loading: true, error: null };
    case "success": return { periods: action.periods, loading: false, error: null };
    case "error":   return { ...state, loading: false, error: action.message };
  }
}

// ---------- csv import config ----------
const DM_CSV_COLUMNS: ColumnDef[] = [
  { key: "agent_name", label: "Agent Name", required: true, hint: "Must match a team member name" },
  { key: "metric_date", label: "Metric Date", required: true, hint: "YYYY-MM-DD or MM/DD/YYYY" },
  { key: "ssa_calls", label: "SSA Calls", hint: "Non-negative integer" },
  { key: "client_calls_ib", label: "Client Calls IB", hint: "Non-negative integer" },
  { key: "client_calls_ob", label: "Client Calls OB", hint: "Non-negative integer" },
  { key: "win_sheets_created", label: "Win Sheets Created", hint: "Non-negative integer" },
  { key: "notes", label: "Notes", hint: "Optional text" },
];

const DM_TEMPLATE_CSV =
  "agent_name,metric_date,ssa_calls,client_calls_ib,client_calls_ob,win_sheets_created,notes\n" +
  "Jane Smith,2024-01-15,5,3,2,1,\n";

const DM_INT_KEYS = ["ssa_calls", "client_calls_ib", "client_calls_ob", "win_sheets_created"];

const validateDmRow = (raw: Record<string, string>): string[] => {
  const errors: string[] = [];
  if (!raw["agent_name"]?.trim()) errors.push("agent_name is required");
  if (!raw["metric_date"]?.trim() || !parseDate(raw["metric_date"])) errors.push("Invalid or missing metric_date");
  for (const key of DM_INT_KEYS) {
    if (raw[key] !== undefined && raw[key].trim() && parseNonNegativeInt(raw[key]) === null) {
      errors.push(`Invalid value for "${key}" — must be a non-negative integer`);
    }
  }
  return errors;
};

// ---------- component ----------

export const Scoreboard = () => {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const t = themeClasses(dark);
  const { can } = useCapabilities();
  const canImport = can("dailyMetrics.editOthers");

  const [mode, setMode] = useState<PeriodMode>("week");
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [copiedRow, setCopiedRow] = useState<string | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copiedTable, setCopiedTable] = useState<CopyFormat | null>(null);
  const tableCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copiedTeam, setCopiedTeam] = useState<{ key: string; format: CopyFormat } | null>(null);
  const teamCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    if (tableCopyTimerRef.current) clearTimeout(tableCopyTimerRef.current);
    if (teamCopyTimerRef.current) clearTimeout(teamCopyTimerRef.current);
  }, []);
  const [{ periods, loading, error }, dispatch] = useReducer(fetchReducer, {
    periods: [],
    loading: true,
    error: null,
  });

  const offset = mode === "week" ? weekOffset : monthOffset;

  useEffect(() => {
    let cancelled = false;
    dispatch({ type: "start" });

    // 5 periods: the currently selected one plus 4 before it — same shape
    // for week and month, just a different unit and a different API query
    // (?week= for a 7-day window, ?from=&to= for a calendar month).
    const slots = Array.from({ length: 5 }, (_, i) => {
      const o = offset - i;
      if (mode === "week") {
        const monday = getMonday(o);
        return {
          url: `/api/scoreboard?week=${monday}`,
          key: monday,
          label: i === 0 && offset === 0 ? "This week" : weekRangeLabel(monday),
        };
      }
      const { from, to, shortLabel } = getMonthRange(o);
      return {
        url: `/api/scoreboard?from=${from}&to=${to}`,
        key: from,
        label: i === 0 && offset === 0 ? "This month" : shortLabel,
      };
    });
    const controllers = slots.map(() => new AbortController());

    Promise.all(
      slots.map((slot, i) =>
        fetch(slot.url, { signal: controllers[i].signal })
          .then((res) => {
            if (!res.ok) throw new Error(`Failed to load scoreboard (${res.status})`);
            return res.json();
          })
          .then((json): PeriodSlot => ({
            key: slot.key,
            label: slot.label,
            agents: (json.agents ?? []).map((a: AgentPeriodData) => ({
              agent: a.agent,
              team: a.team ?? "",
              role: a.role ?? null,
              casesClosed: a.casesClosed ?? 0,
            })),
          }))
      )
    )
      .then((results) => {
        if (cancelled) return;
        dispatch({ type: "success", periods: results });
      })
      .catch((err: Error) => {
        if (err.name === "AbortError" || cancelled) return;
        dispatch({ type: "error", message: err.message });
      });

    return () => {
      cancelled = true;
      controllers.forEach((c) => c.abort());
    };
  }, [mode, offset]);

  const currentPeriodMax = Math.max(
    ...TEAMS.flatMap(({ key }) =>
      (periods[0]?.agents ?? [])
        .filter((a) => a.team === key && a.role !== "team_lead")
        .map((a) => a.casesClosed)
    ),
    1
  );

  const teamRows = (teamKey: string) => {
    // Team leads (e.g. supervisors) are excluded from the per-agent ranking
    // rows — they're still counted in team-level financial totals elsewhere
    // (Reports), just not scored individually here. They're also excluded
    // from the Team Total row below, for the same reason.
    const currentAgents = (periods[0]?.agents ?? []).filter(
      (a) => a.team === teamKey && a.role !== "team_lead",
    );
    return currentAgents
      .map((a) => ({
        agent: a.agent,
        periodValues: periods.map(
          (p) => p.agents.find((x) => x.agent === a.agent)?.casesClosed ?? 0
        ),
      }))
      .sort((a, b) => b.periodValues[0] - a.periodValues[0]);
  };

  const teamTotalRow = (rows: { periodValues: number[] }[]): number[] =>
    periods.map((_, i) => rows.reduce((sum, r) => sum + r.periodValues[i], 0));

  const copyAllTeams = (format: CopyFormat) => {
    const periodLabels = periods.map((p) => p.label);
    const teamBlocks = TEAMS.flatMap(({ key, label: teamLabel }) => {
      const rows = teamRows(key);
      if (rows.length === 0) return [];
      const totals = teamTotalRow(rows);
      return [{
        teamLabel,
        header: ["Agent", ...periodLabels],
        rows: [...rows.map((r) => [r.agent, ...r.periodValues]), ["Team Total", ...totals]],
      }];
    });

    const done = () => {
      setCopiedTable(format);
      if (tableCopyTimerRef.current) clearTimeout(tableCopyTimerRef.current);
      tableCopyTimerRef.current = setTimeout(() => setCopiedTable(null), 1500);
    };

    if (format === "sheets") {
      const lines: string[] = [];
      for (const { teamLabel, header, rows } of teamBlocks) {
        lines.push(teamLabel);
        lines.push(header.join("\t"));
        for (const row of rows) lines.push(row.join("\t"));
        lines.push("");
      }
      navigator.clipboard.writeText(lines.join("\n")).then(done);
    } else {
      const text = teamBlocks.map(({ teamLabel, header, rows }) => toChatBlock(teamLabel, header, rows)).join("\n\n");
      navigator.clipboard.writeText(text).then(done);
    }
  };

  const copyOneTeam = (teamKey: string, teamLabel: string, format: CopyFormat) => {
    const periodLabels = periods.map((p) => p.label);
    const rows = teamRows(teamKey);
    const totals = teamTotalRow(rows);

    const header = ["Agent", ...periodLabels];
    const dataRows = [...rows.map((r) => [r.agent, ...r.periodValues]), ["Team Total", ...totals]];

    const done = () => {
      setCopiedTeam({ key: teamKey, format });
      if (teamCopyTimerRef.current) clearTimeout(teamCopyTimerRef.current);
      teamCopyTimerRef.current = setTimeout(() => setCopiedTeam(null), 1500);
    };

    if (format === "sheets") {
      const lines = [teamLabel, header.join("\t"), ...dataRows.map((r) => r.join("\t"))];
      navigator.clipboard.writeText(lines.join("\n")).then(done);
    } else {
      navigator.clipboard.writeText(toChatBlock(teamLabel, header, dataRows)).then(done);
    }
  };

  const setOffset = (next: number) => {
    if (mode === "week") setWeekOffset(next);
    else setMonthOffset(next);
  };

  return (
    <>
    {csvImportOpen && (
      <CsvImportModal
        dark={dark}
        title="Import Daily Metrics"
        description="Upload a CSV to bulk-import or update daily metric entries for the scoreboard."
        columns={DM_CSV_COLUMNS}
        templateFilename="daily-metrics-template.csv"
        templateCsv={DM_TEMPLATE_CSV}
        validateRow={validateDmRow}
        onImport={bulkImportDailyMetrics}
        onClose={() => setCsvImportOpen(false)}
        onSuccess={() => dispatch({ type: "start" })}
      />
    )}
    <div className={`rounded-xl border ${t.card} overflow-hidden`}>
      {/* Header */}
      <div className={`px-5 py-4 border-b ${t.borderLight} flex items-center justify-between gap-4 flex-wrap`}>
        <div>
          <h2 className={`text-sm font-bold ${t.text}`}>Total Number of Closed Cases</h2>
          <p className={`text-[13px] ${t.textMuted} mt-0.5`}>
            {mode === "week"
              ? offset === 0
                ? "Current week + 4 previous weeks"
                : `5 weeks ending ${weekRangeLabel(getMonday(offset)).split("–")[0].trim()}`
              : offset === 0
                ? "Current month + 4 previous months"
                : `5 months ending ${getMonthRange(offset).shortLabel}`}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0 flex-wrap">
          {canImport && (
            <button
              onClick={() => setCsvImportOpen(true)}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[13px] font-medium border transition-colors ${dark ? "border-neutral-700 text-neutral-300 hover:bg-neutral-800" : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"}`}
              aria-label="Import daily metrics from CSV"
            >
              <Upload aria-hidden="true" className="h-3.5 w-3.5" />
              Import
            </button>
          )}
          {COPY_FORMATS.map(({ format, Icon, label, ariaLabel, title }) => (
            <button
              key={format}
              onClick={() => copyAllTeams(format)}
              aria-label={ariaLabel}
              title={title}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[13px] font-medium border transition-colors ${copiedTable === format ? (dark ? "border-emerald-700 text-emerald-400" : "border-emerald-300 text-emerald-600") : (dark ? "border-neutral-700 text-neutral-300 hover:bg-neutral-800" : "border-neutral-200 text-neutral-600 hover:bg-neutral-50")}`}
            >
              {copiedTable === format ? <><Check aria-hidden="true" className="h-3.5 w-3.5" />Copied</> : <><Icon aria-hidden="true" className="h-3.5 w-3.5" />{label}</>}
            </button>
          ))}
          <div className={`flex items-center rounded-md border overflow-hidden text-[13px] font-medium shrink-0 ${dark ? "border-neutral-700" : "border-neutral-200"}`}>
            {(["week", "month"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={`px-2.5 py-1 transition-colors ${
                  mode === m
                    ? dark
                      ? "bg-emerald-700 text-white"
                      : "bg-emerald-600 text-white"
                    : dark
                      ? "text-neutral-400 hover:bg-neutral-800"
                      : "text-neutral-500 hover:bg-neutral-50"
                }`}
              >
                {m === "week" ? "Week" : "Month"}
              </button>
            ))}
          </div>
          <button
            onClick={() => setOffset(offset - 1)}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[13px] font-medium border transition-colors ${dark ? "border-neutral-700 text-neutral-300 hover:bg-neutral-800" : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"}`}
            aria-label={`Previous 5 ${mode}s`}
          >
            <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" />
            Prev
          </button>
          {offset < 0 && (
            <button
              onClick={() => setOffset(0)}
              className={`px-2 py-1 rounded-md text-[13px] font-medium border transition-colors ${dark ? "border-amber-700 text-amber-400 hover:bg-amber-900/20" : "border-amber-300 text-amber-700 hover:bg-amber-50"}`}
            >
              {mode === "week" ? "This week" : "This month"}
            </button>
          )}
          <button
            onClick={() => setOffset(offset + 1)}
            disabled={offset >= 0}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[13px] font-medium border transition-colors ${offset >= 0 ? (dark ? "border-neutral-800 text-neutral-600 cursor-not-allowed" : "border-neutral-100 text-neutral-300 cursor-not-allowed") : (dark ? "border-neutral-700 text-neutral-300 hover:bg-neutral-800" : "border-neutral-200 text-neutral-600 hover:bg-neutral-50")}`}
            aria-label={`Next 5 ${mode}s`}
            aria-disabled={offset >= 0}
          >
            Next
            <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className={`h-5 w-5 animate-spin ${t.textMuted}`} aria-hidden="true" />
          <span className={`ml-2 text-sm ${t.textSub}`}>Loading leaderboard...</span>
        </div>
      )}

      {error && (
        <div
          className={`m-4 rounded-lg border p-4 text-sm ${dark ? "bg-red-900/20 border-red-800 text-red-400" : "bg-red-50 border-red-200 text-red-700"}`}
          role="alert"
        >
          {error}
        </div>
      )}

      {!loading && !error && periods.length > 0 && (
        <div>
          {TEAMS.map(({ key, label, headerBg }) => {
            const rows = teamRows(key);

            // Per-column (per-period) max, so each previous period's top
            // scorer can get its own trophy next to that period's number —
            // not just the currently selected one. Same zero-exclusion as
            // the by-name trophy: a period with no closures for the whole
            // team awards nothing.
            const maxPerColumn = periods.map((_, i) =>
              Math.max(...rows.map((r) => r.periodValues[i]), 0),
            );
            const totals = teamTotalRow(rows);

            return (
              <div key={key} className={`border-b last:border-b-0 ${t.borderLight}`}>
                {/* Team header with per-team copy buttons */}
                <div className={`px-4 py-2 ${headerBg} flex items-center justify-between`}>
                  <span className="text-xs font-bold text-white">{label}</span>
                  <div className="flex items-center gap-1">
                    {COPY_FORMATS.map(({ format, Icon, label: fmtLabel, title }) => {
                      const isActive = copiedTeam?.key === key && copiedTeam?.format === format;
                      return (
                        <button
                          key={format}
                          onClick={() => copyOneTeam(key, label, format)}
                          aria-label={`Copy ${label} for ${fmtLabel}`}
                          title={title}
                          className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-colors"
                        >
                          {isActive
                            ? <><Check aria-hidden="true" className="h-3 w-3" />Copied</>
                            : <><Icon aria-hidden="true" className="h-3 w-3" />{fmtLabel}</>
                          }
                        </button>
                      );
                    })}
                  </div>
                </div>

                {rows.length === 0 ? (
                  <p className={`text-xs ${t.textMuted} px-4 py-4`}>No agents this {mode}.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-120">
                      <thead>
                        <tr className={`border-b ${t.borderLight}`}>
                          <th
                            className={`py-2 px-4 text-left text-[12px] font-semibold uppercase tracking-wider ${t.textMuted} w-40`}
                          >
                            Agent
                          </th>
                          {periods.map((p, i) => (
                            <th
                              key={i}
                              className={`py-2 px-3 text-center text-[12px] font-semibold uppercase tracking-wider ${i === 0 ? t.text : t.textMuted}`}
                            >
                              {p.label}
                            </th>
                          ))}
                          <th className="w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, rowIdx) => {
                          // Trophy marks whoever topped this team for the
                          // currently displayed period (rows are already
                          // sorted by that period's value) — ties all get
                          // one, and a period with zero closures for the
                          // whole team awards none rather than crowning a 0.
                          const isTopScorer =
                            row.periodValues[0] > 0 && row.periodValues[0] === rows[0].periodValues[0];
                          return (
                          <tr
                            key={row.agent}
                            className={`group/row border-b ${t.borderLight} ${rowIdx % 2 !== 0 ? (dark ? "bg-neutral-800/20" : "bg-neutral-50/50") : ""}`}
                          >
                            <td className={`py-2.5 px-4 text-[14px] font-medium ${t.text}`}>
                              <span
                                className="inline-flex items-center gap-1.5"
                                title={isTopScorer ? `Top scorer this ${mode}` : undefined}
                              >
                                <span className="select-all cursor-text">{row.agent}</span>
                                {isTopScorer && (
                                  <Trophy aria-hidden="true" className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                )}
                              </span>
                            </td>
                            {row.periodValues.map((val, i) => {
                              // Excludes i === 0 — the current period already
                              // gets its own trophy next to the agent's name
                              // above, so this only covers previous periods.
                              const isTopForColumn = i > 0 && val > 0 && val === maxPerColumn[i];
                              return (
                              <td key={i} className="py-2.5 px-3 text-center">
                                <span
                                  className="inline-flex items-center justify-center gap-1"
                                  title={isTopForColumn ? `Top scorer that ${mode}` : undefined}
                                >
                                  {i === 0 ? (
                                    <span
                                      className={`inline-block min-w-8 rounded px-2 py-0.5 text-[14px] font-semibold select-all cursor-text ${thisPeriodCellColor(val, currentPeriodMax)}`}
                                    >
                                      {val}
                                    </span>
                                  ) : (
                                    <span className={`text-[14px] select-all cursor-text ${t.textSub}`}>{val}</span>
                                  )}
                                  {isTopForColumn && (
                                    <Trophy aria-hidden="true" className="h-3 w-3 text-amber-500 shrink-0" />
                                  )}
                                </span>
                              </td>
                              );
                            })}
                            <td className="py-2.5 px-2 text-center">
                              <button
                                onClick={() => {
                                  const parts = [row.agent, ...row.periodValues.map((v, i) => `${periods[i]?.label ?? `P${i+1}`}: ${v}`)];
                                  navigator.clipboard.writeText(parts.join(" | ")).then(() => {
                                    setCopiedRow(row.agent);
                                    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
                                    copyTimerRef.current = setTimeout(() => setCopiedRow(null), 1500);
                                  });
                                }}
                                aria-label={`Copy ${row.agent} row`}
                                title="Copy row"
                                className={`p-1 rounded transition-colors opacity-0 group-hover/row:opacity-100 ${copiedRow === row.agent ? (dark ? "text-emerald-400" : "text-emerald-600") : (dark ? "text-neutral-500" : "text-neutral-400")} ${dark ? "hover:text-neutral-200" : "hover:text-neutral-700"}`}
                              >
                                {copiedRow === row.agent
                                  ? <Check aria-hidden="true" className="h-3.5 w-3.5" />
                                  : <Clipboard aria-hidden="true" className="h-3.5 w-3.5" />
                                }
                              </button>
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className={dark ? "bg-neutral-800/60" : "bg-neutral-50"}>
                          <td className={`py-2.5 px-4 text-[14px] font-bold ${t.text}`}>Team Total</td>
                          {totals.map((val, i) => (
                            <td key={i} className={`py-2.5 px-3 text-center text-[14px] font-bold ${i === 0 ? t.text : t.textSub}`}>
                              {val}
                            </td>
                          ))}
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
    </>
  );
};
