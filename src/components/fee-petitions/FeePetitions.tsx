"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useTheme } from "next-themes";
import {
  Search,
  ArrowUpDown,
  Gavel,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";

// ---------- types ----------
interface FeePetitionRow {
  id: number;
  claimant: string;
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
type SortKey = "claimant";
type SortDir = "asc" | "desc";
type StatusFilter = "all" | "complete" | "incomplete";

// ---------- helpers ----------
const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

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
  const res = await fetch(`/api/fee-petitions/${caseId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to save petition");
};

// ---------- component ----------
export const FeePetitions = () => {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted ? resolvedTheme === "dark" : false;
  const t = themeClasses(dark);

  const [rows, setRows] = useState<FeePetitionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search (debounced -> appliedSearch drives the fetch)
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);

  // Completion filter
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // Sort (only affects current page)
  const [sortKey, setSortKey] = useState<SortKey>("claimant");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Track last-persisted note value per row to skip no-op writes on blur
  const noteSnapshot = useRef<Map<number, string>>(new Map());

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

  const fetchPetitions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
      });
      if (appliedSearch) params.set("search", appliedSearch);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/fee-petitions?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load fee petitions");
      const json = await res.json();
      const data: FeePetitionRow[] = json.data || [];
      setRows(data);
      setTotal(typeof json.total === "number" ? json.total : data.length);
      noteSnapshot.current = new Map(data.map((r) => [r.id, r.updateNote]));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, appliedSearch, statusFilter]);

  useEffect(() => {
    fetchPetitions();
  }, [fetchPetitions]);

  const sorted = useMemo(() => {
    const d = [...rows];
    d.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return d;
  }, [rows, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir("asc");
    }
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
    try {
      await patchPetition(row.id, { updateNote: row.updateNote });
      noteSnapshot.current.set(row.id, row.updateNote);
    } catch (err) {
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

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className={`${sectionCard} p-4 md:p-5`}>
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center ${dark ? "bg-indigo-900/40" : "bg-indigo-50"}`}
          >
            <Gavel
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
              <Search
                className={`absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 ${t.textMuted}`}
              />
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
        <div className="overflow-x-auto">
          <table className="w-full min-w-250">
            <thead>
              <tr className={`border-b ${t.borderLight}`}>
                <th
                  className={`${thBase} ${t.textSub} text-left cursor-pointer`}
                  onClick={() => toggleSort("claimant")}
                >
                  <span className="flex items-center gap-1">
                    Claimant <ArrowUpDown className="h-3 w-3" />
                  </span>
                </th>
                <th className={`${thBase} ${t.textSub} text-center`}>
                  Progress
                </th>
                {CHECKBOX_COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className={`${thBase} ${t.textSub} text-center`}
                  >
                    {col.label}
                  </th>
                ))}
                <th className={`${thBase} ${t.textSub} text-left min-w-50`}>
                  Update
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={CHECKBOX_COLUMNS.length + 3}
                    className={`${tdBase} text-center py-8 ${t.textMuted}`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      Loading petitions...
                    </span>
                  </td>
                </tr>
              ) : sorted.length === 0 ? (
                <tr>
                  <td
                    colSpan={CHECKBOX_COLUMNS.length + 3}
                    className={`${tdBase} text-center py-8 ${t.textMuted}`}
                  >
                    No fee petitions found.
                  </td>
                </tr>
              ) : (
                sorted.map((row) => {
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
                  return (
                  <tr
                    key={row.id}
                    className={`border-b ${rowBorder} ${completeBg} ${rowHover} transition-colors`}
                  >
                    <td
                      className={`${tdBase} ${t.text} font-semibold max-w-45 truncate`}
                      title={row.claimant}
                    >
                      {row.claimant}
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
                      <input
                        type="text"
                        value={row.updateNote}
                        onChange={(e) =>
                          setUpdateNoteLocal(row.id, e.target.value)
                        }
                        onBlur={() => persistUpdateNote(row)}
                        placeholder="Add a note..."
                        className={`w-full h-7 px-2 rounded-md border text-[11px] outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-600 ${t.inputBg}`}
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
        <div
          className={`px-4 py-3 flex items-center justify-between border-t ${t.borderLight}`}
        >
          <p className={`text-[11px] ${t.textMuted}`}>
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className={`h-8 px-2 rounded-md border text-xs font-medium flex items-center gap-1 ${t.outlineBtn} disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className={`h-8 px-2 rounded-md border text-xs font-medium flex items-center gap-1 ${t.outlineBtn} disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
