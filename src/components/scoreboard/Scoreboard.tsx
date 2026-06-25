"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { RefreshCw } from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";

// ---------- types ----------

interface AgentWeekData {
  agent: string;
  team: string;
  casesClosed: number;
}

interface WeekSlot {
  monday: string;
  label: string;
  agents: AgentWeekData[];
}

// ---------- helpers ----------

const getMonday = (offsetWeeks: number): string => {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1) + offsetWeeks * 7);
  return d.toISOString().split("T")[0];
};

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
  { key: "Concurrent", label: "Concurrent Team", headerBg: "bg-teal-700" },
  { key: "T2",         label: "T2 Team",         headerBg: "bg-blue-800" },
  { key: "T16",        label: "T16 Team",         headerBg: "bg-red-700"  },
];

// ---------- component ----------

export const Scoreboard = () => {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const t = themeClasses(dark);

  const [weeks, setWeeks] = useState<WeekSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const mondays = Array.from({ length: 5 }, (_, i) => getMonday(-i));
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
            label: i === 0 ? "This week" : weekRangeLabel(monday),
            agents: (json.agents ?? []).map((a: AgentWeekData) => ({
              agent: a.agent,
              team: a.team ?? "",
              casesClosed: a.casesClosed ?? 0,
            })),
          }))
      )
    )
      .then((results) => {
        if (cancelled) return;
        setWeeks(results);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (err.name === "AbortError" || cancelled) return;
        setError(err.message);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      controllers.forEach((c) => c.abort());
    };
  }, []);

  const currentWeekMax = Math.max(
    ...TEAMS.flatMap(({ key }) =>
      (weeks[0]?.agents ?? [])
        .filter((a) => a.team === key)
        .map((a) => a.casesClosed)
    ),
    1
  );

  return (
    <div className={`rounded-xl border ${t.card} overflow-hidden`}>
      {/* Header */}
      <div className={`px-5 py-4 border-b ${t.borderLight}`}>
        <h2 className={`text-sm font-bold ${t.text}`}>Total Number of Closed Cases</h2>
        <p className={`text-[11px] ${t.textMuted} mt-0.5`}>
          Current week + 4 previous weeks
        </p>
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
            const currentAgents = (weeks[0]?.agents ?? []).filter((a) => a.team === key);
            const rows = currentAgents
              .map((a) => ({
                agent: a.agent,
                weekValues: weeks.map(
                  (w) => w.agents.find((x) => x.agent === a.agent)?.casesClosed ?? 0
                ),
              }))
              .sort((a, b) => b.weekValues[0] - a.weekValues[0]);

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
                            className={`py-2 px-4 text-left text-[10px] font-semibold uppercase tracking-wider ${t.textMuted} w-40`}
                          >
                            Agent
                          </th>
                          {weeks.map((w, i) => (
                            <th
                              key={i}
                              className={`py-2 px-3 text-center text-[10px] font-semibold uppercase tracking-wider ${i === 0 ? t.text : t.textMuted}`}
                            >
                              {w.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, rowIdx) => (
                          <tr
                            key={row.agent}
                            className={`border-b ${t.borderLight} ${rowIdx % 2 !== 0 ? (dark ? "bg-neutral-800/20" : "bg-neutral-50/50") : ""}`}
                          >
                            <td className={`py-2.5 px-4 text-[12px] font-medium ${t.text}`}>
                              {row.agent}
                            </td>
                            {row.weekValues.map((val, i) => (
                              <td key={i} className="py-2.5 px-3 text-center">
                                {i === 0 ? (
                                  <span
                                    className={`inline-block min-w-8 rounded px-2 py-0.5 text-[12px] font-semibold ${thisWeekCellColor(val, currentWeekMax)}`}
                                  >
                                    {val}
                                  </span>
                                ) : (
                                  <span className={`text-[12px] ${t.textSub}`}>{val}</span>
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
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
  );
};
