"use client";

import { useState, useMemo, useRef, useEffect, useTransition } from "react";
import { useTheme } from "next-themes";
import { useSession } from "next-auth/react";
import {
  Search,
  ArrowUpDown,
  Upload,
  MessageSquare,
  FileSpreadsheet,
  CloudUpload,
  Database,
  RotateCcw,
  Loader2,
  ExternalLink,
  TrendingDown,
  Plus,
  X,
} from "lucide-react";

import { themeClasses } from "@/lib/theme-classes";
import {
  fmtFull,
  fmtDate,
  fmtClaim,
  STATUS_LABELS,
  getStatusColor,
} from "@/lib/formatters";
import type { CaseRow, ApprovedByOption } from "@/types";
import type { DropdownOptionsByCategory } from "@/hooks/useDashboard";
import { useCapabilities } from "@/hooks/useCapabilities";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import CaseDetailSheet from "./CaseDetailSheet";
import ImportCasesModal from "@/components/modals/ImportCasesModal";
import AddCaseModal from "@/components/modals/AddCaseModal";
import SheetSyncModal from "@/components/modals/SheetSyncModal";
import SheetPushModal from "@/components/modals/SheetPushModal";
import MyCaseSyncModal from "@/components/modals/MyCaseSyncModal";
import NotesModal from "@/components/modals/NotesModal";
import { AcknowledgeAndCloseDialog } from "./AcknowledgeAndCloseDialog";

interface FeeRecordsTableProps {
  cases: CaseRow[];
  dateRange?: { from: string; to: string } | null;
  onImported?: () => Promise<void> | void;
  // Active dashboard (default) shows the Approved By dropdown + close flow.
  // "closed" renders a read-only view for /fees-closed.
  mode?: "active" | "closed";
  approvedByOptions?: ApprovedByOption[];
  // Per-category option lists for the other inline dropdowns (Assigned,
  // Fees Confirmation, Case Status). Optional — an empty list just yields
  // an empty dropdown with the current value preserved as a fallback.
  dropdownOptions?: DropdownOptionsByCategory;
}

// Whether a field lives on the `fee_records` row or the `cases` row.
// The PATCH endpoint splits its body into `feeFields` and `caseFields`.
type CaseField = "claimTypeLabel" | "levelWon";
type FeeField =
  | "assignedTo"
  | "approvedBy"
  | "feesConfirmation"
  | "caseStatus"
  | "winSheetStatus";

// Sends a single-field patch and logs an activity entry so the side
// panel keeps a trail of who changed what.
const patchSingleField = async (
  caseId: number,
  target: "case" | "fee",
  field: CaseField | FeeField,
  value: string | null,
  fieldLabel: string,
) => {
  const payload =
    target === "case"
      ? { caseFields: { [field]: value } }
      : { feeFields: { [field]: value } };
  await fetch(`/api/cases/${caseId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload,
      logMessage: value
        ? `${fieldLabel} set to "${value}"`
        : `${fieldLabel} cleared`,
    }),
  });
};

const currency = (v: number) => (v > 0 ? fmtFull(v) : "—");
const dateStr = (d: string | null) => (d ? fmtDate(d) : "—");

const PIF_COLORS = (pif: string | null, dark: boolean) => {
  if (pif === "YES")
    return dark
      ? "bg-emerald-900/40 text-emerald-400"
      : "bg-emerald-50 text-emerald-700";
  if (pif === "PENDING")
    return dark
      ? "bg-amber-900/40 text-amber-400"
      : "bg-amber-50 text-amber-700";
  if (pif === "NO")
    return dark ? "bg-red-900/40 text-red-400" : "bg-red-50 text-red-700";
  return dark
    ? "bg-neutral-800 text-neutral-500"
    : "bg-neutral-100 text-neutral-400";
};

const AGING_COLORS = (cat: string | null, dark: boolean) => {
  if (cat === ">60") return dark ? "text-red-400" : "text-red-600";
  if (cat === "≤60") return dark ? "text-emerald-400" : "text-emerald-600";
  return dark ? "text-neutral-500" : "text-neutral-400";
};

type SortKey =
  | "name"
  | "assigned"
  | "date"
  | "expected"
  | "paid"
  | "daysAfterApproval";
type SortDir = "asc" | "desc";

export const FeeRecordsTable = ({
  cases,
  dateRange,
  onImported,
  mode = "active",
  approvedByOptions = [],
  dropdownOptions = {},
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

  const assignedOptions = dropdownOptions.assigned_to ?? [];
  const feesConfirmationOptions = dropdownOptions.fees_confirmation ?? [];
  const caseStatusOptions = dropdownOptions.case_status ?? [];
  const caseLevelOptions = dropdownOptions.case_level ?? [];
  const claimTypeOptions = dropdownOptions.claim_type ?? [];
  const winSheetStatusOptions = dropdownOptions.win_sheet_status ?? [];

  // Keys for varchar cells that support inline-edit dropdowns. `status` is
  // the win_sheet_status row field; `level`/`claim` live on the cases row.
  type DropdownRowKey =
    | "assigned"
    | "approvedBy"
    | "feesConfirmation"
    | "caseStatus"
    | "level"
    | "claim"
    | "status";

  // Optimistic overrides keyed by case id — the row value is patched
  // immediately on change, and the server reconciles on the next refresh.
  const [pending, setPending] = useState<
    Record<number, Partial<Record<DropdownRowKey, string>>>
  >({});

  // Case row whose dropdown change should prompt the "mark closed?" modal.
  // Currently triggered by Fees Confirmation = "Paid In Full"; the dialog is
  // field-agnostic so it can host future triggers without another branch.
  const [ackTarget, setAckTarget] = useState<{
    caseId: number;
    caseName: string;
    triggerField: string;
    triggerValue: string;
    triggerLabel: string;
  } | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [assignedFilter, setAssignedFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  // Client-side pagination over the filtered+sorted set. Page size is
  // user-selectable; "all" renders the whole filtered set on one page.
  const [pageSize, setPageSize] = useState<number | "all">(100);
  const [pageIndex, setPageIndex] = useState(0);
  // Switching to a large page size ("All") renders many rows at once. Marking
  // the change a transition keeps the click responsive (shows a pending state)
  // instead of hard-freezing the main thread during that render.
  const [isPending, startTransition] = useTransition();
  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [myCaseSyncOpen, setMyCaseSyncOpen] = useState(false);
  const [pushOpen, setPushOpen] = useState(false);
  const [notesFor, setNotesFor] = useState<{ id: number; name: string } | null>(
    null,
  );
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [overpaidOverrides, setOverpaidOverrides] = useState<
    Record<number, boolean>
  >({});
  const [batchLoading, setBatchLoading] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const toggleRowSelection = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const allSelected =
      filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id));
    setSelectedIds(
      allSelected ? new Set() : new Set(filtered.map((c) => c.id)),
    );
  };

  const handleBatchOverpaid = async (mark: boolean) => {
    if (selectedIds.size === 0 || batchLoading) return;
    const ids = Array.from(selectedIds);
    setBatchLoading(true);
    // Optimistic override only when marking — removing the flag should not
    // immediately change the visual state in this table (it takes effect on
    // the next data refresh so the row highlight isn't stripped mid-session).
    if (mark) {
      setOverpaidOverrides((prev) => {
        const next = { ...prev };
        ids.forEach((id) => {
          next[id] = true;
        });
        return next;
      });
    }
    try {
      const res = await fetch("/api/cases/bulk-overpaid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseIds: ids, markedOverpaid: mark }),
      });
      if (!res.ok)
        throw new Error(`Failed to update overpaid flag (${res.status})`);
      setSelectedIds(new Set());
    } catch (err) {
      if (mark) {
        setOverpaidOverrides((prev) => {
          const next = { ...prev };
          ids.forEach((id) => {
            delete next[id];
          });
          return next;
        });
      }
      window.alert((err as Error).message);
    } finally {
      setBatchLoading(false);
    }
  };

  // Unique assignees for filter dropdown
  const assignees = useMemo(() => {
    const set = new Set(cases.map((c) => c.assigned).filter((a) => a !== "—"));
    return Array.from(set).sort();
  }, [cases]);

  const filtered = useMemo(() => {
    let d = [...cases];
    // Date range filter (approval date)
    if (dateRange) {
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
    if (assignedFilter !== "all")
      d = d.filter((c) => c.assigned === assignedFilter);

    d.sort((a, b) => {
      let av: string | number, bv: string | number;
      switch (sortKey) {
        case "name":
          av = a.name;
          bv = b.name;
          break;
        case "assigned":
          // Empty assignees ("—") sort last regardless of direction so the
          // unassigned bucket never breaks up real groups in the middle.
          av = a.assigned === "—" ? "￿" : a.assigned.toLowerCase();
          bv = b.assigned === "—" ? "￿" : b.assigned.toLowerCase();
          break;
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
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return d;
  }, [
    cases,
    search,
    statusFilter,
    assignedFilter,
    sortKey,
    sortDir,
    dateRange,
  ]);

  // ── Pagination ────────────────────────────────────────────────────────────
  const pageCount =
    pageSize === "all" ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize));
  // Clamp so a stale pageIndex (e.g. after a filter shrinks the set) never
  // renders an empty page — fall back to the last valid page instead.
  const currentPage = Math.min(pageIndex, pageCount - 1);
  const pageStart = pageSize === "all" ? 0 : currentPage * pageSize;
  const pageEnd =
    pageSize === "all"
      ? filtered.length
      : Math.min(pageStart + pageSize, filtered.length);
  const paged =
    pageSize === "all" ? filtered : filtered.slice(pageStart, pageEnd);

  // Reset to the first page whenever the result set or page size changes.
  useEffect(() => {
    setPageIndex(0);
  }, [
    search,
    statusFilter,
    assignedFilter,
    sortKey,
    sortDir,
    pageSize,
    dateRange,
  ]);

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
      // Text columns default to A→Z; numeric/date columns default to newest/highest.
      setSortDir(key === "name" || key === "assigned" ? "asc" : "desc");
    }
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
    const value = next || null;
    setPending((prev) => ({
      ...prev,
      [c.id]: { ...prev[c.id], [rowKey]: value ?? "" },
    }));
    try {
      await patchSingleField(c.id, target, field, value, fieldLabel);
    } catch (err) {
      console.error(`Failed to update ${fieldLabel}:`, err);
      setPending((prev) => {
        const copy = { ...prev };
        if (copy[c.id]) {
          const { [rowKey]: _drop, ...rest } = copy[c.id];
          void _drop;
          copy[c.id] = rest;
        }
        return copy;
      });
    }
  };

  // Track per-row reopen state so the button can show a spinner + disable
  // while the PATCH is in flight. Cleared on refresh (the row leaves the
  // closed list).
  const [reopeningId, setReopeningId] = useState<number | null>(null);

  // Reopen a closed case from /fees-closed: flip isClosed=false (the API
  // also stamps closed_at NULL) and clear feesConfirmation so the case
  // doesn't immediately re-trigger the "mark closed?" modal when the user
  // sees it back on the dashboard.
  const handleReopen = async (c: CaseRow) => {
    if (reopeningId !== null) return;
    if (
      !window.confirm(
        `Reopen "${c.name}"? It will move back to the active dashboard and Fees Confirmation will be cleared.`,
      )
    )
      return;
    setReopeningId(c.id);
    try {
      const res = await fetch(`/api/cases/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feeFields: { isClosed: false, feesConfirmation: null },
          logMessage:
            "Reopened from Fees Closed — moved back to the active dashboard and Fees Confirmation cleared.",
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Reopen failed (${res.status})`);
      }
      await onImported?.();
    } catch (err) {
      console.error("Failed to reopen case:", err);
      window.alert((err as Error).message);
    } finally {
      setReopeningId(null);
    }
  };

  const rowBorder = dark ? "border-neutral-800/50" : "border-neutral-100";
  const rowHover = dark ? "hover:bg-neutral-800/40" : "hover:bg-neutral-50/80";

  // Opaque bg matching the card surface so sticky cells never show the
  // scrolled content bleeding through. `stickyHover` lets frozen body cells
  // inherit the row's hover from the <tr> (which carries `group`). The
  // second frozen column gets a right divider marking the freeze boundary.
  const stickyBg = dark ? "bg-neutral-900" : "bg-white";
  const stickyHover = dark
    ? "group-hover:bg-neutral-800/40"
    : "group-hover:bg-neutral-50/80";
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
    ? "sm:bg-neutral-900 sm:group-hover:bg-neutral-800/40"
    : "sm:bg-white sm:group-hover:bg-neutral-50/80";
  // Frozen-column widths: Case Name stays frozen on all screens (narrower on
  // mobile); Assigned is 160px on desktop. The desktop left-48 offset below
  // assumes Case Name's sm width (w-48 = 192px).
  // max-w pins the frozen columns to an exact box so the sticky, opaque
  // Case Name cell can't overflow in front of (cover) the Assigned column.
  const colNameW = `w-36 min-w-36 max-w-36 sm:w-48 sm:min-w-48 sm:max-w-48`;
  const colAssignedW = `w-32 min-w-32 max-w-32 sm:w-40 sm:min-w-40 sm:max-w-40`;

  // Every header cell is sticky vertically by default — the column-header
  // row (row 2) parks 32px down. Baking this into `thBase` means the ~24
  // column-header cells need no per-cell annotation. The group-header row
  // (row 1) overrides to the very top with `top-0!`.
  // `h-8` forces each header row to exactly 32px so row 2's `top-8` sits
  // flush against row 1's bottom — no gap for body rows to peek through.
  const thBase = `h-8 px-3 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap sticky top-8 z-20 ${stickyBg}`;
  const tdBase = `py-2 px-3 text-[12px] whitespace-nowrap`;
  const groupBorder = dark
    ? "border-l border-neutral-700/50"
    : "border-l border-neutral-200";

  // Group-header row (row 1) pins to the very top, overriding thBase's top-8.
  const stickyThRow1 = `top-0!`;
  // Frozen column headers (row 2). Case Name freezes left on all screens;
  // Assigned freezes left only at sm+ (on mobile it keeps thBase's sticky-top
  // but scrolls horizontally). Corner cells use z-30 to cover both single-axis
  // sticky neighbors during scroll.
  const stickyTh1 = `left-10 z-30 ${colNameW} ${nameDivider}`;
  // z-30 only at sm+ (where Assigned is a frozen corner). On mobile Assigned
  // scrolls, so it must stay at thBase's z-20 — BELOW the frozen Case Name
  // (z-30) — otherwise it paints over the frozen "front index" on scroll.
  const stickyTh2 = `sm:left-[14.5rem] sm:z-30 ${colAssignedW} ${stickyDivider}`;
  // "Case Info" group label is split into two cells so each part's freeze
  // matches the column beneath it: the label over Case Name freezes on all
  // screens (stickyGroup); the blank part over Assigned freezes only at sm+
  // (stickyGroup2). This keeps "Case Info" pinned over the frozen Case Name
  // column on mobile instead of letting T16/T2 labels slide over it.
  const stickyGroup = `top-0! left-10 z-30 ${colNameW} ${nameDivider}`;
  // Same as stickyTh2: z-30 only at sm+ so on mobile this scrolls below the
  // frozen "Case Info" label (z-30) instead of covering it.
  const stickyGroup2 = `top-0! sm:left-[14.5rem] sm:z-30 ${colAssignedW} ${stickyDivider}`;
  const stickyTd1 = `sticky left-10 z-10 ${colNameW} ${stickyBg} ${stickyHover} ${nameDivider}`;
  const stickyTd2 = `sm:sticky sm:left-[14.5rem] sm:z-10 ${colAssignedW} ${stickyColBg} ${stickyDivider}`;
  const stickyCheckTh = `sticky top-0! left-0 z-30 w-10 min-w-10 ${stickyBg}`;
  const stickyCheckTd = `sticky left-0 z-10 w-10 min-w-10 ${stickyBg} ${stickyHover}`;

  return (
    <div className={`relative rounded-xl border ${t.card}`}>
      {/* Case Detail Side Panel */}
      {selectedCaseId && (
        <CaseDetailSheet
          caseId={selectedCaseId}
          isOpen={true}
          onClose={() => setSelectedCaseId(null)}
        />
      )}

      {/* Header — sticky to the page scroll (<main>) so the title + filters
          stay visible while scrolling the long list. z above the table's
          own sticky thead. */}
      <div
        className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b ${t.borderLight} sticky top-0 z-40 rounded-t-xl ${stickyBg}`}
      >
        <div>
          <h3 className={`text-sm font-bold ${t.text}`}>Master Fee Records</h3>
          <p className={`text-[11px] ${t.textMuted} mt-0.5`}>
            {filtered.length} of {cases.length} cases
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
              placeholder="Search cases..."
              className={`h-8 pl-8 pr-3 w-full sm:w-48 rounded-md border text-xs outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-600 ${t.inputBg}`}
            />
          </div>
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
            value={assignedFilter}
            onChange={(e) => setAssignedFilter(e.target.value)}
            className={`h-8 px-2 rounded-md border text-xs outline-none cursor-pointer ${t.inputBg}`}
          >
            <option value="all">All Agents</option>
            {assignees.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
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
              <button
                onClick={() => setPushOpen(true)}
                className={`h-8 px-3 rounded-md text-xs font-semibold flex items-center gap-1.5 ${dark ? "bg-blue-700 hover:bg-blue-600 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"} transition-colors`}
              >
                <CloudUpload className="h-3.5 w-3.5" aria-hidden="true" /> Push
                to Sheets
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
            onClick={() => setImportOpen(true)}
            className={`h-8 px-3 rounded-md text-xs font-semibold flex items-center gap-1.5 ${t.outlineBtn}`}
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" /> Import
          </button>
        </div>
      </div>

      {/* Floating batch action pill — anchored to the bottom of the table card */}
      {selectedIds.size > 0 && canFinalize && (
        <div className="pointer-events-none absolute bottom-12 left-0 right-0 z-50 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-gray-900 px-4 py-2.5 shadow-2xl ring-1 ring-white/10 dark:bg-gray-800">
            <span className="text-[11px] font-semibold text-gray-300 pr-1 border-r border-white/20 mr-1">
              {selectedIds.size} selected
            </span>
            <button
              onClick={() => handleBatchOverpaid(true)}
              disabled={batchLoading}
              className="h-7 px-3 rounded-full text-[11px] font-semibold flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-gray-900 transition-colors disabled:opacity-50"
            >
              {batchLoading ? (
                <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
              ) : (
                <TrendingDown aria-hidden="true" className="h-3 w-3" />
              )}
              Mark as Overpaid
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              aria-label="Clear selection"
              className="h-7 w-7 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-gray-300 transition-colors ml-1"
            >
              <X aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Table — own scroll container (both axes). Vertical scroll lets the
          sticky <thead> rows pin; horizontal scroll keeps the frozen Case
          Name + Assigned columns. max-h caps it so the header stays in view
          on long lists. */}
      <div className="relative">
        <div className="overflow-auto max-h-[75vh]">
          <table className="w-full min-w-400">
            {/* Group headers */}
            <thead>
              <tr className={`border-b ${t.borderLight}`}>
                {/* Select-all checkbox spans both header rows */}
                <th rowSpan={2} className={`${stickyCheckTh} px-3 text-center`}>
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    onChange={toggleSelectAll}
                    aria-label="Select all rows"
                    className="h-3.5 w-3.5 cursor-pointer accent-indigo-500"
                  />
                </th>
                {/* "Case Info" label is split per column so each part's freeze
                  matches the column below it: the label cell over Case Name
                  freezes on all screens; the blank cell over Assigned freezes
                  only at sm+. Then a scrolling 4-col spacer covers Level /
                  Claim / Approval / Status. */}
                <th
                  className={`${thBase} ${t.textSub} text-left ${stickyGroup}`}
                >
                  Case Info
                </th>
                <th
                  aria-hidden="true"
                  className={`${thBase} ${t.textSub} text-left ${stickyGroup2}`}
                />
                <th
                  colSpan={5}
                  aria-hidden="true"
                  className={`${thBase} ${t.textSub} text-left ${stickyThRow1}`}
                />

                <th
                  colSpan={5}
                  className={`${thBase} text-center ${groupBorder} ${stickyThRow1} ${dark ? "text-indigo-400" : "text-indigo-600"}`}
                >
                  T16
                </th>
                <th
                  colSpan={5}
                  className={`${thBase} text-center ${groupBorder} ${stickyThRow1} ${dark ? "text-blue-400" : "text-blue-600"}`}
                >
                  T2
                </th>
                <th
                  colSpan={5}
                  className={`${thBase} text-center ${groupBorder} ${stickyThRow1} ${dark ? "text-violet-400" : "text-violet-600"}`}
                >
                  AUX
                </th>
                <th
                  colSpan={3}
                  className={`${thBase} text-center ${groupBorder} ${stickyThRow1} ${t.textSub}`}
                >
                  Totals
                </th>
                <th
                  colSpan={mode === "closed" ? 8 : 7}
                  className={`${thBase} text-center ${groupBorder} ${stickyThRow1} ${t.textSub}`}
                >
                  Workflow
                </th>
              </tr>
              {/* Column headers */}
              <tr className={`border-b ${t.borderLight}`}>
                <th
                  className={`${thBase} ${t.textSub} text-left cursor-pointer ${stickyTh1}`}
                  onClick={() => toggleSort("name")}
                >
                  <span className="flex items-center gap-1">
                    Case Name <ArrowUpDown className="h-3 w-3" />
                  </span>
                </th>
                <th
                  className={`${thBase} ${t.textSub} text-left cursor-pointer ${stickyTh2}`}
                  onClick={() => toggleSort("assigned")}
                  title="Sort to group rows by assignee"
                >
                  <span className="flex items-center gap-1">
                    Assigned <ArrowUpDown className="h-3 w-3" />
                  </span>
                </th>
                <th className={`${thBase} ${t.textSub} text-left`}>Level</th>
                <th className={`${thBase} ${t.textSub} text-left`}>Claim</th>
                <th
                  className={`${thBase} ${t.textSub} text-left cursor-pointer`}
                  onClick={() => toggleSort("date")}
                >
                  <span className="flex items-center gap-1">
                    Approval <ArrowUpDown className="h-3 w-3" />
                  </span>
                </th>
                <th className={`${thBase} ${t.textSub} text-left`}>Status</th>
                <th className={`${thBase} ${t.textSub} text-left`}>
                  Win Sheet
                </th>

                {/* T16 */}
                <th
                  className={`${thBase} ${t.textSub} text-right ${groupBorder}`}
                >
                  Retro
                </th>
                <th className={`${thBase} ${t.textSub} text-right`}>Fee Due</th>
                <th className={`${thBase} ${t.textSub} text-right`}>
                  Rec&apos;d
                </th>
                <th className={`${thBase} ${t.textSub} text-right`}>Pending</th>
                <th className={`${thBase} ${t.textSub} text-left`}>
                  Date Rec&apos;d
                </th>

                {/* T2 */}
                <th
                  className={`${thBase} ${t.textSub} text-right ${groupBorder}`}
                >
                  Retro
                </th>
                <th className={`${thBase} ${t.textSub} text-right`}>Fee Due</th>
                <th className={`${thBase} ${t.textSub} text-right`}>
                  Rec&apos;d
                </th>
                <th className={`${thBase} ${t.textSub} text-right`}>Pending</th>
                <th className={`${thBase} ${t.textSub} text-left`}>
                  Date Rec&apos;d
                </th>

                {/* AUX */}
                <th
                  className={`${thBase} ${t.textSub} text-right ${groupBorder}`}
                >
                  Retro
                </th>
                <th className={`${thBase} ${t.textSub} text-right`}>Fee Due</th>
                <th className={`${thBase} ${t.textSub} text-right`}>
                  Rec&apos;d
                </th>
                <th className={`${thBase} ${t.textSub} text-right`}>Pending</th>
                <th className={`${thBase} ${t.textSub} text-left`}>
                  Date Rec&apos;d
                </th>

                {/* Totals */}
                <th
                  className={`${thBase} ${t.textSub} text-right ${groupBorder}`}
                >
                  Retro Due
                </th>
                <th
                  className={`${thBase} ${t.textSub} text-right cursor-pointer`}
                  onClick={() => toggleSort("expected")}
                >
                  <span className="flex items-center justify-end gap-1">
                    Expected <ArrowUpDown className="h-3 w-3" />
                  </span>
                </th>
                <th
                  className={`${thBase} ${t.textSub} text-right cursor-pointer`}
                  onClick={() => toggleSort("paid")}
                >
                  <span className="flex items-center justify-end gap-1">
                    Paid <ArrowUpDown className="h-3 w-3" />
                  </span>
                </th>

                {/* Workflow */}
                <th
                  className={`${thBase} ${t.textSub} text-center ${groupBorder}`}
                >
                  PIF
                </th>
                <th className={`${thBase} ${t.textSub} text-left`}>
                  Approved By
                </th>
                <th className={`${thBase} ${t.textSub} text-left`}>
                  Fees Conf
                </th>
                <th className={`${thBase} ${t.textSub} text-left`}>
                  Case Status
                </th>
                <th className={`${thBase} ${t.textSub} text-left`}>
                  Recent Update
                </th>
                <th className={`${thBase} ${t.textSub} text-center`}>Notes</th>
                <th
                  className={`${thBase} ${t.textSub} text-right cursor-pointer`}
                  onClick={() => toggleSort("daysAfterApproval")}
                >
                  <span className="flex items-center justify-end gap-1">
                    Days <ArrowUpDown className="h-3 w-3" />
                  </span>
                </th>
                {mode === "closed" && (
                  <th className={`${thBase} ${t.textSub} text-center`}>
                    Action
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {paged.map((c) => {
                const isOverpaid = overpaidOverrides[c.id] ?? c.markedOverpaid;
                return (
                  <tr
                    key={c.id}
                    onClick={() => setSelectedCaseId(c.id)}
                    className={`border-b ${rowBorder} ${rowHover} transition-colors cursor-pointer group ${isOverpaid ? "border-l-2 border-l-amber-500" : ""}`}
                  >
                    {/* Checkbox */}
                    <td
                      className={`${stickyCheckTd} px-3 text-center`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(c.id)}
                        onChange={() => toggleRowSelection(c.id)}
                        aria-label={`Select ${c.name}`}
                        className="h-3.5 w-3.5 cursor-pointer accent-indigo-500"
                      />
                    </td>
                    {/* Case Info — first two columns are frozen */}
                    <td
                      className={`${tdBase} ${t.text} font-semibold truncate ${stickyTd1}`}
                      title={c.name}
                    >
                      {c.name}
                    </td>
                    <td
                      className={`${tdBase} ${t.textSub} ${stickyTd2}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {mode === "closed" ? (
                        c.assigned
                      ) : (
                        <select
                          value={cellValue(c, "assigned")}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) =>
                            handleVarcharChange(
                              c,
                              "fee",
                              "assignedTo",
                              "assigned",
                              "Assigned To",
                              e.target.value,
                            )
                          }
                          className={`h-7 px-2 rounded-md border text-[11px] outline-none cursor-pointer ${t.inputBg}`}
                          title={
                            assignedOptions.length === 0
                              ? "No options configured — add them in Settings"
                              : undefined
                          }
                        >
                          <option value="">— Select —</option>
                          {(() => {
                            const v = cellValue(c, "assigned");
                            return (
                              v &&
                              !assignedOptions.some((o) => o.name === v) && (
                                <option value={v}>{v}</option>
                              )
                            );
                          })()}
                          {assignedOptions
                            .filter(
                              (o) =>
                                o.isActive ||
                                o.name === cellValue(c, "assigned"),
                            )
                            .map((o) => (
                              <option key={o.id} value={o.name}>
                                {o.name}
                              </option>
                            ))}
                        </select>
                      )}
                    </td>
                    {/* Level — varchar; lives on the cases row. */}
                    <td
                      className={`${tdBase}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {mode === "closed" ? (
                        <span
                          className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${t.pillBg}`}
                        >
                          {cellValue(c, "level") || "—"}
                        </span>
                      ) : (
                        <select
                          value={cellValue(c, "level")}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) =>
                            handleVarcharChange(
                              c,
                              "case",
                              "levelWon",
                              "level",
                              "Case Level",
                              e.target.value,
                            )
                          }
                          className={`h-7 px-2 rounded-md border text-[11px] outline-none cursor-pointer ${t.inputBg}`}
                          title={
                            caseLevelOptions.length === 0
                              ? "No options configured — add them in Settings"
                              : undefined
                          }
                        >
                          <option value="">— Select —</option>
                          {(() => {
                            const v = cellValue(c, "level");
                            return (
                              v &&
                              !caseLevelOptions.some((o) => o.name === v) && (
                                <option value={v}>{v}</option>
                              )
                            );
                          })()}
                          {caseLevelOptions
                            .filter(
                              (o) =>
                                o.isActive || o.name === cellValue(c, "level"),
                            )
                            .map((o) => (
                              <option key={o.id} value={o.name}>
                                {o.name}
                              </option>
                            ))}
                        </select>
                      )}
                    </td>
                    {/* Claim — varchar; lives on the cases row. */}
                    <td
                      className={`${tdBase}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {mode === "closed" ? (
                        <span
                          className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${t.pillBg}`}
                        >
                          {fmtClaim(cellValue(c, "claim")) || "—"}
                        </span>
                      ) : (
                        <select
                          value={cellValue(c, "claim")}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) =>
                            handleVarcharChange(
                              c,
                              "case",
                              "claimTypeLabel",
                              "claim",
                              "Claim Type",
                              e.target.value,
                            )
                          }
                          className={`h-7 px-2 rounded-md border text-[11px] outline-none cursor-pointer ${t.inputBg}`}
                          title={
                            claimTypeOptions.length === 0
                              ? "No options configured — add them in Settings"
                              : undefined
                          }
                        >
                          <option value="">— Select —</option>
                          {(() => {
                            const v = cellValue(c, "claim");
                            return (
                              v &&
                              !claimTypeOptions.some((o) => o.name === v) && (
                                <option value={v}>{v}</option>
                              )
                            );
                          })()}
                          {claimTypeOptions
                            .filter(
                              (o) =>
                                o.isActive || o.name === cellValue(c, "claim"),
                            )
                            .map((o) => (
                              <option key={o.id} value={o.name}>
                                {o.name}
                              </option>
                            ))}
                        </select>
                      )}
                    </td>
                    <td className={`${tdBase} ${t.textSub} tabular-nums`}>
                      {dateStr(c.date)}
                    </td>
                    {/* Win-sheet Status — varchar; lives on fee_records. */}
                    <td
                      className={`${tdBase}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {mode === "closed" ? (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${getStatusColor(cellValue(c, "status"), dark)}`}
                        >
                          {STATUS_LABELS[cellValue(c, "status")] ||
                            cellValue(c, "status") ||
                            "—"}
                        </span>
                      ) : (
                        <select
                          value={cellValue(c, "status")}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) =>
                            handleVarcharChange(
                              c,
                              "fee",
                              "winSheetStatus",
                              "status",
                              "Win Sheet Status",
                              e.target.value,
                            )
                          }
                          className={`h-7 px-2 rounded-md border text-[11px] outline-none cursor-pointer ${t.inputBg}`}
                          title={
                            winSheetStatusOptions.length === 0
                              ? "No options configured — add them in Settings"
                              : undefined
                          }
                        >
                          <option value="">— Select —</option>
                          {(() => {
                            const v = cellValue(c, "status");
                            return (
                              v &&
                              !winSheetStatusOptions.some(
                                (o) => o.name === v,
                              ) && <option value={v}>{v}</option>
                            );
                          })()}
                          {winSheetStatusOptions
                            .filter(
                              (o) =>
                                o.isActive || o.name === cellValue(c, "status"),
                            )
                            .map((o) => (
                              <option key={o.id} value={o.name}>
                                {o.name}
                              </option>
                            ))}
                        </select>
                      )}
                    </td>

                    {/* Win Sheet Link */}
                    <td
                      className={`${tdBase}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {c.winSheetLink ? (
                        <a
                          href={c.winSheetLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-500 hover:underline"
                        >
                          <ExternalLink
                            className="h-3 w-3"
                            aria-hidden="true"
                          />
                          {c.winSheetLinkText || "Open"}
                        </a>
                      ) : (
                        <span className={`text-[11px] ${t.textMuted}`}>—</span>
                      )}
                    </td>

                    {/* T16 */}
                    <td
                      className={`${tdBase} text-right tabular-nums ${t.text} ${groupBorder}`}
                    >
                      {currency(c.t16Retro)}
                    </td>
                    <td
                      className={`${tdBase} text-right tabular-nums ${t.text}`}
                    >
                      {currency(c.t16FeeDue)}
                    </td>
                    <td
                      className={`${tdBase} text-right tabular-nums ${c.t16FeeReceived > 0 ? "text-emerald-500 font-medium" : t.textMuted}`}
                    >
                      {currency(c.t16FeeReceived)}
                    </td>
                    <td
                      className={`${tdBase} text-right tabular-nums ${c.t16Pending > 0 ? (dark ? "text-amber-400" : "text-amber-600") : t.textMuted}`}
                    >
                      {currency(c.t16Pending)}
                    </td>
                    <td className={`${tdBase} ${t.textSub} tabular-nums`}>
                      {dateStr(c.t16FeeReceivedDate)}
                    </td>

                    {/* T2 */}
                    <td
                      className={`${tdBase} text-right tabular-nums ${t.text} ${groupBorder}`}
                    >
                      {currency(c.t2Retro)}
                    </td>
                    <td
                      className={`${tdBase} text-right tabular-nums ${t.text}`}
                    >
                      {currency(c.t2FeeDue)}
                    </td>
                    <td
                      className={`${tdBase} text-right tabular-nums ${c.t2FeeReceived > 0 ? "text-emerald-500 font-medium" : t.textMuted}`}
                    >
                      {currency(c.t2FeeReceived)}
                    </td>
                    <td
                      className={`${tdBase} text-right tabular-nums ${c.t2Pending > 0 ? (dark ? "text-amber-400" : "text-amber-600") : t.textMuted}`}
                    >
                      {currency(c.t2Pending)}
                    </td>
                    <td className={`${tdBase} ${t.textSub} tabular-nums`}>
                      {dateStr(c.t2FeeReceivedDate)}
                    </td>

                    {/* AUX */}
                    <td
                      className={`${tdBase} text-right tabular-nums ${t.text} ${groupBorder}`}
                    >
                      {currency(c.auxRetro)}
                    </td>
                    <td
                      className={`${tdBase} text-right tabular-nums ${t.text}`}
                    >
                      {currency(c.auxFeeDue)}
                    </td>
                    <td
                      className={`${tdBase} text-right tabular-nums ${c.auxFeeReceived > 0 ? "text-emerald-500 font-medium" : t.textMuted}`}
                    >
                      {currency(c.auxFeeReceived)}
                    </td>
                    <td
                      className={`${tdBase} text-right tabular-nums ${c.auxPending > 0 ? (dark ? "text-amber-400" : "text-amber-600") : t.textMuted}`}
                    >
                      {currency(c.auxPending)}
                    </td>
                    <td className={`${tdBase} ${t.textSub} tabular-nums`}>
                      {dateStr(c.auxFeeReceivedDate)}
                    </td>

                    {/* Totals */}
                    <td
                      className={`${tdBase} text-right tabular-nums font-medium ${t.text} ${groupBorder}`}
                    >
                      {currency(c.totalRetroDue)}
                    </td>
                    <td
                      className={`${tdBase} text-right tabular-nums font-semibold ${t.text}`}
                    >
                      {currency(c.expected)}
                    </td>
                    <td
                      className={`${tdBase} text-right tabular-nums font-semibold ${c.paid > 0 ? "text-emerald-500" : t.textMuted}`}
                    >
                      {currency(c.paid)}
                    </td>

                    {/* Workflow */}
                    <td className={`${tdBase} text-center ${groupBorder}`}>
                      {c.pif && (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${PIF_COLORS(c.pif, dark)}`}
                        >
                          {c.pif}
                        </span>
                      )}
                    </td>
                    <td
                      className={`${tdBase} ${t.textSub}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {mode === "closed" || !canFinalize ? (
                        cellValue(c, "approvedBy") || "—"
                      ) : (
                        <select
                          value={cellValue(c, "approvedBy")}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) =>
                            handleVarcharChange(
                              c,
                              "fee",
                              "approvedBy",
                              "approvedBy",
                              "Approved By",
                              e.target.value,
                            )
                          }
                          className={`h-7 px-2 rounded-md border text-[11px] outline-none cursor-pointer ${t.inputBg}`}
                          title={
                            approvedByOptions.length === 0
                              ? "No options configured — add them in Settings"
                              : undefined
                          }
                        >
                          <option value="">— Select —</option>
                          {(() => {
                            const v = cellValue(c, "approvedBy");
                            return (
                              v &&
                              !approvedByOptions.some((o) => o.name === v) && (
                                <option value={v}>{v}</option>
                              )
                            );
                          })()}
                          {approvedByOptions
                            .filter(
                              (o) =>
                                o.isActive ||
                                o.name === cellValue(c, "approvedBy"),
                            )
                            .map((o) => (
                              <option key={o.id} value={o.name}>
                                {o.name}
                              </option>
                            ))}
                        </select>
                      )}
                    </td>
                    {/* Fees Confirmation */}
                    <td
                      className={`${tdBase} ${t.textSub}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {mode === "closed" ? (
                        cellValue(c, "feesConfirmation") || "—"
                      ) : (
                        <select
                          value={cellValue(c, "feesConfirmation")}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            const next = e.target.value;
                            // "Paid In Full" prompts the close flow, which is a
                            // finalize action — only offer it to users who can
                            // finalize. Others just set the field value.
                            if (
                              canFinalize &&
                              next &&
                              next.toLowerCase() === "paid in full" &&
                              next !== cellValue(c, "feesConfirmation")
                            ) {
                              setAckTarget({
                                caseId: c.id,
                                caseName: c.name,
                                triggerField: "feesConfirmation",
                                triggerValue: next,
                                triggerLabel: "Fees Confirmation",
                              });
                              return;
                            }
                            handleVarcharChange(
                              c,
                              "fee",
                              "feesConfirmation",
                              "feesConfirmation",
                              "Fees Confirmation",
                              next,
                            );
                          }}
                          className={`h-7 px-2 rounded-md border text-[11px] outline-none cursor-pointer ${t.inputBg}`}
                          title={
                            feesConfirmationOptions.length === 0
                              ? "No options configured — add them in Settings"
                              : undefined
                          }
                        >
                          <option value="">— Select —</option>
                          {(() => {
                            const v = cellValue(c, "feesConfirmation");
                            return (
                              v &&
                              !feesConfirmationOptions.some(
                                (o) => o.name === v,
                              ) && <option value={v}>{v}</option>
                            );
                          })()}
                          {feesConfirmationOptions
                            .filter(
                              (o) =>
                                o.isActive ||
                                o.name === cellValue(c, "feesConfirmation"),
                            )
                            .map((o) => (
                              <option key={o.id} value={o.name}>
                                {o.name}
                              </option>
                            ))}
                        </select>
                      )}
                    </td>
                    {/* Case Status */}
                    <td
                      className={`${tdBase} ${t.textSub}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {mode === "closed" ? (
                        cellValue(c, "caseStatus") || "—"
                      ) : (
                        <select
                          value={cellValue(c, "caseStatus")}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) =>
                            handleVarcharChange(
                              c,
                              "fee",
                              "caseStatus",
                              "caseStatus",
                              "Case Status",
                              e.target.value,
                            )
                          }
                          className={`h-7 px-2 rounded-md border text-[11px] outline-none cursor-pointer ${t.inputBg}`}
                          title={
                            caseStatusOptions.length === 0
                              ? "No options configured — add them in Settings"
                              : undefined
                          }
                        >
                          <option value="">— Select —</option>
                          {(() => {
                            const v = cellValue(c, "caseStatus");
                            return (
                              v &&
                              !caseStatusOptions.some((o) => o.name === v) && (
                                <option value={v}>{v}</option>
                              )
                            );
                          })()}
                          {caseStatusOptions
                            .filter(
                              (o) =>
                                o.isActive ||
                                o.name === cellValue(c, "caseStatus"),
                            )
                            .map((o) => (
                              <option key={o.id} value={o.name}>
                                {o.name}
                              </option>
                            ))}
                        </select>
                      )}
                    </td>
                    <td className={`${tdBase} ${t.textSub} max-w-65`}>
                      {c.update && c.update !== "—" ? (
                        <HoverCard openDelay={150} closeDelay={50}>
                          <HoverCardTrigger asChild>
                            <span className="block truncate">{c.update}</span>
                          </HoverCardTrigger>
                          {/* Portaled + collision-aware so a long update can't
                          run off the viewport in windowed mode; capped to
                          90vw so it always fits. */}
                          <HoverCardContent
                            align="start"
                            collisionPadding={12}
                            className="w-auto max-w-[min(28rem,90vw)] p-3 text-[12px] leading-relaxed whitespace-pre-wrap wrap-break-word"
                          >
                            {c.update}
                          </HoverCardContent>
                        </HoverCard>
                      ) : (
                        <span className="block truncate">{c.update}</span>
                      )}
                    </td>
                    <td className={`${tdBase} text-center`}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setNotesFor({ id: c.id, name: c.name });
                        }}
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          c.notesCount > 0
                            ? dark
                              ? "bg-blue-900/40 text-blue-400 hover:bg-blue-900/60"
                              : "bg-blue-50 text-blue-700 hover:bg-blue-100"
                            : dark
                              ? "bg-neutral-800 text-neutral-500 hover:bg-neutral-700"
                              : "bg-neutral-100 text-neutral-400 hover:bg-neutral-200"
                        }`}
                        title={
                          c.notesCount > 0
                            ? `View ${c.notesCount} note${c.notesCount === 1 ? "" : "s"}`
                            : "No notes yet"
                        }
                      >
                        <MessageSquare className="h-3 w-3" />
                        {c.notesCount}
                      </button>
                    </td>
                    <td
                      className={`${tdBase} text-right tabular-nums font-medium ${AGING_COLORS(c.approvalCategory, dark)}`}
                    >
                      {c.daysAfterApproval !== null ? (
                        <span>
                          {c.daysAfterApproval}d{" "}
                          <span className="text-[9px] opacity-70">
                            {c.approvalCategory}
                          </span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    {mode === "closed" && (
                      <td
                        className={`${tdBase} text-center`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {canFinalize ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleReopen(c);
                            }}
                            disabled={reopeningId !== null}
                            className={`inline-flex items-center gap-1 h-7 px-2 rounded-md text-[11px] font-semibold border ${t.outlineBtn} disabled:opacity-40`}
                            title="Move this case back to the active dashboard and clear Fees Confirmation"
                          >
                            {reopeningId === c.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3 w-3" />
                            )}
                            Reopen
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {isPending && (
          <div
            className={`absolute inset-0 z-40 flex items-center justify-center gap-2 text-sm font-medium ${t.text} ${dark ? "bg-neutral-900/60" : "bg-white/60"}`}
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading rows…
          </div>
        )}
      </div>

      {filtered.length > 0 && (
        <div
          className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-t ${t.borderLight}`}
        >
          <p className={`text-[11px] ${t.textMuted}`}>
            Showing {pageStart + 1}–{pageEnd} of {filtered.length}
          </p>
          <div className="flex items-center gap-2">
            <label
              className={`text-[11px] font-medium ${t.textSub} flex items-center gap-1.5`}
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
                  className={`text-[11px] ${t.textSub} px-1 whitespace-nowrap`}
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

      {filtered.length === 0 && (
        <div className={`py-12 text-center text-sm ${t.textMuted}`}>
          No cases match your filters.
        </div>
      )}

      {importOpen && (
        <ImportCasesModal
          dark={dark}
          onClose={() => setImportOpen(false)}
          onImported={async () => {
            if (onImported) await onImported();
          }}
        />
      )}

      {addOpen && (
        <AddCaseModal
          dark={dark}
          dropdownOptions={dropdownOptions}
          onClose={() => setAddOpen(false)}
          onCreated={async () => {
            if (onImported) await onImported();
          }}
        />
      )}

      {syncOpen && (
        <SheetSyncModal
          dark={dark}
          onClose={() => setSyncOpen(false)}
          onSynced={async () => {
            if (onImported) await onImported();
          }}
        />
      )}

      {myCaseSyncOpen && (
        <MyCaseSyncModal
          dark={dark}
          onClose={() => setMyCaseSyncOpen(false)}
          onSynced={async () => {
            if (onImported) await onImported();
          }}
        />
      )}

      {pushOpen && (
        <SheetPushModal
          dark={dark}
          onClose={() => setPushOpen(false)}
          onPushed={() => {}}
        />
      )}

      {notesFor && (
        <NotesModal
          dark={dark}
          caseId={notesFor.id}
          caseName={notesFor.name}
          onClose={() => setNotesFor(null)}
          onChanged={() => onImported?.()}
        />
      )}

      <AcknowledgeAndCloseDialog
        open={ackTarget !== null}
        caseId={ackTarget?.caseId ?? null}
        caseName={ackTarget?.caseName ?? ""}
        triggerField={ackTarget?.triggerField ?? ""}
        triggerValue={ackTarget?.triggerValue ?? ""}
        triggerLabel={ackTarget?.triggerLabel ?? ""}
        onClose={() => setAckTarget(null)}
        onAcknowledged={() => {
          setAckTarget(null);
          onImported?.();
        }}
      />
    </div>
  );
};
