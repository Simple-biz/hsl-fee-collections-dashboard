"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  Search,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Check,
  TrendingDown,
  Loader2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Download,
} from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import { fmt, fmtFull } from "@/lib/formatters";
import { upsertOverpaidCase, updateFeesConfirmation } from "@/app/(dashboard)/overpaid-cases/actions";

// ---------- types ----------
interface OverpaidCaseRow {
  id: number;
  claimant: string;
  assignedTo: string | null;
  feesReceived: number;
  overpaidAmount: number;
  feesConfirmation: string | null;
  opLtrReceived: string | null;
  checksCleared: boolean;
  updateNote: string;
}

type CheckboxKey = "checksCleared";
type SortKey = "claimant" | "feesReceived" | "overpaidAmount" | "opLtrDate" | "assignedTo";
type SortDir = "asc" | "desc";
type StatusFilter = "all" | "cleared" | "pending";

// ---------- helpers ----------
const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];
const SORT_KEYS: SortKey[] = ["claimant", "feesReceived", "overpaidAmount", "opLtrDate", "assignedTo"];
const STATUS_VALUES: StatusFilter[] = ["all", "cleared", "pending"];
const DEFAULTS = {
  search: "",
  status: "all" as StatusFilter,
  agent: "",
  sort: "overpaidAmount" as SortKey,
  dir: "desc" as SortDir,
  page: 1,
  pageSize: 50,
};

const patchCase = async (
  caseId: number,
  body: Partial<Omit<OverpaidCaseRow, "id" | "claimant" | "feesReceived" | "overpaidAmount" | "feesConfirmation">>,
) => {
  const result = await upsertOverpaidCase({ caseId, fields: body as Parameters<typeof upsertOverpaidCase>[0]["fields"] });
  if (!result.ok) throw new Error(result.error);
};

// ---------- component ----------
export const OverpaidCases = () => {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted ? resolvedTheme === "dark" : false;
  const t = themeClasses(dark);

  const router = useRouter();
  const pathname = usePathname();
  const urlParams = useSearchParams();
  const initialState = useRef({
    search: urlParams.get("q") ?? DEFAULTS.search,
    status: (STATUS_VALUES.includes(urlParams.get("status") as StatusFilter)
      ? (urlParams.get("status") as StatusFilter)
      : DEFAULTS.status) as StatusFilter,
    agent: urlParams.get("agent") ?? DEFAULTS.agent,
    sort: (SORT_KEYS.includes(urlParams.get("sort") as SortKey)
      ? (urlParams.get("sort") as SortKey)
      : DEFAULTS.sort) as SortKey,
    dir: (urlParams.get("dir") === "asc" ? "asc" : "desc") as SortDir,
    page: Math.max(1, parseInt(urlParams.get("page") || "1") || 1),
    pageSize: PAGE_SIZE_OPTIONS.includes(parseInt(urlParams.get("size") || "0"))
      ? parseInt(urlParams.get("size") || "0")
      : DEFAULTS.pageSize,
  }).current;

  const [rows, setRows] = useState<OverpaidCaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ totalOverpaid: 0, clearedCount: 0, ltrCount: 0 });
  const [agents, setAgents] = useState<string[]>([]);

  const [search, setSearch] = useState(initialState.search);
  const [appliedSearch, setAppliedSearch] = useState(initialState.search);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const [page, setPage] = useState(initialState.page);
  const [pageSize, setPageSize] = useState(initialState.pageSize);
  const [total, setTotal] = useState(0);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialState.status);
  const [agentFilter, setAgentFilter] = useState(initialState.agent);
  const [sortKey, setSortKey] = useState<SortKey>(initialState.sort);
  const [sortDir, setSortDir] = useState<SortDir>(initialState.dir);

  const urlMethodRef = useRef<"push" | "replace">("replace");

  // Mirror state into URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (appliedSearch) params.set("q", appliedSearch);
    if (statusFilter !== DEFAULTS.status) params.set("status", statusFilter);
    if (agentFilter !== DEFAULTS.agent) params.set("agent", agentFilter);
    if (sortKey !== DEFAULTS.sort) params.set("sort", sortKey);
    if (sortDir !== DEFAULTS.dir) params.set("dir", sortDir);
    if (page !== DEFAULTS.page) params.set("page", String(page));
    if (pageSize !== DEFAULTS.pageSize) params.set("size", String(pageSize));
    const target = params.toString();
    if (target === urlParams.toString()) {
      urlMethodRef.current = "replace";
      return;
    }
    router[urlMethodRef.current](
      `${pathname}${target ? `?${target}` : ""}`,
      { scroll: false },
    );
    urlMethodRef.current = "replace";
  }, [appliedSearch, statusFilter, agentFilter, sortKey, sortDir, page, pageSize, pathname, router, urlParams]);

  // Sync URL → state (back/forward)
  useEffect(() => {
    const urlSearch = urlParams.get("q") ?? DEFAULTS.search;
    const urlStatusRaw = urlParams.get("status") as StatusFilter | null;
    const urlStatus = STATUS_VALUES.includes(urlStatusRaw as StatusFilter)
      ? (urlStatusRaw as StatusFilter)
      : DEFAULTS.status;
    const urlSortRaw = urlParams.get("sort") as SortKey | null;
    const urlSort = SORT_KEYS.includes(urlSortRaw as SortKey)
      ? (urlSortRaw as SortKey)
      : DEFAULTS.sort;
    const urlDir: SortDir = urlParams.get("dir") === "asc" ? "asc" : "desc";
    const urlPage = Math.max(1, parseInt(urlParams.get("page") || "1") || 1);
    const sizeNum = parseInt(urlParams.get("size") || "0");
    const urlSize = PAGE_SIZE_OPTIONS.includes(sizeNum) ? sizeNum : DEFAULTS.pageSize;

    const urlAgent = urlParams.get("agent") ?? DEFAULTS.agent;
    if (urlSearch !== appliedSearch) { setSearch(urlSearch); setAppliedSearch(urlSearch); }
    if (urlStatus !== statusFilter) setStatusFilter(urlStatus);
    if (urlAgent !== agentFilter) setAgentFilter(urlAgent);
    if (urlSort !== sortKey) setSortKey(urlSort);
    if (urlDir !== sortDir) setSortDir(urlDir);
    if (urlPage !== page) setPage(urlPage);
    if (urlSize !== pageSize) setPageSize(urlSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlParams]);

  const noteSnapshot = useRef<Map<number, string>>(new Map());
  const ltrSnapshot = useRef<Map<number, string | null>>(new Map());
  const confirmationSnapshot = useRef<Map<number, string>>(new Map());
  const [noteState, setNoteState] = useState<Record<number, "saving" | "saved" | undefined>>({});
  const [ltrState, setLtrState] = useState<Record<number, "saving" | "saved" | undefined>>({});
  const [confirmationState, setConfirmationState] = useState<Record<number, "saving" | "saved" | undefined>>({});
  const savedTimerRef = useRef<Map<number, NodeJS.Timeout>>(new Map());

  useEffect(() => {
    const timers = savedTimerRef.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setAppliedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  const fetchAbortRef = useRef<AbortController | null>(null);

  const fetchCases = useCallback(async () => {
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
      });
      if (appliedSearch) params.set("search", appliedSearch);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (agentFilter) params.set("agent", agentFilter);
      params.set("sort", sortKey);
      params.set("dir", sortDir);
      const res = await fetch(`/api/overpaid-cases?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Failed to load overpaid cases (${res.status})`);
      const json = await res.json();
      const data: OverpaidCaseRow[] = json.data || [];
      setRows(data);
      setTotal(typeof json.total === "number" ? json.total : data.length);
      setStats({
        totalOverpaid: typeof json.totalOverpaid === "number" ? json.totalOverpaid : 0,
        clearedCount: typeof json.clearedCount === "number" ? json.clearedCount : 0,
        ltrCount: typeof json.ltrCount === "number" ? json.ltrCount : 0,
      });
      if (Array.isArray(json.agents)) setAgents(json.agents);
      noteSnapshot.current = new Map(data.map((r) => [r.id, r.updateNote]));
      ltrSnapshot.current = new Map(data.map((r) => [r.id, r.opLtrReceived]));
      confirmationSnapshot.current = new Map(data.map((r) => [r.id, r.feesConfirmation ?? ""]));
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError((err as Error).message);
    } finally {
      if (fetchAbortRef.current === controller) setLoading(false);
    }
  }, [page, pageSize, appliedSearch, statusFilter, agentFilter, sortKey, sortDir]);

  useEffect(() => {
    fetchCases();
    return () => { fetchAbortRef.current?.abort(); };
  }, [fetchCases]);

  const toggleSort = (key: SortKey) => {
    urlMethodRef.current = "push";
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "claimant" ? "asc" : "desc");
    }
    setPage(1);
  };

  const onSortKeyDown = (e: React.KeyboardEvent, key: SortKey) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSort(key); }
  };

  const ariaSortFor = (key: SortKey): "ascending" | "descending" | "none" => {
    if (sortKey !== key) return "none";
    return sortDir === "asc" ? "ascending" : "descending";
  };

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return <ArrowUpDown aria-hidden="true" className="h-3 w-3" />;
    return sortDir === "asc"
      ? <ArrowUp aria-hidden="true" className="h-3 w-3" />
      : <ArrowDown aria-hidden="true" className="h-3 w-3" />;
  };

  const toggleCheckbox = async (id: number, key: CheckboxKey) => {
    const prevRow = rows.find((r) => r.id === id);
    if (!prevRow) return;
    const next = !prevRow[key];
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [key]: next } : r)));
    try {
      await patchCase(id, { [key]: next });
      if (key === "checksCleared") {
        setStats((s) => ({ ...s, clearedCount: Math.max(0, s.clearedCount + (next ? 1 : -1)) }));
      }
      if (statusFilter === "cleared" && key === "checksCleared" && !next) {
        setRows((prev) => prev.filter((r) => r.id !== id));
        setTotal((tot) => Math.max(0, tot - 1));
      } else if (statusFilter === "pending" && key === "checksCleared" && next) {
        setRows((prev) => prev.filter((r) => r.id !== id));
        setTotal((tot) => Math.max(0, tot - 1));
      }
    } catch (err) {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [key]: !next } : r)));
      if (key === "checksCleared") {
        setStats((s) => ({ ...s, clearedCount: Math.max(0, s.clearedCount + (next ? -1 : 1)) }));
      }
      setError((err as Error).message);
    }
  };

  const setUpdateNoteLocal = (id: number, value: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, updateNote: value } : r)));
  };

  const setLtrDateLocal = (id: number, value: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, opLtrReceived: value || null } : r)));
  };

  const setConfirmationLocal = (id: number, value: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, feesConfirmation: value } : r)));
  };

  const persistConfirmation = async (row: OverpaidCaseRow) => {
    const current = row.feesConfirmation ?? "";
    if (confirmationSnapshot.current.get(row.id) === current) return;
    setConfirmationState((s) => ({ ...s, [row.id]: "saving" }));
    try {
      const result = await updateFeesConfirmation({ caseId: row.id, feesConfirmation: current });
      if (!result.ok) throw new Error(result.error);
      confirmationSnapshot.current.set(row.id, current);
      setConfirmationState((s) => ({ ...s, [row.id]: "saved" }));
      const timer = setTimeout(() => {
        setConfirmationState((s) => ({ ...s, [row.id]: undefined }));
        savedTimerRef.current.delete(row.id);
      }, 1500);
      savedTimerRef.current.set(row.id, timer);
    } catch (err) {
      setConfirmationState((s) => ({ ...s, [row.id]: undefined }));
      setError((err as Error).message);
    }
  };

  const persistUpdateNote = async (row: OverpaidCaseRow) => {
    if (noteSnapshot.current.get(row.id) === row.updateNote) return;
    const existingTimer = savedTimerRef.current.get(row.id);
    if (existingTimer) clearTimeout(existingTimer);
    setNoteState((s) => ({ ...s, [row.id]: "saving" }));
    try {
      await patchCase(row.id, { updateNote: row.updateNote });
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

  const persistLtrDate = async (row: OverpaidCaseRow) => {
    const prev = ltrSnapshot.current.get(row.id);
    if (prev === row.opLtrReceived) return;
    setLtrState((s) => ({ ...s, [row.id]: "saving" }));
    try {
      await patchCase(row.id, { opLtrReceived: row.opLtrReceived });
      const wasSet = prev != null;
      const nowSet = row.opLtrReceived != null;
      if (!wasSet && nowSet) setStats((s) => ({ ...s, ltrCount: s.ltrCount + 1 }));
      if (wasSet && !nowSet) setStats((s) => ({ ...s, ltrCount: Math.max(0, s.ltrCount - 1) }));
      ltrSnapshot.current.set(row.id, row.opLtrReceived);
      setLtrState((s) => ({ ...s, [row.id]: "saved" }));
      const timer = setTimeout(() => {
        setLtrState((s) => ({ ...s, [row.id]: undefined }));
        savedTimerRef.current.delete(row.id);
      }, 1500);
      savedTimerRef.current.set(row.id, timer);
    } catch (err) {
      setLtrState((s) => ({ ...s, [row.id]: undefined }));
      setError((err as Error).message);
    }
  };

  const [exporting, setExporting] = useState(false);

  const downloadCsv = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({ page: "1", limit: "10000" });
      if (appliedSearch) params.set("search", appliedSearch);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (agentFilter) params.set("agent", agentFilter);
      params.set("sort", sortKey);
      params.set("dir", sortDir);
      const res = await fetch(`/api/overpaid-cases?${params.toString()}`);
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const json = await res.json();
      const all: OverpaidCaseRow[] = json.data || [];
      const headers = ["Case", "Assigned To", "Fees Received", "Overpaid Amount", "Fees Confirmation", "O/P LTR Date Received", "Notes", "Checks Cleared"];
      const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
      const csvRows = [
        headers.join(","),
        ...all.map((r) =>
          [
            escape(r.claimant),
            escape(r.assignedTo ?? ""),
            r.feesReceived.toFixed(2),
            r.overpaidAmount.toFixed(2),
            escape(r.feesConfirmation ?? ""),
            r.opLtrReceived ?? "",
            escape(r.updateNote),
            r.checksCleared ? "Yes" : "No",
          ].join(","),
        ),
      ].join("\n");
      const blob = new Blob([csvRows], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `overpaid-cases-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  const sectionCard = `rounded-xl border ${t.card}`;
  const thBase = `py-2 px-3 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap`;
  const tdBase = `py-2 px-3 text-[12px] whitespace-nowrap`;
  const rowBorder = dark ? "border-neutral-800/50" : "border-neutral-100";
  const rowHover = dark ? "hover:bg-neutral-800/40" : "hover:bg-neutral-50/80";
  const stickyHeaderBg = dark ? "bg-neutral-900" : "bg-white";

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className={`${sectionCard} p-4 md:p-5`}>
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center ${dark ? "bg-amber-900/40" : "bg-amber-50"}`}
          >
            <TrendingDown
              aria-hidden="true"
              className={`h-5 w-5 ${dark ? "text-amber-400" : "text-amber-600"}`}
            />
          </div>
          <div>
            <h3 className={`text-sm font-bold ${t.text}`}>Overpaid Cases</h3>
            <p className={`text-[11px] ${t.textMuted} mt-0.5`}>
              Cases where fees received exceed expected amount
            </p>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "Total Cases",
            value: loading ? "—" : String(total),
            sub: "with overpayment",
          },
          {
            label: "Total Overpaid",
            value: loading ? "—" : fmtFull(stats.totalOverpaid),
            sub: "across filtered cases",
            highlight: true,
          },
          {
            label: "Checks Cleared",
            value: loading ? "—" : `${stats.clearedCount} / ${total}`,
            sub: "cases resolved",
          },
          {
            label: "LTR Received",
            value: loading ? "—" : `${stats.ltrCount} / ${total}`,
            sub: "letters on file",
          },
        ].map((s) => (
          <div key={s.label} className={`${sectionCard} p-4`}>
            <p className={`text-[10px] font-semibold uppercase tracking-wider ${t.textMuted}`}>
              {s.label}
            </p>
            <p className={`text-xl font-bold mt-1 ${s.highlight ? (dark ? "text-amber-400" : "text-amber-600") : t.text}`}>
              {s.value}
            </p>
            <p className={`text-[10px] ${t.textMuted} mt-0.5`}>{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div
          role="alert"
          className={`rounded-xl border p-4 flex items-center gap-3 ${dark ? "bg-red-900/20 border-red-800 text-red-400" : "bg-red-50 border-red-200 text-red-700"}`}
        >
          <span className="text-sm">{error}</span>
          <button onClick={fetchCases} className="ml-auto text-xs font-medium underline">
            Retry
          </button>
        </div>
      )}

      {/* Table card */}
      <div className={sectionCard}>
        {/* Toolbar */}
        <div className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b ${t.borderLight}`}>
          <div>
            <h3 className={`text-sm font-bold ${t.text}`}>Cases</h3>
            <p className={`text-[11px] ${t.textMuted} mt-0.5`}>
              {total === 0
                ? "0 cases"
                : `Showing ${rangeStart}–${rangeEnd} of ${total} cases`}
            </p>
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
                aria-label="Search claimants"
                className={`h-8 pl-8 pr-3 w-full sm:w-48 rounded-md border text-xs outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-600 ${t.inputBg}`}
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => {
                urlMethodRef.current = "push";
                setStatusFilter(e.target.value as StatusFilter);
                setPage(1);
              }}
              aria-label="Filter by status"
              className={`h-8 px-2 rounded-md border text-xs outline-none cursor-pointer ${t.inputBg}`}
            >
              <option value="all">All</option>
              <option value="cleared">Checks Cleared</option>
              <option value="pending">Pending</option>
            </select>
            <select
              value={agentFilter}
              onChange={(e) => {
                urlMethodRef.current = "push";
                setAgentFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by assigned agent"
              className={`h-8 px-2 rounded-md border text-xs outline-none cursor-pointer ${t.inputBg}`}
            >
              <option value="">All Agents</option>
              {agents.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <select
              value={pageSize}
              onChange={(e) => {
                urlMethodRef.current = "push";
                setPageSize(parseInt(e.target.value));
                setPage(1);
              }}
              aria-label="Rows per page"
              className={`h-8 px-2 rounded-md border text-xs outline-none cursor-pointer ${t.inputBg}`}
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>{n} / page</option>
              ))}
            </select>
            <button
              onClick={downloadCsv}
              disabled={exporting || total === 0}
              aria-label="Export to CSV"
              className={`h-8 px-2.5 rounded-md border text-xs font-medium flex items-center gap-1.5 ${t.outlineBtn} disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {exporting
                ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                : <Download aria-hidden="true" className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">Export</span>
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
          <table className="w-full min-w-200">
            <thead>
              <tr className={`border-b ${t.borderLight}`}>
                <th
                  role="button"
                  tabIndex={0}
                  aria-sort={ariaSortFor("claimant")}
                  className={`${thBase} ${t.textSub} text-left cursor-pointer sticky left-0 top-0 z-30 ${stickyHeaderBg} focus:outline-none focus:ring-2 focus:ring-inset focus:ring-neutral-300 dark:focus:ring-neutral-600`}
                  onClick={() => toggleSort("claimant")}
                  onKeyDown={(e) => onSortKeyDown(e, "claimant")}
                >
                  <span className="flex items-center gap-1">Case {sortIcon("claimant")}</span>
                </th>
                <th
                  role="button"
                  tabIndex={0}
                  aria-sort={ariaSortFor("assignedTo")}
                  className={`${thBase} ${t.textSub} text-left cursor-pointer sticky top-0 z-20 ${stickyHeaderBg} focus:outline-none focus:ring-2 focus:ring-inset focus:ring-neutral-300 dark:focus:ring-neutral-600`}
                  onClick={() => toggleSort("assignedTo")}
                  onKeyDown={(e) => onSortKeyDown(e, "assignedTo")}
                >
                  <span className="flex items-center gap-1">Assigned To {sortIcon("assignedTo")}</span>
                </th>
                <th
                  role="button"
                  tabIndex={0}
                  aria-sort={ariaSortFor("feesReceived")}
                  className={`${thBase} ${t.textSub} text-right cursor-pointer sticky top-0 z-20 ${stickyHeaderBg} focus:outline-none focus:ring-2 focus:ring-inset focus:ring-neutral-300 dark:focus:ring-neutral-600`}
                  onClick={() => toggleSort("feesReceived")}
                  onKeyDown={(e) => onSortKeyDown(e, "feesReceived")}
                >
                  <span className="flex items-center justify-end gap-1">Fees Received {sortIcon("feesReceived")}</span>
                </th>
                <th
                  role="button"
                  tabIndex={0}
                  aria-sort={ariaSortFor("overpaidAmount")}
                  className={`${thBase} ${t.textSub} text-right cursor-pointer sticky top-0 z-20 ${stickyHeaderBg} focus:outline-none focus:ring-2 focus:ring-inset focus:ring-neutral-300 dark:focus:ring-neutral-600`}
                  onClick={() => toggleSort("overpaidAmount")}
                  onKeyDown={(e) => onSortKeyDown(e, "overpaidAmount")}
                >
                  <span className="flex items-center justify-end gap-1">Overpaid Amount {sortIcon("overpaidAmount")}</span>
                </th>
                <th className={`${thBase} ${t.textSub} text-left sticky top-0 z-20 ${stickyHeaderBg}`}>
                  Fees Confirmation
                </th>
                <th
                  role="button"
                  tabIndex={0}
                  aria-sort={ariaSortFor("opLtrDate")}
                  className={`${thBase} ${t.textSub} text-left cursor-pointer sticky top-0 z-20 ${stickyHeaderBg} focus:outline-none focus:ring-2 focus:ring-inset focus:ring-neutral-300 dark:focus:ring-neutral-600`}
                  onClick={() => toggleSort("opLtrDate")}
                  onKeyDown={(e) => onSortKeyDown(e, "opLtrDate")}
                >
                  <span className="flex items-center gap-1">O/P LTR Date Received {sortIcon("opLtrDate")}</span>
                </th>
                <th className={`${thBase} ${t.textSub} text-left min-w-48 sticky top-0 z-20 ${stickyHeaderBg}`}>
                  Notes
                </th>
                <th className={`${thBase} ${t.textSub} text-center sticky top-0 z-20 ${stickyHeaderBg}`}>
                  Checks Cleared
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className={`${tdBase} text-center py-8 ${t.textMuted}`}>
                    <span className="inline-flex items-center gap-2">
                      <RefreshCw aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                      Loading cases...
                    </span>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className={`${tdBase} text-center py-8 ${t.textMuted}`}>
                    No overpaid cases found.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const isCleared = row.checksCleared;
                  const clearedBg = isCleared
                    ? dark ? "bg-emerald-900/40" : "bg-emerald-100/80"
                    : "";
                  const stickyBg = isCleared
                    ? dark ? "bg-emerald-900" : "bg-emerald-100"
                    : dark ? "bg-neutral-900" : "bg-white";
                  const stickyHover = isCleared
                    ? dark ? "group-hover/row:bg-emerald-800" : "group-hover/row:bg-emerald-200"
                    : dark ? "group-hover/row:bg-neutral-800" : "group-hover/row:bg-neutral-50";
                  return (
                    <tr
                      key={row.id}
                      className={`group/row border-b ${rowBorder} ${clearedBg} ${rowHover} transition-colors`}
                    >
                      <td
                        className={`${tdBase} font-semibold max-w-45 truncate sticky left-0 z-10 ${stickyBg} ${stickyHover}`}
                        title={row.claimant}
                      >
                        <Link
                          href={`/cases/${row.id}`}
                          className={`hover:underline ${dark ? "text-indigo-400" : "text-indigo-600"}`}
                        >
                          {row.claimant}
                        </Link>
                      </td>
                      <td className={`${tdBase} ${t.textMuted}`}>
                        {row.assignedTo ?? "—"}
                      </td>
                      <td className={`${tdBase} ${t.textMuted} text-right`}>
                        {fmt(row.feesReceived)}
                      </td>
                      <td className={`${tdBase} text-right font-semibold ${dark ? "text-amber-400" : "text-amber-600"}`}>
                        {fmt(row.overpaidAmount)}
                      </td>
                      <td className={`${tdBase}`}>
                        <div className="relative">
                          <input
                            type="text"
                            value={row.feesConfirmation ?? ""}
                            onChange={(e) => setConfirmationLocal(row.id, e.target.value)}
                            onBlur={() => persistConfirmation(row)}
                            placeholder="—"
                            className={`w-full h-7 pl-2 pr-7 rounded-md border text-[11px] outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-600 ${t.inputBg}`}
                          />
                          {confirmationState[row.id] === "saving" && (
                            <Loader2
                              aria-hidden="true"
                              className={`absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin ${t.textMuted}`}
                            />
                          )}
                          {confirmationState[row.id] === "saved" && (
                            <Check
                              aria-hidden="true"
                              className={`absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 ${dark ? "text-emerald-400" : "text-emerald-600"}`}
                            />
                          )}
                        </div>
                      </td>
                      <td className={`${tdBase}`}>
                        <div className="relative">
                          <input
                            type="date"
                            value={row.opLtrReceived ?? ""}
                            onChange={(e) => setLtrDateLocal(row.id, e.target.value)}
                            onBlur={() => persistLtrDate(row)}
                            aria-label="O/P letter received date"
                            className={`w-36 h-7 px-2 rounded-md border text-[11px] outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-600 ${t.inputBg}`}
                          />
                          {ltrState[row.id] === "saving" && (
                            <Loader2
                              aria-hidden="true"
                              className={`absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin ${t.textMuted}`}
                            />
                          )}
                          {ltrState[row.id] === "saved" && (
                            <Check
                              aria-hidden="true"
                              className={`absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 ${dark ? "text-emerald-400" : "text-emerald-600"}`}
                            />
                          )}
                        </div>
                      </td>
                      <td className={`${tdBase}`}>
                        <div className="relative">
                          <input
                            type="text"
                            value={row.updateNote}
                            onChange={(e) => setUpdateNoteLocal(row.id, e.target.value)}
                            onBlur={() => persistUpdateNote(row)}
                            placeholder="Add a note..."
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
                      <td className={`${tdBase} text-center`}>
                        <input
                          type="checkbox"
                          checked={row.checksCleared}
                          onChange={() => toggleCheckbox(row.id, "checksCleared")}
                          aria-label="Checks cleared"
                          className="h-3.5 w-3.5 cursor-pointer accent-indigo-500"
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        <div className={`px-4 py-3 flex items-center justify-between border-t ${t.borderLight}`}>
          <p className={`text-[11px] ${t.textMuted}`}>
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { urlMethodRef.current = "push"; setPage((p) => Math.max(1, p - 1)); }}
              disabled={page <= 1 || loading}
              className={`h-8 px-2 rounded-md border text-xs font-medium flex items-center gap-1 ${t.outlineBtn} disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" /> Prev
            </button>
            <div className="flex items-center gap-1 px-1">
              <input
                key={page}
                type="number"
                min={1}
                max={totalPages}
                defaultValue={page}
                disabled={loading || totalPages <= 1}
                aria-label="Jump to page"
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  const n = parseInt((e.target as HTMLInputElement).value);
                  if (Number.isFinite(n) && n >= 1 && n <= totalPages && n !== page) {
                    urlMethodRef.current = "push";
                    setPage(n);
                  } else {
                    (e.target as HTMLInputElement).value = String(page);
                  }
                }}
                onBlur={(e) => { e.target.value = String(page); }}
                className={`h-8 w-12 px-1 rounded-md border text-xs text-center outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-600 disabled:opacity-40 ${t.inputBg}`}
              />
              <span className={`text-[11px] ${t.textMuted}`}>/ {totalPages}</span>
            </div>
            <button
              onClick={() => { urlMethodRef.current = "push"; setPage((p) => Math.min(totalPages, p + 1)); }}
              disabled={page >= totalPages || loading}
              className={`h-8 px-2 rounded-md border text-xs font-medium flex items-center gap-1 ${t.outlineBtn} disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              Next <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
