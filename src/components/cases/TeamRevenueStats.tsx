"use client";

import { fmt } from "@/lib/formatters";
import { teamAccentText, teamLabel, teamFillBg } from "@/lib/team-colors";

export interface TeamRevenueEntry {
  team: string;
  collected: number;
}

interface TeamRevenueStatsProps {
  dark: boolean;
  teams: TeamRevenueEntry[];
}

// Vertical bar chart per team, shared dollar scale — same shape as Reports'
// own "Fees This Month" team cards, so the two pages read as the same chart.
export const TeamRevenueStats = ({ dark, teams }: TeamRevenueStatsProps) => {
  if (teams.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-[13px] text-neutral-400 dark:text-neutral-500">
        No fees collected this month yet
      </div>
    );
  }

  const maxVal = Math.max(...teams.map((t) => t.collected), 1);

  return (
    // Columns share one fixed width rather than sizing to their own label —
    // "Concurrent Team" is nearly twice as wide as "T2 Team"/"T16 Team", so
    // letting each column auto-size made the bar next to the long label sit
    // visibly further from its neighbor than the other two bars were from
    // each other, even with equal gap/flex-1 removed. A shared width keeps
    // every bar-to-bar gap equal; "Concurrent Team" wraps to two lines
    // rather than widening its column and throwing the spacing off again.
    <div className="flex items-end justify-center gap-4 h-32 px-2">
      {teams.map((t) => (
        <div key={t.team} className="flex flex-col items-center gap-1.5 w-16">
          <span className={`text-[12px] font-semibold ${teamAccentText(t.team, dark)}`}>{fmt(t.collected)}</span>
          <div className="flex items-end justify-center h-20">
            <div
              className={`w-10 rounded-t ${teamFillBg(t.team)}`}
              style={{ height: `${Math.max((t.collected / maxVal) * 100, 2)}%` }}
            />
          </div>
          {/* Fixed-height slot, top-aligned — "Concurrent Team" wraps to two
              lines while the other labels are one. Without a shared height
              here, the outer row's items-end bottom-alignment made the
              taller (wrapped) column push its bar upward relative to the
              other two, distorting the height comparison between teams. */}
          <div className="h-8 flex items-start justify-center">
            <span
              className={`text-[11px] font-medium text-center leading-tight ${dark ? "text-neutral-400" : "text-neutral-500"}`}
            >
              {teamLabel(t.team)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};
