"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { TeamRevenueStats, type TeamRevenueBar } from "@/components/cases/TeamRevenueStats";
import { themeClasses } from "@/lib/theme-classes";
import { fmtFull } from "@/lib/formatters";
import type { CaseRow, DashboardSummary, TeamMember } from "@/types";

export type RevenueWindowMode = "today" | "week" | "month" | "alltime";

const WINDOW_LABELS: Record<RevenueWindowMode, string> = {
  today: "Today",
  week: "Week",
  month: "Month",
  alltime: "All Time",
};

// Same restriction as Reports' TEAM_ORDER in /api/scoreboard — only these
// three are real collections teams; Fee Petition and unassigned agents don't
// belong on a revenue-by-team chart.
const TEAM_ORDER = ["T2", "T16", "Concurrent"];

interface RevenuePanelProps {
  stats: DashboardSummary;
  cases: CaseRow[];
  team: TeamMember[];
}

export const RevenuePanel = ({ stats, cases, team }: RevenuePanelProps) => {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const t = themeClasses(dark);

  const [windowMode, setWindowMode] = useState<RevenueWindowMode>("alltime");
  const [windowedTeams, setWindowedTeams] = useState<{ team: string; collected: number }[] | null>(null);
  const [windowLoading, setWindowLoading] = useState(false);
  const [windowError, setWindowError] = useState<string | null>(null);

  const fetchWindowedTeams = useCallback(
    async (mode: RevenueWindowMode, signal: AbortSignal, cancelledRef: { current: boolean }) => {
      setWindowLoading(true);
      setWindowError(null);
      try {
        const res = await fetch(`/api/revenue-by-team?window=${mode}`, { signal });
        if (!res.ok) throw new Error(`Failed to load revenue by team (${res.status})`);
        const json = await res.json();
        if (cancelledRef.current) return;
        // SQL's GROUP BY gives no ordering guarantee — sort to the same
        // TEAM_ORDER as the "All Time" bars so the row order doesn't jump
        // around between windows.
        const teams: { team: string; collected: number }[] = json.teams ?? [];
        teams.sort((a, b) => TEAM_ORDER.indexOf(a.team) - TEAM_ORDER.indexOf(b.team));
        setWindowedTeams(teams);
      } catch (err) {
        if (cancelledRef.current || (err as Error).name === "AbortError") return;
        setWindowError((err as Error).message);
      } finally {
        if (!cancelledRef.current) setWindowLoading(false);
      }
    },
    [],
  );

  // "All Time" is derived entirely from the `cases`/`team` props (no fetch,
  // matches the original always-cumulative view). Any narrower window has no
  // local data to derive from — fees collected in a day/week/month live only
  // in the payment ledger, not on the case rows this page already has.
  useEffect(() => {
    if (windowMode === "alltime") return;
    const controller = new AbortController();
    const cancelledRef = { current: false };
    fetchWindowedTeams(windowMode, controller.signal, cancelledRef);
    return () => {
      cancelledRef.current = true;
      controller.abort();
    };
  }, [windowMode, fetchWindowedTeams]);

  // Expected/Collected per team, for "All Time" — a case's team comes from
  // its assigned agent's roster entry, not a field on the case itself. Team
  // leads stay included (they aren't filtered here), matching Reports' own
  // team rollup in /api/scoreboard, which only excludes them from the
  // per-agent table, not the team totals.
  const teamByAgent = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of team) {
      if (m.team) map.set(m.name, m.team);
    }
    return map;
  }, [team]);

  const bars = useMemo<TeamRevenueBar[]>(() => {
    const totals = new Map<string, { expected: number; paid: number }>();
    for (const c of cases) {
      const teamName = teamByAgent.get(c.assigned);
      if (!teamName || !TEAM_ORDER.includes(teamName)) continue;
      const cur = totals.get(teamName) ?? { expected: 0, paid: 0 };
      cur.expected += c.expected;
      cur.paid += c.paid;
      totals.set(teamName, cur);
    }
    return TEAM_ORDER.filter((name) => totals.has(name)).map((name) => ({
      team: name,
      ...totals.get(name)!,
    }));
  }, [cases, teamByAgent]);

  // Collection rate = paid / expected. It's a standing ratio (not a delta),
  // so no "+" prefix; color reflects how much of the expected fees are in.
  // Only meaningful for "All Time" — "expected" (the total fee owed) has no
  // time dimension, so a windowed rate would read as a day's collections
  // against the full lifetime total owed rather than anything a team lead
  // could act on.
  const hasExpected = stats.expected > 0;
  const rate = hasExpected ? (stats.paid / stats.expected) * 100 : 0;
  const rateTone = !hasExpected
    ? t.textMuted
    : rate >= 80
      ? "text-emerald-500"
      : rate >= 40
        ? dark
          ? "text-amber-400"
          : "text-amber-600"
        : dark
          ? "text-red-400"
          : "text-red-500";

  const windowedTotal = windowedTeams?.reduce((sum, c) => sum + c.collected, 0) ?? 0;

  return (
    <div className={`rounded-xl border p-4 md:p-5 ${t.card}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className={`text-sm font-bold ${t.text}`}>Revenue by Team</h3>
        <div className={`flex items-center rounded-md border overflow-hidden text-[11px] font-semibold shrink-0 ${dark ? "border-neutral-700" : "border-neutral-200"}`}>
          {(["today", "week", "month", "alltime"] as const).map((mode) => {
            const active = windowMode === mode;
            return (
              <button
                key={mode}
                onClick={() => setWindowMode(mode)}
                aria-pressed={active}
                className={`px-2.5 py-1 transition-colors ${
                  active
                    ? dark
                      ? "bg-emerald-700 text-white"
                      : "bg-emerald-600 text-white"
                    : dark
                      ? "text-neutral-400 hover:bg-neutral-800"
                      : "text-neutral-500 hover:bg-neutral-50"
                }`}
              >
                {WINDOW_LABELS[mode]}
              </button>
            );
          })}
        </div>
      </div>

      {windowMode === "alltime" ? (
        <>
          <div className={`text-2xl font-extrabold ${t.text} mt-1`}>
            {fmtFull(stats.paid)}
          </div>
          <div className={`text-[13px] font-medium mt-0.5 ${rateTone}`}>
            {hasExpected
              ? `${rate.toFixed(1)}% collection rate`
              : "No fees expected yet"}
          </div>
        </>
      ) : windowError ? (
        <div className={`text-[13px] mt-1 ${dark ? "text-red-400" : "text-red-500"}`} role="alert">
          {windowError}
        </div>
      ) : (
        <>
          <div className={`text-2xl font-extrabold ${t.text} mt-1`}>
            {fmtFull(windowedTotal)}
          </div>
          <div className={`text-[13px] font-medium mt-0.5 ${t.textMuted}`}>
            Collected — {WINDOW_LABELS[windowMode]}
          </div>
        </>
      )}

      <div className="mt-4" aria-busy={windowLoading}>
        <TeamRevenueStats
          dark={dark}
          bars={bars}
          windowedTeams={windowMode === "alltime" ? null : windowedTeams}
        />
      </div>
    </div>
  );
};
