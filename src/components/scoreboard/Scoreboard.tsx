"use client";

import { useState, useReducer, useEffect } from "react";
import { useTheme } from "next-themes";
import { RefreshCw, ChevronLeft, ChevronRight, Upload, Trophy } from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import CsvImportModal, { type ColumnDef } from "@/components/modals/CsvImportModal";
import { bulkImportDailyMetrics } from "@/app/(dashboard)/scoreboard/actions";
import { parseDate, parseNonNegativeInt } from "@/lib/import/csv-parser";
import { teamHeaderBg } from "@/lib/team-colors";
import { useCapabilities } from "@/hooks/useCapabilities";
import { getMonday } from "@/lib/formatters";

// ---------- types ----------

interface AgentWeekData {
  agent: string;
  team: string;
  role: string | null;
  casesClosed: number;
}

interface WeekSlot {
  monday: string;
  label: string;
  agents: AgentWeekData[];
}

// ---------- helpers ----------

const weekRangeLabel = (monday: string): string => {
  const start = new Date(monday + "T12:00:00");
  const end = new Date(monday + "T12:00:00");
  end.setDate(start.getDate() + 4);
  const mo: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${start.toLocaleDateString("en-US", mo)} – ${end.toLocaleDateString("en-US", { day: "numeric" })}`;
};

const thisWeekCellColor = (value: number, max: number): string => {
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

type FetchState = { weeks: WeekSlot[]; loading: boolean; error: string | null };
type FetchAction =
  | { type: "start" }
  | { type: "success"; weeks: WeekSlot[] }
  | { type: "error"; message: string };

function fetchReducer(state: FetchState, action: FetchAction): FetchState {
  switch (action.type) {
    case "start":   return { ...state, loading: true, error: null };
    case "success": return { weeks: action.weeks, loading: false, error: null };
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

  const [weekOffset, setWeekOffset] = useState(0);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [{ weeks, loading, error }, dispatch] = useReducer(fetchReducer, {
    weeks: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    dispatch({ type: "start" });
    const mondays = Array.from({ length: 5 }, (_, i) => getMonday(weekOffset - i));
    const controllers = mondays.map(() => new AbortController());

    Promise.all(
      mondays.map((monday, i) =>
        fetch(`/api/scoreboard?week=${monday}`, { signal: controllers[i].signal })
          .then((res) => {
            if (!res.ok) throw new Error(`Failed to load scoreboard (${res.status})`);
            return res.json();
          })
          .then((json): WeekSlot => ({
            monday,
            label: i === 0 && weekOffset === 0 ? "This week" : weekRangeLabel(monday),
            agents: (json.agents ?? []).map((a: AgentWeekData) => ({
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
        dispatch({ type: "success", weeks: results });
      })
      .catch((err: Error) => {
        if (err.name === "AbortError" || cancelled) return;
        dispatch({ type: "error", message: err.message });
      });

    return () => {
      cancelled = true;
      controllers.forEach((c) => c.abort());
    };
  }, [weekOffset]);

  const currentWeekMax = Math.max(
    ...TEAMS.flatMap(({ key }) =>
      (weeks[0]?.agents ?? [])
        .filter((a) => a.team === key && a.role !== "team_lead")
        .map((a) => a.casesClosed)
    ),
    1
  );

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
      <div className={`px-5 py-4 border-b ${t.borderLight} flex items-center justify-between gap-4`}>
        <div>
          <h2 className={`text-sm font-bold ${t.text}`}>Total Number of Closed Cases</h2>
          <p className={`text-[13px] ${t.textMuted} mt-0.5`}>
            {weekOffset === 0
              ? "Current week + 4 previous weeks"
              : `5 weeks ending ${weekRangeLabel(getMonday(weekOffset)).split("–")[0].trim()}`}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
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
          <button
            onClick={() => setWeekOffset(weekOffset - 1)}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[13px] font-medium border transition-colors ${dark ? "border-neutral-700 text-neutral-300 hover:bg-neutral-800" : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"}`}
            aria-label="Previous 5 weeks"
          >
            <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" />
            Prev
          </button>
          {weekOffset < 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className={`px-2 py-1 rounded-md text-[13px] font-medium border transition-colors ${dark ? "border-amber-700 text-amber-400 hover:bg-amber-900/20" : "border-amber-300 text-amber-700 hover:bg-amber-50"}`}
            >
              This week
            </button>
          )}
          <button
            onClick={() => setWeekOffset(weekOffset + 1)}
            disabled={weekOffset >= 0}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[13px] font-medium border transition-colors ${weekOffset >= 0 ? (dark ? "border-neutral-800 text-neutral-600 cursor-not-allowed" : "border-neutral-100 text-neutral-300 cursor-not-allowed") : (dark ? "border-neutral-700 text-neutral-300 hover:bg-neutral-800" : "border-neutral-200 text-neutral-600 hover:bg-neutral-50")}`}
            aria-label="Next 5 weeks"
            aria-disabled={weekOffset >= 0}
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

      {!loading && !error && weeks.length > 0 && (
        <div>
          {TEAMS.map(({ key, label, headerBg }) => {
            // Team leads (e.g. supervisors) are excluded from the per-agent
            // ranking rows — they're still counted in team-level financial
            // totals elsewhere (Reports), just not scored individually here.
            const currentAgents = (weeks[0]?.agents ?? []).filter(
              (a) => a.team === key && a.role !== "team_lead",
            );
            const rows = currentAgents
              .map((a) => ({
                agent: a.agent,
                weekValues: weeks.map(
                  (w) => w.agents.find((x) => x.agent === a.agent)?.casesClosed ?? 0
                ),
              }))
              .sort((a, b) => b.weekValues[0] - a.weekValues[0]);

            // Per-column (per-week) max, so each previous week's top scorer
            // can get its own trophy next to that week's number — not just
            // the currently-selected week. Same zero-exclusion as the
            // by-name trophy: a week with no closures for the whole team
            // awards nothing.
            const maxPerColumn = weeks.map((_, i) =>
              Math.max(...rows.map((r) => r.weekValues[i]), 0),
            );

            return (
              <div key={key} className={`border-b last:border-b-0 ${t.borderLight}`}>
                {/* Team header */}
                <div className={`px-4 py-2.5 ${headerBg}`}>
                  <span className="text-xs font-bold text-white">{label}</span>
                </div>

                {rows.length === 0 ? (
                  <p className={`text-xs ${t.textMuted} px-4 py-4`}>No agents this week.</p>
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
                          {weeks.map((w, i) => (
                            <th
                              key={i}
                              className={`py-2 px-3 text-center text-[12px] font-semibold uppercase tracking-wider ${i === 0 ? t.text : t.textMuted}`}
                            >
                              {w.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, rowIdx) => {
                          // Trophy marks whoever topped this team for the
                          // currently displayed week (rows are already sorted
                          // by that week's value) — ties all get one, and a
                          // week with zero closures for the whole team awards
                          // none rather than crowning a 0.
                          const isTopScorer =
                            row.weekValues[0] > 0 && row.weekValues[0] === rows[0].weekValues[0];
                          return (
                          <tr
                            key={row.agent}
                            className={`border-b ${t.borderLight} ${rowIdx % 2 !== 0 ? (dark ? "bg-neutral-800/20" : "bg-neutral-50/50") : ""}`}
                          >
                            <td className={`py-2.5 px-4 text-[14px] font-medium ${t.text}`}>
                              <span
                                className="inline-flex items-center gap-1.5"
                                title={isTopScorer ? "Top scorer this week" : undefined}
                              >
                                {row.agent}
                                {isTopScorer && (
                                  <Trophy aria-hidden="true" className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                )}
                              </span>
                            </td>
                            {row.weekValues.map((val, i) => {
                              // Excludes i === 0 — the current week already
                              // gets its own trophy next to the agent's name
                              // above, so this only covers previous weeks.
                              const isTopForColumn = i > 0 && val > 0 && val === maxPerColumn[i];
                              return (
                              <td key={i} className="py-2.5 px-3 text-center">
                                <span
                                  className="inline-flex items-center justify-center gap-1"
                                  title={isTopForColumn ? "Top scorer that week" : undefined}
                                >
                                  {i === 0 ? (
                                    <span
                                      className={`inline-block min-w-8 rounded px-2 py-0.5 text-[14px] font-semibold select-all cursor-text ${thisWeekCellColor(val, currentWeekMax)}`}
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
                          </tr>
                          );
                        })}
                      </tbody>
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
