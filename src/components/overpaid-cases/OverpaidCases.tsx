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
  Upload,
  Plus,
  X,
  Undo2,
} from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import { fmt, fmtFull } from "@/lib/formatters";
import { upsertOverpaidCase, updateFeesConfirmation, bulkMarkCleared, bulkRestoreCleared, bulkImportOverpaidCases } from "@/app/(dashboard)/overpaid-cases/actions";
import CsvImportModal, { type ColumnDef } from "@/components/modals/CsvImportModal";
import AddCaseModal from "@/components/modals/AddCaseModal";
import { parseBool, parseDate, parseDecimalString } from "@/lib/import/csv-parser";
import { fetchDropdownOptions, type DropdownOptionsByCategory } from "@/lib/dropdown-options";
import { NoteField } from "@/components/shared/NoteField";
import { ClearedCases } from "@/components/overpaid-cases/ClearedCases";
import { useCapabilities } from "@/hooks/useCapabilities";

// ---------- types ----------
interface OverpaidCaseRow {
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
  updatedAt: string | null;
}

type CheckboxKey = "checksCleared";
type SortKey = "claimant" | "feesReceived" | "overpaidAmount" | "opLtrDate" | "assignedTo";
type SortDir = "asc" | "desc";
type LtrFilter = "" | "none";

// ---------- helpers ----------
const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];
const SORT_KEYS: SortKey[] = ["claimant", "feesReceived", "overpaidAmount", "opLtrDate", "assignedTo"];
const DEFAULTS = {
  search: "",
  agent: "",
  ltr: "" as LtrFilter,
  minAmount: "",
  maxAmount: "",
  sort: "overpaidAmount" as SortKey,
  dir: "desc" as SortDir,
  page: 1,
  pageSize: 50,
};

const formatRelativeDate = (iso: string): string => {
  const date = new Date(iso);
  const diffDays = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const patchCase = async (
  caseId: number,
  body: Partial<Omit<OverpaidCaseRow, "id" | "claimant" | "feesReceived" | "feesConfirmation" | "updatedAt">>,
) => {
  const result = await upsertOverpaidCase({ caseId, fields: body as Parameters<typeof upsertOverpaidCase>[0]["fields"] });
  if (!result.ok) throw new Error(result.error);
};

// ---------- csv import config ----------
const OC_CSV_COLUMNS: ColumnDef[] = [
  { key: "client_id", label: "Client ID / Name", required: true, hint: "Integer client ID or \"First Last\" / \"Last, First\"" },
  { key: "op_ltr_date", label: "OP Ltr Date", hint: "YYYY-MM-DD or MM/DD/YYYY" },
  { key: "op_ltr_received", label: "OP Ltr Received", hint: "YYYY-MM-DD or MM/DD/YYYY" },
  { key: "overpaid_amount", label: "Overpaid Amount", hint: "Decimal, e.g. 1234.56" },
  { key: "checks_cleared", label: "Checks Cleared", hint: "true/false/yes/no/1/0" },
  { key: "region", label: "Region", hint: "Optional text" },
  { key: "update_note", label: "Update Note", hint: "Optional text, max 5000 chars" },
];

const OC_TEMPLATE_CSV =
  "client_id,op_ltr_date,op_ltr_received,overpaid_amount,checks_cleared,region,update_note\n" +
  "123456,2024-01-15,2024-01-20,1500.00,false,Region A,Example note\n";

const validateOcRow = (raw: Record<string, string>): string[] => {
  const errors: string[] = [];
  if (!raw["client_id"]?.trim()) errors.push("client_id is required");
  if (raw["op_ltr_date"]?.trim() && !parseDate(raw["op_ltr_date"])) errors.push("Invalid op_ltr_date");
  if (raw["op_ltr_received"]?.trim() && !parseDate(raw["op_ltr_received"])) errors.push("Invalid op_ltr_received");
  if (raw["overpaid_amount"]?.trim() && !parseDecimalString(raw["overpaid_amount"])) errors.push("Invalid overpaid_amount");
  if (raw["checks_cleared"]?.trim() && parseBool(raw["checks_cleared"]) === null) errors.push("Invalid checks_cleared value");
  if (raw["update_note"] && raw["update_note"].length > 5000) errors.push("update_note too long");
  return errors;
};

// ---------- component ----------
export const OverpaidCases = () => {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted ? resolvedTheme === "dark" : false;
  const t = themeClasses(dark);
  const { can } = useCapabilities();
  const canFinalize = can("case.finalize");
  const canEditFeesConf = can("feesConfirmation.edit");

  const router = useRouter();
  const pathname = usePathname();
  const urlParams = useSearchParams();
  const initialState = useRef({
    search: urlParams.get("q") ?? DEFAULTS.search,
    agent: urlParams.get("agent") ?? DEFAULTS.agent,
    ltr: (urlParams.get("ltr") === "none" ? "none" : "") as LtrFilter,
    minAmount: urlParams.get("minAmount") ?? DEFAULTS.minAmount,
    maxAmount: urlParams.get("maxAmount") ?? DEFAULTS.maxAmount,
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
  const [stats, setStats] = useState({ totalOverpaid: 0, ltrCount: 0 });
  const [pageTotals, setPageTotals] = useState({ pageFeesReceived: 0, pageOverpaid: 0 });
  const [agents, setAgents] = useState<{ name: string; count: number }[]>([]);

  const [search, setSearch] = useState(initialState.search);
  const [appliedSearch, setAppliedSearch] = useState(initialState.search);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const [page, setPage] = useState(initialState.page);
  const [pageSize, setPageSize] = useState(initialState.pageSize);
  const [total, setTotal] = useState(0);

  const [agentFilter, setAgentFilter] = useState(initialState.agent);
  const [ltrFilter, setLtrFilter] = useState<LtrFilter>(initialState.ltr);
  const [minAmount, setMinAmount] = useState(initialState.minAmount);
  const [maxAmount, setMaxAmount] = useState(initialState.maxAmount);
  const [appliedMinAmount, setAppliedMinAmount] = useState(initialState.minAmount);
  const [appliedMaxAmount, setAppliedMaxAmount] = useState(initialState.maxAmount);
  const amountDebounceRef = useRef<NodeJS.Timeout | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>(initialState.sort);
  const [sortDir, setSortDir] = useState<SortDir>(initialState.dir);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkClearing, setBulkClearing] = useState(false);
  const [bulkConfirming, setBulkConfirming] = useState(false);
  const [undoInfo, setUndoInfo] = useState<{ caseIds: number[]; expiresAt: number } | null>(null);
  const [undoing, setUndoing] = useState(false);
  // Bumped whenever a case is marked/un-marked cleared from this table, so
  // the independently-fetching ClearedCases section below knows to refresh
  // its badge (and its list, if already expanded).
  const [clearedRefreshToken, setClearedRefreshToken] = useState(0);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const urlMethodRef = useRef<"push" | "replace">("replace");

  // Mirror state into URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (appliedSearch) params.set("q", appliedSearch);
    if (agentFilter !== DEFAULTS.agent) params.set("agent", agentFilter);
    if (ltrFilter) params.set("ltr", ltrFilter);
    if (appliedMinAmount) params.set("minAmount", appliedMinAmount);
    if (appliedMaxAmount) params.set("maxAmount", appliedMaxAmount);
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
  }, [appliedSearch, agentFilter, ltrFilter, appliedMinAmount, appliedMaxAmount, sortKey, sortDir, page, pageSize, pathname, router, urlParams]);

  // Sync URL → state (back/forward)
  useEffect(() => {
    const urlSearch = urlParams.get("q") ?? DEFAULTS.search;
    const urlSortRaw = urlParams.get("sort") as SortKey | null;
    const urlSort = SORT_KEYS.includes(urlSortRaw as SortKey)
      ? (urlSortRaw as SortKey)
      : DEFAULTS.sort;
    const urlDir: SortDir = urlParams.get("dir") === "asc" ? "asc" : "desc";
    const urlPage = Math.max(1, parseInt(urlParams.get("page") || "1") || 1);
    const sizeNum = parseInt(urlParams.get("size") || "0");
    const urlSize = PAGE_SIZE_OPTIONS.includes(sizeNum) ? sizeNum : DEFAULTS.pageSize;
    const urlAgent = urlParams.get("agent") ?? DEFAULTS.agent;
    const urlLtr = (urlParams.get("ltr") === "none" ? "none" : "") as LtrFilter;
    const urlMin = urlParams.get("minAmount") ?? DEFAULTS.minAmount;
    const urlMax = urlParams.get("maxAmount") ?? DEFAULTS.maxAmount;

    if (urlSearch !== appliedSearch) { setSearch(urlSearch); setAppliedSearch(urlSearch); }
    if (urlAgent !== agentFilter) setAgentFilter(urlAgent);
    if (urlLtr !== ltrFilter) setLtrFilter(urlLtr);
    if (urlMin !== appliedMinAmount) { setMinAmount(urlMin); setAppliedMinAmount(urlMin); }
    if (urlMax !== appliedMaxAmount) { setMaxAmount(urlMax); setAppliedMaxAmount(urlMax); }
    if (urlSort !== sortKey) setSortKey(urlSort);
    if (urlDir !== sortDir) setSortDir(urlDir);
    if (urlPage !== page) setPage(urlPage);
    if (urlSize !== pageSize) setPageSize(urlSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlParams]);

  const noteSnapshot = useRef<Map<number, string>>(new Map());
  const ltrSnapshot = useRef<Map<number, string | null>>(new Map());
  const opLtrDateSnapshot = useRef<Map<number, string | null>>(new Map());
  const confirmationSnapshot = useRef<Map<number, string>>(new Map());
  const regionSnapshot = useRef<Map<number, string>>(new Map());
  const overpaidAmountSnapshot = useRef<Map<number, number | null>>(new Map());
  const [noteState, setNoteState] = useState<Record<number, "saving" | "saved" | undefined>>({});
  const [ltrState, setLtrState] = useState<Record<number, "saving" | "saved" | undefined>>({});
  const [opLtrDateState, setOpLtrDateState] = useState<Record<number, "saving" | "saved" | undefined>>({});
  const [confirmationState, setConfirmationState] = useState<Record<number, "saving" | "saved" | undefined>>({});
  const [regionState, setRegionState] = useState<Record<number, "saving" | "saved" | undefined>>({});
  const [overpaidAmountState, setOverpaidAmountState] = useState<Record<number, "saving" | "saved" | undefined>>({});
  const [liveMessage, setLiveMessage] = useState("");
  // Keyed by `${rowId}:${field}` so the three inline fields on one row don't
  // share a timer slot — otherwise one field's reset can cancel another's,
  // leaving a "saved ✓" stuck on screen.
  const savedTimerRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

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

  useEffect(() => {
    if (amountDebounceRef.current) clearTimeout(amountDebounceRef.current);
    amountDebounceRef.current = setTimeout(() => {
      setAppliedMinAmount(minAmount.trim());
      setAppliedMaxAmount(maxAmount.trim());
      setPage(1);
    }, 500);
    return () => { if (amountDebounceRef.current) clearTimeout(amountDebounceRef.current); };
  }, [minAmount, maxAmount]);

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
      params.set("status", "pending");
      if (agentFilter) params.set("agent", agentFilter);
      if (ltrFilter) params.set("ltr", ltrFilter);
      if (appliedMinAmount) params.set("minAmount", appliedMinAmount);
      if (appliedMaxAmount) params.set("maxAmount", appliedMaxAmount);
      params.set("sort", sortKey);
      params.set("dir", sortDir);
      const res = await fetch(`/api/overpaid-cases?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Failed to load overpaid cases (${res.status})`);
      const json = await res.json();
      const data: OverpaidCaseRow[] = json.data || [];
      setRows(data);
      setSelectedIds(new Set());
      setBulkConfirming(false);
      setTotal(typeof json.total === "number" ? json.total : data.length);
      setStats({
        totalOverpaid: typeof json.totalOverpaid === "number" ? json.totalOverpaid : 0,
        ltrCount: typeof json.ltrCount === "number" ? json.ltrCount : 0,
      });
      setPageTotals({
        pageFeesReceived: typeof json.pageFeesReceived === "number" ? json.pageFeesReceived : 0,
        pageOverpaid: typeof json.pageOverpaid === "number" ? json.pageOverpaid : 0,
      });
      if (Array.isArray(json.agents)) setAgents(json.agents);
      noteSnapshot.current = new Map(data.map((r) => [r.id, r.updateNote]));
      ltrSnapshot.current = new Map(data.map((r) => [r.id, r.opLtrReceived]));
      opLtrDateSnapshot.current = new Map(data.map((r) => [r.id, r.opLtrDate]));
      confirmationSnapshot.current = new Map(data.map((r) => [r.id, r.feesConfirmation ?? ""]));
      regionSnapshot.current = new Map(data.map((r) => [r.id, r.region ?? ""]));
      overpaidAmountSnapshot.current = new Map(data.map((r) => [r.id, r.overpaidAmount]));
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError((err as Error).message);
    } finally {
      if (fetchAbortRef.current === controller) setLoading(false);
    }
  }, [page, pageSize, appliedSearch, agentFilter, ltrFilter, appliedMinAmount, appliedMaxAmount, sortKey, sortDir]);

  useEffect(() => {
    fetchCases();
    return () => { fetchAbortRef.current?.abort(); };
  }, [fetchCases]);

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
    agentFilter !== DEFAULTS.agent ||
    ltrFilter !== DEFAULTS.ltr ||
    appliedMinAmount !== DEFAULTS.minAmount ||
    appliedMaxAmount !== DEFAULTS.maxAmount;

  const clearAllFilters = () => {
    urlMethodRef.current = "push";
    setSearch(DEFAULTS.search);
    setAppliedSearch(DEFAULTS.search);
    setAgentFilter(DEFAULTS.agent);
    setLtrFilter(DEFAULTS.ltr);
    setMinAmount(DEFAULTS.minAmount);
    setMaxAmount(DEFAULTS.maxAmount);
    setAppliedMinAmount(DEFAULTS.minAmount);
    setAppliedMaxAmount(DEFAULTS.maxAmount);
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

  const handleBulkMarkCleared = async () => {
    if (selectedIds.size === 0 || bulkClearing) return;
    setBulkClearing(true);
    const ids = Array.from(selectedIds);
    try {
      const result = await bulkMarkCleared({ caseIds: ids });
      if (!result.ok) throw new Error(result.error);
      setRows((prev) => prev.filter((r) => !ids.includes(r.id)));
      setTotal((tot) => Math.max(0, tot - ids.length));
      setSelectedIds(new Set());
      setBulkConfirming(false);
      setClearedRefreshToken((v) => v + 1);
      setUndoInfo({ caseIds: ids, expiresAt: Date.now() + 8000 });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBulkClearing(false);
    }
  };

  const handleUndoBulk = async () => {
    if (!undoInfo || undoing) return;
    setUndoing(true);
    const restoreIds = undoInfo.caseIds;
    try {
      const result = await bulkRestoreCleared({ caseIds: restoreIds });
      if (!result.ok) throw new Error(result.error);
      setUndoInfo(null);
      fetchCases();
      setClearedRefreshToken((v) => v + 1);
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
    const clearedAtPatch = key === "checksCleared"
      ? { checksClearedAt: next ? new Date().toISOString() : null }
      : {};
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [key]: next, ...clearedAtPatch, updatedAt: new Date().toISOString() } : r)));
    try {
      await patchCase(id, { [key]: next });
      if (key === "checksCleared") {
        setClearedRefreshToken((v) => v + 1);
        if (next) {
          setRows((prev) => prev.filter((r) => r.id !== id));
          setTotal((tot) => Math.max(0, tot - 1));
        }
      }
    } catch (err) {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [key]: !next, ...( key === "checksCleared" ? { checksClearedAt: prevRow.checksClearedAt } : {}) } : r)));
      setError((err as Error).message);
    }
  };

  const setUpdateNoteLocal = (id: number, value: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, updateNote: value } : r)));
  };

  const setLtrDateLocal = (id: number, value: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, opLtrReceived: value || null } : r)));
  };

  const setOpLtrDateLocal = (id: number, value: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, opLtrDate: value || null } : r)));
  };

  const setConfirmationLocal = (id: number, value: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, feesConfirmation: value } : r)));
  };

  const setRegionLocal = (id: number, value: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, region: value || null } : r)));
  };

  const setOverpaidAmountLocal = (id: number, value: string) => {
    const parsed = value === "" ? null : Number(value);
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, overpaidAmount: parsed != null && !isNaN(parsed) ? parsed : null } : r)));
  };

  const persistConfirmation = async (row: OverpaidCaseRow) => {
    const current = row.feesConfirmation ?? "";
    if (confirmationSnapshot.current.get(row.id) === current) return;
    const timerKey = `${row.id}:confirmation`;
    const existingTimer = savedTimerRef.current.get(timerKey);
    if (existingTimer) clearTimeout(existingTimer);
    setConfirmationState((s) => ({ ...s, [row.id]: "saving" }));
    try {
      const result = await updateFeesConfirmation({ caseId: row.id, feesConfirmation: current });
      if (!result.ok) throw new Error(result.error);
      confirmationSnapshot.current.set(row.id, current);
      setConfirmationState((s) => ({ ...s, [row.id]: "saved" }));
      setLiveMessage("Confirmation saved");
      const timer = setTimeout(() => {
        setConfirmationState((s) => ({ ...s, [row.id]: undefined }));
        savedTimerRef.current.delete(timerKey);
      }, 1500);
      savedTimerRef.current.set(timerKey, timer);
    } catch (err) {
      setConfirmationState((s) => ({ ...s, [row.id]: undefined }));
      setLiveMessage("Confirmation save failed");
      setError((err as Error).message);
    }
  };

  const persistUpdateNote = async (row: OverpaidCaseRow) => {
    if (noteSnapshot.current.get(row.id) === row.updateNote) return;
    const timerKey = `${row.id}:note`;
    const existingTimer = savedTimerRef.current.get(timerKey);
    if (existingTimer) clearTimeout(existingTimer);
    setNoteState((s) => ({ ...s, [row.id]: "saving" }));
    try {
      await patchCase(row.id, { updateNote: row.updateNote });
      noteSnapshot.current.set(row.id, row.updateNote);
      setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, updatedAt: new Date().toISOString() } : r));
      setNoteState((s) => ({ ...s, [row.id]: "saved" }));
      setLiveMessage("Note saved");
      const timer = setTimeout(() => {
        setNoteState((s) => ({ ...s, [row.id]: undefined }));
        savedTimerRef.current.delete(timerKey);
      }, 1500);
      savedTimerRef.current.set(timerKey, timer);
    } catch (err) {
      setNoteState((s) => ({ ...s, [row.id]: undefined }));
      setLiveMessage("Note save failed");
      setError((err as Error).message);
    }
  };

  const persistOverpaidAmount = async (row: OverpaidCaseRow) => {
    if (overpaidAmountSnapshot.current.get(row.id) === row.overpaidAmount) return;
    const timerKey = `${row.id}:overpaidAmount`;
    const existingTimer = savedTimerRef.current.get(timerKey);
    if (existingTimer) clearTimeout(existingTimer);
    setOverpaidAmountState((s) => ({ ...s, [row.id]: "saving" }));
    try {
      const result = await upsertOverpaidCase({ caseId: row.id, fields: { overpaidAmount: row.overpaidAmount != null ? String(row.overpaidAmount) : null } });
      if (!result.ok) throw new Error(result.error);
      overpaidAmountSnapshot.current.set(row.id, row.overpaidAmount);
      setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, updatedAt: new Date().toISOString() } : r));
      setOverpaidAmountState((s) => ({ ...s, [row.id]: "saved" }));
      setLiveMessage("Overpaid amount saved");
      const timer = setTimeout(() => {
        setOverpaidAmountState((s) => ({ ...s, [row.id]: undefined }));
        savedTimerRef.current.delete(timerKey);
      }, 1500);
      savedTimerRef.current.set(timerKey, timer);
    } catch (err) {
      setOverpaidAmountState((s) => ({ ...s, [row.id]: undefined }));
      setLiveMessage("Overpaid amount save failed");
      setError((err as Error).message);
    }
  };

  const persistOpLtrDate = async (row: OverpaidCaseRow) => {
    const prev = opLtrDateSnapshot.current.get(row.id);
    if (prev === row.opLtrDate) return;
    const timerKey = `${row.id}:opLtrDate`;
    const existingTimer = savedTimerRef.current.get(timerKey);
    if (existingTimer) clearTimeout(existingTimer);
    setOpLtrDateState((s) => ({ ...s, [row.id]: "saving" }));
    try {
      await patchCase(row.id, { opLtrDate: row.opLtrDate });
      opLtrDateSnapshot.current.set(row.id, row.opLtrDate);
      setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, updatedAt: new Date().toISOString() } : r));
      setOpLtrDateState((s) => ({ ...s, [row.id]: "saved" }));
      setLiveMessage(row.opLtrDate ? "O/P LTR date saved" : "O/P LTR date cleared");
      const timer = setTimeout(() => {
        setOpLtrDateState((s) => ({ ...s, [row.id]: undefined }));
        savedTimerRef.current.delete(timerKey);
      }, 1500);
      savedTimerRef.current.set(timerKey, timer);
    } catch (err) {
      setOpLtrDateState((s) => ({ ...s, [row.id]: undefined }));
      setLiveMessage("O/P LTR date save failed");
      setError((err as Error).message);
    }
  };

  const persistRegion = async (row: OverpaidCaseRow) => {
    const current = row.region ?? "";
    if (regionSnapshot.current.get(row.id) === current) return;
    const timerKey = `${row.id}:region`;
    const existingTimer = savedTimerRef.current.get(timerKey);
    if (existingTimer) clearTimeout(existingTimer);
    setRegionState((s) => ({ ...s, [row.id]: "saving" }));
    try {
      await patchCase(row.id, { region: current || null });
      regionSnapshot.current.set(row.id, current);
      setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, updatedAt: new Date().toISOString() } : r));
      setRegionState((s) => ({ ...s, [row.id]: "saved" }));
      setLiveMessage("Region saved");
      const timer = setTimeout(() => {
        setRegionState((s) => ({ ...s, [row.id]: undefined }));
        savedTimerRef.current.delete(timerKey);
      }, 1500);
      savedTimerRef.current.set(timerKey, timer);
    } catch (err) {
      setRegionState((s) => ({ ...s, [row.id]: undefined }));
      setLiveMessage("Region save failed");
      setError((err as Error).message);
    }
  };

  const persistLtrDate = async (row: OverpaidCaseRow) => {
    const prev = ltrSnapshot.current.get(row.id);
    if (prev === row.opLtrReceived) return;
    const timerKey = `${row.id}:ltr`;
    const existingTimer = savedTimerRef.current.get(timerKey);
    if (existingTimer) clearTimeout(existingTimer);
    setLtrState((s) => ({ ...s, [row.id]: "saving" }));
    try {
      await patchCase(row.id, { opLtrReceived: row.opLtrReceived });
      const wasSet = prev != null;
      const nowSet = row.opLtrReceived != null;
      if (!wasSet && nowSet) setStats((s) => ({ ...s, ltrCount: s.ltrCount + 1 }));
      if (wasSet && !nowSet) setStats((s) => ({ ...s, ltrCount: Math.max(0, s.ltrCount - 1) }));
      ltrSnapshot.current.set(row.id, row.opLtrReceived);
      setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, updatedAt: new Date().toISOString() } : r));
      setLtrState((s) => ({ ...s, [row.id]: "saved" }));
      setLiveMessage(row.opLtrReceived ? "LTR date saved" : "LTR date cleared");
      const timer = setTimeout(() => {
        setLtrState((s) => ({ ...s, [row.id]: undefined }));
        savedTimerRef.current.delete(timerKey);
      }, 1500);
      savedTimerRef.current.set(timerKey, timer);
    } catch (err) {
      setLtrState((s) => ({ ...s, [row.id]: undefined }));
      setLiveMessage("LTR date save failed");
      setError((err as Error).message);
    }
  };

  const [exporting, setExporting] = useState(false);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [addCaseOpen, setAddCaseOpen] = useState(false);
  const [dropdownOptions, setDropdownOptions] = useState<DropdownOptionsByCategory>({});

  // Lazy-loaded the first time the Add Case modal opens — this page doesn't
  // otherwise need the full dropdown-options set, so there's no reason to
  // fetch it on every page load.
  const openAddCase = async () => {
    if (Object.keys(dropdownOptions).length === 0) {
      try {
        setDropdownOptions(await fetchDropdownOptions());
      } catch {
        /* non-critical — modal falls back to empty dropdowns */
      }
    }
    setAddCaseOpen(true);
  };

  // A manually-added case has no fee_records row marked overpaid yet (it
  // isn't part of a Sheets/MyCase sync, just created bare via AddCaseModal),
  // so flip that flag right after creation — this is what actually makes it
  // show up in this page's own list.
  const markNewCaseOverpaid = async (clientId: number) => {
    const res = await fetch("/api/cases/bulk-overpaid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseIds: [clientId], markedOverpaid: true }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.error || `Failed to mark case overpaid (${res.status})`);
    }
    await fetchCases();
  };

  const downloadCsv = async () => {
    setExporting(true);
    const controller = new AbortController();
    try {
      let all: OverpaidCaseRow[];
      if (selectedIds.size > 0) {
        all = rows.filter((r) => selectedIds.has(r.id));
      } else {
        const params = new URLSearchParams({ page: "1", limit: "10000" });
        if (appliedSearch) params.set("search", appliedSearch);
        params.set("status", "pending");
        if (agentFilter) params.set("agent", agentFilter);
        if (ltrFilter) params.set("ltr", ltrFilter);
        if (appliedMinAmount) params.set("minAmount", appliedMinAmount);
        if (appliedMaxAmount) params.set("maxAmount", appliedMaxAmount);
        params.set("sort", sortKey);
        params.set("dir", sortDir);
        const res = await fetch(`/api/overpaid-cases?${params.toString()}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`Export failed (${res.status})`);
        const json = await res.json();
        all = json.data || [];
      }
      const headers = ["Case", "Assigned To", "Region", "Fees Received", "Overpaid Amount", "Fees Confirmation", "Notice Sent", "Notice Received", "Notes", "Checks Cleared", "Last Updated"];
      const escape = (v: string) => {
        const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
        return `"${safe.replace(/"/g, '""')}"`;
      };
      const csvRows = [
        headers.join(","),
        ...all.map((r) =>
          [
            escape(r.claimant),
            escape(r.assignedTo ?? ""),
            escape(r.region ?? ""),
            r.feesReceived.toFixed(2),
            r.overpaidAmount != null ? r.overpaidAmount.toFixed(2) : "",
            escape(r.feesConfirmation ?? ""),
            r.opLtrDate ?? "",
            r.opLtrReceived ?? "",
            escape(r.updateNote),
            r.checksCleared ? "Yes" : "No",
            r.updatedAt ? new Date(r.updatedAt).toLocaleDateString("en-US") : "",
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
      if ((err as Error).name === "AbortError") return;
      setError((err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  const { pageFeesReceived, pageOverpaid } = pageTotals;

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

  return (
    <div className="space-y-4">
      {csvImportOpen && (
        <CsvImportModal
          dark={dark}
          title="Import Overpaid Cases"
          description="Upload a CSV to bulk-upsert overpaid case tracking data."
          columns={OC_CSV_COLUMNS}
          templateFilename="overpaid-cases-template.csv"
          templateCsv={OC_TEMPLATE_CSV}
          validateRow={validateOcRow}
          onImport={bulkImportOverpaidCases}
          onClose={() => setCsvImportOpen(false)}
          onSuccess={() => { fetchCases(); setClearedRefreshToken((v) => v + 1); }}
        />
      )}
      {addCaseOpen && (
        <AddCaseModal
          dark={dark}
          dropdownOptions={dropdownOptions}
          onClose={() => setAddCaseOpen(false)}
          onCreated={markNewCaseOverpaid}
        />
      )}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {liveMessage}
      </div>
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
            <p className={`text-[13px] ${t.textMuted} mt-0.5`}>
              Cases where fees received exceed expected amount
            </p>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className={`${sectionCard} p-4`}>
          <p className={`text-[12px] font-semibold uppercase tracking-wider ${t.textMuted}`}>Pending Cases</p>
          <p className={`text-xl font-bold mt-1 ${t.text}`}>{isInitialLoad ? "—" : String(total)}</p>
          <p className={`text-[12px] ${t.textMuted} mt-0.5`}>awaiting cleared checks</p>
        </div>
        <div className={`${sectionCard} p-4`}>
          <p className={`text-[12px] font-semibold uppercase tracking-wider ${t.textMuted}`}>Total Overpaid</p>
          <p className={`text-xl font-bold mt-1 ${dark ? "text-amber-400" : "text-amber-600"}`}>{isInitialLoad ? "—" : fmtFull(stats.totalOverpaid)}</p>
          <p className={`text-[12px] ${t.textMuted} mt-0.5`}>across filtered cases</p>
        </div>
        <div className={`${sectionCard} p-4`}>
          <p className={`text-[12px] font-semibold uppercase tracking-wider ${t.textMuted}`}>LTR Received</p>
          <p className={`text-xl font-bold mt-1 ${t.text}`}>{isInitialLoad ? "—" : `${stats.ltrCount} / ${total}`}</p>
          {!isInitialLoad && total > 0 && (
            <div className={`mt-2 h-1.5 rounded-full ${dark ? "bg-neutral-700" : "bg-neutral-200"}`}>
              <div
                className="h-1.5 rounded-full bg-indigo-500 transition-[width] duration-300"
                style={{ width: `${Math.min(100, (stats.ltrCount / total) * 100)}%` }}
              />
            </div>
          )}
          <p className={`text-[12px] ${t.textMuted} mt-1`}>
            {!isInitialLoad && total > 0 ? `${Math.round((stats.ltrCount / total) * 100)}% on file` : "letters on file"}
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          role="alert"
          className={`rounded-xl border p-4 flex items-center gap-3 ${dark ? "bg-red-900/20 border-red-800 text-red-400" : "bg-red-50 border-red-200 text-red-700"}`}
        >
          <span className="text-sm">{error}</span>
          <button onClick={fetchCases} className="ml-auto text-xs font-medium underline">Retry</button>
        </div>
      )}

      {/* Undo banner */}
      {undoInfo && (
        <div
          role="status"
          className={`rounded-xl border p-3 flex items-center gap-3 ${dark ? "bg-emerald-900/20 border-emerald-800 text-emerald-300" : "bg-emerald-50 border-emerald-200 text-emerald-800"}`}
        >
          <Check aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span className="text-sm">Marked {undoInfo.caseIds.length} case{undoInfo.caseIds.length === 1 ? "" : "s"} as cleared.</span>
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
                      Mark {selectedIds.size} case{selectedIds.size !== 1 ? "s" : ""} as cleared?
                    </span>
                    <button
                      onClick={handleBulkMarkCleared}
                      disabled={bulkClearing}
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
                    </span>
                    <button
                      onClick={() => setBulkConfirming(true)}
                      aria-label="Mark selected cases as cleared"
                      className={`h-7 px-3 rounded-md text-xs font-medium flex items-center gap-1.5 ${dark ? "bg-emerald-700 hover:bg-emerald-600 text-white" : "bg-emerald-600 hover:bg-emerald-700 text-white"} disabled:opacity-40 disabled:cursor-not-allowed transition-colors`}
                    >
                      <Check aria-hidden="true" className="h-3 w-3" />
                      Mark Cleared
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
                  Cases
                  {isRefreshing && (
                    <Loader2 aria-label="Refreshing" className={`h-3 w-3 animate-spin ${t.textMuted}`} />
                  )}
                </h3>
                <p className={`text-[13px] ${t.textMuted} mt-0.5`}>
                  {total === 0 ? "0 cases" : `Showing ${rangeStart}–${rangeEnd} of ${total} cases`}
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
                aria-label="Search claimants"
                className={`h-8 pl-8 pr-3 w-full sm:w-48 rounded-md border text-xs outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-600 ${t.inputBg}`}
              />
            </div>
            <select
              value={agentFilter}
              onChange={(e) => { urlMethodRef.current = "push"; setAgentFilter(e.target.value); setPage(1); }}
              aria-label="Filter by assigned agent"
              className={`h-8 px-2 rounded-md border text-xs outline-none cursor-pointer ${t.inputBg}`}
            >
              <option value="">All Agents</option>
              {agents.map((a) => (
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
            {canFinalize && (
              <button
                onClick={() => setCsvImportOpen(true)}
                className={`h-8 px-2.5 rounded-md border text-xs font-medium flex items-center gap-1.5 ${t.outlineBtn}`}
                aria-label="Import from CSV"
              >
                <Upload aria-hidden="true" className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Import</span>
              </button>
            )}
            {canFinalize && (
              <button
                onClick={openAddCase}
                className={`h-8 px-2.5 rounded-md border text-xs font-medium flex items-center gap-1.5 ${t.outlineBtn}`}
                aria-label="Manually add an overpaid case"
                title="For cases handled here that never came through Master Fees"
              >
                <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Add Case</span>
              </button>
            )}
          </div>
        </div>

        {/* Quick filter presets + amount range */}
        <div className={`px-4 py-2 flex items-center gap-2 flex-wrap border-b ${t.borderLight}`}>
          <span className={`text-[12px] font-semibold uppercase tracking-wider ${t.textMuted} shrink-0`}>Quick:</span>
          <button
            onClick={() => {
              urlMethodRef.current = "push";
              const isActive = appliedMinAmount === "3000" && appliedMaxAmount === "";
              setMinAmount(isActive ? "" : "3000");
              setAppliedMinAmount(isActive ? "" : "3000");
              setMaxAmount("");
              setAppliedMaxAmount("");
              setPage(1);
            }}
            className={`${presetBase} ${appliedMinAmount === "3000" && appliedMaxAmount === "" ? presetActive : t.outlineBtn}`}
          >
            High Value (≥$3k)
          </button>
          <button
            onClick={() => {
              urlMethodRef.current = "push";
              setLtrFilter((v) => (v === "none" ? "" : "none"));
              setPage(1);
            }}
            className={`${presetBase} ${ltrFilter === "none" ? presetActive : t.outlineBtn}`}
          >
            No LTR Sent
          </button>
          <div className="ml-auto flex items-center gap-1.5 shrink-0">
            <span className={`text-[13px] ${t.textMuted}`}>$</span>
            <input
              type="number"
              min={0}
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)}
              placeholder="Min"
              aria-label="Minimum overpaid amount"
              className={`h-7 w-20 px-2 rounded-md border text-[13px] outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-600 ${t.inputBg}`}
            />
            <span className={`text-[13px] ${t.textMuted}`}>–</span>
            <input
              type="number"
              min={0}
              value={maxAmount}
              onChange={(e) => setMaxAmount(e.target.value)}
              placeholder="Max"
              aria-label="Maximum overpaid amount"
              className={`h-7 w-20 px-2 rounded-md border text-[13px] outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-600 ${t.inputBg}`}
            />
          </div>
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
            {agentFilter && (
              <span className={chipBase}>
                Agent: {agentFilter}
                <button aria-label="Clear agent filter" onClick={() => { urlMethodRef.current = "push"; setAgentFilter(""); setPage(1); }} className="ml-0.5 hover:opacity-70">
                  <X aria-hidden="true" className="h-3 w-3" />
                </button>
              </span>
            )}
            {ltrFilter === "none" && (
              <span className={chipBase}>
                No LTR Sent
                <button aria-label="Clear LTR filter" onClick={() => { urlMethodRef.current = "push"; setLtrFilter(""); setPage(1); }} className="ml-0.5 hover:opacity-70">
                  <X aria-hidden="true" className="h-3 w-3" />
                </button>
              </span>
            )}
            {appliedMinAmount && (
              <span className={chipBase}>
                Min: ${appliedMinAmount}
                <button aria-label="Clear minimum amount filter" onClick={() => { setMinAmount(""); setAppliedMinAmount(""); setPage(1); }} className="ml-0.5 hover:opacity-70">
                  <X aria-hidden="true" className="h-3 w-3" />
                </button>
              </span>
            )}
            {appliedMaxAmount && (
              <span className={chipBase}>
                Max: ${appliedMaxAmount}
                <button aria-label="Clear maximum amount filter" onClick={() => { setMaxAmount(""); setAppliedMaxAmount(""); setPage(1); }} className="ml-0.5 hover:opacity-70">
                  <X aria-hidden="true" className="h-3 w-3" />
                </button>
              </span>
            )}
            <button onClick={clearAllFilters} className={`text-[13px] font-medium underline ${t.textMuted} hover:opacity-70`}>
              Clear all
            </button>
          </div>
        )}

        {/* Legend */}
        <div className={`px-4 py-1.5 flex items-center gap-4 flex-wrap border-b ${t.borderLight}`}>
          <span className={`text-[12px] font-semibold uppercase tracking-wider ${t.textMuted}`}>Key</span>
          <span className="flex items-center gap-1.5">
            <span className={`inline-block w-4 h-4 rounded-sm border-l-2 border-l-amber-500 ${dark ? "bg-neutral-800" : "bg-neutral-100"}`} />
            <span className={`text-[13px] ${t.textMuted}`}>Overpaid amount ≥ $3,000</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${dark ? "bg-amber-400" : "bg-amber-500"}`} />
            <span className={`text-[13px] ${t.textMuted}`}>No workflow data entered</span>
          </span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
          <table className="w-full min-w-200">
            <thead>
              <tr className={`border-b ${t.borderLight}`}>
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
                    Case {sortIcon("claimant")}
                  </button>
                </th>
                <th
                  aria-sort={ariaSortFor("assignedTo")}
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
                  aria-sort={ariaSortFor("feesReceived")}
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
                  aria-sort={ariaSortFor("overpaidAmount")}
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
                <th className={`${thBase} ${t.textSub} text-left sticky top-0 z-20 ${stickyHeaderBg}`}>Notice Sent</th>
                <th
                  aria-sort={ariaSortFor("opLtrDate")}
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
                <th className={`${thBase} ${t.textSub} text-center sticky top-0 z-20 ${stickyHeaderBg}`}>Checks Cleared</th>
              </tr>
            </thead>
            <tbody>
              {isInitialLoad ? (
                <tr>
                  <td colSpan={11} className={`${tdBase} text-center py-8 ${t.textMuted}`}>
                    <span className="inline-flex items-center gap-2">
                      <RefreshCw aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                      Loading cases...
                    </span>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={11} className={`${tdBase} text-center py-12 ${t.textMuted}`}>
                    <div className="flex flex-col items-center gap-2">
                      <TrendingDown aria-hidden="true" className="h-8 w-8 opacity-30" />
                      <p className="text-sm font-medium">
                        {hasFilters ? "No cases match your filters." : "No overpaid cases found."}
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
                  const isHighValue = row.overpaidAmount != null && row.overpaidAmount >= 3000;
                  const isSelected = selectedIds.has(row.id);
                  const needsAttention = !row.feesConfirmation && !row.opLtrReceived && !row.updateNote;
                  const stickyBg = dark ? "bg-neutral-900" : "bg-white";
                  const stickyHover = dark ? "group-hover/row:bg-neutral-800" : "group-hover/row:bg-neutral-50";
                  return (
                    <tr
                      key={row.id}
                      className={`group/row border-b ${rowBorder} ${rowHover} transition-colors ${isHighValue ? "border-l-2 border-l-amber-500" : ""}`}
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
                      <td className={`${tdBase} font-semibold max-w-45 sticky left-10 z-10 ${stickyBg} ${stickyHover}`} title={row.claimant}>
                        <div className="flex items-center gap-1.5 max-w-45">
                          {needsAttention && (
                            <span
                              title="No workflow data entered"
                              aria-label="Needs attention"
                              className={`shrink-0 w-1.5 h-1.5 rounded-full ${dark ? "bg-amber-400" : "bg-amber-500"}`}
                            />
                          )}
                          <div className="min-w-0">
                            <Link href={`/cases/${row.id}`} className={`hover:underline truncate block ${dark ? "text-indigo-400" : "text-indigo-600"}`}>
                              {row.claimant}
                            </Link>
                            {row.updatedAt && (
                              <p className={`text-[12px] ${t.textMuted} mt-0.5 font-normal`}>
                                Updated {formatRelativeDate(row.updatedAt)}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className={`${tdBase} ${t.textMuted}`}>{row.assignedTo ?? "—"}</td>
                      <td className={`${tdBase}`}>
                        <div className="relative">
                          <input
                            type="text"
                            value={row.region ?? ""}
                            onChange={(e) => setRegionLocal(row.id, e.target.value)}
                            onBlur={() => persistRegion(row)}
                            placeholder="—"
                            maxLength={100}
                            className={`w-full h-7 pl-2 pr-7 rounded-md border text-[13px] outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-600 ${t.inputBg}`}
                          />
                          {regionState[row.id] === "saving" && (
                            <Loader2 aria-hidden="true" className={`absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin ${t.textMuted}`} />
                          )}
                          {regionState[row.id] === "saved" && (
                            <Check aria-hidden="true" className={`absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 ${dark ? "text-emerald-400" : "text-emerald-600"}`} />
                          )}
                        </div>
                      </td>
                      <td className={`${tdBase} ${t.textMuted} text-right`}>{fmt(row.feesReceived)}</td>
                      <td className={`${tdBase}`}>
                        <div className="relative">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={row.overpaidAmount ?? ""}
                            onChange={(e) => setOverpaidAmountLocal(row.id, e.target.value)}
                            onBlur={() => persistOverpaidAmount(row)}
                            placeholder="—"
                            aria-label="Overpaid amount"
                            className={`w-full h-7 pl-2 pr-7 rounded-md border text-[13px] outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-600 ${t.inputBg}`}
                          />
                          {overpaidAmountState[row.id] === "saving" && (
                            <Loader2 aria-hidden="true" className={`absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin ${t.textMuted}`} />
                          )}
                          {overpaidAmountState[row.id] === "saved" && (
                            <Check aria-hidden="true" className={`absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 ${dark ? "text-emerald-400" : "text-emerald-600"}`} />
                          )}
                        </div>
                      </td>
                      <td className={`${tdBase}`}>
                        <div className="relative">
                          <input
                            type="text"
                            value={row.feesConfirmation ?? ""}
                            onChange={(e) => setConfirmationLocal(row.id, e.target.value)}
                            onBlur={() => persistConfirmation(row)}
                            placeholder="—"
                            maxLength={50}
                            disabled={!canEditFeesConf}
                            title={!canEditFeesConf ? "You don't have permission to update Fees Confirmation." : undefined}
                            className={`w-full h-7 pl-2 pr-7 rounded-md border text-[13px] outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-600 ${t.inputBg} disabled:opacity-50 disabled:cursor-not-allowed`}
                          />
                          {confirmationState[row.id] === "saving" && (
                            <Loader2 aria-hidden="true" className={`absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin ${t.textMuted}`} />
                          )}
                          {confirmationState[row.id] === "saved" && (
                            <Check aria-hidden="true" className={`absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 ${dark ? "text-emerald-400" : "text-emerald-600"}`} />
                          )}
                        </div>
                      </td>
                      <td className={`${tdBase}`}>
                        <div className="relative">
                          <input
                            type="date"
                            value={row.opLtrDate ?? ""}
                            onChange={(e) => setOpLtrDateLocal(row.id, e.target.value)}
                            onBlur={() => persistOpLtrDate(row)}
                            aria-label="O/P letter sent date"
                            className={`w-36 h-7 px-2 rounded-md border text-[13px] outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-600 ${t.inputBg}`}
                          />
                          {opLtrDateState[row.id] === "saving" && (
                            <Loader2 aria-hidden="true" className={`absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin ${t.textMuted}`} />
                          )}
                          {opLtrDateState[row.id] === "saved" && (
                            <Check aria-hidden="true" className={`absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 ${dark ? "text-emerald-400" : "text-emerald-600"}`} />
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
                            className={`w-36 h-7 px-2 rounded-md border text-[13px] outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-600 ${t.inputBg}`}
                          />
                          {ltrState[row.id] === "saving" && (
                            <Loader2 aria-hidden="true" className={`absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin ${t.textMuted}`} />
                          )}
                          {ltrState[row.id] === "saved" && (
                            <Check aria-hidden="true" className={`absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 ${dark ? "text-emerald-400" : "text-emerald-600"}`} />
                          )}
                        </div>
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
            {!loading && rows.length > 0 && (
              <tfoot>
                <tr className={`border-t-2 ${dark ? "border-neutral-700 bg-neutral-800/60" : "border-neutral-300 bg-neutral-50"}`}>
                  <td colSpan={4} className={`${tdBase} font-semibold ${t.textSub}`}>
                    Page Totals <span className={`font-normal ${t.textMuted}`}>({rows.length} rows)</span>
                  </td>
                  <td className={`${tdBase} text-right font-bold ${t.text}`}>{fmtFull(pageFeesReceived)}</td>
                  <td className={`${tdBase} text-right font-bold ${dark ? "text-amber-400" : "text-amber-600"}`}>{fmtFull(pageOverpaid)}</td>
                  <td colSpan={5} />
                </tr>
              </tfoot>
            )}
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

      <ClearedCases dark={dark} t={t} refreshToken={clearedRefreshToken} onRestored={fetchCases} />
    </div>
  );
};
