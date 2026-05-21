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
  Gavel,
  Loader2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Download,
  X,
  Undo2,
} from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import { fmtDate } from "@/lib/formatters";
import { upsertFeePetition, bulkMarkComplete, bulkRestoreChecklists } from "@/app/(dashboard)/fee-petitions/actions";

// ---------- types ----------
interface FeePetitionRow {
  id: number;
  claimant: string;
  approvalDate: string | null;
  updatedAt: string | null;
  noa: boolean;
  timeDelineation: boolean;
  feePetitionDoc: boolean;
  ltrToClmt: boolean;
  ltrToClmtWithSignature: boolean;
  ltrToAlj: boolean;
  faxConfFeePet: boolean;
  updateNote: string;
}

type CheckboxKey =
  | "noa"
  | "timeDelineation"
  | "feePetitionDoc"
  | "ltrToClmt"
  | "ltrToClmtWithSignature"
  | "ltrToAlj"
  | "faxConfFeePet";
type SortKey = "claimant" | "approvalDate" | "updatedAt" | "progress";
type SortDir = "asc" | "desc";
type StatusFilter = "all" | "complete" | "incomplete";
type TouchedFilter = "" | "none";
type MissingFilter = "" | CheckboxKey;

// ---------- helpers ----------
const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];
const SORT_KEYS: SortKey[] = ["claimant", "approvalDate", "updatedAt", "progress"];
const CHECKBOX_KEYS = ["noa", "timeDelineation", "feePetitionDoc", "ltrToClmt", "ltrToClmtWithSignature", "ltrToAlj", "faxConfFeePet"] as const;

const daysSince = (dateStr: string | null): number | null => {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
};

const formatRelativeDate = (dateStr: string): string => {
  const diffDays = daysSince(dateStr) ?? 0;
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
const STATUS_VALUES: StatusFilter[] = ["all", "complete", "incomplete"];
const DEFAULTS = {
  search: "",
  status: "all" as StatusFilter,
  touched: "" as TouchedFilter,
  missing: "" as MissingFilter,
  sort: "approvalDate" as SortKey,
  dir: "desc" as SortDir,
  page: 1,
  pageSize: 50,
};

const CHECKBOX_COLUMNS: { key: CheckboxKey; label: string }[] = [
  { key: "noa", label: "NOA" },
  { key: "timeDelineation", label: "Time Delineation" },
  { key: "feePetitionDoc", label: "Fee Petition Doc" },
  { key: "ltrToClmt", label: "Ltr to Clmt" },
  { key: "ltrToClmtWithSignature", label: "Ltr to Clmt w/ Signature" },
  { key: "ltrToAlj", label: "Ltr to ALJ" },
  { key: "faxConfFeePet", label: "Fax Conf Fee Pet" },
];

const patchPetition = async (
  caseId: number,
  body: Partial<Omit<FeePetitionRow, "id" | "claimant">>,
) => {
  const result = await upsertFeePetition({ caseId, fields: body });
  if (!result.ok) throw new Error(result.error);
};

// ---------- component ----------
export const FeePetitions = () => {
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
    touched: (urlParams.get("touched") === "none" ? "none" : "") as TouchedFilter,
    missing: (CHECKBOX_KEYS.includes(urlParams.get("missing") as CheckboxKey) ? urlParams.get("missing") : "") as MissingFilter,
    sort: (SORT_KEYS.includes(urlParams.get("sort") as SortKey)
      ? (urlParams.get("sort") as SortKey)
      : DEFAULTS.sort) as SortKey,
    dir: (urlParams.get("dir") === "asc" ? "asc" : "desc") as SortDir,
    page: Math.max(1, parseInt(urlParams.get("page") || "1") || 1),
    pageSize: PAGE_SIZE_OPTIONS.includes(parseInt(urlParams.get("size") || "0"))
      ? parseInt(urlParams.get("size") || "0")
      : DEFAULTS.pageSize,
  }).current;

  const [rows, setRows] = useState<FeePetitionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ completeCount: 0, incompleteCount: 0, neverTouchedCount: 0 });

  const [search, setSearch] = useState(initialState.search);
  const [appliedSearch, setAppliedSearch] = useState(initialState.search);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const [page, setPage] = useState(initialState.page);
  const [pageSize, setPageSize] = useState(initialState.pageSize);
  const [total, setTotal] = useState(0);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialState.status);
  const [touchedFilter, setTouchedFilter] = useState<TouchedFilter>(initialState.touched);
  const [missingFilter, setMissingFilter] = useState<MissingFilter>(initialState.missing);
  const [sortKey, setSortKey] = useState<SortKey>(initialState.sort);
  const [sortDir, setSortDir] = useState<SortDir>(initialState.dir);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkClearing, setBulkClearing] = useState(false);
  const [bulkConfirming, setBulkConfirming] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [undoInfo, setUndoInfo] = useState<{
    rows: Array<{ caseId: number; fields: Record<CheckboxKey, boolean> }>;
    expiresAt: number;
  } | null>(null);
  const [undoing, setUndoing] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const urlMethodRef = useRef<"push" | "replace">("replace");

  // Mirror state into URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (appliedSearch) params.set("q", appliedSearch);
    if (statusFilter !== DEFAULTS.status) params.set("status", statusFilter);
    if (touchedFilter) params.set("touched", touchedFilter);
    if (missingFilter) params.set("missing", missingFilter);
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
  }, [appliedSearch, statusFilter, touchedFilter, missingFilter, sortKey, sortDir, page, pageSize, pathname, router, urlParams]);

  // Sync URL → state (back/forward)
  useEffect(() => {
    const urlSearch = urlParams.get("q") ?? DEFAULTS.search;
    const urlStatusRaw = urlParams.get("status") as StatusFilter | null;
    const urlStatus = STATUS_VALUES.includes(urlStatusRaw as StatusFilter)
      ? (urlStatusRaw as StatusFilter)
      : DEFAULTS.status;
    const urlTouched = (urlParams.get("touched") === "none" ? "none" : "") as TouchedFilter;
    const urlMissingRaw = urlParams.get("missing");
    const urlMissing = (CHECKBOX_KEYS.includes(urlMissingRaw as CheckboxKey) ? urlMissingRaw : "") as MissingFilter;
    const urlSortRaw = urlParams.get("sort") as SortKey | null;
    const urlSort = SORT_KEYS.includes(urlSortRaw as SortKey)
      ? (urlSortRaw as SortKey)
      : DEFAULTS.sort;
    const urlDir: SortDir = urlParams.get("dir") === "asc" ? "asc" : "desc";
    const urlPage = Math.max(1, parseInt(urlParams.get("page") || "1") || 1);
    const sizeNum = parseInt(urlParams.get("size") || "0");
    const urlSize = PAGE_SIZE_OPTIONS.includes(sizeNum) ? sizeNum : DEFAULTS.pageSize;

    if (urlSearch !== appliedSearch) { setSearch(urlSearch); setAppliedSearch(urlSearch); }
    if (urlStatus !== statusFilter) setStatusFilter(urlStatus);
    if (urlTouched !== touchedFilter) setTouchedFilter(urlTouched);
    if (urlMissing !== missingFilter) setMissingFilter(urlMissing);
    if (urlSort !== sortKey) setSortKey(urlSort);
    if (urlDir !== sortDir) setSortDir(urlDir);
    if (urlPage !== page) setPage(urlPage);
    if (urlSize !== pageSize) setPageSize(urlSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlParams]);

  const noteSnapshot = useRef<Map<number, string>>(new Map());
  const [noteState, setNoteState] = useState<Record<number, "saving" | "saved" | undefined>>({});
  const [liveMessage, setLiveMessage] = useState("");
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

  const fetchPetitions = useCallback(async () => {
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
      if (touchedFilter) params.set("touched", touchedFilter);
      if (missingFilter) params.set("missing", missingFilter);
      params.set("sort", sortKey);
      params.set("dir", sortDir);
      const res = await fetch(`/api/fee-petitions?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Failed to load fee petitions (${res.status})`);
      const json = await res.json();
      const data: FeePetitionRow[] = json.data || [];
      setRows(data);
      setSelectedIds(new Set());
      setBulkConfirming(false);
      setTotal(typeof json.total === "number" ? json.total : data.length);
      setStats({
        completeCount: typeof json.completeCount === "number" ? json.completeCount : 0,
        incompleteCount: typeof json.incompleteCount === "number" ? json.incompleteCount : 0,
        neverTouchedCount: typeof json.neverTouchedCount === "number" ? json.neverTouchedCount : 0,
      });
      noteSnapshot.current = new Map(data.map((r) => [r.id, r.updateNote]));
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError((err as Error).message);
    } finally {
      if (fetchAbortRef.current === controller) setLoading(false);
    }
  }, [page, pageSize, appliedSearch, statusFilter, touchedFilter, missingFilter, sortKey, sortDir]);

  useEffect(() => {
    fetchPetitions();
    return () => { fetchAbortRef.current?.abort(); };
  }, [fetchPetitions]);

  // Update select-all indeterminate state
  useEffect(() => {
    if (!selectAllRef.current) return;
    const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));
    const someSelected = rows.some((r) => selectedIds.has(r.id));
    selectAllRef.current.checked = allSelected;
    selectAllRef.current.indeterminate = !allSelected && someSelected;
  }, [selectedIds, rows]);

  const hasFilters =
    appliedSearch !== DEFAULTS.search ||
    statusFilter !== DEFAULTS.status ||
    touchedFilter !== DEFAULTS.touched ||
    missingFilter !== DEFAULTS.missing;

  const clearAllFilters = () => {
    urlMethodRef.current = "push";
    setSearch(DEFAULTS.search);
    setAppliedSearch(DEFAULTS.search);
    setStatusFilter(DEFAULTS.status);
    setTouchedFilter(DEFAULTS.touched);
    setMissingFilter(DEFAULTS.missing);
    setPage(1);
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setBulkConfirming(false);
  };

  const toggleSelectAll = () => {
    const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));
    if (allSelected) {
      clearSelection();
    } else {
      setSelectedIds(new Set(rows.map((r) => r.id)));
    }
  };

  const toggleRowSelection = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleBulkMarkComplete = async () => {
    if (selectedIds.size === 0 || bulkClearing) return;
    setBulkClearing(true);
    const ids = Array.from(selectedIds);
    const previouslyIncomplete = rows.filter(
      (r) => ids.includes(r.id) && !CHECKBOX_COLUMNS.every((c) => r[c.key]),
    );
    const snapshot = previouslyIncomplete.map((r) => ({
      caseId: r.id,
      fields: CHECKBOX_KEYS.reduce(
        (acc, k) => ({ ...acc, [k]: r[k] }),
        {} as Record<CheckboxKey, boolean>,
      ),
    }));
    const notYetComplete = previouslyIncomplete.length;
    try {
      const result = await bulkMarkComplete({ caseIds: ids });
      if (!result.ok) throw new Error(result.error);
      const today = new Date().toISOString().slice(0, 10);
      setRows((prev) =>
        prev.map((r) =>
          ids.includes(r.id)
            ? {
                ...r,
                noa: true, timeDelineation: true, feePetitionDoc: true,
                ltrToClmt: true, ltrToClmtWithSignature: true, ltrToAlj: true,
                faxConfFeePet: true, updatedAt: today,
              }
            : r,
        ),
      );
      setStats((s) => ({
        ...s,
        completeCount: s.completeCount + notYetComplete,
        incompleteCount: Math.max(0, s.incompleteCount - notYetComplete),
      }));
      if (statusFilter === "incomplete") {
        setRows((prev) => prev.filter((r) => !ids.includes(r.id)));
        setTotal((tot) => Math.max(0, tot - ids.length));
      }
      clearSelection();
      if (snapshot.length > 0) {
        setUndoInfo({ rows: snapshot, expiresAt: Date.now() + 8000 });
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBulkClearing(false);
    }
  };

  const handleUndoBulk = async () => {
    if (!undoInfo || undoing) return;
    setUndoing(true);
    const snapshot = undoInfo.rows;
    try {
      const result = await bulkRestoreChecklists({ rows: snapshot });
      if (!result.ok) throw new Error(result.error);
      setUndoInfo(null);
      if (statusFilter === "incomplete") {
        fetchPetitions();
      } else {
        const byId = new Map(snapshot.map((r) => [r.caseId, r.fields]));
        setRows((prev) =>
          prev.map((r) => {
            const f = byId.get(r.id);
            return f ? { ...r, ...f } : r;
          }),
        );
        setStats((s) => ({
          ...s,
          completeCount: Math.max(0, s.completeCount - snapshot.length),
          incompleteCount: s.incompleteCount + snapshot.length,
        }));
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUndoing(false);
    }
  };

  useEffect(() => {
    if (!undoInfo) return;
    const remaining = undoInfo.expiresAt - Date.now();
    if (remaining <= 0) {
      setUndoInfo(null);
      return;
    }
    const timer = setTimeout(() => setUndoInfo(null), remaining);
    return () => clearTimeout(timer);
  }, [undoInfo]);

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
    const wasComplete = CHECKBOX_COLUMNS.every((c) => prevRow[c.key]);
    const isComplete = CHECKBOX_COLUMNS.every((c) =>
      c.key === key ? next : prevRow[c.key],
    );
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [key]: next } : r)));
    try {
      await patchPetition(id, { [key]: next });
      const today = new Date().toISOString().slice(0, 10);
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, updatedAt: today } : r)));
      const label = CHECKBOX_COLUMNS.find((c) => c.key === key)?.label ?? key;
      setLiveMessage(`${label} ${next ? "checked" : "unchecked"}`);
      if (statusFilter === "all") {
        // Row stays visible — keep the Complete/Incomplete stat cards in sync.
        if (wasComplete !== isComplete) {
          setStats((s) => ({
            ...s,
            completeCount: Math.max(0, s.completeCount + (isComplete ? 1 : -1)),
            incompleteCount: Math.max(0, s.incompleteCount + (isComplete ? -1 : 1)),
          }));
        }
      } else {
        const stillMatches = statusFilter === "complete" ? isComplete : !isComplete;
        if (!stillMatches) {
          // Row no longer matches the active filter — drop it and keep the
          // filtered stat count aligned with the new total.
          setRows((prev) => prev.filter((r) => r.id !== id));
          setTotal((tot) => Math.max(0, tot - 1));
          setStats((s) => ({
            ...s,
            completeCount:
              statusFilter === "complete"
                ? Math.max(0, s.completeCount - 1)
                : s.completeCount,
            incompleteCount:
              statusFilter === "incomplete"
                ? Math.max(0, s.incompleteCount - 1)
                : s.incompleteCount,
          }));
        }
      }
    } catch (err) {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [key]: !next } : r)));
      setLiveMessage("Save failed");
      setError((err as Error).message);
    }
  };

  const setUpdateNoteLocal = (id: number, value: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, updateNote: value } : r)));
  };

  const persistUpdateNote = async (row: FeePetitionRow) => {
    if (noteSnapshot.current.get(row.id) === row.updateNote) return;
    const existingTimer = savedTimerRef.current.get(row.id);
    if (existingTimer) clearTimeout(existingTimer);
    setNoteState((s) => ({ ...s, [row.id]: "saving" }));
    try {
      await patchPetition(row.id, { updateNote: row.updateNote });
      noteSnapshot.current.set(row.id, row.updateNote);
      setNoteState((s) => ({ ...s, [row.id]: "saved" }));
      setLiveMessage("Note saved");
      const timer = setTimeout(() => {
        setNoteState((s) => ({ ...s, [row.id]: undefined }));
        savedTimerRef.current.delete(row.id);
      }, 1500);
      savedTimerRef.current.set(row.id, timer);
    } catch (err) {
      setNoteState((s) => ({ ...s, [row.id]: undefined }));
      setLiveMessage("Note save failed");
      setError((err as Error).message);
    }
  };

  const downloadCsv = async () => {
    setExporting(true);
    try {
      let all: FeePetitionRow[];
      if (selectedIds.size > 0) {
        all = rows.filter((r) => selectedIds.has(r.id));
      } else {
        const params = new URLSearchParams({ page: "1", limit: "10000" });
        if (appliedSearch) params.set("search", appliedSearch);
        if (statusFilter !== "all") params.set("status", statusFilter);
        if (touchedFilter) params.set("touched", touchedFilter);
        if (missingFilter) params.set("missing", missingFilter);
        params.set("sort", sortKey);
        params.set("dir", sortDir);
        const res = await fetch(`/api/fee-petitions?${params.toString()}`);
        if (!res.ok) throw new Error(`Export failed (${res.status})`);
        const json = await res.json();
        all = json.data || [];
      }
      const headers = [
        "Case", "Approval Date", "Last Updated", "Progress",
        "NOA", "Time Delineation", "Fee Petition Doc", "Ltr to Clmt",
        "Ltr to Clmt w/ Signature", "Ltr to ALJ", "Fax Conf Fee Pet", "Notes",
      ];
      const escape = (v: string) => {
        const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
        return `"${safe.replace(/"/g, '""')}"`;
      };
      const csvRows = [
        headers.join(","),
        ...all.map((r) => {
          const completedCount = CHECKBOX_COLUMNS.reduce((acc, c) => acc + (r[c.key] ? 1 : 0), 0);
          return [
            escape(r.claimant),
            r.approvalDate ?? "",
            r.updatedAt ?? "",
            `${completedCount}/${CHECKBOX_COLUMNS.length}`,
            r.noa ? "Yes" : "No",
            r.timeDelineation ? "Yes" : "No",
            r.feePetitionDoc ? "Yes" : "No",
            r.ltrToClmt ? "Yes" : "No",
            r.ltrToClmtWithSignature ? "Yes" : "No",
            r.ltrToAlj ? "Yes" : "No",
            r.faxConfFeePet ? "Yes" : "No",
            escape(r.updateNote),
          ].join(",");
        }),
      ].join("\n");
      const blob = new Blob([csvRows], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fee-petitions-${new Date().toISOString().slice(0, 10)}.csv`;
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

  const selectedIncompleteCount = rows.filter(
    (r) => selectedIds.has(r.id) && !CHECKBOX_COLUMNS.every((c) => r[c.key]),
  ).length;

  const isInitialLoad = loading && rows.length === 0;
  const isRefreshing = loading && rows.length > 0;

  const sectionCard = `rounded-xl border ${t.card}`;
  const thBase = `py-2 px-3 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap`;
  const tdBase = `py-2 px-3 text-[12px] whitespace-nowrap`;
  const rowBorder = dark ? "border-neutral-800/50" : "border-neutral-100";
  const rowHover = dark ? "hover:bg-neutral-800/40" : "hover:bg-neutral-50/80";
  const stickyHeaderBg = dark ? "bg-neutral-900" : "bg-white";
  const chipBase = `inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${dark ? "bg-neutral-700 text-neutral-200" : "bg-neutral-100 text-neutral-700"}`;
  const presetActive = dark
    ? "bg-indigo-700 border-indigo-600 text-white"
    : "bg-indigo-100 border-indigo-400 text-indigo-800";
  const presetBase = `shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors`;
  const colSpan = CHECKBOX_COLUMNS.length + 6;

  return (
    <div className="space-y-4">
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {liveMessage}
      </div>
      {/* Page header */}
      <div className={`${sectionCard} p-4 md:p-5`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${dark ? "bg-indigo-900/40" : "bg-indigo-50"}`}>
            <Gavel aria-hidden="true" className={`h-5 w-5 ${dark ? "text-indigo-400" : "text-indigo-600"}`} />
          </div>
          <div>
            <h3 className={`text-sm font-bold ${t.text}`}>Fee Petitions</h3>
            <p className={`text-[11px] ${t.textMuted} mt-0.5`}>Track and manage fee petition filings</p>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Cases", value: isInitialLoad ? "—" : String(total), sub: "at fee petition stage" },
          {
            label: "Complete",
            value: isInitialLoad ? "—" : `${stats.completeCount} / ${total}`,
            sub: "all steps done",
            color: dark ? "text-emerald-400" : "text-emerald-600",
          },
          {
            label: "Incomplete",
            value: isInitialLoad ? "—" : `${stats.incompleteCount} / ${total}`,
            sub: "pending steps",
            color: dark ? "text-amber-400" : "text-amber-600",
          },
          { label: "Never Touched", value: isInitialLoad ? "—" : String(stats.neverTouchedCount), sub: "not yet started" },
        ].map((s) => (
          <div key={s.label} className={`${sectionCard} p-4`}>
            <p className={`text-[10px] font-semibold uppercase tracking-wider ${t.textMuted}`}>{s.label}</p>
            <p className={`text-xl font-bold mt-1 ${"color" in s ? s.color : t.text}`}>{s.value}</p>
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
          <button onClick={fetchPetitions} className="ml-auto text-xs font-medium underline">Retry</button>
        </div>
      )}

      {/* Undo banner */}
      {undoInfo && (
        <div
          role="status"
          className={`rounded-xl border p-3 flex items-center gap-3 ${dark ? "bg-emerald-900/20 border-emerald-800 text-emerald-300" : "bg-emerald-50 border-emerald-200 text-emerald-800"}`}
        >
          <Check aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span className="text-sm">Marked {undoInfo.rows.length} case{undoInfo.rows.length === 1 ? "" : "s"} as complete.</span>
          <button
            onClick={handleUndoBulk}
            disabled={undoing}
            className="ml-auto flex items-center gap-1 text-xs font-semibold underline hover:opacity-80 disabled:opacity-50"
          >
            {undoing ? <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" /> : <Undo2 aria-hidden="true" className="h-3 w-3" />}
            Undo
          </button>
          <button
            onClick={() => setUndoInfo(null)}
            aria-label="Dismiss undo banner"
            className="hover:opacity-70"
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Table card */}
      <div className={sectionCard}>
        {/* Toolbar */}
        <div className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b ${t.borderLight}`}>
          <div>
            {selectedIds.size > 0 ? (
              <div className="flex items-center gap-2 flex-wrap">
                {bulkConfirming ? (
                  <>
                    <span className={`text-sm ${t.textMuted}`}>
                      Mark {selectedIncompleteCount} case{selectedIncompleteCount !== 1 ? "s" : ""} as complete?
                    </span>
                    <button
                      onClick={handleBulkMarkComplete}
                      disabled={bulkClearing || selectedIncompleteCount === 0}
                      className={`h-7 px-3 rounded-md text-xs font-medium flex items-center gap-1.5 ${dark ? "bg-emerald-700 hover:bg-emerald-600 text-white" : "bg-emerald-600 hover:bg-emerald-700 text-white"} disabled:opacity-40 disabled:cursor-not-allowed transition-colors`}
                    >
                      {bulkClearing
                        ? <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
                        : <Check aria-hidden="true" className="h-3 w-3" />}
                      Confirm
                    </button>
                    <button
                      onClick={() => setBulkConfirming(false)}
                      className={`h-7 px-3 rounded-md border text-xs font-medium ${t.outlineBtn}`}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <span className={`text-sm font-bold ${t.text}`}>
                      {selectedIds.size} selected
                      {selectedIncompleteCount < selectedIds.size && (
                        <span className={`ml-1.5 font-normal ${t.textMuted}`}>
                          ({selectedIncompleteCount} to complete)
                        </span>
                      )}
                    </span>
                    <button
                      onClick={() => setBulkConfirming(true)}
                      disabled={selectedIncompleteCount === 0}
                      aria-label="Mark selected cases as complete"
                      title={selectedIncompleteCount === 0 ? "All selected cases are already complete" : undefined}
                      className={`h-7 px-3 rounded-md text-xs font-medium flex items-center gap-1.5 ${dark ? "bg-emerald-700 hover:bg-emerald-600 text-white" : "bg-emerald-600 hover:bg-emerald-700 text-white"} disabled:opacity-40 disabled:cursor-not-allowed transition-colors`}
                    >
                      <Check aria-hidden="true" className="h-3 w-3" />
                      Mark Complete
                    </button>
                    <button
                      onClick={clearSelection}
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
                <h3 className={`text-sm font-bold ${t.text} flex items-center gap-1.5`}>
                  Petitions
                  {isRefreshing && (
                    <Loader2 aria-label="Refreshing" className={`h-3 w-3 animate-spin ${t.textMuted}`} />
                  )}
                </h3>
                <p className={`text-[11px] ${t.textMuted} mt-0.5`}>
                  {total === 0 ? "0 petitions" : `Showing ${rangeStart}–${rangeEnd} of ${total} petitions`}
                </p>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 sm:flex-none">
              {search.trim() !== appliedSearch ? (
                <Loader2 aria-hidden="true" className={`absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin ${t.textMuted}`} />
              ) : (
                <Search aria-hidden="true" className={`absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 ${t.textMuted}`} />
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
              onChange={(e) => { urlMethodRef.current = "push"; setStatusFilter(e.target.value as StatusFilter); setPage(1); }}
              aria-label="Filter by completion status"
              className={`h-8 px-2 rounded-md border text-xs outline-none cursor-pointer ${t.inputBg}`}
            >
              <option value="all">All</option>
              <option value="complete">Complete</option>
              <option value="incomplete">Incomplete</option>
            </select>
            <select
              value={missingFilter}
              onChange={(e) => { urlMethodRef.current = "push"; setMissingFilter(e.target.value as MissingFilter); setPage(1); }}
              aria-label="Filter by missing step"
              className={`h-8 px-2 rounded-md border text-xs outline-none cursor-pointer ${t.inputBg}`}
            >
              <option value="">Missing: Any</option>
              {CHECKBOX_COLUMNS.map((col) => (
                <option key={col.key} value={col.key}>{col.label}</option>
              ))}
            </select>
            <select
              value={pageSize}
              onChange={(e) => { urlMethodRef.current = "push"; setPageSize(parseInt(e.target.value)); setPage(1); }}
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
              aria-label={selectedIds.size > 0 ? `Export ${selectedIds.size} selected to CSV` : "Export filtered to CSV"}
              className={`h-8 px-2.5 rounded-md border text-xs font-medium flex items-center gap-1.5 ${t.outlineBtn} disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {exporting
                ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                : <Download aria-hidden="true" className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">
                {selectedIds.size > 0 ? `Export ${selectedIds.size} selected` : "Export"}
              </span>
            </button>
          </div>
        </div>

        {/* Quick filter presets */}
        <div className={`px-4 py-2 flex items-center gap-2 flex-wrap border-b ${t.borderLight}`}>
          <span className={`text-[10px] font-semibold uppercase tracking-wider ${t.textMuted} shrink-0`}>Quick:</span>
          <button
            onClick={() => { urlMethodRef.current = "push"; setStatusFilter((v) => (v === "incomplete" ? "all" : "incomplete")); setPage(1); }}
            className={`${presetBase} ${statusFilter === "incomplete" ? presetActive : t.outlineBtn}`}
          >
            Incomplete
          </button>
          <button
            onClick={() => { urlMethodRef.current = "push"; setStatusFilter((v) => (v === "complete" ? "all" : "complete")); setPage(1); }}
            className={`${presetBase} ${statusFilter === "complete" ? presetActive : t.outlineBtn}`}
          >
            Complete
          </button>
          <button
            onClick={() => { urlMethodRef.current = "push"; setTouchedFilter((v) => (v === "none" ? "" : "none")); setPage(1); }}
            className={`${presetBase} ${touchedFilter === "none" ? presetActive : t.outlineBtn}`}
          >
            Never Touched
          </button>
        </div>

        {/* Active filter chips */}
        {hasFilters && (
          <div className={`px-4 py-2 flex items-center gap-2 flex-wrap border-b ${t.borderLight}`}>
            {appliedSearch && (
              <span className={chipBase}>
                Search: {appliedSearch}
                <button aria-label="Clear search filter" onClick={() => { setSearch(""); setAppliedSearch(""); setPage(1); }} className="ml-0.5 hover:opacity-70">
                  <X aria-hidden="true" className="h-3 w-3" />
                </button>
              </span>
            )}
            {statusFilter !== "all" && (
              <span className={chipBase}>
                Status: {statusFilter === "complete" ? "Complete" : "Incomplete"}
                <button aria-label="Clear status filter" onClick={() => { urlMethodRef.current = "push"; setStatusFilter("all"); setPage(1); }} className="ml-0.5 hover:opacity-70">
                  <X aria-hidden="true" className="h-3 w-3" />
                </button>
              </span>
            )}
            {touchedFilter === "none" && (
              <span className={chipBase}>
                Never Touched
                <button aria-label="Clear touched filter" onClick={() => { urlMethodRef.current = "push"; setTouchedFilter(""); setPage(1); }} className="ml-0.5 hover:opacity-70">
                  <X aria-hidden="true" className="h-3 w-3" />
                </button>
              </span>
            )}
            {missingFilter && (
              <span className={chipBase}>
                Missing: {CHECKBOX_COLUMNS.find((c) => c.key === missingFilter)?.label}
                <button aria-label="Clear missing filter" onClick={() => { urlMethodRef.current = "push"; setMissingFilter(""); setPage(1); }} className="ml-0.5 hover:opacity-70">
                  <X aria-hidden="true" className="h-3 w-3" />
                </button>
              </span>
            )}
            <button onClick={clearAllFilters} className={`text-[11px] font-medium underline ${t.textMuted} hover:opacity-70`}>
              Clear all
            </button>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
          <table className="w-full min-w-250">
            <thead>
              <tr className={`border-b ${t.borderLight}`}>
                {/* Select-all checkbox */}
                <th className={`${thBase} text-center sticky left-0 top-0 z-30 ${stickyHeaderBg}`}>
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    onChange={toggleSelectAll}
                    aria-label="Select all rows"
                    className="h-3.5 w-3.5 cursor-pointer accent-indigo-500"
                  />
                </th>
                <th
                  aria-sort={ariaSortFor("claimant")}
                  className={`${thBase} ${t.textSub} text-left sticky left-10 top-0 z-30 ${stickyHeaderBg}`}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort("claimant")}
                    className="inline-flex items-center gap-1 cursor-pointer rounded-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-neutral-300 dark:focus:ring-neutral-600"
                  >
                    Claimant {sortIcon("claimant")}
                  </button>
                </th>
                <th
                  aria-sort={ariaSortFor("approvalDate")}
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
                  aria-sort={ariaSortFor("updatedAt")}
                  className={`${thBase} ${t.textSub} text-left sticky top-0 z-20 ${stickyHeaderBg}`}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort("updatedAt")}
                    className="inline-flex items-center gap-1 cursor-pointer rounded-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-neutral-300 dark:focus:ring-neutral-600"
                  >
                    Updated {sortIcon("updatedAt")}
                  </button>
                </th>
                <th
                  aria-sort={ariaSortFor("progress")}
                  className={`${thBase} ${t.textSub} text-center sticky top-0 z-20 ${stickyHeaderBg}`}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort("progress")}
                    className="inline-flex items-center gap-1 cursor-pointer rounded-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-neutral-300 dark:focus:ring-neutral-600"
                  >
                    Progress {sortIcon("progress")}
                  </button>
                </th>
                {CHECKBOX_COLUMNS.map((col) => (
                  <th key={col.key} className={`${thBase} ${t.textSub} text-center sticky top-0 z-20 ${stickyHeaderBg}`}>
                    {col.label}
                  </th>
                ))}
                <th className={`${thBase} ${t.textSub} text-left min-w-50 sticky top-0 z-20 ${stickyHeaderBg}`}>Update</th>
              </tr>
            </thead>
            <tbody>
              {isInitialLoad ? (
                <tr>
                  <td colSpan={colSpan} className={`${tdBase} text-center py-8 ${t.textMuted}`}>
                    <span className="inline-flex items-center gap-2">
                      <RefreshCw aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                      Loading petitions...
                    </span>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={colSpan} className={`${tdBase} text-center py-12 ${t.textMuted}`}>
                    <div className="flex flex-col items-center gap-2">
                      <Gavel aria-hidden="true" className="h-8 w-8 opacity-30" />
                      <p className="text-sm font-medium">
                        {hasFilters ? "No petitions match your filters." : "No fee petitions found."}
                      </p>
                      {hasFilters && (
                        <button onClick={clearAllFilters} className={`text-xs font-medium underline ${dark ? "text-indigo-400" : "text-indigo-600"}`}>
                          Clear filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const completedCount = CHECKBOX_COLUMNS.reduce((acc, c) => acc + (row[c.key] ? 1 : 0), 0);
                  const isComplete = completedCount === CHECKBOX_COLUMNS.length;
                  const isSelected = selectedIds.has(row.id);
                  const completeBg = isComplete
                    ? dark ? "bg-emerald-900/40" : "bg-emerald-100/80"
                    : "";
                  const stickyBg = isComplete
                    ? dark ? "bg-emerald-900" : "bg-emerald-100"
                    : dark ? "bg-neutral-900" : "bg-white";
                  const stickyHover = isComplete
                    ? dark ? "group-hover/row:bg-emerald-800" : "group-hover/row:bg-emerald-200"
                    : dark ? "group-hover/row:bg-neutral-800" : "group-hover/row:bg-neutral-50";
                  return (
                    <tr
                      key={row.id}
                      className={`group/row border-b ${rowBorder} ${completeBg} ${rowHover} transition-colors`}
                    >
                      <td className={`${tdBase} text-center sticky left-0 z-10 ${stickyBg} ${stickyHover}`}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRowSelection(row.id)}
                          aria-label={`Select ${row.claimant}`}
                          className="h-3.5 w-3.5 cursor-pointer accent-indigo-500"
                        />
                      </td>
                      <td
                        className={`${tdBase} ${t.text} font-semibold max-w-45 sticky left-10 z-10 ${stickyBg} ${stickyHover}`}
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
                            Updated {formatRelativeDate(row.updatedAt)}
                          </p>
                        )}
                      </td>
                      <td className={`${tdBase} ${t.textMuted}`}>
                        <div className="flex items-center gap-1.5">
                          <span>{fmtDate(row.approvalDate)}</span>
                          {daysSince(row.approvalDate) != null && (
                            <span className={`text-[10px] font-semibold px-1 rounded ${dark ? "bg-neutral-700 text-neutral-300" : "bg-neutral-100 text-neutral-500"}`}>
                              {daysSince(row.approvalDate)}d
                            </span>
                          )}
                        </div>
                      </td>
                      <td className={`${tdBase} ${t.textMuted}`}>{fmtDate(row.updatedAt)}</td>
                      <td className={`${tdBase} text-center`}>
                        <div className="flex items-center gap-2 justify-center">
                          <div className="w-16 h-1.5 rounded-full overflow-hidden bg-neutral-200 dark:bg-neutral-700">
                            <div
                              className={`h-full rounded-full transition-[width] ${isComplete ? "bg-emerald-500" : completedCount > 0 ? "bg-amber-400" : ""}`}
                              style={{ width: `${(completedCount / CHECKBOX_COLUMNS.length) * 100}%` }}
                            />
                          </div>
                          <span className={`text-[11px] font-semibold ${isComplete ? (dark ? "text-emerald-400" : "text-emerald-600") : t.textMuted}`}>
                            {completedCount}/{CHECKBOX_COLUMNS.length}
                          </span>
                        </div>
                      </td>
                      {CHECKBOX_COLUMNS.map((col) => (
                        <td key={col.key} className={`${tdBase} text-center`}>
                          <input
                            type="checkbox"
                            checked={row[col.key]}
                            onChange={() => toggleCheckbox(row.id, col.key)}
                            className="h-3.5 w-3.5 cursor-pointer accent-indigo-500"
                          />
                        </td>
                      ))}
                      <td className={`${tdBase}`}>
                        <div className="relative">
                          <input
                            type="text"
                            value={row.updateNote}
                            onChange={(e) => setUpdateNoteLocal(row.id, e.target.value)}
                            onBlur={() => persistUpdateNote(row)}
                            placeholder="Add a note..."
                            maxLength={5000}
                            className={`w-full h-7 pl-2 pr-7 rounded-md border text-[11px] outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-600 ${t.inputBg}`}
                          />
                          {noteState[row.id] === "saving" && (
                            <Loader2 aria-hidden="true" className={`absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin ${t.textMuted}`} />
                          )}
                          {noteState[row.id] === "saved" && (
                            <Check aria-hidden="true" className={`absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 ${dark ? "text-emerald-400" : "text-emerald-600"}`} />
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

        {/* Pagination footer */}
        <div className={`px-4 py-3 flex items-center justify-between border-t ${t.borderLight}`}>
          <p className={`text-[11px] ${t.textMuted}`}>Page {page} of {totalPages}</p>
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
