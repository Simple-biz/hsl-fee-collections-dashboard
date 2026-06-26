"use client";

import { useState } from "react";
import { themeClasses } from "@/lib/theme-classes";
import { fmt } from "@/lib/formatters";

export interface ScoreboardSummary {
  totalCasesAssigned: number;
  totalOpenCases: number;
  totalCasesClosed: number;
  totalCompletedWinSheets: number;
  totalWinSheetsCreated: number;
  totalUnpaidT2Over60: number;
  totalUnpaidT16Over60: number;
  totalUnpaidConcOver60: number;
  totalUnpaidT2Over90: number;
  totalUnpaidT16Over90: number;
  totalUnpaidConcOver90: number;
  totalCollected: number;
  totalFeesCollectedInWindow: number;
  totalCasesFullFee: number;
  totalSsaCalls: number;
  totalClientCalls: number;
}

export interface ScoreboardTeam {
  team: string;
  agentCount: number;
  casesAssigned: number;
  openCases: number;
  casesClosed: number;
  completedWinSheets: number;
  winSheetsCreated: number;
  unpaidT2Over60: number;
  unpaidT16Over60: number;
  unpaidConcOver60: number;
  totalCollected: number;
  feesCollectedInWindow: number;
  casesFullFee: number;
  ssaCalls: number;
  clientCalls: number;
}

interface ScoreboardSummaryCardsProps {
  summary: ScoreboardSummary;
  teams: ScoreboardTeam[];
  label: string;
  dark: boolean;
  t: ReturnType<typeof themeClasses>;
  showMiniCards?: boolean;
}

export function ScoreboardSummaryCards({
  summary,
  teams,
  label,
  dark,
  t,
  showMiniCards = true,
}: ScoreboardSummaryCardsProps) {
  const [t2Days, setT2Days] = useState<60 | 90>(60);
  const [t16Days, setT16Days] = useState<60 | 90>(60);
  const [concDays, setConcDays] = useState<60 | 90>(60);

  const stats: { label: string; value: string | number; onClick?: () => void; toggled?: boolean }[] = [
    { label: "Cases Assigned", value: summary.totalCasesAssigned },
    { label: "Win Sheets", value: summary.totalCompletedWinSheets },
    {
      label: `T2 >${t2Days}D`,
      value: t2Days === 60 ? summary.totalUnpaidT2Over60 : summary.totalUnpaidT2Over90,
      onClick: () => setT2Days((v) => v === 60 ? 90 : 60),
      toggled: t2Days === 90,
    },
    {
      label: `T16 >${t16Days}D`,
      value: t16Days === 60 ? summary.totalUnpaidT16Over60 : summary.totalUnpaidT16Over90,
      onClick: () => setT16Days((v) => v === 60 ? 90 : 60),
      toggled: t16Days === 90,
    },
    {
      label: `CONC >${concDays}D`,
      value: concDays === 60 ? summary.totalUnpaidConcOver60 : summary.totalUnpaidConcOver90,
      onClick: () => setConcDays((v) => v === 60 ? 90 : 60),
      toggled: concDays === 90,
    },
    { label: "Collected", value: fmt(summary.totalCollected) },
    { label: "Full Fee", value: summary.totalCasesFullFee },
    { label: "SSA Calls", value: summary.totalSsaCalls },
    { label: "Client Calls", value: summary.totalClientCalls },
  ];

  return (
    <>
      {/* Summary mini-cards */}
      {showMiniCards && (
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-3">
          {stats.map((item) =>
            item.onClick ? (
              <button
                key={item.label}
                onClick={item.onClick}
                aria-pressed={item.toggled}
                aria-label={`${item.label} aging threshold — click to toggle`}
                title="Toggle 60D / 90D threshold"
                className={`rounded-lg border p-3 text-left transition-colors ${
                  item.toggled
                    ? dark
                      ? "bg-violet-900/20 border-violet-700/60"
                      : "bg-violet-50 border-violet-300"
                    : t.card
                }`}
              >
                <p className={`text-[10px] font-medium uppercase ${item.toggled ? (dark ? "text-violet-400" : "text-violet-600") : t.textMuted}`}>
                  {item.label}
                </p>
                <p className={`text-lg font-bold mt-1 ${item.toggled ? (dark ? "text-violet-300" : "text-violet-700") : t.text}`}>
                  {item.value}
                </p>
              </button>
            ) : (
              <div key={item.label} className={`rounded-lg border p-3 ${t.card}`}>
                <p className={`text-[10px] font-medium ${t.textMuted} uppercase`}>
                  {item.label}
                </p>
                <p className={`text-lg font-bold ${t.text} mt-1`}>{item.value}</p>
              </div>
            )
          )}
        </div>
      )}

      {/* Team breakdown */}
      {teams.length > 0 && (
        <div>
          <p className={`text-[10px] font-semibold uppercase tracking-wider ${t.textMuted} mb-3`}>
            By Team — {label}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {teams.map((team) => {
              const teamColor =
                team.team === "T2"
                  ? dark
                    ? "border-blue-700/50 bg-blue-900/10"
                    : "border-blue-200 bg-blue-50/60"
                  : team.team === "T16"
                    ? dark
                      ? "border-purple-700/50 bg-purple-900/10"
                      : "border-purple-200 bg-purple-50/60"
                    : dark
                      ? "border-teal-700/50 bg-teal-900/10"
                      : "border-teal-200 bg-teal-50/60";
              const teamLabel =
                team.team === "T2"
                  ? "T2 Team"
                  : team.team === "T16"
                    ? "T16 Team"
                    : "Concurrent Team";
              const accentText =
                team.team === "T2"
                  ? dark
                    ? "text-blue-400"
                    : "text-blue-700"
                  : team.team === "T16"
                    ? dark
                      ? "text-purple-400"
                      : "text-purple-700"
                    : dark
                      ? "text-teal-400"
                      : "text-teal-700";
              return (
                <div key={team.team} className={`rounded-lg border p-4 ${teamColor}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-xs font-bold ${accentText}`}>
                      {teamLabel}
                    </span>
                    <span className={`text-[10px] ${t.textMuted}`}>
                      {team.agentCount} agent{team.agentCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "Fees Collected", value: fmt(team.feesCollectedInWindow) },
                      { label: "SSA Calls", value: team.ssaCalls },
                      { label: "CL Calls", value: team.clientCalls },
                      { label: "Win Sheets", value: team.winSheetsCreated },
                      { label: "Cases Closed", value: team.casesClosed },
                      { label: "Open Cases", value: team.openCases },
                    ].map((stat) => (
                      <div key={stat.label}>
                        <p className={`text-[9px] font-medium uppercase tracking-wide ${t.textMuted}`}>
                          {stat.label}
                        </p>
                        <p className={`text-sm font-bold ${t.text} mt-0.5`}>
                          {stat.value}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
