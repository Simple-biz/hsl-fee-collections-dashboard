"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { StatCards } from "@/components/cases/StatCards";
import { CollectionsPanel } from "@/components/cases/CollectionsPanel";
import { RevenuePanel } from "@/components/cases/RevenuePanel";
import { useDashboard } from "@/hooks/useDashboard";
import { themeClasses } from "@/lib/theme-classes";
import { RefreshCw, AlertCircle } from "lucide-react";
import {
  ScoreboardSummaryCards,
  ScoreboardSummary,
  ScoreboardTeam,
} from "@/components/scoreboard/ScoreboardSummaryCards";
import { RecentActivityFeed, ActivityEntry } from "@/components/reports/RecentActivityFeed";

const toISO = (d: Date) => d.toISOString().slice(0, 10);

const currentMonday = () => {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
};

export default function OverviewPage() {
  const {
    cases,
    summary,
    monthlyData,
    loading,
    error,
    refresh,
  } = useDashboard();
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const t = themeClasses(dark);

  const [scoreboardSummary, setScoreboardSummary] = useState<ScoreboardSummary | null>(null);
  const [scoreboardTeams, setScoreboardTeams] = useState<ScoreboardTeam[]>([]);
  const [scoreboardLabel, setScoreboardLabel] = useState("This Week");
  const [recentActivities, setRecentActivities] = useState<ActivityEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const week = toISO(currentMonday());
    fetch(`/api/scoreboard?week=${week}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load scoreboard (${res.status})`);
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;
        setScoreboardSummary(json.summary);
        setScoreboardTeams(json.teams ?? []);
        if (json.start && json.end) {
          const fmt = (s: string) =>
            new Date(s + "T12:00:00").toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            });
          setScoreboardLabel(`${fmt(json.start)} – ${fmt(json.end)}`);
        }
      })
      .catch((err: Error) => {
        if (err.name === "AbortError") return;
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const to = toISO(new Date());
    const fromD = new Date();
    fromD.setDate(fromD.getDate() - 6);
    const from = toISO(fromD);
    fetch(`/api/reports?from=${from}&to=${to}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load recent activity (${res.status})`);
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;
        setRecentActivities(json.data?.recentActivity ?? []);
      })
      .catch((err: Error) => {
        if (err.name === "AbortError") return;
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  if (error) {
    return (
      <div
        className={`rounded-xl border p-4 flex items-center gap-3 ${dark ? "bg-red-900/20 border-red-800 text-red-400" : "bg-red-50 border-red-200 text-red-700"}`}
      >
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="text-sm">Failed to load dashboard data: {error}</span>
        <button
          onClick={refresh}
          className="ml-auto text-xs font-medium underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className={`h-6 w-6 animate-spin ${t.textMuted}`} aria-hidden="true" />
        <span className={`ml-3 text-sm ${t.textSub}`}>
          Loading dashboard...
        </span>
      </div>
    );
  }

  return (
    <>
      <StatCards stats={summary} monthlyData={monthlyData} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
        <CollectionsPanel data={monthlyData} />
        <RevenuePanel stats={summary} cases={cases} />
      </div>
      {scoreboardSummary && (
        <div
          className={`rounded-xl border p-4 space-y-4 ${dark ? "bg-neutral-900 border-neutral-800" : "bg-white border-neutral-200"}`}
        >
          <ScoreboardSummaryCards
            summary={scoreboardSummary}
            teams={[]}
            label={scoreboardLabel}
            dark={dark}
            t={t}
          />
        </div>
      )}
      {recentActivities.length > 0 && (
        <RecentActivityFeed
          activities={recentActivities}
          dark={dark}
          t={t}
        />
      )}
    </>
  );
}
