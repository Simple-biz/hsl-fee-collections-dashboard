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
  ArchiveX,
  RefreshCw,
} from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import { fmt, fmtDate } from "@/lib/formatters";
import { upsertFeePetition } from "@/app/(dashboard)/fee-petitions/actions";

interface CompletedRow {
  id: number;
  claimant: string;
  approvalDate: string | null;
  updatedAt: string | null;
  feeAmount: number | null;
  feesReceived: number | null;
  noa: boolean;
  timeDelineation: boolean;
  feePetitionDoc: boolean;
  ltrToClmt: boolean;
  ltrToClmtWithSignature: boolean;
  ltrToAlj: boolean;
  faxConfFeePet: boolean;
  updateNote: string;
}

type SortKey = "claimant" | "approvalDate" | "updatedAt";
type SortDir = "asc" | "desc";

const PAGE_SIZE_OPTIONS = [25, 50, 100];

const CHECKBOX_COLUMNS = [
  { key: "noa", label: "NOA" },
  { key: "timeDelineation", label: "Time Delineation" },
  { key: "feePetitionDoc", label: "Fee Petition Doc" },
  { key: "ltrToClmt", label: "Ltr to Clmt" },
  { key: "ltrToClmtWithSignature", label: "Ltr to Clmt w/ Signature" },
  { key: "ltrToAlj", label: "Ltr to ALJ" },
  { key: "faxConfFeePet", label: "Fax Conf Fee Pet" },
] as const;

const formatRelativeDate = (dateStr: string): string => {
  const diffDays = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

interface Props {
  dark: boolean;
  canFinalize: boolean;
}

export const CompletedPetitions = ({ dark, canFinalize }: Props) => {
  const t = themeClasses(dark);
  const [expanded, setExpanded] = useState(false);
  const [rows, setRows] = useState<CompletedRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [closeConfirming, setCloseConfirming] = useState(false);
  const [closing, setClosing] = useState(false);
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

  // Fetch count badge on mount without loading the full table
  useEffect(() => {
    const controller = new AbortController();
    countAbortRef.current = controller;
    fetch(`/api/fee-petitions?status=complete&page=1&limit=1`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json != null && mountedRef.current) {
          setTotal(typeof json.total === "number" ? json.total : 0);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

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

  const fetchCompleted = useCallback(async () => {
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        status: "complete",
        page: String(page),
        limit: String(pageSize),
        sort: sortKey,
        dir: sortDir,
      });
      if (appliedSearch) params.set("search", appliedSearch);
      const res = await fetch(`/api/fee-petitions?${params}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`Failed to load completed petitions (${res.status})`);
      const json = await res.json();
      if (!mountedRef.current) return;
      const data: CompletedRow[] = json.data || [];
      setRows(data);
      setTotal(typeof json.total === "number" ? json.total : 0);
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
    fetchCompleted();
    return () => {
      fetchAbortRef.current?.abort();
    };
  }, [expanded, fetchCompleted]);

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

  const handleClose = async () => {
    if (closing) return;
    setClosing(true);
    const ids = [...selectedIds];
    try {
      const results = await Promise.allSettled(
        ids.map((id) =>
          fetch(`/api/cases/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              feeFields: { isClosed: true },
              logMessage: "Fee petition complete — case moved to Fees Closed.",
            }),
          }).then(async (res) => {
            if (!res.ok) {
              const j = await res.json().catch(() => ({}));
              throw new Error(j.error || `Failed to close case ${id} (${res.status})`);
            }
            return id;
          }),
        ),
      );

      if (!mountedRef.current) return;

      const succeeded = results
        .filter((r): r is PromiseFulfilledResult<number> => r.status === "fulfilled")
        .map((r) => r.value);
      const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");

      if (succeeded.length > 0) {
        setRows((prev) => prev.filter((r) => !succeeded.includes(r.id)));
        setTotal((prev) => (prev != null ? Math.max(0, prev - succeeded.length) : prev));
        setLiveMessage(
          `${succeeded.length} case${succeeded.length === 1 ? "" : "s"} moved to Fees Closed`,
        );
      }

      setSelectedIds(new Set());
      setCloseConfirming(false);

      if (failures.length > 0) {
        setError(
          failures.length === 1
            ? (failures[0].reason as Error).message
            : `${failures.length} of ${ids.length} cases failed to close.`,
        );
      }
    } finally {
      if (mountedRef.current) setClosing(false);
    }
  };

  const setNoteLocal = (id: number, value: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, updateNote: value } : r)));
  };

  const persistNote = async (row: CompletedRow) => {
    if (noteSnapshot.current.get(row.id) === row.updateNote) return;
    const existingTimer = savedTimerRef.current.get(row.id);
    if (existingTimer) clearTimeout(existingTimer);
    setNoteState((s) => ({ ...s, [row.id]: "saving" }));
    try {
      const result = await upsertFeePetition({ caseId: row.id, fields: { updateNote: row.updateNote } });
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
  // checkbox + claimant + fee + approved + completed + 7 checkbox cols + note
  const colSpan = CHECKBOX_COLUMNS.length + 7;

  return (
    <div className={`rounded-xl border ${t.card}`}>
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
          <span className={`text-sm font-bold ${t.text}`}>Completed Petitions</span>
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
                  {closeConfirming ? (
                    <>
                      <span className={`text-sm ${t.textMuted}`}>
                        Close {selectedIds.size} case{selectedIds.size !== 1 ? "s" : ""} to Fees Closed?
                      </span>
                      <button
                        onClick={handleClose}
                        disabled={closing}
                        className={`h-7 px-3 rounded-md text-xs font-medium flex items-center gap-1.5 ${dark ? "bg-indigo-700 hover:bg-indigo-600 text-white" : "bg-indigo-600 hover:bg-indigo-700 text-white"} disabled:opacity-40 disabled:cursor-not-allowed transition-colors`}
                      >
                        {closing
                          ? <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
                          : <ArchiveX aria-hidden="true" className="h-3 w-3" />}
                        Confirm
                      </button>
                      <button
                        onClick={() => setCloseConfirming(false)}
                        disabled={closing}
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
                      {canFinalize && (
                        <button
                          onClick={() => setCloseConfirming(true)}
                          aria-label="Move selected cases to Fees Closed"
                          className={`h-7 px-3 rounded-md border text-xs font-medium flex items-center gap-1.5 ${t.outlineBtn} transition-colors`}
                        >
                          <ArchiveX aria-hidden="true" className="h-3 w-3" />
                          Close to Fees Closed
                        </button>
                      )}
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
                    Completed
                    {isRefreshing && (
                      <Loader2 aria-hidden="true" className={`h-3 w-3 animate-spin ${t.textMuted}`} />
                    )}
                  </p>
                  <p className={`text-[11px] ${t.textMuted} mt-0.5`}>
                    {safeTotal === 0
                      ? "0 petitions"
                      : `Showing ${rangeStart}–${rangeEnd} of ${safeTotal} petitions`}
                  </p>
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
                  aria-label="Search completed claimants"
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
                onClick={fetchCompleted}
                disabled={loading}
                aria-label="Refresh completed petitions"
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
                onClick={() => { setError(null); fetchCompleted(); }}
                className="ml-auto text-xs font-medium underline"
              >
                Retry
              </button>
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto overflow-y-auto max-h-[60vh]">
            <table className="w-full min-w-250">
              <thead>
                <tr className={`border-b ${t.borderLight}`}>
                  <th className={`${thBase} w-10 text-center sticky left-0 top-0 z-30 ${stickyHeaderBg}`}>
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      onChange={toggleSelectAll}
                      aria-label="Select all completed rows"
                      className="h-3.5 w-3.5 cursor-pointer accent-indigo-500"
                    />
                  </th>
                  <th
                    aria-sort={sortKey === "claimant" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                    className={`${thBase} w-40 ${t.textSub} text-left sticky left-10 top-0 z-30 ${stickyHeaderBg}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort("claimant")}
                      className="inline-flex items-center gap-1 cursor-pointer rounded-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-neutral-300 dark:focus:ring-neutral-600"
                    >
                      Claimant {sortIcon("claimant")}
                    </button>
                  </th>
                  <th className={`${thBase} w-24 ${t.textSub} text-right sticky left-[200px] top-0 z-30 ${stickyHeaderBg}`}>
                    Fee Requested
                  </th>
                  <th className={`${thBase} w-24 ${t.textSub} text-right sticky top-0 z-20 ${stickyHeaderBg}`}>
                    Fees Received
                  </th>
                  <th
                    aria-sort={sortKey === "approvalDate" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                    className={`${thBase} ${t.textSub} text-left sticky top-0 z-20 ${stickyHeaderBg}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort("approvalDate")}
                      className="inline-flex items-center gap-1 cursor-pointer rounded-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-neutral-300 dark:focus:ring-neutral-600"
                    >
                      Approved {sortIcon("approvalDate")}
                    </button>
                  </th>
                  <th
                    aria-sort={sortKey === "updatedAt" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                    className={`${thBase} ${t.textSub} text-left sticky top-0 z-20 ${stickyHeaderBg}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort("updatedAt")}
                      className="inline-flex items-center gap-1 cursor-pointer rounded-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-neutral-300 dark:focus:ring-neutral-600"
                    >
                      Completed {sortIcon("updatedAt")}
                    </button>
                  </th>
                  {CHECKBOX_COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      className={`${thBase} ${t.textSub} text-center sticky top-0 z-20 ${stickyHeaderBg}`}
                    >
                      {col.label}
                    </th>
                  ))}
                  <th className={`${thBase} ${t.textSub} text-left min-w-50 sticky top-0 z-20 ${stickyHeaderBg}`}>
                    Update
                  </th>
                </tr>
              </thead>
              <tbody>
                {isInitialLoad ? (
                  <tr>
                    <td colSpan={colSpan} className={`${tdBase} text-center py-8 ${t.textMuted}`}>
                      <span className="inline-flex items-center gap-2">
                        <RefreshCw aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                        Loading completed petitions...
                      </span>
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={colSpan} className={`${tdBase} text-center py-10 ${t.textMuted}`}>
                      <div className="flex flex-col items-center gap-2">
                        <Check aria-hidden="true" className="h-7 w-7 opacity-30" />
                        <p className="text-sm font-medium">
                          {appliedSearch
                            ? "No completed petitions match your search."
                            : "No completed petitions yet."}
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
                        <td className={`${tdBase} text-center sticky left-0 z-10 ${stickyBg} ${stickyHover}`}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleRow(row.id)}
                            aria-label={`Select ${row.claimant}`}
                            className="h-3.5 w-3.5 cursor-pointer accent-indigo-500"
                          />
                        </td>
                        <td
                          className={`${tdBase} ${t.text} font-semibold w-40 sticky left-10 z-10 ${stickyBg} ${stickyHover}`}
                          title={row.claimant}
                        >
                          <Link
                            href={`/cases/${row.id}`}
                            className={`hover:underline truncate block ${dark ? "text-indigo-400" : "text-indigo-600"}`}
                          >
                            {row.claimant}
                          </Link>
                          {row.updatedAt && (
                            <p className={`text-[10px] ${t.textMuted} mt-0.5 font-normal`}>
                              Completed {formatRelativeDate(row.updatedAt)}
                            </p>
                          )}
                        </td>
                        <td
                          className={`${tdBase} w-24 ${t.text} text-right font-medium tabular-nums sticky left-[200px] z-10 ${stickyBg} ${stickyHover}`}
                        >
                          {row.feeAmount != null ? fmt(row.feeAmount) : "—"}
                        </td>
                        <td className={`${tdBase} w-24 text-right font-medium tabular-nums ${row.feesReceived != null && row.feesReceived > 0 ? (dark ? "text-emerald-400" : "text-emerald-600") : t.textMuted}`}>
                          {row.feesReceived != null && row.feesReceived > 0 ? fmt(row.feesReceived) : "—"}
                        </td>
                        <td className={`${tdBase} ${t.textMuted}`}>{fmtDate(row.approvalDate)}</td>
                        <td className={`${tdBase} ${t.textMuted}`}>{fmtDate(row.updatedAt)}</td>
                        {CHECKBOX_COLUMNS.map((col) => (
                          <td key={col.key} className={`${tdBase} text-center`}>
                            <Check
                              aria-hidden="true"
                              className={`h-3.5 w-3.5 mx-auto ${dark ? "text-emerald-400" : "text-emerald-600"}`}
                            />
                          </td>
                        ))}
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
                      </tr>
                    );
                  })
                )}
              </tbody>
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
