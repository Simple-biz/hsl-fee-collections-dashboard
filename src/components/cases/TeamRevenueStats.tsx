"use client";

import { fmt } from "@/lib/formatters";
import { teamCardClasses, teamAccentText, teamLabel } from "@/lib/team-colors";

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

// Plain-text stat rows rather than a bar chart — a bar chart made T2/CONC's
// larger dollar totals visually dwarf T16's smaller one on the same scale,
// reading as "T16 is underperforming" even when its own collection rate was
// fine. Numbers side by side, with no shared height to compare against,
// don't carry that same implication. Stacked full-width rows (not a 3-column
// grid) — this panel is already one of three columns on the dashboard, so a
// nested 3-up grid squeezes each team's Expected/Collected into too little
// width to read.
export const TeamRevenueStats = ({ dark, bars, windowedTeams }: TeamRevenueStatsProps) => {
  if (windowedTeams) {
    if (windowedTeams.length === 0) {
      return (
        <div className="flex items-center justify-center h-24 text-[13px] text-neutral-400 dark:text-neutral-500">
          No fees collected in this window yet
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {windowedTeams.map((b) => (
          <div
            key={b.team}
            className={`rounded-lg border p-3 flex items-center justify-between gap-3 ${teamCardClasses(b.team, dark)}`}
          >
            <p className={`text-xs font-bold ${teamAccentText(b.team, dark)}`}>{teamLabel(b.team)}</p>
            <div className="text-right">
              <p className={statLabelClass}>Collected</p>
              <p className={statValueClass}>{fmt(b.collected)}</p>
            </div>
          </div>
        ))}
      </div>
    );
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
      {bars.map((b) => (
        <div
          key={b.team}
          className={`rounded-lg border p-3 flex items-center justify-between gap-3 ${teamCardClasses(b.team, dark)}`}
        >
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
      ))}
    </div>
  );
};
