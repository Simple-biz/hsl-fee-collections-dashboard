"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  CaseRow,
  DashboardSummary,
  MonthlyData,
  TeamMember,
  ApprovedByOption,
} from "@/types";
import type { DropdownCategory } from "@/lib/dropdown-categories";

export type DropdownOptionsByCategory = Partial<
  Record<DropdownCategory, ApprovedByOption[]>
>;

interface DashboardData {
  cases: CaseRow[];
  summary: DashboardSummary;
  monthlyData: MonthlyData[];
  team: TeamMember[];
  approvedByOptions: ApprovedByOption[];
  dropdownOptions: DropdownOptionsByCategory;
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
  feesCollectedMTD: 0,
  casesClosedMTD: 0,
};

export const useDashboard = (): DashboardData => {
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [summary, setSummary] = useState<DashboardSummary>(EMPTY_SUMMARY);
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [approvedByOptions, setApprovedByOptions] = useState<
    ApprovedByOption[]
  >([]);
  const [dropdownOptions, setDropdownOptions] =
    useState<DropdownOptionsByCategory>({});
  const [loading, setLoading] = useState(true);
  const [casesLoading, setCasesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);

  const fetchAll = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    cancelledRef.current = false;

    setLoading(true);
    setCasesLoading(true);
    setError(null);

    // Summary + team + ALL dropdown_options (one round-trip, grouped by
    // category on the client) power the KPI cards and the inline-editable
    // dropdowns in the fee records table.
    const summaryTask = (async () => {
      const [dashRes, teamRes, optRes] = await Promise.all([
        fetch("/api/dashboard", { signal: controller.signal }),
        fetch("/api/team-members", { signal: controller.signal }),
        fetch("/api/settings/dropdown-options", { signal: controller.signal }),
      ]);
      if (!dashRes.ok)
        throw new Error(`Failed to fetch dashboard data (${dashRes.status})`);
      if (!teamRes.ok)
        throw new Error(`Failed to fetch team data (${teamRes.status})`);
      const dashJson = await dashRes.json();
      const teamJson = await teamRes.json();
      if (cancelledRef.current) return;
      setSummary(dashJson.summary);
      setMonthlyData(dashJson.monthlyData);
      setTeam(teamJson.data);
      // Options are non-critical: an empty list just yields an empty dropdown.
      if (optRes.ok) {
        const optJson = await optRes.json();
        const all: (ApprovedByOption & { category: DropdownCategory })[] =
          optJson.data || [];
        // Group by category for fast per-cell lookup in the table.
        const grouped: DropdownOptionsByCategory = {};
        for (const o of all) {
          (grouped[o.category] ||= []).push(o);
        }
        if (cancelledRef.current) return;
        setDropdownOptions(grouped);
        setApprovedByOptions(grouped.approved_by || []);
      }
    })();

    // The cases list is heavier; let it resolve independently so the table
    // doesn't hold up the rest of the dashboard. Active (non-closed) only —
    // closed cases live on /fees-closed.
    const casesTask = (async () => {
      // Pull the full active set in one request — the table paginates/filters
      // client-side, so it needs every row, not the API's default page of 50.
      // Active caseload is hundreds to low-thousands; a high limit is fine.
      const casesRes = await fetch("/api/cases?isClosed=false&limit=100000", {
        signal: controller.signal,
      });
      if (!casesRes.ok)
        throw new Error(`Failed to fetch cases (${casesRes.status})`);
      const casesJson = await casesRes.json();
      if (cancelledRef.current) return;
      setCases(casesJson.data);
    })();

    // Both fetches run in parallel; flip each loading flag as it settles.
    await Promise.all([
      summaryTask
        .catch((err: unknown) => {
          if ((err as Error).name === "AbortError") return;
          if (!cancelledRef.current) setError((err as Error).message);
        })
        .finally(() => {
          if (!cancelledRef.current) setLoading(false);
        }),
      casesTask
        .catch((err: unknown) => {
          if ((err as Error).name === "AbortError") return;
          if (!cancelledRef.current) setError((err as Error).message);
        })
        .finally(() => {
          if (!cancelledRef.current) setCasesLoading(false);
        }),
    ]);
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    fetchAll();
    return () => {
      cancelledRef.current = true;
      abortRef.current?.abort();
    };
  }, [fetchAll]);

  return {
    cases,
    summary,
    monthlyData,
    team,
    approvedByOptions,
    dropdownOptions,
    loading,
    casesLoading,
    error,
    refresh: fetchAll,
  };
};
