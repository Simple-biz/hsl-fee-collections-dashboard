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
  Download,
  Upload,
  X,
  Undo2,
  ExternalLink,
} from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import { fmt, fmtDate } from "@/lib/formatters";
import { upsertFeePetition, bulkMarkComplete, bulkRestoreChecklists, bulkImportFeePetitions } from "@/app/(dashboard)/fee-petitions/actions";
import { CompletedPetitions } from "./CompletedPetitions";
import CsvImportModal, { type ColumnDef } from "@/components/modals/CsvImportModal";
import { parseBool } from "@/lib/import/csv-parser";
import { buildMyCaseUrl } from "@/lib/import/case-link";
import { NoteField } from "@/components/shared/NoteField";
import { FeeAmountCell } from "@/components/cases/FeeAmountCell";
import { useCapabilities } from "@/hooks/useCapabilities";
import { Listbox } from "@/components/shared/Listbox";
import { buildListboxOptions } from "@/lib/listbox-options";
import { fetchDropdownOptions, type DropdownOptionsByCategory } from "@/lib/dropdown-options";

// ---------- types ----------
interface FeePetitionRow {
  id: number;
  claimant: string;
  externalId: string | null;
  approvalDate: string | null;
  updatedAt: string | null;
  feeAmount: number | null;
  // Which fee_records benefit type Fee Requested edits — resolved
  // server-side to whichever type actually has data (falling back to the
  // case's registered claim type when nothing's entered yet).
  activeFeeType: "t16" | "t2" | "aux";
  assignedTo: string | null;
  noa: boolean;
  timeDelineation: boolean;
  feePetitionDoc: boolean;
  ltrToClmt: boolean;
  ltrToClmtWithSignature: boolean;
  ltrToAlj: boolean;
  faxConfFeePet: boolean;
  // Outcome flag, not part of the filing checklist above — synced with
  // Remarks ("FEE PETITION APPROVED") on Master Fees in both directions.
  feePetitionApproved: boolean;
  updateNote: string;
}

type CheckboxKey =
  | "timeDelineation"
  | "feePetitionDoc"
  | "ltrToClmt"
  | "ltrToClmtWithSignature"
  | "ltrToAlj"
  | "faxConfFeePet";
type SortKey = "claimant" | "approvalDate" | "updatedAt" | "progress";
type SortDir = "asc" | "desc";
type TouchedFilter = "" | "none";
type MissingFilter = "" | CheckboxKey;
type AgingFilter = "" | "unpaid_60" | "unpaid_90";
type Assignee = { name: string; count: number };

// ---------- helpers ----------
const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];
const SORT_KEYS: SortKey[] = ["claimant", "approvalDate", "updatedAt", "progress"];
const CHECKBOX_KEYS = ["timeDelineation", "feePetitionDoc", "ltrToClmt", "ltrToClmtWithSignature", "ltrToAlj", "faxConfFeePet"] as const;

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
const DEFAULTS = {
  search: "",
  touched: "" as TouchedFilter,
  missing: "" as MissingFilter,
  aging: "" as AgingFilter,
  assignedTo: "",
  sort: "approvalDate" as SortKey,
  dir: "desc" as SortDir,
  page: 1,
  pageSize: 50,
};

const CHECKBOX_COLUMNS: { key: CheckboxKey; label: string }[] = [
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

// ---------- csv import config ----------
const FP_CSV_COLUMNS: ColumnDef[] = [
  { key: "client_id", label: "Client ID / Name", required: true, hint: "Integer client ID or \"First Last\" / \"Last, First\"" },
  { key: "noa", label: "NOA", hint: "true/false/yes/no/1/0" },
  { key: "time_delineation", label: "Time Delineation", hint: "true/false/yes/no/1/0" },
  { key: "fee_petition_doc", label: "Fee Petition Doc", hint: "true/false/yes/no/1/0" },
  { key: "ltr_to_clmt", label: "Ltr to Clmt", hint: "true/false/yes/no/1/0" },
  { key: "ltr_to_clmt_with_signature", label: "Ltr to Clmt (Sig)", hint: "true/false/yes/no/1/0" },
  { key: "ltr_to_alj", label: "Ltr to ALJ", hint: "true/false/yes/no/1/0" },
  { key: "fax_conf_fee_pet", label: "Fax Conf Fee Pet", hint: "true/false/yes/no/1/0" },
  { key: "update_note", label: "Update Note", hint: "Optional text, max 5000 chars" },
];

const FP_TEMPLATE_CSV =
  "client_id,noa,time_delineation,fee_petition_doc,ltr_to_clmt,ltr_to_clmt_with_signature,ltr_to_alj,fax_conf_fee_pet,update_note\n" +
  "123456,true,true,false,false,false,false,false,Example note\n";

const FP_BOOL_KEYS = ["noa", "time_delineation", "fee_petition_doc", "ltr_to_clmt", "ltr_to_clmt_with_signature", "ltr_to_alj", "fax_conf_fee_pet"];

const validateFpRow = (raw: Record<string, string>): string[] => {
  const errors: string[] = [];
  if (!raw["client_id"]?.trim()) errors.push("client_id is required");
  for (const key of FP_BOOL_KEYS) {
    if (raw[key] !== undefined && raw[key].trim() && parseBool(raw[key]) === null) {
      errors.push(`Invalid boolean for "${key}"`);
    }
  }
  if (raw["update_note"] && raw["update_note"].length > 5000) errors.push("update_note too long");
  return errors;
};

// ---------- component ----------
export const FeePetitions = () => {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted ? resolvedTheme === "dark" : false;
  const t = themeClasses(dark);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    (async () => {
      const grouped = await fetchDropdownOptions(controller.signal);
      if (!cancelled) setDropdownOptions(grouped);
    })().catch((e) => {
      if ((e as Error).name !== "AbortError") console.error("fetchDropdownOptions error:", e);
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);
  const { can } = useCapabilities();
  const canEditFees = can("case.update");

  const router = useRouter();
  const pathname = usePathname();
  const urlParams = useSearchParams();
  const initialState = useRef({
    search: urlParams.get("q") ?? DEFAULTS.search,
    touched: (urlParams.get("touched") === "none" ? "none" : "") as TouchedFilter,
    missing: (CHECKBOX_KEYS.includes(urlParams.get("missing") as CheckboxKey) ? urlParams.get("missing") : "") as MissingFilter,
    aging: (["unpaid_60", "unpaid_90"].includes(urlParams.get("aging") ?? "") ? urlParams.get("aging") : "") as AgingFilter,
    assignedTo: urlParams.get("assignedTo") ?? DEFAULTS.assignedTo,
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
  const [dropdownOptions, setDropdownOptions] = useState<DropdownOptionsByCategory>({});

  const [search, setSearch] = useState(initialState.search);
  const [appliedSearch, setAppliedSearch] = useState(initialState.search);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const [page, setPage] = useState(initialState.page);
  const [pageSize, setPageSize] = useState(initialState.pageSize);
  const [total, setTotal] = useState(0);

  const [touchedFilter, setTouchedFilter] = useState<TouchedFilter>(initialState.touched);
  const [missingFilter, setMissingFilter] = useState<MissingFilter>(initialState.missing);
  const [agingFilter, setAgingFilter] = useState<AgingFilter>(initialState.aging);
  const [assignedToFilter, setAssignedToFilter] = useState(initialState.assignedTo);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [unassignedCount, setUnassignedCount] = useState(0);
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
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const urlMethodRef = useRef<"push" | "replace">("replace");

  // Mirror state into URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (appliedSearch) params.set("q", appliedSearch);
    if (touchedFilter) params.set("touched", touchedFilter);
    if (missingFilter) params.set("missing", missingFilter);
    if (agingFilter) params.set("aging", agingFilter);
    if (assignedToFilter) params.set("assignedTo", assignedToFilter);
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
  }, [appliedSearch, touchedFilter, missingFilter, agingFilter, assignedToFilter, sortKey, sortDir, page, pageSize, pathname, router, urlParams]);

  // Sync URL → state (back/forward)
  useEffect(() => {
    const urlSearch = urlParams.get("q") ?? DEFAULTS.search;
    const urlTouched = (urlParams.get("touched") === "none" ? "none" : "") as TouchedFilter;
    const urlMissingRaw = urlParams.get("missing");
    const urlMissing = (CHECKBOX_KEYS.includes(urlMissingRaw as CheckboxKey) ? urlMissingRaw : "") as MissingFilter;
    const urlAgingRaw = urlParams.get("aging") ?? "";
    const urlAging = (["unpaid_60", "unpaid_90"].includes(urlAgingRaw) ? urlAgingRaw : "") as AgingFilter;
    const urlAssignedTo = urlParams.get("assignedTo") ?? DEFAULTS.assignedTo;
    const urlSortRaw = urlParams.get("sort") as SortKey | null;
    const urlSort = SORT_KEYS.includes(urlSortRaw as SortKey)
      ? (urlSortRaw as SortKey)
      : DEFAULTS.sort;
    const urlDir: SortDir = urlParams.get("dir") === "asc" ? "asc" : "desc";
    const urlPage = Math.max(1, parseInt(urlParams.get("page") || "1") || 1);
    const sizeNum = parseInt(urlParams.get("size") || "0");
    const urlSize = PAGE_SIZE_OPTIONS.includes(sizeNum) ? sizeNum : DEFAULTS.pageSize;

    if (urlSearch !== appliedSearch) { setSearch(urlSearch); setAppliedSearch(urlSearch); }
    if (urlTouched !== touchedFilter) setTouchedFilter(urlTouched);
    if (urlMissing !== missingFilter) setMissingFilter(urlMissing);
    if (urlAging !== agingFilter) setAgingFilter(urlAging);
    if (urlAssignedTo !== assignedToFilter) setAssignedToFilter(urlAssignedTo);
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
  const completedCountAbortRef = useRef<AbortController | null>(null);
  const allTotalsAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const [completedCount, setCompletedCount] = useState<number | null>(null);

  // fetchPetitions always filters to status=incomplete, so its own
  // completeCount aggregate is trivially 0 — fetch the real completed total
  // separately, the same way CompletedPetitions.tsx gets its own badge count.
  // Exposed as a callback (not just an effect) so in-page actions that move a
  // petition from pending to complete can refresh it immediately instead of
  // waiting for a reload.
  const fetchCompletedCount = useCallback(() => {
    completedCountAbortRef.current?.abort();
    const controller = new AbortController();
    completedCountAbortRef.current = controller;
    fetch(`/api/fee-petitions?status=complete&page=1&limit=1`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json != null && mountedRef.current) {
          setCompletedCount(typeof json.total === "number" ? json.total : 0);
        }
      })
      .catch(() => {});
  }, []);

  const [allTotals, setAllTotals] = useState<{ feeRequested: number } | null>(null);

  // Fees Requested/Received in the stats bar cover pending AND completed
  // petitions together — fetched with no status filter (unlike fetchPetitions,
  // which always scopes its own aggregate to incomplete for the row list).
  // These only change when a payment is recorded on the case detail page, not
  // from anything this page itself does — refreshed on window focus below
  // rather than tied to any local action.
  const fetchAllTotals = useCallback(() => {
    allTotalsAbortRef.current?.abort();
    const controller = new AbortController();
    allTotalsAbortRef.current = controller;
    fetch(`/api/fee-petitions?page=1&limit=1`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json != null && mountedRef.current) {
          setAllTotals({
            feeRequested: typeof json.totalFeeRequested === "number" ? json.totalFeeRequested : 0,
          });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchCompletedCount();
    fetchAllTotals();
    return () => {
      completedCountAbortRef.current?.abort();
      allTotalsAbortRef.current?.abort();
    };
  }, [fetchCompletedCount, fetchAllTotals]);

  // Catches fee changes made elsewhere (e.g. a payment added from the case
  // detail page) — neither count can react to that on its own, so refresh
  // both whenever the user comes back to this tab.
  useEffect(() => {
    const onFocus = () => {
      fetchCompletedCount();
      fetchAllTotals();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchCompletedCount, fetchAllTotals]);

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
      params.set("status", "incomplete");
      if (appliedSearch) params.set("search", appliedSearch);
      if (touchedFilter) params.set("touched", touchedFilter);
      if (missingFilter) params.set("missing", missingFilter);
      if (agingFilter) params.set("aging", agingFilter);
      if (assignedToFilter) params.set("assignedTo", assignedToFilter);
      params.set("sort", sortKey);
      params.set("dir", sortDir);
      const res = await fetch(`/api/fee-petitions?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Failed to load fee petitions (${res.status})`);
      const json = await res.json();
      const data: FeePetitionRow[] = json.data || [];
      setRows(data);
      // A full list refetch supersedes any per-row refresh snapshot taken
      // before it — must not outlive this, or a stale rowOverrides entry
      // would keep shadowing newer data for that row indefinitely.
      setRowOverrides({});
      setSelectedIds(new Set());
      setBulkConfirming(false);
      setTotal(typeof json.total === "number" ? json.total : data.length);
      if (Array.isArray(json.assignees)) setAssignees(json.assignees);
      if (typeof json.unassignedCount === "number") setUnassignedCount(json.unassignedCount);
      noteSnapshot.current = new Map(data.map((r) => [r.id, r.updateNote]));
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError((err as Error).message);
    } finally {
      if (fetchAbortRef.current === controller) setLoading(false);
    }
  }, [page, pageSize, appliedSearch, touchedFilter, missingFilter, agingFilter, assignedToFilter, sortKey, sortDir]);

  useEffect(() => {
    fetchPetitions();
    return () => { fetchAbortRef.current?.abort(); };
  }, [fetchPetitions]);

  // Re-fetches one petition and patches just its row — lets staff confirm a
  // checkbox/assignee edit's saved state without reloading (and losing
  // their filters/page/scroll position on) the whole table. `updateNote` is
  // deliberately excluded from the patch — it has its own dedicated
  // draft/save flow (setUpdateNoteLocal writes straight into `rows`, ahead
  // of persistUpdateNote's debounced save), and patching it here would
  // silently revert an in-progress, not-yet-saved note back to the
  // pre-edit server value if a refresh landed mid-draft.
  const handleRowRefresh = async (id: number) => {
    rowRefreshAbortRef.current.get(id)?.abort();
    const controller = new AbortController();
    rowRefreshAbortRef.current.set(id, controller);
    setRowRefreshing((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/fee-petitions?caseId=${id}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Failed to refresh petition (${res.status})`);
      const json = await res.json();
      const fresh: FeePetitionRow | undefined = json.data?.[0];
      if (!fresh) throw new Error("Petition not found");
      const patch: Partial<FeePetitionRow> = { ...fresh };
      delete patch.updateNote;
      setRowOverrides((prev) => ({ ...prev, [id]: patch }));
      setFeeAmountOverrides((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      console.error("Failed to refresh row:", err);
      setLiveMessage("Refresh failed");
    } finally {
      if (rowRefreshAbortRef.current.get(id) === controller) {
        rowRefreshAbortRef.current.delete(id);
      }
      setRowRefreshing((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  // Fee Requested/Fees Received have no single editable column of their own
  // (they're sums of t16/t2/aux Fee Due and Fee Received) — each cell edits
  // row.activeFeeType's column directly (resolved server-side to whichever
  // benefit type the case is actually using).
  const [feeAmountEdit, setFeeAmountEdit] = useState<{
    rowId: number;
    draft: string;
  } | null>(null);
  const [feeAmountSaving, setFeeAmountSaving] = useState(false);
  const [feeAmountError, setFeeAmountError] = useState<string | null>(null);
  const [feeAmountOverrides, setFeeAmountOverrides] = useState<
    Record<number, Partial<Pick<FeePetitionRow, "feeAmount">>>
  >({});
  const feeAmountAbortRef = useRef<AbortController | null>(null);

  // Per-row "refresh" — re-fetches one petition from the server and patches
  // just that row, so staff can see a checkbox/note/assignee edit's saved
  // state confirmed without reloading (and losing their filters/page/scroll
  // position on) the whole table. Mirrors Master Fees' rowOverrides pattern;
  // cleared inside fetchPetitions itself (not a [rows] effect, since rows
  // also changes on every unrelated optimistic edit in this file).
  const [rowOverrides, setRowOverrides] = useState<Record<number, Partial<FeePetitionRow>>>({});
  const [rowRefreshing, setRowRefreshing] = useState<Set<number>>(new Set());
  const rowRefreshAbortRef = useRef<Map<number, AbortController>>(new Map());

  const saveFeeAmount = useCallback(async () => {
    if (!feeAmountEdit || feeAmountSaving) return;
    const amount = parseFloat(feeAmountEdit.draft);
    if (isNaN(amount) || amount < 0) {
      setFeeAmountError("Enter a valid amount (0 or more).");
      return;
    }
    const row = rows.find((r) => r.id === feeAmountEdit.rowId);
    if (!row) return;
    const patchField = `${row.activeFeeType}FeeDue`;
    const typeLabel = row.activeFeeType === "t16" ? "T16" : row.activeFeeType === "t2" ? "T2" : "AUX";
    const label = `${typeLabel} Fee Due`;

    feeAmountAbortRef.current?.abort();
    const controller = new AbortController();
    feeAmountAbortRef.current = controller;
    setFeeAmountSaving(true);
    setFeeAmountError(null);
    try {
      const res = await fetch(`/api/cases/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feeFields: { [patchField]: amount },
          logMessage: `${label} updated to ${fmt(amount)}`,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `Save failed (${res.status})`);
      }
      setFeeAmountOverrides((prev) => ({
        ...prev,
        [row.id]: { ...prev[row.id], feeAmount: amount },
      }));
      setFeeAmountEdit(null);
      fetchAllTotals();
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setFeeAmountError((err as Error).message);
    } finally {
      if (!controller.signal.aborted) setFeeAmountSaving(false);
    }
  }, [feeAmountEdit, feeAmountSaving, fetchAllTotals, rows]);

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
    touchedFilter !== DEFAULTS.touched ||
    missingFilter !== DEFAULTS.missing ||
    agingFilter !== DEFAULTS.aging ||
    assignedToFilter !== DEFAULTS.assignedTo;

  const clearAllFilters = () => {
    urlMethodRef.current = "push";
    setSearch(DEFAULTS.search);
    setAppliedSearch(DEFAULTS.search);
    setTouchedFilter(DEFAULTS.touched);
    setMissingFilter(DEFAULTS.missing);
    setAgingFilter(DEFAULTS.aging);
    setAssignedToFilter(DEFAULTS.assignedTo);
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
    try {
      const result = await bulkMarkComplete({ caseIds: ids });
      if (!result.ok) throw new Error(result.error);
      const today = new Date().toISOString().slice(0, 10);
      setRows((prev) =>
        prev.map((r) =>
          ids.includes(r.id)
            ? {
                ...r,
                timeDelineation: true, feePetitionDoc: true,
                ltrToClmt: true, ltrToClmtWithSignature: true, ltrToAlj: true,
                faxConfFeePet: true, updatedAt: today,
              }
            : r,
        ),
      );
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
      fetchPetitions();
      fetchCompletedCount();
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
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [key]: next } : r)));
    try {
      await patchPetition(id, { [key]: next });
      const today = new Date().toISOString().slice(0, 10);
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, updatedAt: today } : r)));
      const label = CHECKBOX_COLUMNS.find((c) => c.key === key)?.label ?? key;
      setLiveMessage(`${label} ${next ? "checked" : "unchecked"}`);
    } catch (err) {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [key]: !next } : r)));
      setLiveMessage("Save failed");
      setError((err as Error).message);
    }
  };

  // This is what moves a petition to Completed Petitions now — independent
  // of the filing checklist (toggleCheckbox above no longer does this).
  // Checking it also syncs Remarks to "FEE PETITION APPROVED" on Master
  // Fees server-side (see upsertFeePetition); unchecking only updates this
  // column, not Remarks.
  const toggleFeePetitionApproved = async (id: number) => {
    const prevRow = rows.find((r) => r.id === id);
    if (!prevRow) return;
    const next = !prevRow.feePetitionApproved;
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, feePetitionApproved: next } : r)));
    try {
      await patchPetition(id, { feePetitionApproved: next });
      const today = new Date().toISOString().slice(0, 10);
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, updatedAt: today } : r)));
      setLiveMessage(`Fee Petition Approved ${next ? "checked" : "unchecked"}`);
      if (next) {
        setRows((prev) => prev.filter((r) => r.id !== id));
        setTotal((tot) => Math.max(0, tot - 1));
        fetchCompletedCount();
      }
    } catch (err) {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, feePetitionApproved: !next } : r)));
      setLiveMessage("Save failed");
      setError((err as Error).message);
    }
  };

  const updateAssignedTo = async (id: number, value: string) => {
    const prevRow = rows.find((r) => r.id === id);
    if (!prevRow) return;
    const next = value || null;
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, assignedTo: next } : r)));
    try {
      await patchPetition(id, { assignedTo: next });
      setLiveMessage("Assigned To updated");
    } catch (err) {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, assignedTo: prevRow.assignedTo } : r)));
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
        params.set("status", "incomplete");
        if (appliedSearch) params.set("search", appliedSearch);
        if (touchedFilter) params.set("touched", touchedFilter);
        if (missingFilter) params.set("missing", missingFilter);
        if (agingFilter) params.set("aging", agingFilter);
        if (assignedToFilter) params.set("assignedTo", assignedToFilter);
        params.set("sort", sortKey);
        params.set("dir", sortDir);
        const res = await fetch(`/api/fee-petitions?${params.toString()}`);
        if (!res.ok) throw new Error(`Export failed (${res.status})`);
        const json = await res.json();
        all = json.data || [];
      }
      const headers = [
        "Case", "Approval Date", "Last Updated", "Progress",
        "Time Delineation", "Fee Petition Doc", "Ltr to Clmt",
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
  const thBase = `py-2 px-3 text-[12px] font-semibold uppercase tracking-wider whitespace-nowrap`;
  const tdBase = `py-2 px-3 text-[14px] whitespace-nowrap`;
  const rowBorder = dark ? "border-neutral-800/50" : "border-neutral-100";
  const rowHover = dark ? "hover:bg-neutral-800/40" : "hover:bg-neutral-50/80";
  const stickyHeaderBg = dark ? "bg-neutral-900" : "bg-white";
  const chipBase = `inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[13px] font-medium ${dark ? "bg-neutral-700 text-neutral-200" : "bg-neutral-100 text-neutral-700"}`;
  const presetActive = dark
    ? "bg-indigo-700 border-indigo-600 text-white"
    : "bg-indigo-100 border-indigo-400 text-indigo-800";
  const presetBase = `shrink-0 px-2.5 py-1 rounded-full text-[13px] font-medium border transition-colors`;
  const colSpan = CHECKBOX_COLUMNS.length + 10;

  return (
    <div className="space-y-4">
      {csvImportOpen && (
        <CsvImportModal
          dark={dark}
          title="Import Fee Petitions"
          description="Upload a CSV to bulk-upsert checklist data for fee petition cases."
          columns={FP_CSV_COLUMNS}
          templateFilename="fee-petitions-template.csv"
          templateCsv={FP_TEMPLATE_CSV}
          validateRow={validateFpRow}
          onImport={bulkImportFeePetitions}
          onClose={() => setCsvImportOpen(false)}
          onSuccess={fetchPetitions}
        />
      )}
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
            <p className={`text-[13px] ${t.textMuted} mt-0.5`}>Track and manage fee petition filings</p>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: "Pending", value: isInitialLoad ? "—" : String(total), sub: "not yet approved" },
          { label: "Completed", value: completedCount == null ? "—" : String(completedCount), sub: "fee petitions filed & approved" },
          { label: "Fees Requested", value: allTotals == null ? "—" : fmt(allTotals.feeRequested), sub: "pending + completed petitions" },
        ].map((s) => (
          <div key={s.label} className={`${sectionCard} p-4`}>
            <p className={`text-[12px] font-semibold uppercase tracking-wider ${t.textMuted}`}>{s.label}</p>
            <p className={`text-xl font-bold mt-1 ${t.text}`}>{s.value}</p>
            <p className={`text-[12px] ${t.textMuted} mt-0.5`}>{s.sub}</p>
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
                    <>
                      <Loader2 aria-hidden="true" className={`h-3 w-3 animate-spin ${t.textMuted}`} />
                      <span className="sr-only">Refreshing</span>
                    </>
                  )}
                </h3>
                <p className={`text-[13px] ${t.textMuted} mt-0.5`}>
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
              value={assignedToFilter}
              onChange={(e) => { urlMethodRef.current = "push"; setAssignedToFilter(e.target.value); setPage(1); }}
              aria-label="Filter by assigned to"
              className={`h-8 px-2 rounded-md border text-xs outline-none cursor-pointer ${t.inputBg}`}
            >
              <option value="">All Assigned</option>
              <option value="__unassigned__">Unassigned ({unassignedCount})</option>
              {assignees.map((a) => (
                <option key={a.name} value={a.name}>{a.name} ({a.count})</option>
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
              onClick={fetchPetitions}
              disabled={loading}
              aria-label="Refresh petitions"
              className={`h-8 px-2.5 rounded-md border text-xs font-medium flex items-center gap-1 ${t.outlineBtn} disabled:opacity-40`}
            >
              <RefreshCw
                aria-hidden="true"
                className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              />
            </button>
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
            <button
              onClick={() => setCsvImportOpen(true)}
              className={`h-8 px-2.5 rounded-md border text-xs font-medium flex items-center gap-1.5 ${t.outlineBtn}`}
              aria-label="Import from CSV"
            >
              <Upload aria-hidden="true" className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Import</span>
            </button>
          </div>
        </div>

        {/* Quick filter presets */}
        <div className={`px-4 py-2 flex items-center gap-2 flex-wrap border-b ${t.borderLight}`}>
          <span className={`text-[12px] font-semibold uppercase tracking-wider ${t.textMuted} shrink-0`}>Quick:</span>
          <button
            onClick={() => { urlMethodRef.current = "push"; setTouchedFilter((v) => (v === "none" ? "" : "none")); setPage(1); }}
            className={`${presetBase} ${touchedFilter === "none" ? presetActive : t.outlineBtn}`}
          >
            Never Touched
          </button>
          <button
            onClick={() => { urlMethodRef.current = "push"; setAgingFilter((v) => (v === "unpaid_60" ? "" : "unpaid_60")); setPage(1); }}
            aria-pressed={agingFilter === "unpaid_60"}
            className={`${presetBase} ${agingFilter === "unpaid_60" ? presetActive : t.outlineBtn}`}
          >
            Unpaid &gt;60d
          </button>
          <button
            onClick={() => { urlMethodRef.current = "push"; setAgingFilter((v) => (v === "unpaid_90" ? "" : "unpaid_90")); setPage(1); }}
            aria-pressed={agingFilter === "unpaid_90"}
            className={`${presetBase} ${agingFilter === "unpaid_90" ? presetActive : t.outlineBtn}`}
          >
            Unpaid &gt;90d
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
            {agingFilter && (
              <span className={chipBase}>
                {agingFilter === "unpaid_60" ? "Unpaid >60d" : "Unpaid >90d"}
                <button aria-label="Clear aging filter" onClick={() => { urlMethodRef.current = "push"; setAgingFilter(""); setPage(1); }} className="ml-0.5 hover:opacity-70">
                  <X aria-hidden="true" className="h-3 w-3" />
                </button>
              </span>
            )}
            {assignedToFilter && (
              <span className={chipBase}>
                Assigned: {assignedToFilter === "__unassigned__" ? "Unassigned" : assignedToFilter}
                <button aria-label="Clear assigned to filter" onClick={() => { urlMethodRef.current = "push"; setAssignedToFilter(""); setPage(1); }} className="ml-0.5 hover:opacity-70">
                  <X aria-hidden="true" className="h-3 w-3" />
                </button>
              </span>
            )}
            <button onClick={clearAllFilters} className={`text-[13px] font-medium underline ${t.textMuted} hover:opacity-70`}>
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
                <th className={`${thBase} w-10 text-center sticky left-0 top-0 z-30 ${stickyHeaderBg}`}>
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    onChange={toggleSelectAll}
                    aria-label="Select all rows"
                    className="h-3.5 w-3.5 cursor-pointer accent-indigo-500"
                  />
                </th>
                {/* Refresh — frozen, right after the checkbox, before
                    Claimant, so it's usable without scrolling right. */}
                <th className={`${thBase} w-14 text-center sticky left-10 top-0 z-30 ${stickyHeaderBg}`} title="Refresh">
                  <RefreshCw className="h-3.5 w-3.5 inline" aria-hidden="true" />
                  <span className="sr-only">Refresh</span>
                </th>
                <th
                  aria-sort={ariaSortFor("claimant")}
                  className={`${thBase} w-40 ${t.textSub} text-left sticky left-24 top-0 z-30 ${stickyHeaderBg}`}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort("claimant")}
                    className="inline-flex items-center gap-1 cursor-pointer rounded-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-neutral-300 dark:focus:ring-neutral-600"
                  >
                    Claimant {sortIcon("claimant")}
                  </button>
                </th>
                <th className={`${thBase} w-24 ${t.textSub} text-right sticky left-[256px] top-0 z-30 ${stickyHeaderBg}`}>
                  Fee Requested
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
                <th className={`${thBase} ${t.textSub} text-left sticky top-0 z-20 ${stickyHeaderBg}`}>
                  Assigned To
                </th>
                {CHECKBOX_COLUMNS.map((col) => (
                  <th key={col.key} className={`${thBase} ${t.textSub} text-center sticky top-0 z-20 ${stickyHeaderBg}`}>
                    {col.label}
                  </th>
                ))}
                <th className={`${thBase} ${t.textSub} text-center border-l ${t.borderLight} sticky top-0 z-20 ${stickyHeaderBg}`}>
                  Fee Petition Approved
                </th>
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
                rows.map((rawRow) => {
                  const row = { ...rawRow, ...feeAmountOverrides[rawRow.id], ...rowOverrides[rawRow.id] };
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
                      <td className={`${tdBase} text-center sticky left-10 z-10 ${stickyBg} ${stickyHover}`}>
                        <button
                          type="button"
                          onClick={() => handleRowRefresh(row.id)}
                          disabled={rowRefreshing.has(row.id)}
                          aria-label={`Refresh ${row.claimant}`}
                          title="Refresh this petition's data from the server"
                          className={`inline-flex items-center justify-center h-6 w-6 rounded ${t.hover} ${t.textSub} disabled:opacity-50`}
                        >
                          <RefreshCw
                            className={`h-3.5 w-3.5 ${rowRefreshing.has(row.id) ? "animate-spin" : ""}`}
                            aria-hidden="true"
                          />
                        </button>
                      </td>
                      <td
                        className={`${tdBase} ${t.text} font-semibold w-40 sticky left-24 z-10 ${stickyBg} ${stickyHover}`}
                        title={row.claimant}
                      >
                        <a
                          href={row.externalId || buildMyCaseUrl(row.id)}
                          target="_blank"
                          rel="noreferrer"
                          className={`inline-flex items-center gap-1 max-w-full truncate hover:underline ${dark ? "text-indigo-400" : "text-indigo-600"}`}
                        >
                          <span className="truncate">{row.claimant}</span>
                          <ExternalLink className="h-3 w-3 shrink-0 opacity-50" aria-hidden="true" />
                        </a>
                        {row.updatedAt && (
                          <p className={`text-[12px] ${t.textMuted} mt-0.5 font-normal`}>
                            Updated {formatRelativeDate(row.updatedAt)}
                          </p>
                        )}
                      </td>
                      <td
                        className={`${tdBase} w-24 ${t.text} text-right font-medium tabular-nums sticky left-[256px] z-10 ${stickyBg} ${stickyHover}`}
                      >
                        <FeeAmountCell
                          active={canEditFees && feeAmountEdit?.rowId === row.id}
                          value={row.feeAmount ?? 0}
                          draft={feeAmountEdit?.draft ?? ""}
                          saving={feeAmountSaving}
                          error={feeAmountError}
                          canEdit={canEditFees}
                          saveLabel="Fee Requested"
                          inputBg={t.inputBg}
                          hoverCls={t.hover}
                          textMuted={t.textMuted}
                          pencilRevealClass="opacity-0 group-hover/row:opacity-100"
                          onEdit={() => { setFeeAmountEdit({ rowId: row.id, draft: String(row.feeAmount ?? 0) }); setFeeAmountError(null); }}
                          onDraftChange={(v) => setFeeAmountEdit((p) => p ? { ...p, draft: v } : p)}
                          onSave={saveFeeAmount}
                          onCancel={() => { setFeeAmountEdit(null); setFeeAmountError(null); }}
                        />
                      </td>
                      <td className={`${tdBase} ${t.textMuted}`}>
                        <div className="flex items-center gap-1.5">
                          <span>{fmtDate(row.approvalDate)}</span>
                          {daysSince(row.approvalDate) != null && (
                            <span className={`text-[12px] font-semibold px-1 rounded ${dark ? "bg-neutral-700 text-neutral-300" : "bg-neutral-100 text-neutral-500"}`}>
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
                          <span className={`text-[13px] font-semibold ${isComplete ? (dark ? "text-emerald-400" : "text-emerald-600") : t.textMuted}`}>
                            {completedCount}/{CHECKBOX_COLUMNS.length}
                          </span>
                        </div>
                      </td>
                      <td className={`${tdBase}`} onClick={(e) => e.stopPropagation()}>
                        <Listbox
                          value={row.assignedTo ?? ""}
                          onChange={(v) => updateAssignedTo(row.id, v)}
                          dark={dark}
                          t={t}
                          aria-label="Assigned To"
                          className="w-full"
                          title={
                            (dropdownOptions.fee_petition_assigned_to ?? []).length === 0
                              ? "No options configured — add them in Settings"
                              : undefined
                          }
                          options={buildListboxOptions(
                            dropdownOptions.fee_petition_assigned_to ?? [],
                            row.assignedTo ?? "",
                          )}
                        />
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
                      <td className={`${tdBase} text-center border-l ${t.borderLight}`}>
                        <input
                          type="checkbox"
                          checked={row.feePetitionApproved}
                          onChange={() => toggleFeePetitionApproved(row.id)}
                          disabled={!canEditFees}
                          aria-label={`Fee Petition Approved for ${row.claimant}`}
                          title={
                            canEditFees
                              ? 'Also sets Remarks to "FEE PETITION APPROVED" on Master Fees'
                              : "You don't have permission to approve fee petitions"
                          }
                          className="h-3.5 w-3.5 cursor-pointer accent-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                        />
                      </td>
                      <td className={`${tdBase}`}>
                        <NoteField
                          value={row.updateNote}
                          onChange={(v) => setUpdateNoteLocal(row.id, v)}
                          onSave={() => persistUpdateNote(row)}
                          dark={dark}
                          t={t}
                          status={noteState[row.id]}
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
          <p className={`text-[13px] ${t.textMuted}`}>Page {page} of {totalPages}</p>
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
              <span className={`text-[13px] ${t.textMuted}`}>/ {totalPages}</span>
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

      <CompletedPetitions dark={dark} />
    </div>
  );
};
