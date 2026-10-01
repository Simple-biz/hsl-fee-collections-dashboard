"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, Trophy, AlertCircle, ArrowUp, ArrowDown } from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import { teamHeaderBg } from "@/lib/team-colors";

type Metric = "cases_closed" | "fees_collected" | "calls_logged";
type Mode = "monthly" | "all_time";

interface AgentRow {
  agent: string;
  team: string;
  role: string | null;
  value: number;
}

interface TeamStanding {
  team: string;
  top: AgentRow[];
  bottom: AgentRow[];
}

interface ScoreboardStandingsTabProps {
  dark: boolean;
  t: ReturnType<typeof themeClasses>;
}

const TEAMS = ["Concurrent", "T2", "T16"];

const METRIC_OPTIONS: { value: Metric; label: string }[] = [
  { value: "cases_closed",   label: "Cases Closed" },
  { value: "fees_collected", label: "Fees Collected" },
  { value: "calls_logged",   label: "Calls Logged" },
];

const formatValue = (metric: Metric, value: number): string => {
  if (metric === "fees_collected") {
    return value === 0
      ? "$0"
      : "$" + value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  return String(value);
};

const valueLabel = (metric: Metric): string => {
  if (metric === "fees_collected") return "collected";
  if (metric === "calls_logged")   return "calls";
  return "closed";
};

const getMonthRange = (offset: number): { from: string; to: string; label: string } => {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return {
    from: iso(first),
    to: iso(lastDay),
    label: first.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
  };
};

function computeStandings(agents: AgentRow[]): TeamStanding[] {
  return TEAMS.map((team) => {
    const ranked = agents
      .filter((a) => a.team === team && a.role !== "team_lead")
      .sort((a, b) => b.value - a.value);

    if (ranked.length === 0) return { team, top: [], bottom: [] };

    const topScore = ranked[0].value;
    const bottomScore = ranked[ranked.length - 1].value;

    const top = ranked.filter((a) => a.value === topScore);
    const bottom =
      bottomScore < topScore ? ranked.filter((a) => a.value === bottomScore) : [];

    return { team, top, bottom };
  });
}

export function ScoreboardStandingsTab({ dark, t }: ScoreboardStandingsTabProps) {
  const [metric, setMetric] = useState<Metric>("cases_closed");
  const [mode, setMode] = useState<Mode>("monthly");
  const [monthOffset, setMonthOffset] = useState(0);
  const [standings, setStandings] = useState<TeamStanding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const monthRange = getMonthRange(monthOffset);
  const periodLabel =
    mode === "all_time"
      ? "All time"
      : monthOffset === 0
        ? "This month"
        : (monthRange?.label ?? "");

  const apiUrl =
    mode === "all_time"
      ? `/api/scoreboard-standings?metric=${metric}`
      : `/api/scoreboard-standings?from=${monthRange.from}&to=${monthRange.to}&metric=${metric}`;

  useEffect(() => {
    let cancelled = false;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    fetch(apiUrl, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load standings (${res.status})`);
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;
        const agents: AgentRow[] = (json.agents ?? []).map((a: AgentRow) => ({
          agent: a.agent,
          team: a.team ?? "",
          role: a.role ?? null,
          value: a.value ?? 0,
        }));
        setStandings(computeStandings(agents));
      })
      .catch((err) => {
        if (cancelled || (err as Error).name === "AbortError") return;
        setError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [apiUrl]);

  const canGoForward = monthOffset < 0;

  const handlePrev = () => setMonthOffset((v) => v - 1);
  const handleNext = () => setMonthOffset((v) => v + 1);

  return (
    <div className="space-y-4">
      <div className={`rounded-xl border ${t.card}`}>
        {/* Header */}
        <div className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b ${t.borderLight}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${dark ? "bg-amber-900/30" : "bg-amber-50"}`}>
              <Trophy className={`h-5 w-5 ${dark ? "text-amber-400" : "text-amber-600"}`} aria-hidden="true" />
            </div>
            <div>
              <h3 className={`text-sm font-bold ${t.text}`}>Scoreboard Standings</h3>
              <p className={`text-[13px] ${t.textMuted} mt-0.5`}>
                Top &amp; bottom per team — {periodLabel}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Metric dropdown */}
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value as Metric)}
              className={`h-8 px-2 pr-6 rounded-md text-xs font-medium border appearance-none cursor-pointer transition-colors
                ${dark
                  ? "bg-neutral-800 border-neutral-700 text-neutral-200"
                  : "bg-white border-neutral-200 text-neutral-800"
                }`}
              aria-label="Ranking metric"
            >
              {METRIC_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            {/* Mode toggle */}
            <div className={`flex rounded-md border overflow-hidden text-xs font-medium ${dark ? "border-neutral-700" : "border-neutral-200"}`}>
              {(["monthly", "all_time"] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`h-8 px-3 transition-colors ${
                    mode === m
                      ? dark
                        ? "bg-neutral-700 text-white"
                        : "bg-neutral-100 text-neutral-900"
                      : dark
                        ? "bg-neutral-800 text-neutral-400 hover:bg-neutral-750"
                        : "bg-white text-neutral-500 hover:bg-neutral-50"
                  }`}
                >
                  {m === "monthly" ? "Monthly" : "All Time"}
                </button>
              ))}
            </div>

            {/* Period navigation — monthly mode only */}
            {mode === "monthly" && (
              <>
                <button
                  onClick={handlePrev}
                  className={`h-8 w-8 rounded-md flex items-center justify-center transition-colors ${t.hover} ${t.textSub}`}
                  aria-label="Previous period"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </button>
                <span className={`text-[13px] font-medium ${t.textSub} whitespace-nowrap px-1`}>
                  {periodLabel}
                </span>
                <button
                  onClick={handleNext}
                  disabled={!canGoForward}
                  className={`h-8 w-8 rounded-md flex items-center justify-center transition-colors ${t.hover} ${t.textSub} disabled:opacity-40`}
                  aria-label="Next period"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </>
            )}

            {/* All-time label */}
            {mode === "all_time" && (
              <span className={`text-[13px] font-medium ${t.textSub} whitespace-nowrap px-1`}>
                All time
              </span>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div
            className={`m-4 rounded-lg border p-3 flex items-center gap-2 text-xs ${dark ? "bg-red-900/20 border-red-800 text-red-400" : "bg-red-50 border-red-200 text-red-700"}`}
            role="alert"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className={`h-5 w-5 animate-spin ${t.textMuted}`} aria-hidden="true" />
            <span className={`ml-2 text-sm ${t.textSub}`}>Loading standings…</span>
          </div>
        )}

        {/* Standings grid */}
        {!loading && !error && (
          <div className="divide-y divide-inherit">
            {standings.map(({ team, top, bottom }) => {
              const headerBg = teamHeaderBg(team);
              return (
                <div key={team}>
                  <div className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white ${headerBg}`}>
                    {team === "Concurrent" ? "Concurrent Team" : `${team} Team`}
                  </div>

                  <div className="px-4 py-3 grid grid-cols-2 gap-4">
                    {/* Top performer */}
                    <div>
                      <div className={`flex items-center gap-1.5 mb-1.5 text-[11px] font-semibold uppercase tracking-wide ${dark ? "text-amber-400" : "text-amber-600"}`}>
                        <ArrowUp className="h-3 w-3" aria-hidden="true" />
                        Top
                      </div>
                      {top.length > 0 ? (
                        <ul className="space-y-0.5">
                          {top.map((a) => (
                            <li key={a.agent} className={`text-sm font-medium ${t.text}`}>
                              {a.agent}
                              <span className={`ml-1.5 text-[11px] font-normal ${t.textMuted}`}>
                                {formatValue(metric, a.value)} {valueLabel(metric)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className={`text-xs ${t.textMuted}`}>—</span>
                      )}
                    </div>

                    {/* Bottom performer */}
                    <div>
                      <div className={`flex items-center gap-1.5 mb-1.5 text-[11px] font-semibold uppercase tracking-wide ${dark ? "text-red-400" : "text-red-600"}`}>
                        <ArrowDown className="h-3 w-3" aria-hidden="true" />
                        Bottom
                      </div>
                      {bottom.length > 0 ? (
                        <ul className="space-y-0.5">
                          {bottom.map((a) => (
                            <li key={a.agent} className={`text-sm font-medium ${t.text}`}>
                              {a.agent}
                              <span className={`ml-1.5 text-[11px] font-normal ${t.textMuted}`}>
                                {formatValue(metric, a.value)} {valueLabel(metric)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className={`text-xs ${t.textMuted}`}>
                          {top.length > 0 ? "Tied" : "—"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
