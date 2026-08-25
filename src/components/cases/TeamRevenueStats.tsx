"use client";

import { fmt } from "@/lib/formatters";
import { teamCardClasses, teamAccentText, teamLabel, teamFillBg } from "@/lib/team-colors";

export interface TeamRevenueBar {
  team: string;
  expected: number;
  paid: number;
}

interface TeamRevenueStatsProps {
  dark: boolean;
  /** Pre-aggregated Expected/Collected per team, in display order (see
   *  RevenuePanel's TEAM_ORDER) — this component doesn't own the team
   *  taxonomy. */
  bars: TeamRevenueBar[];
  /** Collected-in-window totals per team. When set (any window other than
   *  "All Time"), each row shows only Collected — "Expected" (the total fee
   *  owed) has no time dimension, so there's nothing to pair it with. */
  windowedTeams?: { team: string; collected: number }[] | null;
}

const statLabelClass = "text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400";
const statValueClass = "text-sm font-bold text-neutral-900 dark:text-neutral-100 mt-0.5";

// Windowed (Today/Week/Month) has only Collected — a plain vertical bar
// chart per team, shared dollar scale, same shape as Reports' own "Fees
// This Month" team cards. Comparing raw Collected across teams for the same
// period is an apples-to-apples read (unlike Expected-vs-Collected below),
// so a shared scale doesn't carry the "T16 is underperforming" implication.
const WindowedBars = ({ dark, teams }: { dark: boolean; teams: { team: string; collected: number }[] }) => {
  const maxVal = Math.max(...teams.map((t) => t.collected), 1);
  return (
    <div className="flex items-end gap-6 justify-center h-32 px-2">
      {teams.map((t) => (
        <div key={t.team} className="flex flex-col items-center gap-1.5 flex-1">
          <span className={`text-[12px] font-semibold ${teamAccentText(t.team, dark)}`}>{fmt(t.collected)}</span>
          <div className="w-full flex items-end justify-center h-20">
            <div
              className={`w-10 rounded-t ${teamFillBg(t.team)}`}
              style={{ height: `${Math.max((t.collected / maxVal) * 100, 2)}%` }}
            />
          </div>
          <span className={`text-[11px] font-medium ${dark ? "text-neutral-400" : "text-neutral-500"}`}>
            {teamLabel(t.team)}
          </span>
        </div>
      ))}
    </div>
  );
};

// All Time pairs Expected with Collected, so each team's progress bar is
// scaled to its OWN Expected (% collected), not a shared dollar axis across
// teams — a shared axis made T2/CONC's larger dollar totals visually dwarf
// T16's smaller one, reading as "T16 is underperforming" even when its own
// collection rate was fine.
export const TeamRevenueStats = ({ dark, bars, windowedTeams }: TeamRevenueStatsProps) => {
  if (windowedTeams) {
    if (windowedTeams.length === 0) {
      return (
        <div className="flex items-center justify-center h-24 text-[13px] text-neutral-400 dark:text-neutral-500">
          No fees collected in this window yet
        </div>
      );
    }

    return <WindowedBars dark={dark} teams={windowedTeams} />;
  }

  if (bars.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-[13px] text-neutral-400 dark:text-neutral-500">
        No team data yet
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {bars.map((b) => {
        const pct = b.expected > 0 ? Math.min(100, (b.paid / b.expected) * 100) : 0;
        return (
          <div
            key={b.team}
            className={`rounded-lg border p-3 ${teamCardClasses(b.team, dark)}`}
          >
            <div className="flex items-center justify-between gap-3">
              <p className={`text-xs font-bold ${teamAccentText(b.team, dark)}`}>{teamLabel(b.team)}</p>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className={statLabelClass}>Expected</p>
                  <p className={statValueClass}>{fmt(b.expected)}</p>
                </div>
                <div className="text-right">
                  <p className={statLabelClass}>Collected</p>
                  <p className={statValueClass}>{fmt(b.paid)}</p>
                </div>
              </div>
            </div>
            <div
              className={`mt-2 h-1.5 rounded-full overflow-hidden ${dark ? "bg-neutral-800" : "bg-neutral-200"}`}
              role="progressbar"
              aria-valuenow={Math.round(pct)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${teamLabel(b.team)} collection progress`}
            >
              <div className={`h-full rounded-full ${teamFillBg(b.team)}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};
