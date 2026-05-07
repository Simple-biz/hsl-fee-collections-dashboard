"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
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
} from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import { fmtDate } from "@/lib/formatters";
import { upsertFeePetition } from "@/app/(dashboard)/fee-petitions/actions";

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
type SortKey = "claimant" | "approvalDate" | "updatedAt";
type SortDir = "asc" | "desc";
type StatusFilter = "all" | "complete" | "incomplete";

// ---------- helpers ----------
const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];
const SORT_KEYS: SortKey[] = ["claimant", "approvalDate", "updatedAt"];
const STATUS_VALUES: StatusFilter[] = ["all", "complete", "incomplete"];
const DEFAULTS = {
  search: "",
  status: "all" as StatusFilter,
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

  // URL hydration — read initial values once
  const router = useRouter();
  const pathname = usePathname();
  const urlParams = useSearchParams();
  const initialState = useRef({
    search: urlParams.get("q") ?? DEFAULTS.search,
    status: (STATUS_VALUES.includes(urlParams.get("status") as StatusFilter)
      ? (urlParams.get("status") as StatusFilter)
      : DEFAULTS.status) as StatusFilter,
    sort: (SORT_KEYS.includes(urlParams.get("sort") as SortKey)
      ? (urlParams.get("sort") as SortKey)
      : DEFAULTS.sort) as SortKey,
    dir: (urlParams.get("dir") === "asc" ? "asc" : "desc") as SortDir,
    page: Math.max(1, parseInt(urlParams.get("page") || "1") || 1),
    pageSize: PAGE_SIZE_OPTIONS.includes(
      parseInt(urlParams.get("size") || "0"),
    )
      ? parseInt(urlParams.get("size") || "0")
      : DEFAULTS.pageSize,
  }).current;

  const [rows, setRows] = useState<FeePetitionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search (debounced -> appliedSearch drives the fetch + URL)
  const [search, setSearch] = useState(initialState.search);
  const [appliedSearch, setAppliedSearch] = useState(initialState.search);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Pagination
  const [page, setPage] = useState(initialState.page);
  const [pageSize, setPageSize] = useState(initialState.pageSize);
  const [total, setTotal] = useState(0);

  // Completion filter
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    initialState.status,
  );

  // Sort (server-side)
  const [sortKey, setSortKey] = useState<SortKey>(initialState.sort);
  const [sortDir, setSortDir] = useState<SortDir>(initialState.dir);

  // Whether the next URL write should create a history entry.
  // Set to "push" before a state change that the user should be able to back/forward through.
  const urlMethodRef = useRef<"push" | "replace">("replace");

  // Mirror state into URL (omit defaults; skip if URL already matches to avoid feedback loops)
  useEffect(() => {
    const params = new URLSearchParams();
    if (appliedSearch) params.set("q", appliedSearch);
    if (statusFilter !== DEFAULTS.status) params.set("status", statusFilter);
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
  }, [
    appliedSearch,
    statusFilter,
    sortKey,
    sortDir,
    page,
    pageSize,
    pathname,
    router,
    urlParams,
  ]);

  // Sync URL → state (handles back/forward). Equality checks make this a no-op
  // when state already matches the URL, preventing ping-pong with the mirror effect.
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
    const urlSize = PAGE_SIZE_OPTIONS.includes(sizeNum)
      ? sizeNum
      : DEFAULTS.pageSize;

    if (urlSearch !== appliedSearch) {
      setSearch(urlSearch);
      setAppliedSearch(urlSearch);
    }
    if (urlStatus !== statusFilter) setStatusFilter(urlStatus);
    if (urlSort !== sortKey) setSortKey(urlSort);
    if (urlDir !== sortDir) setSortDir(urlDir);
    if (urlPage !== page) setPage(urlPage);
    if (urlSize !== pageSize) setPageSize(urlSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlParams]);

  // Track last-persisted note value per row to skip no-op writes on blur
  const noteSnapshot = useRef<Map<number, string>>(new Map());

  // Per-row note save state: "saving" while in flight, "saved" briefly after success
  const [noteState, setNoteState] = useState<
    Record<number, "saving" | "saved" | undefined>
  >({});
  const savedTimerRef = useRef<Map<number, NodeJS.Timeout>>(new Map());

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
      params.set("sort", sortKey);
      params.set("dir", sortDir);
      const res = await fetch(`/api/fee-petitions?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Failed to load fee petitions (${res.status})`);
      const json = await res.json();
      const data: FeePetitionRow[] = json.data || [];
      setRows(data);
      setTotal(typeof json.total === "number" ? json.total : data.length);
      noteSnapshot.current = new Map(data.map((r) => [r.id, r.updateNote]));
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError((err as Error).message);
    } finally {
      if (fetchAbortRef.current === controller) {
        setLoading(false);
      }
    }
  }, [page, pageSize, appliedSearch, statusFilter, sortKey, sortDir]);

  useEffect(() => {
    fetchPetitions();
    return () => {
      fetchAbortRef.current?.abort();
    };
  }, [fetchPetitions]);

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

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return <ArrowUpDown aria-hidden="true" className="h-3 w-3" />;
    return sortDir === "asc" ? (
      <ArrowUp aria-hidden="true" className="h-3 w-3" />
    ) : (
      <ArrowDown aria-hidden="true" className="h-3 w-3" />
    );
  };

  // Optimistic update + persist; revert on failure
  const toggleCheckbox = async (id: number, key: CheckboxKey) => {
    const prevRow = rows.find((r) => r.id === id);
    if (!prevRow) return;
    const next = !prevRow[key];

    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [key]: next } : r)),
    );

    try {
      await patchPetition(id, { [key]: next });
      const today = new Date().toISOString().slice(0, 10);
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, updatedAt: today } : r)),
      );
      // After save, drop row if it no longer matches the active status filter
      if (statusFilter !== "all") {
        const updated = { ...prevRow, [key]: next };
        const isComplete = CHECKBOX_COLUMNS.every((c) => updated[c.key]);
        const stillMatches =
          statusFilter === "complete" ? isComplete : !isComplete;
        if (!stillMatches) {
          setRows((prev) => prev.filter((r) => r.id !== id));
          setTotal((tot) => Math.max(0, tot - 1));
        }
      }
    } catch (err) {
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, [key]: !next } : r)),
      );
      setError((err as Error).message);
    }
  };

  const setUpdateNoteLocal = (id: number, value: string) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, updateNote: value } : r)),
    );
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
            className={`w-10 h-10 rounded-lg flex items-center justify-center ${dark ? "bg-indigo-900/40" : "bg-indigo-50"}`}
          >
            <Gavel
              aria-hidden="true"
              className={`h-5 w-5 ${dark ? "text-indigo-400" : "text-indigo-600"}`}
            />
          </div>
          <div>
            <h3 className={`text-sm font-bold ${t.text}`}>Fee Petitions</h3>
            <p className={`text-[11px] ${t.textMuted} mt-0.5`}>
              Track and manage fee petition filings
            </p>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          role="alert"
          className={`rounded-xl border p-4 flex items-center gap-3 ${dark ? "bg-red-900/20 border-red-800 text-red-400" : "bg-red-50 border-red-200 text-red-700"}`}
        >
          <span className="text-sm">{error}</span>
          <button
            onClick={fetchPetitions}
            className="ml-auto text-xs font-medium underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Table card */}
      <div className={sectionCard}>
        {/* Toolbar */}
        <div
          className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b ${t.borderLight}`}
        >
          <div>
            <h3 className={`text-sm font-bold ${t.text}`}>Petitions</h3>
            <p className={`text-[11px] ${t.textMuted} mt-0.5`}>
              {total === 0
                ? "0 petitions"
                : `Showing ${rangeStart}–${rangeEnd} of ${total} petitions`}
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
              className={`h-8 px-2 rounded-md border text-xs outline-none cursor-pointer ${t.inputBg}`}
            >
              <option value="all">All</option>
              <option value="complete">Complete</option>
              <option value="incomplete">Incomplete</option>
            </select>
            <select
              value={pageSize}
              onChange={(e) => {
                urlMethodRef.current = "push";
                setPageSize(parseInt(e.target.value));
                setPage(1);
              }}
              className={`h-8 px-2 rounded-md border text-xs outline-none cursor-pointer ${t.inputBg}`}
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} / page
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
          <table className="w-full min-w-250">
            <thead>
              <tr className={`border-b ${t.borderLight}`}>
                <th
                  className={`${thBase} ${t.textSub} text-left cursor-pointer sticky left-0 top-0 z-30 ${stickyHeaderBg}`}
                  onClick={() => toggleSort("claimant")}
                >
                  <span className="flex items-center gap-1">
                    Claimant {sortIcon("claimant")}
                  </span>
                </th>
                <th
                  className={`${thBase} ${t.textSub} text-left cursor-pointer sticky top-0 z-20 ${stickyHeaderBg}`}
                  onClick={() => toggleSort("approvalDate")}
                >
                  <span className="flex items-center gap-1">
                    Approved {sortIcon("approvalDate")}
                  </span>
                </th>
                <th
                  className={`${thBase} ${t.textSub} text-left cursor-pointer sticky top-0 z-20 ${stickyHeaderBg}`}
                  onClick={() => toggleSort("updatedAt")}
                >
                  <span className="flex items-center gap-1">
                    Updated {sortIcon("updatedAt")}
                  </span>
                </th>
                <th className={`${thBase} ${t.textSub} text-center sticky top-0 z-20 ${stickyHeaderBg}`}>
                  Progress
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
              {loading ? (
                <tr>
                  <td
                    colSpan={CHECKBOX_COLUMNS.length + 5}
                    className={`${tdBase} text-center py-8 ${t.textMuted}`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <RefreshCw aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                      Loading petitions...
                    </span>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={CHECKBOX_COLUMNS.length + 5}
                    className={`${tdBase} text-center py-8 ${t.textMuted}`}
                  >
                    No fee petitions found.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const completedCount = CHECKBOX_COLUMNS.reduce(
                    (acc, c) => acc + (row[c.key] ? 1 : 0),
                    0,
                  );
                  const isComplete = completedCount === CHECKBOX_COLUMNS.length;
                  const completeBg = isComplete
                    ? dark
                      ? "bg-emerald-900/40"
                      : "bg-emerald-100/80"
                    : "";
                  const stickyBg = isComplete
                    ? dark
                      ? "bg-emerald-900"
                      : "bg-emerald-100"
                    : dark
                      ? "bg-neutral-900"
                      : "bg-white";
                  const stickyHover = isComplete
                    ? dark
                      ? "group-hover/row:bg-emerald-800"
                      : "group-hover/row:bg-emerald-200"
                    : dark
                      ? "group-hover/row:bg-neutral-800"
                      : "group-hover/row:bg-neutral-50";
                  return (
                  <tr
                    key={row.id}
                    className={`group/row border-b ${rowBorder} ${completeBg} ${rowHover} transition-colors`}
                  >
                    <td
                      className={`${tdBase} ${t.text} font-semibold max-w-45 truncate sticky left-0 z-10 ${stickyBg} ${stickyHover}`}
                      title={row.claimant}
                    >
                      {row.claimant}
                    </td>
                    <td className={`${tdBase} ${t.textMuted}`}>
                      {fmtDate(row.approvalDate)}
                    </td>
                    <td className={`${tdBase} ${t.textMuted}`}>
                      {fmtDate(row.updatedAt)}
                    </td>
                    <td className={`${tdBase} text-center`}>
                      <span
                        className={`text-[11px] font-semibold ${
                          isComplete
                            ? dark
                              ? "text-emerald-400"
                              : "text-emerald-600"
                            : t.textMuted
                        }`}
                      >
                        {completedCount} / {CHECKBOX_COLUMNS.length}
                      </span>
                    </td>
                    {CHECKBOX_COLUMNS.map((col) => (
                      <td
                        key={col.key}
                        className={`${tdBase} text-center`}
                      >
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
                          onChange={(e) =>
                            setUpdateNoteLocal(row.id, e.target.value)
                          }
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
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        <div
          className={`px-4 py-3 flex items-center justify-between border-t ${t.borderLight}`}
        >
          <p className={`text-[11px] ${t.textMuted}`}>
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                urlMethodRef.current = "push";
                setPage((p) => Math.max(1, p - 1));
              }}
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
                onBlur={(e) => {
                  e.target.value = String(page);
                }}
                className={`h-8 w-12 px-1 rounded-md border text-xs text-center outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-600 disabled:opacity-40 ${t.inputBg}`}
              />
              <span className={`text-[11px] ${t.textMuted}`}>/ {totalPages}</span>
            </div>
            <button
              onClick={() => {
                urlMethodRef.current = "push";
                setPage((p) => Math.min(totalPages, p + 1));
              }}
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
