"use client";

import { useState, useRef, useEffect } from "react";
import { Check, Table2, MessageSquare } from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import { fmt, toChatBlock } from "@/lib/formatters";
import { teamCardClasses, teamAccentText, teamLabel } from "@/lib/team-colors";

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
  const [byTeamCopied, setByTeamCopied] = useState<"sheets" | "chat" | null>(null);
  const byTeamCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (byTeamCopyTimerRef.current) clearTimeout(byTeamCopyTimerRef.current);
  }, []);

  const copyByTeam = (format: "sheets" | "chat") => {
    const header = format === "sheets"
      ? ["Team", "Agents", "Fees Collected", "SSA Calls", "CL Calls", "Win Sheets", "Cases Closed", "Open Cases"]
      : ["Team", "Agents", "Collected", "SSA", "CL Calls", "Wins", "Closed", "Open"];
    const rows = teams.map((team) => [
      teamLabel(team.team),
      team.agentCount,
      fmt(team.feesCollectedInWindow),
      team.ssaCalls,
      team.clientCalls,
      team.winSheetsCreated,
      team.casesClosed,
      team.openCases,
    ]);
    const text = format === "sheets"
      ? [header, ...rows].map((r) => r.join("\t")).join("\n")
      : toChatBlock(`By Team — ${label}`, header, rows);
    navigator.clipboard.writeText(text).then(() => {
      setByTeamCopied(format);
      if (byTeamCopyTimerRef.current) clearTimeout(byTeamCopyTimerRef.current);
      byTeamCopyTimerRef.current = setTimeout(() => setByTeamCopied(null), 1500);
    });
  };

  // Quiet per-metric accent (border + tint) on the plain cards — not used on
  // the T2/T16/CONC toggle cards below, whose violet highlight is a state
  // indicator (90D vs 60D), not a metric identity.
  const stats: { label: string; value: string | number; onClick?: () => void; toggled?: boolean; accent?: string }[] = [
    { label: "Cases Assigned", value: summary.totalCasesAssigned, accent: "#7c3aed" },
    { label: "Win Sheets", value: summary.totalCompletedWinSheets, accent: "#0284c7" },
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
    { label: "Collected", value: fmt(summary.totalCollected), accent: "#059669" },
    { label: "Full Fee", value: summary.totalCasesFullFee, accent: "#d97706" },
    { label: "SSA Calls", value: summary.totalSsaCalls, accent: "#7c3aed" },
    { label: "Client Calls", value: summary.totalClientCalls, accent: "#0284c7" },
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
                <p className={`text-[12px] font-medium uppercase ${item.toggled ? (dark ? "text-violet-400" : "text-violet-600") : t.textMuted}`}>
                  {item.label}
                </p>
                <p className={`text-lg font-bold mt-1 ${item.toggled ? (dark ? "text-violet-300" : "text-violet-700") : t.text}`}>
                  {item.value}
                </p>
              </button>
            ) : (
              <div
                key={item.label}
                className={`rounded-lg border p-3 border-l-[3px] ${t.card}`}
                style={item.accent ? { borderLeftColor: item.accent } : undefined}
              >
                <p className={`flex items-center gap-1.5 text-[12px] font-medium ${t.textMuted} uppercase`}>
                  {item.accent && (
                    <span
                      aria-hidden="true"
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: item.accent }}
                    />
                  )}
                  {item.label}
                </p>
                <p className={`text-lg font-bold ${t.text} mt-1 select-all cursor-text`}>{item.value}</p>
              </div>
            )
          )}
        </div>
      )}

      {/* Team breakdown */}
      {teams.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className={`text-[12px] font-semibold uppercase tracking-wider ${t.textMuted}`}>
              By Team — {label}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => copyByTeam("sheets")}
                aria-label="Copy By Team for Google Sheets"
                title="Copy for Google Sheets (tab-separated)"
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[12px] font-medium border transition-colors ${byTeamCopied === "sheets" ? (dark ? "border-emerald-700 text-emerald-400" : "border-emerald-300 text-emerald-600") : (dark ? "border-neutral-700 text-neutral-400 hover:bg-neutral-800" : "border-neutral-200 text-neutral-500 hover:bg-neutral-50")}`}
              >
                {byTeamCopied === "sheets"
                  ? <><Check aria-hidden="true" className="h-3 w-3" />Copied</>
                  : <><Table2 aria-hidden="true" className="h-3 w-3" />Sheets</>
                }
              </button>
              <button
                onClick={() => copyByTeam("chat")}
                aria-label="Copy By Team for Google Chat"
                title="Copy for Google Chat (monospace code block)"
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[12px] font-medium border transition-colors ${byTeamCopied === "chat" ? (dark ? "border-emerald-700 text-emerald-400" : "border-emerald-300 text-emerald-600") : (dark ? "border-neutral-700 text-neutral-400 hover:bg-neutral-800" : "border-neutral-200 text-neutral-500 hover:bg-neutral-50")}`}
              >
                {byTeamCopied === "chat"
                  ? <><Check aria-hidden="true" className="h-3 w-3" />Copied</>
                  : <><MessageSquare aria-hidden="true" className="h-3 w-3" />Chat</>
                }
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {teams.map((team) => {
              const teamColor = teamCardClasses(team.team, dark);
              const accentText = teamAccentText(team.team, dark);
              return (
                <div key={team.team} className={`rounded-lg border p-4 ${teamColor}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-xs font-bold ${accentText}`}>
                      {teamLabel(team.team)}
                    </span>
                    <span className={`text-[12px] ${t.textMuted}`}>
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
                        <p className={`text-[11px] font-medium uppercase tracking-wide ${t.textMuted}`}>
                          {stat.label}
                        </p>
                        <p className={`text-sm font-bold ${t.text} mt-0.5 select-all cursor-text`}>
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
