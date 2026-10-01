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
import type { DropdownOptionsByCategory } from "@/lib/dropdown-options";
import type { DateRange } from "@/lib/date-range-context";

// Re-exported for the many existing `from "@/hooks/useDashboard"` imports —
// the type itself now lives in lib/dropdown-options.ts alongside the fetch
// helper other pages use instead of pulling in this whole hook.
export type { DropdownOptionsByCategory };

interface DashboardData {
  cases: CaseRow[];
  summary: DashboardSummary;
  monthlyData: MonthlyData[];
  team: TeamMember[];
  approvedByOptions: ApprovedByOption[];
  dropdownOptions: DropdownOptionsByCategory;
  loading: boolean; // summary + team (fast — powers KPI cards + collections chart)
  casesLoading: boolean; // the heavier /api/cases list (powers the fee records table)
  // True once the cases list has completed loading at least once — lets
  // consumers distinguish "still loading for the first time" from "loading
  // again after a refresh", even when the result is a genuinely empty list.
  casesLoadedOnce: boolean;
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

export const useDashboard = (dateRange?: DateRange | null): DashboardData => {
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
  const [casesLoadedOnce, setCasesLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const summaryAbortRef = useRef<AbortController | null>(null);
  const summaryCancelledRef = useRef(false);
  const casesAbortRef = useRef<AbortController | null>(null);
  const casesCancelledRef = useRef(false);

  // Fetches summary, team, and dropdown options. Re-runs on dateRange change.
  const fetchSummary = useCallback(() => {
    summaryAbortRef.current?.abort();
    const controller = new AbortController();
    summaryAbortRef.current = controller;

    setLoading(true);
    setError(null);

    const dashboardUrl = dateRange
      ? `/api/dashboard?from=${dateRange.from}&to=${dateRange.to}`
      : "/api/dashboard";

    // Summary + team + ALL dropdown_options (one round-trip, grouped by
    // category on the client) power the KPI cards and the inline-editable
    // dropdowns in the fee records table.
    void (async () => {
      const [dashRes, teamRes, optRes] = await Promise.all([
        fetch(dashboardUrl, { signal: controller.signal }),
        fetch("/api/team-members", { signal: controller.signal }),
        fetch("/api/settings/dropdown-options", { signal: controller.signal }),
      ]);
      if (!dashRes.ok)
        throw new Error(`Failed to fetch dashboard data (${dashRes.status})`);
      if (!teamRes.ok)
        throw new Error(`Failed to fetch team data (${teamRes.status})`);
      const dashJson = await dashRes.json();
      const teamJson = await teamRes.json();
      if (summaryCancelledRef.current) return;
      setSummary(dashJson.summary);
      setMonthlyData(dashJson.monthlyData);
      setTeam(teamJson.data);
      // Options are non-critical: an empty list just yields an empty dropdown.
      if (optRes.ok) {
        const optJson = await optRes.json();
        const all: (ApprovedByOption & { category: DropdownCategory })[] =
          optJson.data || [];
        // Grouped inline rather than via the shared groupDropdownOptions()
        // helper — routing this specific assignment through a function call
        // trips a false-positive react-hooks/set-state-in-effect on this
        // effect's deeply-nested async IIFE (verified: reverting to the
        // inline loop, byte-for-byte the same result, makes the lint error
        // disappear). Keep this in sync with lib/dropdown-options.ts's
        // groupDropdownOptions if the category-key logic ever changes.
        const grouped: DropdownOptionsByCategory = {};
        for (const o of all) {
          (grouped[o.category] ||= []).push(o);
        }
        if (summaryCancelledRef.current) return;
        setDropdownOptions(grouped);
        setApprovedByOptions(grouped.approved_by || []);
      }
    })()
      .catch((err: unknown) => {
        if ((err as Error).name === "AbortError") return;
        if (!summaryCancelledRef.current) setError((err as Error).message);
      })
      .finally(() => {
        if (!controller.signal.aborted && !summaryCancelledRef.current)
          setLoading(false);
      });
  }, [dateRange]);

  // Fetches the active cases list. Runs once on mount — date-insensitive, so
  // it doesn't re-run when the range changes. Strict Mode safe: [] deps means
  // React re-runs it on remount in dev, which is harmless (cases load twice).
  const fetchCases = useCallback(() => {
    casesAbortRef.current?.abort();
    const controller = new AbortController();
    casesAbortRef.current = controller;

    setCasesLoading(true);

    // Pull the full active set in one request — the table paginates/filters
    // client-side, so it needs every row, not the API's default page of 50.
    // Active caseload is hundreds to low-thousands; a high limit is fine.
    void (async () => {
      const casesRes = await fetch("/api/cases?isClosed=false&limit=100000", {
        signal: controller.signal,
      });
      if (!casesRes.ok)
        throw new Error(`Failed to fetch cases (${casesRes.status})`);
      const casesJson = await casesRes.json();
      if (casesCancelledRef.current) return;
      setCases(casesJson.data);
    })()
      .catch((err: unknown) => {
        if ((err as Error).name === "AbortError") return;
        if (!casesCancelledRef.current) setError((err as Error).message);
      })
      .finally(() => {
        if (!controller.signal.aborted && !casesCancelledRef.current) {
          setCasesLoading(false);
          setCasesLoadedOnce(true);
        }
      });
  }, []);

  useEffect(() => {
    summaryCancelledRef.current = false;
    fetchSummary();
    return () => {
      summaryCancelledRef.current = true;
      summaryAbortRef.current?.abort();
    };
  }, [fetchSummary]);

  useEffect(() => {
    casesCancelledRef.current = false;
    fetchCases();
    return () => {
      casesCancelledRef.current = true;
      casesAbortRef.current?.abort();
    };
  }, [fetchCases]);

  const refresh = useCallback(() => {
    fetchSummary();
    fetchCases();
  }, [fetchSummary, fetchCases]);

  return {
    cases,
    summary,
    monthlyData,
    team,
    approvedByOptions,
    dropdownOptions,
    loading,
    casesLoading,
    casesLoadedOnce,
    error,
    refresh,
  };
};
