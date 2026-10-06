"use client";

import { useState, useMemo, useRef, useEffect, useTransition } from "react";
import { useTheme } from "next-themes";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import {
  Search,
  Upload,
  FileDown,
  FileSpreadsheet,
  Database,
  Loader2,
  Plus,
  RefreshCw,
  SearchX,
} from "lucide-react";

import { themeClasses } from "@/lib/theme-classes";
import { buildMyCaseUrl } from "@/lib/import/case-link";
import {
  fmtFull,
  fmtDate,
  caseLevelLabel,
} from "@/lib/formatters";
import type { CaseRow, ApprovedByOption } from "@/types";
import type { DropdownOptionsByCategory } from "@/hooks/useDashboard";
import { useCapabilities } from "@/hooks/useCapabilities";
import CaseDetailSheet from "./CaseDetailSheet";
import ImportCasesModal from "@/components/modals/ImportCasesModal";
import AddCaseModal from "@/components/modals/AddCaseModal";
import SheetSyncModal from "@/components/modals/SheetSyncModal";
import MyCaseSyncModal from "@/components/modals/MyCaseSyncModal";
import NotesModal from "@/components/modals/NotesModal";
import { ArchiveConfirmDialog } from "./ArchiveConfirmDialog";
import { FeesClosedConfirmDialog } from "./FeesClosedConfirmDialog";
import { BulkFeesClosedConfirmDialog } from "./BulkFeesClosedConfirmDialog";
import { normalizeCaseLevel } from "@/lib/case-level-icons";
import { AddToFeePetitionsConfirmDialog } from "./AddToFeePetitionsConfirmDialog";
import { useServerPaginatedFetch } from "@/hooks/useServerPaginatedFetch";
import { useFeeRecordsFilters } from "@/hooks/useFeeRecordsFilters";
import { useBulkActions } from "@/hooks/useBulkActions";
import { useWinSheetEdit } from "@/hooks/useWinSheetEdit";
import { useFeeAmountEdit } from "@/hooks/useFeeAmountEdit";
import { FilterPresetsMenu } from "./FilterPresetsMenu";
import { BatchActionPill } from "./BatchActionPill";
import { FeeRecordsTableHeader } from "./FeeRecordsTableHeader";
import { FeeRecordsTableRow } from "./FeeRecordsTableRow";
import type { SortKey, SortDir, FilterPreset, CaseField, FeeField, DropdownRowKey } from "./fee-records-types";


interface FeeRecordsTableProps {
  cases?: CaseRow[];
  dateRange?: { from: string; to: string } | null;
  onImported?: () => Promise<void> | void;
  // Active dashboard (default) shows the Approved By dropdown + close flow.
  // "closed" renders a read-only view for /fees-closed.
  mode?: "active" | "closed";
  title?: string;
  approvedByOptions?: ApprovedByOption[];
  // Per-category option lists for the other inline dropdowns (Assigned,
  // Fees Confirmation, Case Status). Optional — an empty list just yields
  // an empty dropdown with the current value preserved as a fallback.
  dropdownOptions?: DropdownOptionsByCategory;
  // Team members (name + team + role) — colors the Assigned dropdown by
  // team, and highlights team_lead members by team in the Approved By
  // dropdown so it's obvious who can actually sign off on closing a case.
  teamMembers?: { name: string; team: string | null; role: string }[];
  // When true, the table fetches its own data from /api/cases using the
  // current filter/sort/page state as query params instead of receiving the
  // full case list via props. Enables bounded payloads for large tables.
  serverPaginated?: boolean;
  // Aging filter applied server-side when serverPaginated is true.
  agingFilter?: "all" | "unpaid_60" | "unpaid_90";
}

// Whether a field lives on the `fee_records` row or the `cases` row.
// The PATCH endpoint splits its body into `feeFields` and `caseFields`.

// Sends a single-field patch and logs an activity entry so the side
// panel keeps a trail of who changed what.
const patchSingleField = async (
  caseId: number,
  target: "case" | "fee",
  field: CaseField | FeeField,
  value: string | null,
  fieldLabel: string,
  signal?: AbortSignal,
) => {
  const payload =
    target === "case"
      ? { caseFields: { [field]: value } }
      : { feeFields: { [field]: value } };
  const res = await fetch(`/api/cases/${caseId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload,
      logMessage: value
        ? `${fieldLabel} set to "${value}"`
        : `${fieldLabel} cleared`,
    }),
    signal,
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(
      (j as { error?: string }).error ||
        `Failed to update ${fieldLabel} (${res.status})`,
    );
  }
};

const timeAgo = (date: Date): string => {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

export const FeeRecordsTable = ({
  cases: casesProp = [],
  dateRange,
  onImported,
  mode = "active",
  title = "Master Fee Records",
  approvedByOptions = [],
  dropdownOptions = {},
  teamMembers = [],
  serverPaginated = false,
  agingFilter = "all",
}: FeeRecordsTableProps) => {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const t = themeClasses(dark);
  const { data: session } = useSession();
  const isAdmin =
    session?.user?.role === "admin" || session?.user?.role === "system_admin";
  const { can } = useCapabilities();
  const canCreate = can("case.create");
  const canFinalize = can("case.finalize");
  const canEditFeeDue = can("case.update");
  const canEditFees = can("fees.edit");
  const canSeeLeaderNotes = can("leaderNotes.access");
  const canEditFeesConf = can("feesConfirmation.edit");

  const searchParams = useSearchParams();

  const assignedOptions = dropdownOptions.assigned_to ?? [];
  const feesConfirmationOptions = dropdownOptions.fees_confirmation ?? [];
  const caseStatusOptions = dropdownOptions.case_status ?? [];
  const caseLevelOptions = dropdownOptions.case_level ?? [];
  const claimTypeOptions = dropdownOptions.claim_type ?? [];
  const winSheetStatusOptions = dropdownOptions.win_sheet_status ?? [];
  const leaders = teamMembers.filter((m) => m.role === "team_lead");

  // Optimistic overrides keyed by case id — the row value is patched
  // immediately on change, and the server reconciles on the next refresh.
  const [pending, setPending] = useState<
    Record<number, Partial<Record<DropdownRowKey, string>>>
  >({});

  // Case targeted by the Reopen confirmation dialog (Fees Closed page only —
  // closing is now a batch action, see bulkCloseConfirmOpen below).
  const [reopenConfirmCase, setReopenConfirmCase] = useState<CaseRow | null>(null);

  // ── Filter state ─────────────────────────────────────────────────────────
  // Managed by useFeeRecordsFilters — declared after sort/page state below.

  // Minimized T16/T2/AUX column groups — collapses a claim type's 5 editable
  // columns down to a single read-only Fee Due glance, so staff working a
  // single claim type can't mistakenly enter Retro/Fee Due on the wrong one.
  // Session-only (not persisted), same as this table's other view toggles.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<"caseStatus" | "t16" | "t2" | "aux">>(new Set());
  const toggleGroupCollapse = (group: "caseStatus" | "t16" | "t2" | "aux") => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };
  // Fees Closed defaults to most-recently-closed on top; Master Fees
  // defaults to most-recently-added on top (both requested by Ms. Jazz).
  const defaultSortKey: SortKey = mode === "closed" ? "closedAt" : "createdAt";
  const VALID_SORT_KEYS: SortKey[] = ["name", "assigned", "date", "expected", "paid", "daysAfterApproval", "nextFollowUpDate", "closedAt", "createdAt"];
  const [sortKey, setSortKey] = useState<SortKey>(() => {
    const s = searchParams.get("sort") as SortKey | null;
    return s && VALID_SORT_KEYS.includes(s) ? s : defaultSortKey;
  });
  const [sortDir, setSortDir] = useState<SortDir>(() =>
    searchParams.get("dir") === "asc" ? "asc" : "desc",
  );
  // Client-side pagination over the filtered+sorted set. Page size is
  // user-selectable; "all" renders the whole filtered set on one page.
  const [pageSize, setPageSize] = useState<number | "all">(() => {
    const s = searchParams.get("size");
    if (s === "all") return "all";
    const n = s ? parseInt(s, 10) : NaN;
    return Number.isNaN(n) ? 100 : n;
  });
  const [pageIndex, setPageIndex] = useState(0);
  // Switching to a large page size ("All") renders many rows at once. Marking
  // the change a transition keeps the click responsive (shows a pending state)
  // instead of hard-freezing the main thread during that render.
  const [isPending, startTransition] = useTransition();

  // ── Filter state (hook) ───────────────────────────────────────────────────
  const {
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
  } = useFeeRecordsFilters({
    searchParams,
    sortKey,
    sortDir,
    pageSize,
    defaultSortKey,
    dateRange,
    agingFilter,
    setPageIndex,
    onClearSort: () => {
      setSortKey(defaultSortKey);
      setSortDir("desc");
      setPageIndex(0);
    },
  });

  // ── Server-paginated self-fetch (hook) ────────────────────────────────────
  const {
    fetchedCases,
    fetchTotal,
    fetchLoading,
    fetchLoadedOnce,
    fetchError,
    setFetchRevision,
  } = useServerPaginatedFetch({
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
  });
  // In serverPaginated mode, data comes from the server. Otherwise use the prop.
  const cases = serverPaginated ? fetchedCases : casesProp;

  const [feesConfEditId, setFeesConfEditId] = useState<number | null>(null);
  const [claimEditId, setClaimEditId] = useState<number | null>(null);
  const [winSheetStatusEditId, setWinSheetStatusEditId] = useState<number | null>(null);
  const [caseStatusEditId, setCaseStatusEditId] = useState<number | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  // ── Filter presets ────────────────────────────────────────────────────────
  const PRESET_KEY = `fee-records-presets-${mode}`;
  const [presets, setPresets] = useState<FilterPreset[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem(PRESET_KEY) ?? "[]"); }
    catch { return []; }
  });
  const [presetName, setPresetName] = useState("");
  const [presetsOpen, setPresetsOpen] = useState(false);
  const presetsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!presetsOpen) return;
    const handler = (e: MouseEvent) => {
      if (presetsRef.current && !presetsRef.current.contains(e.target as Node))
        setPresetsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [presetsOpen]);

  const savePreset = () => {
    const name = presetName.trim();
    if (!name) return;
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
    const next: FilterPreset[] = [
      ...presets.filter((p) => p.name !== name),
      { id: crypto.randomUUID(), name, params: params.toString() },
    ];
    setPresets(next);
    localStorage.setItem(PRESET_KEY, JSON.stringify(next));
    setPresetName("");
    setPresetsOpen(false);
  };

  const applyPreset = (preset: FilterPreset) => {
    const p = new URLSearchParams(preset.params);
    setSearch(p.get("q") ?? "");
    setStatusFilter(p.get("status") ?? "all");
    setAssignedFilter(p.get("assigned") ?? "all");
    setFeesConfFilter(p.get("pif") ?? "all");
    setClaimFilter(p.get("claim") ?? "all");
    setCaseStatusFilter(p.get("cs") ?? "all");
    setLevelFilter(p.get("level") ?? "all");
    setApproverFilter(p.get("approver") ?? "all");
    const fuMode = p.get("fuMode");
    setFollowUpMode(fuMode === "day" || fuMode === "range" ? fuMode : "all");
    setFollowUpDay(p.get("fuDay") ?? "");
    setFollowUpFrom(p.get("fuFrom") ?? "");
    setFollowUpTo(p.get("fuTo") ?? "");
    const s = p.get("sort") as SortKey | null;
    if (s && VALID_SORT_KEYS.includes(s)) setSortKey(s);
    else setSortKey(defaultSortKey);
    setSortDir(p.get("dir") === "asc" ? "asc" : "desc");
    setPageIndex(0);
    setPresetsOpen(false);
  };

  const deletePreset = (id: string) => {
    const next = presets.filter((p) => p.id !== id);
    setPresets(next);
    localStorage.setItem(PRESET_KEY, JSON.stringify(next));
  };
  const [syncOpen, setSyncOpen] = useState(false);
  const [myCaseSyncOpen, setMyCaseSyncOpen] = useState(false);
  const [notesFor, setNotesFor] = useState<{ id: number; name: string } | null>(
    null,
  );
  const [leaderNotesFor, setLeaderNotesFor] = useState<{ id: number; name: string } | null>(
    null,
  );
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  // Optimistic overrides for fee payment totals after panel add/delete.
  // Pending is deliberately absent — it's fully derived (Fee Due minus
  // Received) by the compute_fee_totals trigger, never set optimistically.
  const [feeOverrides, setFeeOverrides] = useState<
    Record<number, Partial<Pick<CaseRow, "t16Retro" | "t16FeeDue" | "t16FeeReceived" | "t16FeeReceivedDate" | "t2Retro" | "t2FeeDue" | "t2FeeReceived" | "t2FeeReceivedDate" | "auxRetro" | "auxFeeDue" | "auxFeeReceived" | "auxFeeReceivedDate">>>
  >({});
  // Per-row "refresh" — re-fetches one case from the server and patches just
  // that row, so a fee edit's server-side side effects (Pending recompute,
  // PIF auto-classification) show up without reloading/re-searching the
  // whole table. Takes priority over feeOverrides/pending once populated,
  // since it reflects confirmed server state rather than an optimistic guess.
  const [rowOverrides, setRowOverrides] = useState<Record<number, Partial<CaseRow>>>({});

  // ── Bulk action state + handlers (hook) ──────────────────────────────────
  const {
    archiveConfirmOpen, setArchiveConfirmOpen,
    archivePendingIds,
    archivePendingSource,
    bulkCloseConfirmOpen, setBulkCloseConfirmOpen,
    bulkClosePendingIds,
    bulkOverpaidSaving,
    bulkOverpaidError,
    bulkReassignSaving,
    bulkReassignError,
    bulkFeePetitionSaving,
    bulkFeePetitionError, setBulkFeePetitionError,
    feePetitionConfirmOpen, setFeePetitionConfirmOpen,
    feePetitionPending, setFeePetitionPending,
    handleBulkReassign,
    handleBatchArchive,
    handleBatchFeesClosed,
    handleBatchMarkOverpaid,
    handleBatchAddToFeePetitions,
  } = useBulkActions({ selectedIds, setSelectedIds, setRowOverrides, mode });

  // A per-row refresh snapshot must not outlive the next full-list refetch
  // (CSV import, Sheets/MyCase sync) — otherwise it would keep shadowing
  // newer data for that case indefinitely, since it's spread last in the
  // row merge below. `cases` gets a new array reference on every refetch.
  useEffect(() => {
    setRowOverrides({});
  }, [cases]);
  const [rowRefreshing, setRowRefreshing] = useState<Set<number>>(new Set());
  const rowRefreshAbortRef = useRef<Map<number, AbortController>>(new Map());
  const [copiedDateId, setCopiedDateId] = useState<number | null>(null);
  const copyDateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const patchAbortRef = useRef<Map<string, AbortController>>(new Map());
  const prevCasesRef = useRef(cases);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date>(() => new Date());
  const [, setTick] = useState(0);
  useEffect(() => {
    if (cases !== prevCasesRef.current) {
      prevCasesRef.current = cases;
      setLastUpdatedAt(new Date());
    }
  }, [cases]);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const abortMap = patchAbortRef.current;
    const rowRefreshMap = rowRefreshAbortRef.current;
    return () => {
      for (const ctrl of abortMap.values()) ctrl.abort();
      abortMap.clear();
      for (const ctrl of rowRefreshMap.values()) ctrl.abort();
      rowRefreshMap.clear();
      if (copyDateTimerRef.current) clearTimeout(copyDateTimerRef.current);
    };
  }, []);



  const toggleRowSelection = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Wraps onImported: calls the parent's callback and also increments
  // fetchRevision so serverPaginated mode re-fetches the current page.
  const handleRefresh = async () => {
    await onImported?.();
    if (serverPaginated) setFetchRevision((n) => n + 1);
  };

  const {
    winSheetEditing, setWinSheetEditing,
    winSheetDraft, setWinSheetDraft,
    winSheetSaving,
    winSheetError, setWinSheetError,
    handleWinSheetSave,
  } = useWinSheetEdit({ onRefresh: handleRefresh });

  const {
    feeAmountEdit, setFeeAmountEdit,
    feeAmountSaving,
    feeAmountError, setFeeAmountError,
    handleFeeAmountSave,
  } = useFeeAmountEdit({ setFeeOverrides });

  const toggleSelectAll = () => {
    const allSelected =
      filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id));
    setSelectedIds(
      allSelected ? new Set() : new Set(filtered.map((c) => c.id)),
    );
  };


  // Unique assignees for filter dropdown
  const assignees = useMemo(() => {
    const set = new Set(cases.map((c) => c.assigned).filter((a) => a !== "—"));
    return Array.from(set).sort();
  }, [cases]);

  // All PIF statuses for the filter dropdown — the full admin-configured
  // catalog (so every status is filterable even if no currently-loaded case
  // has it yet), in the admin-configured order, followed by any values
  // actually present on records that aren't in the catalog (e.g. an
  // inactive-but-still-set value), alphabetized since those have no defined
  // order of their own.
  const feesConfValues = useMemo(() => {
    const catalog = (dropdownOptions.fees_confirmation ?? []).map((o) => o.name);
    const catalogSet = new Set(catalog);
    const extras = Array.from(
      new Set(
        cases
          .map((c) => c.feesConfirmation)
          .filter((v): v is string => v != null && !catalogSet.has(v)),
      ),
    ).sort();
    return [...catalog, ...extras];
  }, [cases, dropdownOptions.fees_confirmation]);

  // Remarks values for the quick-filter dropdown — admin-configured catalog
  // first (in its configured order), then any free-text values actually
  // present on records that predate/aren't in the catalog, alphabetized.
  const caseStatusValues = useMemo(() => {
    const catalog = (dropdownOptions.case_status ?? []).map((o) => o.name);
    const catalogSet = new Set(catalog);
    const extras = Array.from(
      new Set(
        cases
          .map((c) => c.caseStatus)
          .filter((v): v is string => v != null && !catalogSet.has(v)),
      ),
    ).sort();
    return [...catalog, ...extras];
  }, [cases, dropdownOptions.case_status]);

  const filtered = useMemo(() => {
    // In server-paginated mode, filtering/sorting is done server-side.
    // Only apply optimistic rowOverrides here — the fetch already handles
    // all filter/sort logic. feeOverrides live on CaseRow fields that are
    // already present in the response, so we spread them on top.
    if (serverPaginated) {
      return cases.map((c) => {
        const ro = rowOverrides[c.id];
        const fo = feeOverrides[c.id];
        return ro || fo ? { ...c, ...(ro ?? {}), ...(fo ?? {}) } : c;
      });
    }

    let d = [...cases];
    // Date range filter (approval date) — skipped in closed mode because
    // closed cases span all approval dates; the parent page has its own
    // closedAt date filters instead.
    if (dateRange && mode !== "closed") {
      d = d.filter((c) => {
        if (!c.date) return false;
        return c.date >= dateRange.from && c.date <= dateRange.to;
      });
    }
    if (search) {
      const q = search.toLowerCase();
      d = d.filter(
        (c) => c.name.toLowerCase().includes(q) || String(c.id).includes(q),
      );
    }
    if (statusFilter !== "all") {
      // win_sheet_status is now varchar — accept both the legacy enum
      // groupings AND the worksheet labels saved via the dropdown.
      if (statusFilter === "finished") {
        d = d.filter((c) =>
          [
            "pending_payment",
            "partially_paid",
            "paid_in_full",
            "Finished",
          ].includes(c.status),
        );
      } else if (statusFilter === "started") {
        d = d.filter((c) =>
          ["started", "in_progress", "Started"].includes(c.status),
        );
      } else {
        d = d.filter((c) => c.status === statusFilter);
      }
    }
    if (assignedFilter === "__unassigned__") {
      d = d.filter((c) => {
        const ov = pending[c.id]?.assigned;
        return ov !== undefined ? !ov : c.assigned === "—";
      });
    } else if (assignedFilter !== "all") {
      d = d.filter((c) => {
        const ov = pending[c.id]?.assigned;
        return ov !== undefined ? ov === assignedFilter : c.assigned === assignedFilter;
      });
    }
    if (feesConfFilter === "__none__")
      d = d.filter((c) => c.feesConfirmation == null);
    else if (feesConfFilter !== "all")
      d = d.filter((c) => c.feesConfirmation === feesConfFilter);
    if (claimFilter !== "all")
      d = d.filter((c) => c.claim === claimFilter);
    if (caseStatusFilter !== "all")
      d = d.filter((c) => c.caseStatus === caseStatusFilter);
    if (levelFilter !== "all")
      d = d.filter((c) => normalizeCaseLevel(c.level) === normalizeCaseLevel(levelFilter));
    if (approverFilter !== "all")
      d = d.filter((c) => c.approvedBy?.toLowerCase().includes(approverFilter));
    // No-ops until a date is actually picked (see the state comment above) —
    // only exclude no-follow-up-scheduled cases once there's something real
    // to compare against.
    if (followUpMode === "day" && followUpDay) {
      d = d.filter((c) => {
        const ov = pending[c.id]?.nextFollowUpDate;
        const val = ov !== undefined ? ov : c.nextFollowUpDate;
        return val === followUpDay;
      });
    } else if (followUpMode === "range" && (followUpFrom || followUpTo)) {
      d = d.filter((c) => {
        const ov = pending[c.id]?.nextFollowUpDate;
        const val = ov !== undefined ? ov : c.nextFollowUpDate;
        if (!val) return false;
        if (followUpFrom && val < followUpFrom) return false;
        if (followUpTo && val > followUpTo) return false;
        return true;
      });
    }

    d.sort((a, b) => {
      let av: string | number, bv: string | number;
      switch (sortKey) {
        case "name":
          av = a.name;
          bv = b.name;
          break;
        case "assigned": {
          // Empty assignees ("—") sort last regardless of direction so the
          // unassigned bucket never breaks up real groups in the middle.
          // Use pending override when present (same logic as the filter above).
          const ova = pending[a.id]?.assigned;
          const ovb = pending[b.id]?.assigned;
          const ea = ova !== undefined ? (ova || "—") : a.assigned;
          const eb = ovb !== undefined ? (ovb || "—") : b.assigned;
          av = ea === "—" ? "￿" : ea.toLowerCase();
          bv = eb === "—" ? "￿" : eb.toLowerCase();
          break;
        }
        case "date":
          av = a.date || "";
          bv = b.date || "";
          break;
        case "expected":
          av = a.expected;
          bv = b.expected;
          break;
        case "paid":
          av = a.paid;
          bv = b.paid;
          break;
        case "daysAfterApproval":
          av = a.daysAfterApproval ?? 0;
          bv = b.daysAfterApproval ?? 0;
          break;
        case "nextFollowUpDate": {
          // Use pending override when present (same logic as "assigned"
          // above) so an unsaved edit reorders the row immediately.
          const ova = pending[a.id]?.nextFollowUpDate;
          const ovb = pending[b.id]?.nextFollowUpDate;
          const da = (ova !== undefined ? ova : a.nextFollowUpDate) || "";
          const db = (ovb !== undefined ? ovb : b.nextFollowUpDate) || "";
          // No date scheduled always sorts to the end, regardless of
          // ascending/descending — an unscheduled follow-up isn't
          // "earliest" or "latest," so it shouldn't jump to the top when
          // the direction is reversed. Real dates fall through to the
          // generic comparison below so sortDir still applies to them.
          if (!da && !db) return 0;
          if (!da) return 1;
          if (!db) return -1;
          av = da;
          bv = db;
          break;
        }
        case "closedAt":
          av = a.closedAt || "";
          bv = b.closedAt || "";
          break;
        case "createdAt":
          av = a.createdAt || "";
          bv = b.createdAt || "";
          break;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return d;
  }, [
    serverPaginated,
    cases,
    rowOverrides,
    feeOverrides,
    pending,
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
    sortKey,
    sortDir,
    dateRange,
    mode,
  ]);

  // Cases in the current selection that aren't on the Fee Petitions page yet.
  // Re-adding one that's already there is a no-op server-side, so the button
  // reports (and acts on) only the ones that would actually move. Resolved
  // against the full case list rather than `filtered`, since a selection
  // survives filter changes, and through rowOverrides so a case added a moment
  // ago isn't offered again before the next refresh.
  const casesById = useMemo(() => new Map(cases.map((c) => [c.id, c])), [cases]);
  const feePetitionAddableIds = useMemo(
    () =>
      Array.from(selectedIds).filter((id) => {
        const row = casesById.get(id);
        if (!row) return false;
        return !(rowOverrides[id]?.inFeePetition ?? row.inFeePetition);
      }),
    [casesById, rowOverrides, selectedIds],
  );

  // Does the batch pill have anything to offer this user? "Add to Fee Petitions"
  // is open to all staff on the active table; Archive is admin-only. A member on
  // Fees Closed has neither, so the pill is suppressed to avoid a floating bar
  // that says only "N selected" with nothing to click.
  const canAddToFeePetitions = mode !== "closed";
  const hasBatchActions = canAddToFeePetitions || isAdmin;


  // ── Pagination ────────────────────────────────────────────────────────────
  // In server-paginated mode, the total comes from the API response; the
  // filtered array is already a single page, so no client-side slicing needed.
  const totalForPagination = serverPaginated ? fetchTotal : filtered.length;
  const pageCount =
    pageSize === "all" ? 1 : Math.max(1, Math.ceil(totalForPagination / (pageSize as number)));
  // Clamp so a stale pageIndex (e.g. after a filter shrinks the set) never
  // renders an empty page — fall back to the last valid page instead.
  const currentPage = Math.min(pageIndex, pageCount - 1);
  const pageStart = serverPaginated || pageSize === "all" ? 0 : currentPage * (pageSize as number);
  const pageEnd = serverPaginated
    ? filtered.length
    : pageSize === "all"
      ? filtered.length
      : Math.min(pageStart + (pageSize as number), filtered.length);
  const paged =
    serverPaginated || pageSize === "all" ? filtered : filtered.slice(pageStart, pageEnd);


  useEffect(() => {
    if (!selectAllRef.current) return;
    const allSelected =
      filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id));
    const someSelected = filtered.some((c) => selectedIds.has(c.id));
    selectAllRef.current.checked = allSelected;
    selectAllRef.current.indeterminate = !allSelected && someSelected;
  }, [selectedIds, filtered]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      // Text columns default to A→Z; numeric/date columns default to
      // newest/highest — except Next Follow-Up, a scheduling date rather
      // than a "when did this happen" date, where soonest-due-first (asc)
      // is what staff scanning for upcoming calls actually want.
      setSortDir(key === "name" || key === "assigned" || key === "nextFollowUpDate" ? "asc" : "desc");
    }
  };

  const ariaSortFor = (key: SortKey): "ascending" | "descending" | "none" => {
    if (sortKey !== key) return "none";
    return sortDir === "asc" ? "ascending" : "descending";
  };

  // Resolve the value the table should show for a varchar dropdown cell,
  // preferring an in-flight optimistic edit over the server-loaded row.
  const cellValue = (c: CaseRow, key: DropdownRowKey): string => {
    const override = pending[c.id]?.[key];
    if (override !== undefined) return override ?? "";
    // `assigned`, `level`, `claim` come back as "—" from the API when null;
    // treat that as empty so the select shows the placeholder option.
    if (key === "assigned") return c.assigned === "—" ? "" : c.assigned;
    if (key === "level") return c.level === "—" ? "" : c.level;
    if (key === "claim") return c.claim === "—" ? "" : c.claim;
    if (key === "status") return c.status ?? "";
    if (key === "approvedBy") return c.approvedBy ?? "";
    return c[key] ?? "";
  };

  // Optimistically patch the local row + fire the API call; on failure,
  // roll back the override and surface the error in the console for now.
  const handleVarcharChange = async (
    c: CaseRow,
    target: "case" | "fee",
    field: CaseField | FeeField,
    rowKey: DropdownRowKey,
    fieldLabel: string,
    next: string,
  ) => {
    const key = `${c.id}:${field}`;
    patchAbortRef.current.get(key)?.abort();
    const controller = new AbortController();
    patchAbortRef.current.set(key, controller);

    const value = next || null;
    setPending((prev) => ({
      ...prev,
      [c.id]: { ...prev[c.id], [rowKey]: value ?? "" },
    }));
    try {
      await patchSingleField(c.id, target, field, value, fieldLabel, controller.signal);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      console.error(`Failed to update ${fieldLabel}:`, err);
      setPending((prev) => {
        const copy = { ...prev };
        if (copy[c.id]) {
          const next = { ...copy[c.id] };
          delete (next as Record<string, unknown>)[rowKey];
          copy[c.id] = next;
        }
        return copy;
      });
    } finally {
      if (patchAbortRef.current.get(key) === controller) {
        patchAbortRef.current.delete(key);
      }
    }
  };

  // Re-fetches one case and patches just its row — lets staff see a fee
  // edit's server-computed side effects (Pending, PIF auto-classification)
  // without reloading the whole table or losing their place in it.
  const handleRowRefresh = async (c: CaseRow) => {
    rowRefreshAbortRef.current.get(c.id)?.abort();
    const controller = new AbortController();
    rowRefreshAbortRef.current.set(c.id, controller);
    setRowRefreshing((prev) => new Set(prev).add(c.id));
    try {
      const res = await fetch(`/api/cases/${c.id}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`Failed to refresh case (${res.status})`);
      const json = await res.json();
      const d = json.data;
      const expected = Number(d.expected) || 0;
      const paid = Number(d.paid) || 0;
      // Mirrors the same PIF derivation used by GET /api/cases (the list
      // endpoint) — the detail endpoint returns expected/paid but not pif.
      let pif: CaseRow["pif"] = null;
      if (expected > 0) {
        if (paid >= expected) pif = "YES";
        else if (paid > 0) pif = "PENDING";
        else pif = "NO";
      }
      const patch: Partial<CaseRow> = {
        externalId: d.externalId ?? null,
        assigned: d.assigned || "—",
        level: d.level || "—",
        claim: d.claim || "—",
        date: d.approvalDate ?? null,
        status: d.status || "not_started",
        t16Retro: Number(d.t16Retro) || 0,
        t16FeeDue: d.t16FeeDue != null ? Number(d.t16FeeDue) : null,
        t16FeeReceived: Number(d.t16FeeReceived) || 0,
        t16Pending: Number(d.t16Pending) || 0,
        t16FeeReceivedDate: d.t16FeeReceivedDate ?? null,
        t2Retro: Number(d.t2Retro) || 0,
        t2FeeDue: d.t2FeeDue != null ? Number(d.t2FeeDue) : null,
        t2FeeReceived: Number(d.t2FeeReceived) || 0,
        t2Pending: Number(d.t2Pending) || 0,
        t2FeeReceivedDate: d.t2FeeReceivedDate ?? null,
        auxRetro: Number(d.auxRetro) || 0,
        auxFeeDue: d.auxFeeDue != null ? Number(d.auxFeeDue) : null,
        auxFeeReceived: Number(d.auxFeeReceived) || 0,
        auxPending: Number(d.auxPending) || 0,
        auxFeeReceivedDate: d.auxFeeReceivedDate ?? null,
        totalRetroDue: Number(d.totalRetroDue) || 0,
        expected,
        paid,
        pif,
        approvedBy: d.approvedBy ?? null,
        feesConfirmation: d.feesConfirmation ?? null,
        feesClosedTrigger: d.feesClosedTrigger ?? null,
        caseStatus: d.caseStatus ?? null,
        isClosed: d.isClosed ?? false,
        markedOverpaid: d.markedOverpaid ?? false,
        inFeePetition: d.inFeePetition ?? false,
        closedAt: d.closedAt ?? null,
        update: d.activities?.[0]?.message || "—",
        sync: d.syncStatus || "not_synced",
        daysAfterApproval: d.daysAfterApproval ?? null,
        approvalCategory: d.approvalCategory ?? null,
        feesStatus: d.feesStatus ?? null,
        weekAssignedToAgent: d.weekAssignedToAgent ?? null,
        monthAssignedToAgent: d.monthAssignedToAgent ?? null,
        office: d.office || "—",
        notesCount: Array.isArray(d.activities) ? d.activities.length : c.notesCount,
        winSheetLink: d.winSheetLink ?? null,
        winSheetLinkText: d.winSheetLinkText ?? null,
      };
      setRowOverrides((prev) => ({ ...prev, [c.id]: patch }));
      // Fresh server truth just arrived — drop any stale optimistic values
      // for this case so they can't keep shadowing it.
      setFeeOverrides((prev) => {
        if (!(c.id in prev)) return prev;
        const next = { ...prev };
        delete next[c.id];
        return next;
      });
      setPending((prev) => {
        if (!(c.id in prev)) return prev;
        const next = { ...prev };
        delete next[c.id];
        return next;
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      console.error("Failed to refresh row:", err);
    } finally {
      if (rowRefreshAbortRef.current.get(c.id) === controller) {
        rowRefreshAbortRef.current.delete(c.id);
      }
      setRowRefreshing((prev) => {
        const next = new Set(prev);
        next.delete(c.id);
        return next;
      });
    }
  };

  const rowBorder = dark ? "border-neutral-800/50" : "border-neutral-100";
  const rowHover = dark ? "hover:bg-neutral-800/40" : "hover:bg-neutral-50/80";

  // Opaque bg matching the card surface so sticky cells never show the
  // scrolled content bleeding through. `stickyHover` lets frozen body cells
  // inherit the row's hover from the <tr> (which carries `group`). The
  // second frozen column gets a right divider marking the freeze boundary.
  const stickyBg = dark ? "bg-neutral-900" : "bg-white";
  // Frozen-cell hover MUST be opaque: a translucent tint (e.g. /40) lets the
  // horizontally-scrolling columns bleed through the frozen Case Name/checkbox
  // cells in dark mode. Light mode's near-white tint hid the issue.
  const stickyHover = dark
    ? "group-hover:bg-neutral-800"
    : "group-hover:bg-neutral-50";
  // Divider + the Assigned column's frozen styling apply only at sm+ — on
  // mobile Assigned scrolls so the 352px of frozen columns don't crowd out
  // the data. `stickyColBg` is the desktop-only opaque bg for the Assigned
  // body cell (transparent on mobile so the row stripe/hover shows through).
  const stickyDivider = dark
    ? "sm:border-r sm:border-neutral-700/60"
    : "sm:border-r sm:border-neutral-200";
  // Freeze-boundary divider. On mobile only Case Name is frozen, so the line
  // sits after Case Name (and is removed at sm+, where the freeze continues
  // to Assigned and `stickyDivider` takes over after it).
  const nameDivider = dark
    ? "border-r border-neutral-700/60 sm:border-r-0"
    : "border-r border-neutral-200 sm:border-r-0";
  const stickyColBg = dark
    ? "sm:bg-neutral-900 sm:group-hover:bg-neutral-800"
    : "sm:bg-white sm:group-hover:bg-neutral-50";
  // Frozen-column widths: Case Name stays frozen on all screens (narrower on
  // mobile); Assigned is 160px on desktop. The desktop left-48 offset below
  // assumes Case Name's sm width (w-48 = 192px).
  // max-w pins the frozen columns to an exact box so the sticky, opaque
  // Case Name cell can't overflow in front of (cover) the Assigned column.
  const colNameW = `w-36 min-w-36 max-w-36 sm:w-48 sm:min-w-48 sm:max-w-48`;
  const colAssignedW = `w-32 min-w-32 max-w-32 sm:w-40 sm:min-w-40 sm:max-w-40`;
  // left offset: checkbox(40) + name(192) + assigned(160) = 392px = 24.5rem
  const colFeesConfW = `w-32 min-w-32 max-w-32 sm:w-36 sm:min-w-36 sm:max-w-36`;
  // Closed On is a 4th frozen column, "closed" mode only, pinned in front of
  // Case Name — fixed 112px at every breakpoint (unlike the others, it never
  // needs to grow on desktop), so every other frozen offset below shifts
  // right by exactly that much when mode === "closed".
  const colClosedOnW = `w-28 min-w-28 max-w-28`;
  // Refresh is a leading frozen column in every mode, sitting right after the
  // checkbox — fixed 56px at every breakpoint, so every other frozen offset
  // below (Closed On, Case Name, Assigned, Fees Conf) shifts right by that
  // much regardless of mode.
  const colRefreshW = `w-14 min-w-14 max-w-14`;
  const isClosedMode = mode === "closed";

  // Every header cell is sticky vertically by default — the column-header
  // row (row 2) parks 32px down. Baking this into `thBase` means the ~24
  // column-header cells need no per-cell annotation. The group-header row
  // (row 1) overrides to the very top with `top-0!`.
  // `h-8` forces each header row to exactly 32px so row 2's `top-8` sits
  // flush against row 1's bottom — no gap for body rows to peek through.
  const thBase = `h-8 px-3 text-[12px] font-semibold uppercase tracking-wider whitespace-nowrap sticky top-8 z-20 ${stickyBg}`;
  const tdBase = `py-2 px-3 text-[14px] whitespace-nowrap`;
  const groupBorder = dark
    ? "border-l border-neutral-700/50"
    : "border-l border-neutral-200";

  // Group-header row (row 1) pins to the very top, overriding thBase's top-8.
  const stickyThRow1 = `top-0!`;
  // Frozen column headers (row 2). Case Name freezes left on all screens;
  // Assigned freezes left only at sm+ (on mobile it keeps thBase's sticky-top
  // but scrolls horizontally). Corner cells use z-30 to cover both single-axis
  // sticky neighbors during scroll. Refresh (56px) is now the leading frozen
  // column in every mode, so every offset below already includes it —
  // checkbox(40) + refresh(56) = 96px = left-24 as the new baseline. In
  // "closed" mode, Closed On additionally sits in front of Case Name, adding
  // colClosedOnW's 112px on top of that — 96+112=208px=13rem, etc.
  const stickyTh1 = isClosedMode
    ? `left-52 z-30 ${colNameW} ${nameDivider}`
    : `left-24 z-30 ${colNameW} ${nameDivider}`;
  // z-30 only at sm+ (where Assigned is a frozen corner). On mobile Assigned
  // scrolls, so no sticky-left. Freeze boundary moved to Fees Conf, so no divider here.
  // scrolls, so it must stay at thBase's z-20 — BELOW the frozen Case Name
  // (z-30) — otherwise it paints over the frozen "front index" on scroll.
  // Assigned: no divider — freeze boundary now sits after Fees Conf.
  const stickyTh2 = isClosedMode
    ? `sm:left-[25rem] sm:z-30 ${colAssignedW}`
    : `sm:left-72 sm:z-30 ${colAssignedW}`;
  // "Case Info" group label is split into cells so each part's freeze matches
  // the column beneath it. Three frozen columns: Case Name, Assigned, Fees
  // Conf (four, with Closed On, in "closed" mode).
  const stickyGroup = isClosedMode
    ? `top-0! left-52 z-30 ${colNameW} ${nameDivider}`
    : `top-0! left-24 z-30 ${colNameW} ${nameDivider}`;
  const stickyGroup2 = isClosedMode
    ? `top-0! sm:left-[25rem] sm:z-30 ${colAssignedW}`
    : `top-0! sm:left-72 sm:z-30 ${colAssignedW}`;
  // Fees Conf is the 3rd frozen column (left offset = 96 + 192 + 160 = 448px
  // = 28rem; + colClosedOnW's 112px = 560px = 35rem in "closed" mode).
  const stickyGroup3 = isClosedMode
    ? `top-0! sm:left-[35rem] sm:z-30 ${colFeesConfW} ${stickyDivider}`
    : `top-0! sm:left-[28rem] sm:z-30 ${colFeesConfW} ${stickyDivider}`;
  const stickyTh3 = isClosedMode
    ? `sm:left-[35rem] sm:z-30 ${colFeesConfW} ${stickyDivider}`
    : `sm:left-[28rem] sm:z-30 ${colFeesConfW} ${stickyDivider}`;
  const stickyTd1 = isClosedMode
    ? `sticky left-52 z-10 ${colNameW} ${stickyBg} ${stickyHover} ${nameDivider}`
    : `sticky left-24 z-10 ${colNameW} ${stickyBg} ${stickyHover} ${nameDivider}`;
  const stickyTd2 = isClosedMode
    ? `sm:sticky sm:left-[25rem] sm:z-10 ${colAssignedW} ${stickyColBg}`
    : `sm:sticky sm:left-72 sm:z-10 ${colAssignedW} ${stickyColBg}`;
  const stickyTd3 = isClosedMode
    ? `sm:sticky sm:left-[35rem] sm:z-10 ${colFeesConfW} ${stickyColBg} ${stickyDivider}`
    : `sm:sticky sm:left-[28rem] sm:z-10 ${colFeesConfW} ${stickyColBg} ${stickyDivider}`;
  const stickyCheckTh = `sticky top-0! left-0 z-30 w-10 min-w-10 ${stickyBg}`;
  const stickyCheckTd = `sticky left-0 z-10 w-10 min-w-10 ${stickyBg} ${stickyHover}`;
  // Refresh — new leading frozen column (all modes), sitting right after the
  // checkbox at left-10 (40px, the checkbox's own width). Spans both header
  // rows like the checkbox, so (like stickyCheckTh) it's fully self-contained
  // rather than combined with thBase — a rowSpan={2} cell needs top-0! for
  // its whole height, not thBase's row-2-only top-8.
  const stickyThRefresh = `h-8 px-3 text-[12px] font-semibold uppercase tracking-wider whitespace-nowrap sticky top-0! left-10 z-30 ${colRefreshW} ${stickyBg} ${t.textSub} text-center`;
  const stickyTdRefresh = `sticky left-10 z-10 ${colRefreshW} ${stickyBg} ${stickyHover}`;
  // Closed On — frozen, "closed" mode only, sitting right after Refresh
  // (checkbox 40px + refresh 56px = 96px = left-24).
  const stickyGroupClosedOn = `top-0! left-24 z-30 ${colClosedOnW}`;
  const stickyThClosedOn = `left-24 z-30 ${colClosedOnW}`;
  const stickyTdClosedOn = `sticky left-24 z-10 ${colClosedOnW} ${stickyBg} ${stickyHover}`;

  const downloadCsv = () => {
    const escape = (v: string) => {
      const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const fmt = (n: number | null | undefined) => (n != null ? n.toFixed(2) : "");
    const headers = [
      "Case ID", "Name", "MyCase Title", "Claim", "Assigned", "Office", "Level", "Date Approved",
      "T16 Retro", "T16 Fee Due", "T16 Fee Received", "T16 Received Date",
      "T2 Retro", "T2 Fee Due", "T2 Fee Received", "T2 Received Date",
      "AUX Retro", "AUX Fee Due", "AUX Fee Received", "AUX Received Date",
      "Total Due", "Total Paid", "PIF", "Status", "Approved By",
      "Case Remarks", "Days After Approval", "Next Follow-Up",
    ];
    const csvRows = [
      headers.join(","),
      ...filtered.map((r) =>
        [
          r.id,
          escape(r.name),
          escape(r.caseLink ?? r.externalId ?? buildMyCaseUrl(r.id)),
          escape(r.claim),
          escape(r.assigned),
          escape(r.office),
          escape(r.level),
          r.date ?? "",
          fmt(r.t16Retro), fmt(r.t16FeeDue), fmt(r.t16FeeReceived), r.t16FeeReceivedDate ?? "",
          fmt(r.t2Retro), fmt(r.t2FeeDue), fmt(r.t2FeeReceived), r.t2FeeReceivedDate ?? "",
          fmt(r.auxRetro), fmt(r.auxFeeDue), fmt(r.auxFeeReceived), r.auxFeeReceivedDate ?? "",
          r.expected.toFixed(2), r.paid.toFixed(2),
          escape(r.pif ?? ""),
          escape(r.status),
          escape(r.approvedBy ?? ""),
          escape(r.caseStatus ?? ""),
          r.daysAfterApproval != null ? r.daysAfterApproval : "",
          r.nextFollowUpDate ?? "",
        ].join(","),
      ),
    ].join("\n");
    const blob = new Blob([csvRows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `open-cases-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Server-paginated: block on the initial load only (same pattern as the
  // master-fees page used to do with casesLoading && !casesLoadedOnce).
  if (serverPaginated && !fetchLoadedOnce && fetchLoading) {
    return (
      <div className={`rounded-xl border ${t.card} flex items-center justify-center py-16`}>
        <RefreshCw aria-hidden="true" className={`h-5 w-5 animate-spin ${t.textMuted}`} />
        <span className={`ml-3 text-sm ${t.textSub}`}>Loading cases…</span>
      </div>
    );
  }
  if (serverPaginated && fetchError) {
    return (
      <div
        className={`rounded-xl border p-4 flex items-center gap-3 ${dark ? "bg-red-900/20 border-red-800 text-red-400" : "bg-red-50 border-red-200 text-red-700"}`}
        role="alert"
      >
        <span className="text-sm">Failed to load cases: {fetchError}</span>
        <button onClick={() => setFetchRevision((n) => n + 1)} className="ml-auto text-xs font-medium underline">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={`relative rounded-xl border ${t.card}`}>
      {/* Case Detail Side Panel */}
      {selectedCaseId && (
        <CaseDetailSheet
          caseId={selectedCaseId}
          isOpen={true}
          onClose={() => setSelectedCaseId(null)}
          dropdownOptions={dropdownOptions}
        />
      )}

      {/* Header — sticky to the page scroll (<main>) so the title + filters
          stay visible while scrolling the long list. z above the table's
          own sticky thead. */}
      <div
        className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b ${t.borderLight} sticky top-0 z-40 rounded-t-xl ${stickyBg}`}
      >
        <div className="flex items-center gap-3">
          <div>
            <h3 className={`text-sm font-bold ${t.text}`}>{title}</h3>
            <p className={`text-[13px] ${t.textMuted} mt-0.5`}>
              {totalForPagination} {serverPaginated ? "" : `of ${cases.length} `}cases · Last updated {timeAgo(lastUpdatedAt)}
            </p>
          </div>
          {/* Filter presets */}
          <FilterPresetsMenu
            dark={dark} t={t}
            presetsRef={presetsRef} presetsOpen={presetsOpen} setPresetsOpen={setPresetsOpen}
            presets={presets} presetName={presetName} setPresetName={setPresetName}
            savePreset={savePreset} applyPreset={applyPreset} deletePreset={deletePreset}
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 sm:flex-none">
            <Search
              aria-hidden="true"
              className={`absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 ${t.textMuted}`}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search cases..."
              className={`h-8 pl-8 pr-3 w-full sm:w-48 rounded-md border text-xs outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-600 ${t.inputBg}`}
            />
          </div>
          <select
            value={assignedFilter}
            onChange={(e) => setAssignedFilter(e.target.value)}
            className={`h-8 px-2 rounded-md border text-xs outline-none cursor-pointer ${t.inputBg}`}
          >
            <option value="all">All Agents</option>
            <option value="__unassigned__">Unassigned</option>
            {assignees.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select
            value={feesConfFilter}
            onChange={(e) => setFeesConfFilter(e.target.value)}
            className={`h-8 px-2 rounded-md border text-xs outline-none cursor-pointer ${t.inputBg}`}
          >
            <option value="all">All PIF</option>
            <option value="__none__">No Fees</option>
            {feesConfValues.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <select
            value={claimFilter}
            onChange={(e) => setClaimFilter(e.target.value)}
            className={`h-8 px-2 rounded-md border text-xs outline-none cursor-pointer ${t.inputBg}`}
          >
            <option value="all">All Claims</option>
            <option value="T2">T2</option>
            <option value="T16">T16</option>
            <option value="CONC">CONC</option>
          </select>
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className={`h-8 px-2 rounded-md border text-xs outline-none cursor-pointer ${t.inputBg}`}
          >
            <option value="all">All Levels</option>
            {caseLevelOptions.map((o) => (
              <option key={o.name} value={o.name}>{caseLevelLabel(o.name)}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={`h-8 px-2 rounded-md border text-xs outline-none cursor-pointer ${t.inputBg}`}
          >
            <option value="all">All Status</option>
            <option value="not_started">Not Started</option>
            <option value="started">Started</option>
            <option value="finished">Finished</option>
            <option value="closed">Closed</option>
          </select>
          <select
            value={caseStatusFilter}
            onChange={(e) => setCaseStatusFilter(e.target.value)}
            className={`h-8 px-2 rounded-md border text-xs outline-none cursor-pointer ${t.inputBg}`}
          >
            <option value="all">All Remarks</option>
            {caseStatusValues.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <select
            value={followUpMode}
            onChange={(e) => setFollowUpMode(e.target.value as "all" | "day" | "range")}
            className={`h-8 px-2 rounded-md border text-xs outline-none cursor-pointer ${t.inputBg}`}
            aria-label="Follow-up date filter mode"
          >
            <option value="all">All Follow-Ups</option>
            <option value="day">Specific Day</option>
            <option value="range">Date Range</option>
          </select>
          {followUpMode === "day" && (
            <input
              type="date"
              value={followUpDay}
              onChange={(e) => setFollowUpDay(e.target.value)}
              aria-label="Follow-up day"
              className={`h-8 px-2 rounded-md border text-xs outline-none cursor-pointer ${t.inputBg}`}
            />
          )}
          {followUpMode === "range" && (
            <>
              <input
                type="date"
                value={followUpFrom}
                onChange={(e) => setFollowUpFrom(e.target.value)}
                aria-label="Follow-up from date"
                className={`h-8 px-2 rounded-md border text-xs outline-none cursor-pointer ${t.inputBg}`}
              />
              <span className={`text-xs ${t.textMuted}`}>to</span>
              <input
                type="date"
                value={followUpTo}
                onChange={(e) => setFollowUpTo(e.target.value)}
                aria-label="Follow-up to date"
                className={`h-8 px-2 rounded-md border text-xs outline-none cursor-pointer ${t.inputBg}`}
              />
            </>
          )}
          {approvedByOptions.length > 0 && (
            <select
              value={approverFilter}
              onChange={(e) => { setApproverFilter(e.target.value); setPageIndex(0); }}
              className={`h-8 px-2 rounded-md border text-xs outline-none cursor-pointer ${t.inputBg}`}
            >
              <option value="all">All Approvers</option>
              <option value="georgia">Georgia</option>
              <option value="lori">Lori</option>
              <option value="deanne">DeAnne</option>
            </select>
          )}
          {isAdmin && (
            <>
              <button
                onClick={() => setSyncOpen(true)}
                className={`h-8 px-3 rounded-md text-xs font-semibold flex items-center gap-1.5 ${dark ? "bg-emerald-700 hover:bg-emerald-600 text-white" : "bg-emerald-600 hover:bg-emerald-700 text-white"} transition-colors`}
              >
                <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />{" "}
                Sync from Sheets
              </button>
              <button
                onClick={() => setMyCaseSyncOpen(true)}
                className={`h-8 px-3 rounded-md text-xs font-semibold flex items-center gap-1.5 ${dark ? "bg-indigo-700 hover:bg-indigo-600 text-white" : "bg-indigo-600 hover:bg-indigo-700 text-white"} transition-colors`}
              >
                <Database className="h-3.5 w-3.5" aria-hidden="true" /> Sync
                from MyCase
              </button>
            </>
          )}
          {mode !== "closed" && canCreate && (
            <button
              onClick={() => setAddOpen(true)}
              className={`h-8 px-3 rounded-md text-xs font-semibold flex items-center gap-1.5 ${t.ctaBtn}`}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add Case
            </button>
          )}
          <button
            onClick={downloadCsv}
            disabled={filtered.length === 0}
            title="Export visible cases to CSV"
            aria-label="Export visible cases to CSV"
            className={`h-8 px-3 rounded-md text-xs font-semibold flex items-center gap-1.5 ${t.outlineBtn} disabled:opacity-40`}
          >
            <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
            Export
          </button>
          {isAdmin && (
            <button
              onClick={() => setImportOpen(true)}
              className={`h-8 px-3 rounded-md text-xs font-semibold flex items-center gap-1.5 ${t.outlineBtn}`}
            >
              <Upload className="h-3.5 w-3.5" aria-hidden="true" /> Import
            </button>
          )}
        </div>
      </div>

      {/* Floating batch action pill — fixed to the viewport bottom. Fees
          Closed, Archive, "Add to Overpaid Cases", and Reassign are the
          batch actions. "Add to Overpaid Cases" is also available in closed
          mode — marking overpaid has no is_closed guard server-side, and
          the alternative (unchecking Reopen) would also clear PIF status
          just to flag a case Overpaid.

          "Add to Fee Petitions" is open to all staff on the active table.
          Archive is admin-only. Each button carries its own gate, so the pill
          also has to check that at least one survives — otherwise a member on
          Fees Closed would see a floating bar with nothing to click. */}
      {selectedIds.size > 0 && hasBatchActions && (
        <BatchActionPill
          selectedIds={selectedIds} mode={mode} isAdmin={isAdmin}
          canFinalize={canFinalize} canAddToFeePetitions={canAddToFeePetitions}
          bulkOverpaidError={bulkOverpaidError} bulkReassignError={bulkReassignError}
          bulkCloseConfirmOpen={bulkCloseConfirmOpen} handleBatchFeesClosed={handleBatchFeesClosed}
          bulkOverpaidSaving={bulkOverpaidSaving} handleBatchMarkOverpaid={handleBatchMarkOverpaid}
          feePetitionAddableIds={feePetitionAddableIds}
          bulkFeePetitionSaving={bulkFeePetitionSaving}
          setFeePetitionPending={setFeePetitionPending}
          setFeePetitionConfirmOpen={setFeePetitionConfirmOpen}
          assignedOptions={assignedOptions} bulkReassignSaving={bulkReassignSaving}
          handleBulkReassign={handleBulkReassign}
          archiveConfirmOpen={archiveConfirmOpen} handleBatchArchive={handleBatchArchive}
          setSelectedIds={setSelectedIds}
        />
      )}

      {/* Table — own scroll container (both axes). Vertical scroll lets the
          sticky <thead> rows pin; horizontal scroll keeps the frozen Case
          Name + Assigned columns. max-h caps it so the header stays in view
          on long lists.

          [contain:layout] is load-bearing, not decoration. Cells that are
          sticky on BOTH axes (top-* headers + left-* frozen columns) leak
          their scroll overflow past the capped scroll div into every ancestor:
          this wrapper measured 569px tall but reported a 4,490px scrollHeight,
          which propagated up to <main> and left ~3,800px of empty space to
          scroll through below the table. Containing layout here stops the leak
          at its source — measured live, <main> went 4,724px → 884px.

          Same Chromium quirk CompletedPetitions.tsx works around, but NOT the
          same placement: there it had to go on the outer card. Here the inner
          wrapper is the one that works, and it also repairs the card's own
          scrollHeight, which the outer placement leaves inflated. Verify with
          a live measurement before moving it. */}
      <div className="relative [contain:layout]">
        <div className="overflow-auto max-h-[75vh]">
          <table className="w-full min-w-400">
            <FeeRecordsTableHeader
              dark={dark}
              isClosedMode={isClosedMode}
              canSeeLeaderNotes={canSeeLeaderNotes}
              collapsedGroups={collapsedGroups}
              selectAllRef={selectAllRef}
              toggleSelectAll={toggleSelectAll}
              toggleGroupCollapse={toggleGroupCollapse}
              toggleSort={toggleSort}
              ariaSortFor={ariaSortFor}
              t={t}
              cls={{
                thBase,
                groupBorder,
                checkTh: stickyCheckTh,
                thRefresh: stickyThRefresh,
                groupClosedOn: stickyGroupClosedOn,
                group: stickyGroup,
                group2: stickyGroup2,
                group3: stickyGroup3,
                thRow1: stickyThRow1,
                thClosedOn: stickyThClosedOn,
                th1: stickyTh1,
                th2: stickyTh2,
                th3: stickyTh3,
              }}
            />
            <tbody>
              {paged.map((rawC) => {
                const c = { ...rawC, ...feeOverrides[rawC.id], ...rowOverrides[rawC.id] };
                return (
                  <FeeRecordsTableRow
                    key={c.id}
                    c={c}
                    dark={dark}
                    isClosedMode={isClosedMode}
                    canSeeLeaderNotes={canSeeLeaderNotes}
                    canFinalize={canFinalize}
                    canEditFeeDue={canEditFeeDue}
                    canEditFees={canEditFees}
                    canEditFeesConf={canEditFeesConf}
                    mode={mode}
                    isSelected={selectedIds.has(c.id)}
                    isRefreshing={rowRefreshing.has(c.id)}
                    collapsedGroups={collapsedGroups}
                    feesConfEditId={feesConfEditId}
                    claimEditId={claimEditId}
                    winSheetStatusEditId={winSheetStatusEditId}
                    caseStatusEditId={caseStatusEditId}
                    copiedDateId={copiedDateId}
                    winSheet={{ winSheetEditing, setWinSheetEditing, winSheetDraft, setWinSheetDraft, winSheetSaving, winSheetError, setWinSheetError, handleWinSheetSave }}
                    feeAmount={{ feeAmountEdit, setFeeAmountEdit, feeAmountSaving, feeAmountError, setFeeAmountError, handleFeeAmountSave }}
                    onRowClick={() => setSelectedCaseId(c.id)}
                    onToggleSelection={() => toggleRowSelection(c.id)}
                    onRowRefresh={() => handleRowRefresh(c)}
                    onVarcharChange={(target, field, rowKey, label, value) =>
                      handleVarcharChange(c, target, field, rowKey, label, value)
                    }
                    setFeesConfEditId={setFeesConfEditId}
                    setClaimEditId={setClaimEditId}
                    setWinSheetStatusEditId={setWinSheetStatusEditId}
                    setCaseStatusEditId={setCaseStatusEditId}
                    setCopiedDateId={setCopiedDateId}
                    copyDateTimerRef={copyDateTimerRef}
                    cellValue={(key) => cellValue(c, key)}
                    onReopenConfirm={() => setReopenConfirmCase(c)}
                    onLeaderNotes={() => setLeaderNotesFor({ id: c.id, name: c.name })}
                    onLogsClick={() => setNotesFor({ id: c.id, name: c.name })}
                    onT16FeeAdded={(amount, receivedDate) =>
                      setFeeOverrides((prev) => ({
                        ...prev,
                        [c.id]: { ...prev[c.id], t16FeeReceived: (prev[c.id]?.t16FeeReceived ?? c.t16FeeReceived) + amount, t16FeeReceivedDate: receivedDate },
                      }))
                    }
                    onT16FeeDeleted={(amount) =>
                      setFeeOverrides((prev) => ({
                        ...prev,
                        [c.id]: { ...prev[c.id], t16FeeReceived: Math.max(0, (prev[c.id]?.t16FeeReceived ?? c.t16FeeReceived) - amount) },
                      }))
                    }
                    onT2FeeAdded={(amount, receivedDate) =>
                      setFeeOverrides((prev) => ({
                        ...prev,
                        [c.id]: { ...prev[c.id], t2FeeReceived: (prev[c.id]?.t2FeeReceived ?? c.t2FeeReceived) + amount, t2FeeReceivedDate: receivedDate },
                      }))
                    }
                    onT2FeeDeleted={(amount) =>
                      setFeeOverrides((prev) => ({
                        ...prev,
                        [c.id]: { ...prev[c.id], t2FeeReceived: Math.max(0, (prev[c.id]?.t2FeeReceived ?? c.t2FeeReceived) - amount) },
                      }))
                    }
                    onAuxFeeAdded={(amount, receivedDate) =>
                      setFeeOverrides((prev) => ({
                        ...prev,
                        [c.id]: { ...prev[c.id], auxFeeReceived: (prev[c.id]?.auxFeeReceived ?? c.auxFeeReceived) + amount, auxFeeReceivedDate: receivedDate },
                      }))
                    }
                    onAuxFeeDeleted={(amount) =>
                      setFeeOverrides((prev) => ({
                        ...prev,
                        [c.id]: { ...prev[c.id], auxFeeReceived: Math.max(0, (prev[c.id]?.auxFeeReceived ?? c.auxFeeReceived) - amount) },
                      }))
                    }
                    options={{
                      assigned: assignedOptions,
                      approvedBy: approvedByOptions,
                      feesConfirmation: feesConfirmationOptions,
                      caseLevel: caseLevelOptions,
                      claimType: claimTypeOptions,
                      winSheetStatus: winSheetStatusOptions,
                      caseStatus: caseStatusOptions,
                    }}
                    leaders={leaders}
                    t={t}
                    tdCls={{
                      tdBase,
                      groupBorder,
                      rowBorder,
                      rowHover,
                      checkTd: stickyCheckTd,
                      tdRefresh: stickyTdRefresh,
                      tdClosedOn: stickyTdClosedOn,
                      td1: stickyTd1,
                      td2: stickyTd2,
                      td3: stickyTd3,
                    }}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
        {(isPending || (serverPaginated && fetchLoadedOnce && fetchLoading)) && (
          <div
            className={`absolute inset-0 z-40 flex items-center justify-center gap-2 text-sm font-medium ${t.text} ${dark ? "bg-neutral-900/60" : "bg-white/60"}`}
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading rows…
          </div>
        )}
      </div>

      {totalForPagination > 0 && (
        <div
          className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-t ${t.borderLight}`}
        >
          <p className={`text-[13px] ${t.textMuted}`}>
            Showing {pageStart + 1}–{pageEnd} of {totalForPagination}
          </p>
          <div className="flex items-center gap-2">
            <label
              className={`text-[13px] font-medium ${t.textSub} flex items-center gap-1.5`}
            >
              Rows per page
              <select
                value={String(pageSize)}
                onChange={(e) => {
                  const next =
                    e.target.value === "all" ? "all" : Number(e.target.value);
                  // Non-urgent: render the larger page in a transition so the
                  // UI stays responsive (pending state) rather than freezing.
                  startTransition(() => setPageSize(next));
                }}
                className={`h-8 px-2 rounded-md border text-xs outline-none cursor-pointer ${t.inputBg}`}
              >
                <option value="100">100</option>
                <option value="200">200</option>
                <option value="500">500</option>
                <option value="all">All</option>
              </select>
            </label>
            {pageSize !== "all" && pageCount > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                  disabled={currentPage === 0}
                  className={`h-8 px-3 rounded-md text-xs font-medium border ${t.outlineBtn} disabled:opacity-40`}
                >
                  Prev
                </button>
                <span
                  className={`text-[13px] ${t.textSub} px-1 whitespace-nowrap`}
                >
                  Page {currentPage + 1} of {pageCount}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setPageIndex((p) => Math.min(pageCount - 1, p + 1))
                  }
                  disabled={currentPage >= pageCount - 1}
                  className={`h-8 px-3 rounded-md text-xs font-medium border ${t.outlineBtn} disabled:opacity-40`}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {totalForPagination === 0 && !fetchLoading && (
        <div className="py-16 flex flex-col items-center gap-3">
          <SearchX className={`h-9 w-9 opacity-25 ${t.textMuted}`} aria-hidden="true" />
          {hasActiveFilters ? (
            <>
              <div className="text-center">
                <p className={`text-sm font-semibold ${t.textSub}`}>No cases match your filters</p>
                <p className={`text-[13px] mt-1 ${t.textMuted}`}>
                  {serverPaginated ? "Try adjusting or clearing your filters." : `${cases.length} case${cases.length !== 1 ? "s" : ""} exist${cases.length === 1 ? "s" : ""} — try adjusting or clearing your filters.`}
                </p>
              </div>
              <button
                onClick={clearFilters}
                className={`h-8 px-4 rounded-md text-xs font-semibold border ${t.outlineBtn}`}
              >
                Clear all filters
              </button>
            </>
          ) : (
            <p className={`text-sm ${t.textMuted}`}>No cases yet.</p>
          )}
        </div>
      )}

      {importOpen && (
        <ImportCasesModal
          dark={dark}
          onClose={() => setImportOpen(false)}
          onImported={async () => { await handleRefresh(); }}
        />
      )}

      {addOpen && (
        <AddCaseModal
          dark={dark}
          dropdownOptions={dropdownOptions}
          onClose={() => setAddOpen(false)}
          onCreated={async () => { await handleRefresh(); }}
        />
      )}

      {syncOpen && (
        <SheetSyncModal
          dark={dark}
          onClose={() => setSyncOpen(false)}
          onSynced={async () => { await handleRefresh(); }}
        />
      )}

      {myCaseSyncOpen && (
        <MyCaseSyncModal
          dark={dark}
          onClose={() => setMyCaseSyncOpen(false)}
          onSynced={async () => { await handleRefresh(); }}
        />
      )}


      {notesFor && (
        <NotesModal
          dark={dark}
          caseId={notesFor.id}
          caseName={notesFor.name}
          onClose={() => setNotesFor(null)}
          onChanged={() => handleRefresh()}
        />
      )}

      {leaderNotesFor && (
        <NotesModal
          dark={dark}
          caseId={leaderNotesFor.id}
          caseName={leaderNotesFor.name}
          variant="leader-notes"
          onClose={() => setLeaderNotesFor(null)}
          onChanged={() => handleRefresh()}
        />
      )}

      <ArchiveConfirmDialog
        open={archiveConfirmOpen}
        clientIds={archivePendingIds}
        source={archivePendingSource}
        onClose={() => setArchiveConfirmOpen(false)}
        onArchived={() => {
          setSelectedIds(new Set());
          handleRefresh();
        }}
      />

      <AddToFeePetitionsConfirmDialog
        open={feePetitionConfirmOpen}
        count={feePetitionPending.ids.length}
        selectedCount={feePetitionPending.selectedCount}
        submitting={bulkFeePetitionSaving}
        error={bulkFeePetitionError}
        onConfirm={handleBatchAddToFeePetitions}
        onClose={() => {
          setFeePetitionConfirmOpen(false);
          setBulkFeePetitionError(null);
        }}
      />

      <BulkFeesClosedConfirmDialog
        open={bulkCloseConfirmOpen}
        caseIds={bulkClosePendingIds}
        onClose={() => setBulkCloseConfirmOpen(false)}
        onProgress={() => handleRefresh()}
        onSuccess={() => {
          setSelectedIds(new Set());
          handleRefresh();
        }}
      />

      <FeesClosedConfirmDialog
        open={reopenConfirmCase !== null}
        mode="reopen"
        caseId={reopenConfirmCase?.id ?? null}
        caseName={reopenConfirmCase?.name ?? ""}
        onClose={() => setReopenConfirmCase(null)}
        onConfirmed={() => {
          setReopenConfirmCase(null);
          handleRefresh();
        }}
      />

    </div>
  );
};
