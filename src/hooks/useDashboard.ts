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
  loading: boolean;
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
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [casesRes, dashRes, teamRes] = await Promise.all([
        fetch("/api/cases"),
        fetch("/api/dashboard"),
        fetch("/api/team-members"),
      ]);

      if (!casesRes.ok || !dashRes.ok || !teamRes.ok) {
        throw new Error("Failed to fetch dashboard data");
      }

      const casesJson = await casesRes.json();
      const dashJson = await dashRes.json();
      const teamJson = await teamRes.json();

      setCases(casesJson.data);
      setSummary(dashJson.summary);
      setMonthlyData(dashJson.monthlyData);
      setTeam(teamJson.data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
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
    error,
    refresh: fetchAll,
  };
};
