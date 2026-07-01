"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Search,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Check,
  CheckCircle2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  X,
  Undo2,
  RefreshCw,
  TrendingDown,
} from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import { fmt, fmtFull } from "@/lib/formatters";
import { upsertOverpaidCase, bulkRestoreCleared } from "@/app/(dashboard)/overpaid-cases/actions";

interface ClearedRow {
  id: number;
  claimant: string;
  assignedTo: string | null;
  region: string | null;
  feesReceived: number;
  overpaidAmount: number | null;
  feesConfirmation: string | null;
  opLtrDate: string | null;
  opLtrReceived: string | null;
  checksCleared: boolean;
  checksClearedAt: string | null;
  updateNote: string;
}

type SortKey = "claimant" | "feesReceived" | "overpaidAmount" | "opLtrDate" | "assignedTo";
type SortDir = "asc" | "desc";

const PAGE_SIZE_OPTIONS = [25, 50, 100];

const fmtDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

interface Props {
  dark: boolean;
  t: ReturnType<typeof themeClasses>;
  // Bumped by the parent whenever a case is marked/un-marked cleared from the
  // main pending table, so this section's badge (and list, if expanded)
  // refreshes without waiting for a manual refresh click.
  refreshToken: number;
  // Called after this section restores a case to Pending, so the parent's
  // pending table picks it back up.
  onRestored: () => void;
}

export const ClearedCases = ({ dark, t, refreshToken, onRestored }: Props) => {
  const [expanded, setExpanded] = useState(false);
  const [rows, setRows] = useState<ClearedRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [totalOverpaid, setTotalOverpaid] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sortKey, setSortKey] = useState<SortKey>("overpaidAmount");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [restoreConfirming, setRestoreConfirming] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [uncheckingIds, setUncheckingIds] = useState<Set<number>>(new Set());
  const [liveMessage, setLiveMessage] = useState("");
  const [noteState, setNoteState] = useState<Record<number, "saving" | "saved" | undefined>>({});

  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const countAbortRef = useRef<AbortController | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);
  const noteSnapshot = useRef<Map<number, string>>(new Map());
  const savedTimerRef = useRef<Map<number, NodeJS.Timeout>>(new Map());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      fetchAbortRef.current?.abort();
      countAbortRef.current?.abort();
    };
  }, []);

  // Fetch count badge on mount and whenever a cleared-status change happens
  // elsewhere — skipped while expanded, since fetchCleared's own effect below
  // already keeps `total` current with the full list in that case.
  useEffect(() => {
    if (expanded) return;
    const controller = new AbortController();
    countAbortRef.current = controller;
    fetch(`/api/overpaid-cases?status=cleared&page=1&limit=1`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json != null && mountedRef.current) {
          setTotal(typeof json.total === "number" ? json.total : 0);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [expanded, refreshToken]);

  useEffect(() => {
    const timers = savedTimerRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setAppliedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  const fetchCleared = useCallback(async () => {
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        status: "cleared",
        page: String(page),
        limit: String(pageSize),
        sort: sortKey,
        dir: sortDir,
      });
      if (appliedSearch) params.set("search", appliedSearch);
      const res = await fetch(`/api/overpaid-cases?${params}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`Failed to load cleared cases (${res.status})`);
      const json = await res.json();
      if (!mountedRef.current) return;
      const data: ClearedRow[] = json.data || [];
      setRows(data);
      setTotal(typeof json.total === "number" ? json.total : 0);
      setTotalOverpaid(typeof json.totalOverpaid === "number" ? json.totalOverpaid : 0);
      noteSnapshot.current = new Map(data.map((r) => [r.id, r.updateNote]));
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      if (!mountedRef.current) return;
      setError((err as Error).message);
    } finally {
      if (fetchAbortRef.current === controller && mountedRef.current) setLoading(false);
    }
  }, [page, pageSize, appliedSearch, sortKey, sortDir]);

  useEffect(() => {
    if (!expanded) return;
    fetchCleared();
    return () => {
      fetchAbortRef.current?.abort();
    };
  }, [expanded, fetchCleared, refreshToken]);

  useEffect(() => {
    if (!selectAllRef.current) return;
    const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));
    const someSelected = rows.some((r) => selectedIds.has(r.id));
    selectAllRef.current.checked = allSelected;
    selectAllRef.current.indeterminate = !allSelected && someSelected;
  }, [selectedIds, rows]);

  const toggleSelectAll = () => {
    const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));
    setSelectedIds(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  };

  const toggleRow = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "claimant" ? "asc" : "desc");
    }
    setPage(1);
  };

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return <ArrowUpDown aria-hidden="true" className="h-3 w-3" />;
    return sortDir === "asc"
      ? <ArrowUp aria-hidden="true" className="h-3 w-3" />
      : <ArrowDown aria-hidden="true" className="h-3 w-3" />;
  };

  const handleRestore = async () => {
    if (restoring) return;
    setRestoring(true);
    const ids = [...selectedIds];
    try {
      const result = await bulkRestoreCleared({ caseIds: ids });
      if (!result.ok) throw new Error(result.error);
      if (!mountedRef.current) return;
      setRows((prev) => prev.filter((r) => !ids.includes(r.id)));
      setTotal((prev) => (prev != null ? Math.max(0, prev - ids.length) : prev));
      setLiveMessage(`${ids.length} case${ids.length === 1 ? "" : "s"} restored to Pending`);
      setSelectedIds(new Set());
      setRestoreConfirming(false);
      onRestored();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      if (mountedRef.current) setRestoring(false);
    }
  };

  // Single-row uncheck — a quick undo for an accidental "checks cleared" press,
  // without going through select-all-then-bulk-restore.
  const toggleClear = async (row: ClearedRow) => {
    if (uncheckingIds.has(row.id)) return;
    setUncheckingIds((prev) => new Set(prev).add(row.id));
    try {
      const result = await upsertOverpaidCase({ caseId: row.id, fields: { checksCleared: false } });
      if (!result.ok) throw new Error(result.error);
      if (!mountedRef.current) return;
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setTotal((prev) => (prev != null ? Math.max(0, prev - 1) : prev));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
      setLiveMessage(`${row.claimant} restored to Pending`);
      onRestored();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUncheckingIds((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
    }
  };

  const setNoteLocal = (id: number, value: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, updateNote: value } : r)));
  };

  const persistNote = async (row: ClearedRow) => {
    if (noteSnapshot.current.get(row.id) === row.updateNote) return;
    const existingTimer = savedTimerRef.current.get(row.id);
    if (existingTimer) clearTimeout(existingTimer);
    setNoteState((s) => ({ ...s, [row.id]: "saving" }));
    try {
      const result = await upsertOverpaidCase({ caseId: row.id, fields: { updateNote: row.updateNote } });
      if (!result.ok) throw new Error(result.error);
      noteSnapshot.current.set(row.id, row.updateNote);
      setNoteState((s) => ({ ...s, [row.id]: "saved" }));
      const timer = setTimeout(() => {
        setNoteState((s) => ({ ...s, [row.id]: undefined }));
        savedTimerRef.current.delete(row.id);
      }, 1500);
      savedTimerRef.current.set(row.id, timer);
    } catch (err) {
      setNoteState((s) => ({ ...s, [row.id]: undefined }));
      setError((err as Error).message);
    }
  };

  const safeTotal = total ?? 0;
  const totalPages = Math.max(1, Math.ceil(safeTotal / pageSize));
  const rangeStart = safeTotal === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, safeTotal);
  const isInitialLoad = loading && rows.length === 0;
  const isRefreshing = loading && rows.length > 0;

  const thBase = `py-2 px-3 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap`;
  const tdBase = `py-2 px-3 text-[12px] whitespace-nowrap`;
  const rowBorder = dark ? "border-neutral-800/50" : "border-neutral-100";
  const rowHover = dark ? "hover:bg-neutral-800/40" : "hover:bg-neutral-50/80";
  const stickyHeaderBg = dark ? "bg-neutral-900" : "bg-white";
  const stickyBg = dark ? "bg-emerald-900" : "bg-emerald-100";
  const stickyHover = dark ? "group-hover/row:bg-emerald-800" : "group-hover/row:bg-emerald-200";
  const colSpan = 11;

  return (
    // contain:layout stops the sticky frozen-column/header cells in the table
    // below from leaking their scroll overflow into <main>'s ancestor chain —
    // see the identical note in CompletedPetitions.tsx.
    <div className={`rounded-xl border ${t.card} [contain:layout]`}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className={`w-full flex items-center justify-between p-4 text-left${expanded ? ` border-b ${t.borderLight}` : ""}`}
      >
        <div className="flex items-center gap-2">
          <CheckCircle2
            aria-hidden="true"
            className={`h-4 w-4 ${dark ? "text-emerald-400" : "text-emerald-600"}`}
          />
          <span className={`text-sm font-bold ${t.text}`}>Cleared Cases</span>
          {total != null && total > 0 && (
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                dark ? "bg-emerald-900/40 text-emerald-300" : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {total}
            </span>
          )}
        </div>
        {expanded
          ? <ChevronUp aria-hidden="true" className={`h-4 w-4 ${t.textMuted}`} />
          : <ChevronDown aria-hidden="true" className={`h-4 w-4 ${t.textMuted}`} />}
      </button>

      {expanded && (
        <>
          <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
            {liveMessage}
          </div>

          {/* Toolbar */}
          <div className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b ${t.borderLight}`}>
            <div>
              {selectedIds.size > 0 ? (
                <div className="flex items-center gap-2 flex-wrap">
                  {restoreConfirming ? (
                    <>
                      <span className={`text-sm ${t.textMuted}`}>
                        Restore {selectedIds.size} case{selectedIds.size !== 1 ? "s" : ""} to Pending?
                      </span>
                      <button
                        onClick={handleRestore}
                        disabled={restoring}
                        className={`h-7 px-3 rounded-md text-xs font-medium flex items-center gap-1.5 ${dark ? "bg-indigo-700 hover:bg-indigo-600 text-white" : "bg-indigo-600 hover:bg-indigo-700 text-white"} disabled:opacity-40 disabled:cursor-not-allowed transition-colors`}
                      >
                        {restoring
                          ? <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
                          : <Undo2 aria-hidden="true" className="h-3 w-3" />}
                        Confirm
                      </button>
                      <button
                        onClick={() => setRestoreConfirming(false)}
                        disabled={restoring}
                        className={`h-7 px-3 rounded-md border text-xs font-medium ${t.outlineBtn} disabled:opacity-40`}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <span className={`text-sm font-bold ${t.text}`}>
                        {selectedIds.size} selected
                      </span>
                      <button
                        onClick={() => setRestoreConfirming(true)}
                        aria-label="Restore selected cases to Pending"
                        className={`h-7 px-3 rounded-md border text-xs font-medium flex items-center gap-1.5 ${t.outlineBtn} transition-colors`}
                      >
                        <Undo2 aria-hidden="true" className="h-3 w-3" />
                        Restore to Pending
                      </button>
                      <button
                        onClick={() => setSelectedIds(new Set())}
                        aria-label="Clear selection"
                        className={`h-7 w-7 rounded-md border flex items-center justify-center ${t.outlineBtn}`}
                      >
                        <X aria-hidden="true" className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <>
                  <p className={`text-sm font-bold ${t.text} flex items-center gap-1.5`}>
                    Cleared
                    {isRefreshing && (
                      <Loader2 aria-hidden="true" className={`h-3 w-3 animate-spin ${t.textMuted}`} />
                    )}
                  </p>
                  <p className={`text-[11px] ${t.textMuted} mt-0.5`}>
                    {safeTotal === 0
                      ? "0 cases"
                      : `Showing ${rangeStart}–${rangeEnd} of ${safeTotal} cases`}
                  </p>
                  {safeTotal > 0 && (
                    <p className={`text-[11px] ${t.textMuted} mt-0.5`}>
                      Total Overpaid {fmt(totalOverpaid)}
                    </p>
                  )}
                </>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 sm:flex-none">
                {search.trim() !== appliedSearch ? (
                  <Loader2
                    aria-hidden="true"
                    className={`absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin ${t.textMuted}`}
                  />
                ) : (
                  <Search
                    aria-hidden="true"
                    className={`absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 ${t.textMuted}`}
                  />
                )}
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search claimants..."
                  aria-label="Search cleared claimants"
                  className={`h-8 pl-8 pr-3 w-full sm:w-48 rounded-md border text-xs outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-600 ${t.inputBg}`}
                />
              </div>
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(parseInt(e.target.value)); setPage(1); }}
                aria-label="Rows per page"
                className={`h-8 px-2 rounded-md border text-xs outline-none cursor-pointer ${t.inputBg}`}
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n} / page</option>
                ))}
              </select>
              <button
                onClick={fetchCleared}
                disabled={loading}
                aria-label="Refresh cleared cases"
                className={`h-8 px-2.5 rounded-md border text-xs font-medium flex items-center gap-1 ${t.outlineBtn} disabled:opacity-40`}
              >
                <RefreshCw
                  aria-hidden="true"
                  className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
                />
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div
              role="alert"
              className={`m-4 rounded-xl border p-3 flex items-center gap-3 ${dark ? "bg-red-900/20 border-red-800 text-red-400" : "bg-red-50 border-red-200 text-red-700"}`}
            >
              <span className="text-sm">{error}</span>
              <button
                onClick={() => { setError(null); fetchCleared(); }}
                className="ml-auto text-xs font-medium underline"
              >
                Retry
              </button>
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto overflow-y-auto max-h-[60vh]">
            <table className="w-full min-w-200">
              <thead>
                <tr className={`border-b ${t.borderLight}`}>
                  <th className={`${thBase} w-10 min-w-10 max-w-10 text-center sticky left-0 top-0 z-30 ${stickyHeaderBg}`}>
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      onChange={toggleSelectAll}
                      aria-label="Select all cleared rows"
                      className="h-3.5 w-3.5 cursor-pointer accent-indigo-500"
                    />
                  </th>
                  <th
                    aria-sort={sortKey === "claimant" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                    className={`${thBase} ${t.textSub} text-left sticky left-10 top-0 z-30 ${stickyHeaderBg}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort("claimant")}
                      className="inline-flex items-center gap-1 cursor-pointer rounded-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-neutral-300 dark:focus:ring-neutral-600"
                    >
                      Case {sortIcon("claimant")}
                    </button>
                  </th>
                  <th
                    aria-sort={sortKey === "assignedTo" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                    className={`${thBase} ${t.textSub} text-left sticky top-0 z-20 ${stickyHeaderBg}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort("assignedTo")}
                      className="inline-flex items-center gap-1 cursor-pointer rounded-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-neutral-300 dark:focus:ring-neutral-600"
                    >
                      Assigned To {sortIcon("assignedTo")}
                    </button>
                  </th>
                  <th className={`${thBase} ${t.textSub} text-left min-w-32 sticky top-0 z-20 ${stickyHeaderBg}`}>Region</th>
                  <th
                    aria-sort={sortKey === "feesReceived" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                    className={`${thBase} ${t.textSub} text-right sticky top-0 z-20 ${stickyHeaderBg}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort("feesReceived")}
                      className="inline-flex items-center gap-1 cursor-pointer rounded-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-neutral-300 dark:focus:ring-neutral-600"
                    >
                      Fees Received {sortIcon("feesReceived")}
                    </button>
                  </th>
                  <th
                    aria-sort={sortKey === "overpaidAmount" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                    className={`${thBase} ${t.textSub} text-right sticky top-0 z-20 ${stickyHeaderBg}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort("overpaidAmount")}
                      className="inline-flex items-center gap-1 cursor-pointer rounded-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-neutral-300 dark:focus:ring-neutral-600"
                    >
                      Overpaid Amount {sortIcon("overpaidAmount")}
                    </button>
                  </th>
                  <th className={`${thBase} ${t.textSub} text-left sticky top-0 z-20 ${stickyHeaderBg}`}>Fees Confirmation</th>
                  <th
                    aria-sort={sortKey === "opLtrDate" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                    className={`${thBase} ${t.textSub} text-left sticky top-0 z-20 ${stickyHeaderBg}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort("opLtrDate")}
                      className="inline-flex items-center gap-1 cursor-pointer rounded-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-neutral-300 dark:focus:ring-neutral-600"
                    >
                      Notice Received {sortIcon("opLtrDate")}
                    </button>
                  </th>
                  <th className={`${thBase} ${t.textSub} text-left min-w-48 sticky top-0 z-20 ${stickyHeaderBg}`}>Notes</th>
                  <th className={`${thBase} ${t.textSub} text-left sticky top-0 z-20 ${stickyHeaderBg}`}>Cleared On</th>
                  <th className={`${thBase} ${t.textSub} text-center sticky top-0 z-20 ${stickyHeaderBg}`}>Checks Cleared</th>
                </tr>
              </thead>
              <tbody>
                {isInitialLoad ? (
                  <tr>
                    <td colSpan={colSpan} className={`${tdBase} text-center py-8 ${t.textMuted}`}>
                      <span className="inline-flex items-center gap-2">
                        <RefreshCw aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                        Loading cleared cases...
                      </span>
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={colSpan} className={`${tdBase} text-center py-10 ${t.textMuted}`}>
                      <div className="flex flex-col items-center gap-2">
                        <TrendingDown aria-hidden="true" className="h-7 w-7 opacity-30" />
                        <p className="text-sm font-medium">
                          {appliedSearch
                            ? "No cleared cases match your search."
                            : "No cleared cases yet."}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const isSelected = selectedIds.has(row.id);
                    return (
                      <tr
                        key={row.id}
                        className={`group/row border-b ${rowBorder} ${dark ? "bg-emerald-900/40" : "bg-emerald-100/80"} ${rowHover} transition-colors`}
                      >
                        <td className={`${tdBase} w-10 min-w-10 max-w-10 text-center sticky left-0 z-10 ${stickyBg} ${stickyHover}`}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleRow(row.id)}
                            aria-label={`Select ${row.claimant}`}
                            className="h-3.5 w-3.5 cursor-pointer accent-indigo-500"
                          />
                        </td>
                        <td
                          className={`${tdBase} font-semibold max-w-45 sticky left-10 z-10 ${stickyBg} ${stickyHover}`}
                          title={row.claimant}
                        >
                          <Link
                            href={`/cases/${row.id}`}
                            className={`hover:underline truncate block ${dark ? "text-indigo-400" : "text-indigo-600"}`}
                          >
                            {row.claimant}
                          </Link>
                        </td>
                        <td className={`${tdBase} ${t.textMuted}`}>{row.assignedTo ?? "—"}</td>
                        <td className={`${tdBase} ${t.textMuted}`}>{row.region ?? "—"}</td>
                        <td className={`${tdBase} ${t.textMuted} text-right`}>{fmt(row.feesReceived)}</td>
                        <td className={`${tdBase} text-right font-medium tabular-nums ${dark ? "text-amber-400" : "text-amber-600"}`}>
                          {row.overpaidAmount != null ? fmt(row.overpaidAmount) : "—"}
                        </td>
                        <td className={`${tdBase} ${t.textMuted}`}>{row.feesConfirmation ?? "—"}</td>
                        <td className={`${tdBase} ${t.textMuted}`}>{fmtDate(row.opLtrReceived)}</td>
                        <td className={`${tdBase}`}>
                          <div className="relative">
                            <input
                              type="text"
                              value={row.updateNote}
                              onChange={(e) => setNoteLocal(row.id, e.target.value)}
                              onBlur={() => persistNote(row)}
                              placeholder="Add a note..."
                              maxLength={5000}
                              className={`w-full h-7 pl-2 pr-7 rounded-md border text-[11px] outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-600 ${t.inputBg}`}
                            />
                            {noteState[row.id] === "saving" && (
                              <Loader2
                                aria-hidden="true"
                                className={`absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin ${t.textMuted}`}
                              />
                            )}
                            {noteState[row.id] === "saved" && (
                              <Check
                                aria-hidden="true"
                                className={`absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 ${dark ? "text-emerald-400" : "text-emerald-600"}`}
                              />
                            )}
                          </div>
                        </td>
                        <td className={`${tdBase} ${t.textMuted}`}>{fmtDate(row.checksClearedAt)}</td>
                        <td className={`${tdBase} text-center`}>
                          {uncheckingIds.has(row.id) ? (
                            <Loader2 aria-hidden="true" className={`h-3.5 w-3.5 animate-spin mx-auto ${t.textMuted}`} />
                          ) : (
                            <input
                              type="checkbox"
                              checked={row.checksCleared}
                              onChange={() => toggleClear(row)}
                              aria-label={`Checks cleared for ${row.claimant} — uncheck to restore to Pending`}
                              title="Uncheck to restore to Pending (e.g. if this was checked by accident)"
                              className="h-3.5 w-3.5 cursor-pointer accent-indigo-500"
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {!loading && rows.length > 0 && (
                <tfoot>
                  <tr className={`border-t-2 ${dark ? "border-neutral-700 bg-neutral-800/60" : "border-neutral-300 bg-neutral-50"}`}>
                    <td colSpan={5} className={`${tdBase} font-semibold ${t.textSub}`}>
                      Page Total <span className={`font-normal ${t.textMuted}`}>({rows.length} rows)</span>
                    </td>
                    <td className={`${tdBase} text-right font-bold ${dark ? "text-amber-400" : "text-amber-600"}`}>
                      {fmtFull(rows.reduce((s, r) => s + (r.overpaidAmount ?? 0), 0))}
                    </td>
                    <td colSpan={5} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Pagination */}
          {safeTotal > pageSize && (
            <div className={`px-4 py-3 flex items-center justify-between border-t ${t.borderLight}`}>
              <p className={`text-[11px] ${t.textMuted}`}>Page {page} of {totalPages}</p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                  className={`h-8 px-2 rounded-md border text-xs font-medium flex items-center gap-1 ${t.outlineBtn} disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" /> Prev
                </button>
                <span className={`text-[11px] px-2 ${t.textMuted}`}>{page} / {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || loading}
                  className={`h-8 px-2 rounded-md border text-xs font-medium flex items-center gap-1 ${t.outlineBtn} disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  Next <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
