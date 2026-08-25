"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { TeamRevenueStats, type TeamRevenueEntry } from "@/components/cases/TeamRevenueStats";
import { themeClasses } from "@/lib/theme-classes";
import { fmtFull } from "@/lib/formatters";

// Same restriction as Reports' TEAM_ORDER in /api/scoreboard — only these
// three are real collections teams; Fee Petition and unassigned agents don't
// belong on a revenue-by-team chart.
const TEAM_ORDER = ["T2", "T16", "Concurrent"];

// Always shows the current month's Collected per team as a bar chart —
// matches Reports' "Fees This Month" team cards exactly (same
// /api/revenue-by-team?window=month endpoint, same dollar-for-dollar
// figures). The Today/Week/All Time toggle and the Expected/Collected
// pairing were dropped at Jazz/Lori's request — this panel reads as a
// simple graph, not a data table.
export const RevenuePanel = () => {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const t = themeClasses(dark);

  const [teams, setTeams] = useState<TeamRevenueEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const cancelledRef = { current: false };
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/revenue-by-team?window=month", { signal: controller.signal });
        if (!res.ok) throw new Error(`Failed to load revenue by team (${res.status})`);
        const json = await res.json();
        if (cancelledRef.current) return;
        // SQL's GROUP BY gives no ordering guarantee — sort to a fixed display order.
        const rows: TeamRevenueEntry[] = json.teams ?? [];
        rows.sort((a, b) => TEAM_ORDER.indexOf(a.team) - TEAM_ORDER.indexOf(b.team));
        setTeams(rows);
      } catch (err) {
        if (cancelledRef.current || (err as Error).name === "AbortError") return;
        setError((err as Error).message);
      } finally {
        if (!cancelledRef.current) setLoading(false);
      }
    })();
    return () => {
      cancelledRef.current = true;
      controller.abort();
    };
  }, []);

  const totalCollected = teams?.reduce((sum, tm) => sum + tm.collected, 0) ?? 0;

  return (
    <div className={`rounded-xl border p-4 md:p-5 ${t.card}`}>
      <h3 className={`text-sm font-bold ${t.text}`}>Revenue by Team</h3>

      {error ? (
        <div className={`text-[13px] mt-1 ${dark ? "text-red-400" : "text-red-500"}`} role="alert">
          {error}
        </div>
      ) : (
        <>
          <div className={`text-2xl font-extrabold ${t.text} mt-1`}>{fmtFull(totalCollected)}</div>
          <div className={`text-[13px] font-medium mt-0.5 ${t.textMuted}`}>Collected — Month</div>
        </>
      )}

      {!error && (
        <div className="mt-4" aria-busy={loading}>
          {loading && !teams ? (
            <div className="flex items-center justify-center h-24 text-[13px] text-neutral-400 dark:text-neutral-500">
              Loading…
            </div>
          ) : (
            <TeamRevenueStats dark={dark} teams={teams ?? []} />
          )}
        </div>
      )}
    </div>
  );
};
