"use client";

import { useState, useEffect, useCallback } from "react";
import type {
  CaseRow,
  DashboardSummary,
  MonthlyData,
  TeamMember,
} from "@/types";

interface DashboardData {
  cases: CaseRow[];
  summary: DashboardSummary;
  monthlyData: MonthlyData[];
  team: TeamMember[];
  loading: boolean; // summary + team (fast — powers KPI cards + collections chart)
  casesLoading: boolean; // the heavier /api/cases list (powers the fee records table)
  error: string | null;
  refresh: () => void;
}

const EMPTY_SUMMARY: DashboardSummary = {
  totalCases: 0,
  expected: 0,
  paid: 0,
  outstanding: 0,
  pif: 0,
  syncErrors: 0,
  synced: 0,
};

export const useDashboard = (): DashboardData => {
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [summary, setSummary] = useState<DashboardSummary>(EMPTY_SUMMARY);
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [casesLoading, setCasesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setCasesLoading(true);
    setError(null);

    // Summary + team are quick and power the KPI cards and collections chart.
    const summaryTask = (async () => {
      const [dashRes, teamRes] = await Promise.all([
        fetch("/api/dashboard"),
        fetch("/api/team-members"),
      ]);
      if (!dashRes.ok || !teamRes.ok) {
        throw new Error("Failed to fetch dashboard data");
      }
      const dashJson = await dashRes.json();
      const teamJson = await teamRes.json();
      setSummary(dashJson.summary);
      setMonthlyData(dashJson.monthlyData);
      setTeam(teamJson.data);
    })();

    // The cases list is heavier; let it resolve independently so the table
    // doesn't hold up the rest of the dashboard.
    const casesTask = (async () => {
      const casesRes = await fetch("/api/cases");
      if (!casesRes.ok) throw new Error("Failed to fetch cases");
      const casesJson = await casesRes.json();
      setCases(casesJson.data);
    })();

    // Both fetches run in parallel; flip each loading flag as it settles.
    await Promise.all([
      summaryTask
        .catch((err: unknown) => setError((err as Error).message))
        .finally(() => setLoading(false)),
      casesTask
        .catch((err: unknown) => setError((err as Error).message))
        .finally(() => setCasesLoading(false)),
    ]);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return {
    cases,
    summary,
    monthlyData,
    team,
    loading,
    casesLoading,
    error,
    refresh: fetchAll,
  };
};
