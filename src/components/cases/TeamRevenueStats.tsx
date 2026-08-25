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
