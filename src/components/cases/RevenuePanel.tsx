"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { TeamRevenueStats, type TeamRevenueBar } from "@/components/cases/TeamRevenueStats";
import { themeClasses } from "@/lib/theme-classes";
import { fmtFull } from "@/lib/formatters";

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

interface TeamEntry {
  team: string;
  collected: number;
  /** Only present for "alltime" — today/week/month have no time dimension
   *  to pair Expected against (see /api/revenue-by-team). */
  expected?: number;
}

// Every window — including "All Time" — is fetched from /api/revenue-by-team
// rather than aggregated client-side from the open-cases-only /api/cases
// list. All Time in particular sums total_fees_paid/total_fees_expected
// across every case (open or closed), the same lifetime figure Reports' team
// card shows — the previous client-side aggregate silently dropped every
// closed case's collected fees and read lower than Reports.
export const RevenuePanel = () => {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const t = themeClasses(dark);

  const [windowMode, setWindowMode] = useState<RevenueWindowMode>("alltime");
  const [teamsData, setTeamsData] = useState<TeamEntry[] | null>(null);
  const [windowLoading, setWindowLoading] = useState(false);
  const [windowError, setWindowError] = useState<string | null>(null);

  const fetchTeams = useCallback(
    async (mode: RevenueWindowMode, signal: AbortSignal, cancelledRef: { current: boolean }) => {
      setWindowLoading(true);
      setWindowError(null);
      try {
        const res = await fetch(`/api/revenue-by-team?window=${mode}`, { signal });
        if (!res.ok) throw new Error(`Failed to load revenue by team (${res.status})`);
        const json = await res.json();
        if (cancelledRef.current) return;
        // SQL's GROUP BY gives no ordering guarantee — sort to a fixed
        // display order so rows don't jump around between windows.
        const teams: TeamEntry[] = json.teams ?? [];
        teams.sort((a, b) => TEAM_ORDER.indexOf(a.team) - TEAM_ORDER.indexOf(b.team));
        setTeamsData(teams);
      } catch (err) {
        if (cancelledRef.current || (err as Error).name === "AbortError") return;
        setWindowError((err as Error).message);
      } finally {
        if (!cancelledRef.current) setWindowLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    const cancelledRef = { current: false };
    fetchTeams(windowMode, controller.signal, cancelledRef);
    return () => {
      cancelledRef.current = true;
      controller.abort();
    };
  }, [windowMode, fetchTeams]);

  // All Time pairs Expected with Collected (for the per-team progress bars);
  // today/week/month only ever carry Collected.
  const bars = useMemo<TeamRevenueBar[]>(() => {
    if (windowMode !== "alltime" || !teamsData) return [];
    return teamsData.map((tm) => ({ team: tm.team, expected: tm.expected ?? 0, paid: tm.collected }));
  }, [windowMode, teamsData]);

  const totalCollected = teamsData?.reduce((sum, tm) => sum + tm.collected, 0) ?? 0;
  const totalExpected = teamsData?.reduce((sum, tm) => sum + (tm.expected ?? 0), 0) ?? 0;

  // Collection rate = paid / expected. It's a standing ratio (not a delta),
  // so no "+" prefix; color reflects how much of the expected fees are in.
  // Only meaningful for "All Time" — a windowed rate would read as a day's
  // collections against the full lifetime total owed rather than anything a
  // team lead could act on.
  const hasExpected = totalExpected > 0;
  const rate = hasExpected ? (totalCollected / totalExpected) * 100 : 0;
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

      {windowError ? (
        <div className={`text-[13px] mt-1 ${dark ? "text-red-400" : "text-red-500"}`} role="alert">
          {windowError}
        </div>
      ) : windowMode === "alltime" ? (
        <>
          <div className={`text-2xl font-extrabold ${t.text} mt-1`}>
            {fmtFull(totalCollected)}
          </div>
          <div className={`text-[13px] font-medium mt-0.5 ${rateTone}`}>
            {hasExpected
              ? `${rate.toFixed(1)}% collection rate`
              : "No fees expected yet"}
          </div>
        </>
      ) : (
        <>
          <div className={`text-2xl font-extrabold ${t.text} mt-1`}>
            {fmtFull(totalCollected)}
          </div>
          <div className={`text-[13px] font-medium mt-0.5 ${t.textMuted}`}>
            Collected — {WINDOW_LABELS[windowMode]}
          </div>
        </>
      )}

      <div className="mt-4" aria-busy={windowLoading}>
        {!windowError && windowLoading && !teamsData ? (
          <div className="flex items-center justify-center h-24 text-[13px] text-neutral-400 dark:text-neutral-500">
            Loading…
          </div>
        ) : (
          <TeamRevenueStats
            dark={dark}
            bars={bars}
            windowedTeams={windowMode === "alltime" ? null : teamsData}
          />
        )}
      </div>
    </div>
  );
};
