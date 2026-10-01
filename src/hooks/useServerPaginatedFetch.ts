"use client";

import { useState, useRef, useEffect } from "react";
import type { CaseRow } from "@/types";
import type { SortKey, SortDir } from "@/components/cases/fee-records-types";

interface Params {
  serverPaginated: boolean;
  mode: string;
  pageIndex: number;
  pageSize: number | "all";
  search: string;
  statusFilter: string;
  assignedFilter: string;
  feesConfFilter: string;
  claimFilter: string;
  caseStatusFilter: string;
  levelFilter: string;
  approverFilter: string;
  followUpMode: "all" | "day" | "range";
  followUpDay: string;
  followUpFrom: string;
  followUpTo: string;
  agingFilter: "all" | "unpaid_60" | "unpaid_90";
  dateRange: { from: string; to: string } | null | undefined;
  sortKey: SortKey;
  sortDir: SortDir;
}

interface Result {
  fetchedCases: CaseRow[];
  fetchTotal: number;
  fetchLoading: boolean;
  fetchLoadedOnce: boolean;
  fetchError: string | null;
  fetchRevision: number;
  setFetchRevision: React.Dispatch<React.SetStateAction<number>>;
}

// Manages the self-fetch lifecycle for FeeRecordsTable when serverPaginated=true.
// Fires on every filter/sort/page state change; search is debounced 300ms.
// Stale responses are discarded via AbortController.
export function useServerPaginatedFetch({
  serverPaginated,
  mode,
  pageIndex,
  pageSize,
  search,
  statusFilter,
  assignedFilter,
  feesConfFilter,
  claimFilter,
  caseStatusFilter,
  levelFilter,
  approverFilter,
  followUpMode,
  followUpDay,
  followUpFrom,
  followUpTo,
  agingFilter,
  dateRange,
  sortKey,
  sortDir,
}: Params): Result {
  const [fetchedCases, setFetchedCases] = useState<CaseRow[]>([]);
  const [fetchTotal, setFetchTotal] = useState(0);
  const [fetchLoading, setFetchLoading] = useState(serverPaginated);
  const [fetchLoadedOnce, setFetchLoadedOnce] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  // Incrementing this triggers a forced re-fetch (e.g. after an import/sync).
  const [fetchRevision, setFetchRevision] = useState(0);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const prevSearchRef = useRef(search);

  useEffect(() => {
    if (!serverPaginated) return;

    const controller = new AbortController();
    fetchAbortRef.current?.abort();
    fetchAbortRef.current = controller;

    const params = new URLSearchParams();
    params.set("isClosed", mode === "closed" ? "true" : "false");
    params.set("page", String(pageIndex + 1));
    params.set("limit", String(pageSize === "all" ? 10000 : pageSize));
    if (search) params.set("search", search);
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
    if (agingFilter && agingFilter !== "all") params.set("aging", agingFilter);
    if (dateRange && mode !== "closed") {
      params.set("dateFrom", dateRange.from);
      params.set("dateTo", dateRange.to);
    }
    params.set("sortKey", sortKey);
    params.set("sortDir", sortDir);

    // Set loading immediately so the table overlay fires even during the
    // 300ms search debounce, not only after the timer fires.
    setFetchLoading(true);
    setFetchError(null);

    const doFetch = async () => {
      try {
        const res = await fetch(`/api/cases?${params}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`Failed to load cases (${res.status})`);
        const json = await res.json() as { data: CaseRow[]; total: number };
        if (!controller.signal.aborted) {
          setFetchedCases(json.data ?? []);
          setFetchTotal(json.total ?? 0);
          setFetchLoadedOnce(true);
        }
      } catch (err) {
        if (!controller.signal.aborted && (err as Error).name !== "AbortError") {
          setFetchError((err as Error).message);
        }
      } finally {
        if (!controller.signal.aborted) setFetchLoading(false);
      }
    };

    // Only debounce when the search string itself changed — not when a filter,
    // page, or sort dep changes while search happens to be non-empty.
    const searchChanged = search !== prevSearchRef.current;
    prevSearchRef.current = search;
    const timer = searchChanged && search ? setTimeout(doFetch, 300) : null;
    if (!timer) doFetch();

    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [
    serverPaginated, mode, pageIndex, pageSize, search, statusFilter, assignedFilter,
    feesConfFilter, claimFilter, caseStatusFilter, levelFilter, approverFilter,
    followUpMode, followUpDay, followUpFrom, followUpTo, agingFilter,
    dateRange, sortKey, sortDir, fetchRevision,
  ]);

  return {
    fetchedCases,
    fetchTotal,
    fetchLoading,
    fetchLoadedOnce,
    fetchError,
    fetchRevision,
    setFetchRevision,
  };
}
