"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ReadonlyURLSearchParams } from "next/navigation";
import type { SortKey, SortDir } from "@/components/cases/fee-records-types";

interface Params {
  searchParams: ReadonlyURLSearchParams;
  // Sort + page state live in the component; the filter hook reads them to
  // build the URL and to run the page-reset effect.
  sortKey: SortKey;
  sortDir: SortDir;
  pageSize: number | "all";
  defaultSortKey: SortKey;
  dateRange: { from: string; to: string } | null | undefined;
  agingFilter: "all" | "unpaid_60" | "unpaid_90";
  setPageIndex: (n: number) => void;
  // Called by clearFilters to reset sort state back to defaults.
  onClearSort: () => void;
}

interface FilterState {
  search: string;
  setSearch: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  assignedFilter: string;
  setAssignedFilter: (v: string) => void;
  feesConfFilter: string;
  setFeesConfFilter: (v: string) => void;
  claimFilter: string;
  setClaimFilter: (v: string) => void;
  caseStatusFilter: string;
  setCaseStatusFilter: (v: string) => void;
  levelFilter: string;
  setLevelFilter: (v: string) => void;
  approverFilter: string;
  setApproverFilter: (v: string) => void;
  followUpMode: "all" | "day" | "range";
  setFollowUpMode: (v: "all" | "day" | "range") => void;
  followUpDay: string;
  setFollowUpDay: (v: string) => void;
  followUpFrom: string;
  setFollowUpFrom: (v: string) => void;
  followUpTo: string;
  setFollowUpTo: (v: string) => void;
  hasActiveFilters: boolean;
  clearFilters: () => void;
}

// Manages all table filter state, URL persistence, and page-reset side-effects
// for FeeRecordsTable. Sort/pagination state lives in the component; this hook
// reads them as reactive params for the URL sync and page-reset effect.
export function useFeeRecordsFilters({
  searchParams,
  sortKey,
  sortDir,
  pageSize,
  defaultSortKey,
  dateRange,
  agingFilter,
  setPageIndex,
  onClearSort,
}: Params): FilterState {
  const router = useRouter();

  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get("status") ?? "all");
  const [assignedFilter, setAssignedFilter] = useState(() => searchParams.get("assigned") ?? "all");
  const [feesConfFilter, setFeesConfFilter] = useState(() => searchParams.get("pif") ?? "all");
  const [claimFilter, setClaimFilter] = useState(() => searchParams.get("claim") ?? "all");
  const [caseStatusFilter, setCaseStatusFilter] = useState(() => searchParams.get("cs") ?? "all");
  const [levelFilter, setLevelFilter] = useState(() => searchParams.get("level") ?? "all");
  const [approverFilter, setApproverFilter] = useState(() => searchParams.get("approver") ?? "all");
  const [followUpMode, setFollowUpMode] = useState<"all" | "day" | "range">(() => {
    const m = searchParams.get("fuMode");
    return m === "day" || m === "range" ? m : "all";
  });
  const [followUpDay, setFollowUpDay] = useState(() => searchParams.get("fuDay") ?? "");
  const [followUpFrom, setFollowUpFrom] = useState(() => searchParams.get("fuFrom") ?? "");
  const [followUpTo, setFollowUpTo] = useState(() => searchParams.get("fuTo") ?? "");

  // Persist filter/sort/pageSize in the URL so reloads and shared links
  // restore the same view. State is the source of truth; URL is a debounced
  // write-only sink. pageIndex is deliberately excluded — it always resets to 0.
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (assignedFilter !== "all") params.set("assigned", assignedFilter);
      if (feesConfFilter !== "all") params.set("pif", feesConfFilter);
      if (claimFilter !== "all") params.set("claim", claimFilter);
      if (caseStatusFilter !== "all") params.set("cs", caseStatusFilter);
      if (levelFilter !== "all") params.set("level", levelFilter);
      if (approverFilter !== "all") params.set("approver", approverFilter);
      if (followUpMode !== "all") params.set("fuMode", followUpMode);
      if (followUpDay) params.set("fuDay", followUpDay);
      if (followUpFrom) params.set("fuFrom", followUpFrom);
      if (followUpTo) params.set("fuTo", followUpTo);
      if (sortKey !== defaultSortKey) params.set("sort", sortKey);
      if (sortDir !== "desc") params.set("dir", sortDir);
      if (pageSize !== 100) params.set("size", String(pageSize));
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    }, 300);
    return () => clearTimeout(timer);
  }, [
    search, statusFilter, assignedFilter, feesConfFilter, claimFilter, caseStatusFilter,
    levelFilter, approverFilter, followUpMode, followUpDay, followUpFrom, followUpTo,
    sortKey, sortDir, pageSize, defaultSortKey, router,
  ]);

  // Reset to the first page whenever filter, sort, page-size, or date state changes.
  useEffect(() => {
    setPageIndex(0);
  }, [
    search, statusFilter, assignedFilter, feesConfFilter, claimFilter, caseStatusFilter,
    levelFilter, approverFilter, followUpMode, followUpDay, followUpFrom, followUpTo,
    sortKey, sortDir, pageSize, dateRange, agingFilter,
    // setPageIndex is stable (from useState setter) — including it satisfies
    // exhaustive-deps without causing re-runs.
    setPageIndex,
  ]);

  const hasActiveFilters =
    !!search ||
    !!dateRange ||
    statusFilter !== "all" ||
    assignedFilter !== "all" ||
    feesConfFilter !== "all" ||
    claimFilter !== "all" ||
    caseStatusFilter !== "all" ||
    levelFilter !== "all" ||
    approverFilter !== "all" ||
    followUpMode !== "all" ||
    agingFilter !== "all";

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setAssignedFilter("all");
    setFeesConfFilter("all");
    setClaimFilter("all");
    setCaseStatusFilter("all");
    setLevelFilter("all");
    setApproverFilter("all");
    setFollowUpMode("all");
    setFollowUpDay("");
    setFollowUpFrom("");
    setFollowUpTo("");
    onClearSort();
  };

  return {
    search, setSearch,
    statusFilter, setStatusFilter,
    assignedFilter, setAssignedFilter,
    feesConfFilter, setFeesConfFilter,
    claimFilter, setClaimFilter,
    caseStatusFilter, setCaseStatusFilter,
    levelFilter, setLevelFilter,
    approverFilter, setApproverFilter,
    followUpMode, setFollowUpMode,
    followUpDay, setFollowUpDay,
    followUpFrom, setFollowUpFrom,
    followUpTo, setFollowUpTo,
    hasActiveFilters,
    clearFilters,
  };
}
