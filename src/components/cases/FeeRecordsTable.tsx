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
  Database,
  Loader2,
  ExternalLink,
  Pencil,
  Check,
  Plus,
  X,
  Archive,
} from "lucide-react";

import { themeClasses } from "@/lib/theme-classes";
import { FeePaymentPanel } from "@/components/cases/FeePaymentPanel";
import {
  fmtFull,
  fmtDate,
  fmtClaimLong,
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
import MyCaseSyncModal from "@/components/modals/MyCaseSyncModal";
import NotesModal from "@/components/modals/NotesModal";
import { ArchiveConfirmDialog } from "./ArchiveConfirmDialog";
import { FeesClosedConfirmDialog } from "./FeesClosedConfirmDialog";
import { Listbox } from "@/components/shared/Listbox";
import { caseLevelVisual } from "@/lib/case-level-icons";
import { buildListboxOptions } from "@/lib/listbox-options";
import { teamRowTint } from "@/lib/team-colors";
import { memberRowTint } from "@/lib/member-colors";

const FEES_CONF_COLORS: Record<string, { badge: string; badgeDark: string }> = {
  "Paid In Full":           { badge: "bg-emerald-50 text-emerald-700 border-emerald-300",  badgeDark: "bg-emerald-900/40 text-emerald-300 border-emerald-700" },
  "Partial Payment":        { badge: "bg-red-50 text-red-700 border-red-300",              badgeDark: "bg-red-900/40 text-red-300 border-red-700"             },
  "Pending (full/partial)": { badge: "bg-blue-50 text-blue-700 border-blue-300",           badgeDark: "bg-blue-900/40 text-blue-300 border-blue-700"          },
  "No Fees Due":            { badge: "bg-neutral-100 text-black border-neutral-400",        badgeDark: "bg-neutral-800 text-white border-neutral-600"          },
  "Overpaid":               { badge: "bg-amber-50 text-amber-700 border-amber-300",        badgeDark: "bg-amber-900/40 text-amber-300 border-amber-700"       },
};
const FEES_CONF_FALLBACK = { badge: "bg-neutral-100 text-neutral-500 border-neutral-300", badgeDark: "bg-neutral-700 text-neutral-300 border-neutral-600" };

const CLAIM_TYPE_COLORS: Record<string, { badge: string; badgeDark: string }> = {
  "T16":  { badge: "bg-blue-50 text-blue-700 border-blue-300",     badgeDark: "bg-blue-900/40 text-blue-300 border-blue-700"     },
  "T2":   { badge: "bg-violet-50 text-violet-700 border-violet-300", badgeDark: "bg-violet-900/40 text-violet-300 border-violet-700" },
  "CONC": { badge: "bg-amber-50 text-amber-700 border-amber-300",   badgeDark: "bg-amber-900/40 text-amber-300 border-amber-700"   },
};
const CLAIM_TYPE_FALLBACK = { badge: "bg-neutral-100 text-neutral-500 border-neutral-300", badgeDark: "bg-neutral-700 text-neutral-300 border-neutral-600" };

function ClaimTypeBadge({ value, dark }: { value: string | null | undefined; dark: boolean }) {
  if (!value) return <span className="text-neutral-400">—</span>;
  const colors = CLAIM_TYPE_COLORS[value] ?? CLAIM_TYPE_FALLBACK;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border whitespace-nowrap ${dark ? colors.badgeDark : colors.badge}`}>
      {value}
    </span>
  );
}

function FeesConfBadge({ value, dark }: { value: string | null | undefined; dark: boolean }) {
  if (!value) return <span className="text-neutral-400">—</span>;
  const colors = FEES_CONF_COLORS[value] ?? FEES_CONF_FALLBACK;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border whitespace-nowrap ${dark ? colors.badgeDark : colors.badge}`}>
      {value}
    </span>
  );
}

// Keyed on what's actually stored in fee_records.win_sheet_status today —
// a mix of the dropdown-configured "Started"/"Finished" and older
// lowercase/underscored values written by the MyCase sync ("not_started",
// "started", "closed").
const WIN_SHEET_STATUS_COLORS: Record<string, { badge: string; badgeDark: string }> = {
  "not_started": { badge: "bg-neutral-100 text-neutral-600 border-neutral-300", badgeDark: "bg-neutral-700 text-neutral-300 border-neutral-600" },
  "started":     { badge: "bg-amber-50 text-amber-700 border-amber-300",       badgeDark: "bg-amber-900/40 text-amber-300 border-amber-700"     },
  "Started":     { badge: "bg-amber-50 text-amber-700 border-amber-300",       badgeDark: "bg-amber-900/40 text-amber-300 border-amber-700"     },
  "closed":      { badge: "bg-emerald-50 text-emerald-700 border-emerald-300", badgeDark: "bg-emerald-900/40 text-emerald-300 border-emerald-700" },
  "Finished":    { badge: "bg-emerald-50 text-emerald-700 border-emerald-300", badgeDark: "bg-emerald-900/40 text-emerald-300 border-emerald-700" },
};
const WIN_SHEET_STATUS_FALLBACK = { badge: "bg-neutral-100 text-neutral-500 border-neutral-300", badgeDark: "bg-neutral-700 text-neutral-300 border-neutral-600" };

function WinSheetStatusBadge({ value, dark }: { value: string | null | undefined; dark: boolean }) {
  if (!value) return <span className="text-neutral-400">—</span>;
  const colors = WIN_SHEET_STATUS_COLORS[value] ?? WIN_SHEET_STATUS_FALLBACK;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border whitespace-nowrap ${dark ? colors.badgeDark : colors.badge}`}>
      {value}
    </span>
  );
}

// Keyed on both the dropdown-configured categories and the pre-dropdown
// free-text values still sitting on older fee_records rows (e.g. "Ready for
// Review" vs. the current "Ready for Review (Specialist)"). One-off custom
// remarks not listed here fall through to the neutral fallback below.
const CASE_STATUS_COLORS: Record<string, { badge: string; badgeDark: string }> = {
  "Ready for Review (Specialist)": { badge: "bg-blue-50 text-blue-700 border-blue-300",       badgeDark: "bg-blue-900/40 text-blue-300 border-blue-700"       },
  "Ready for Review":              { badge: "bg-blue-50 text-blue-700 border-blue-300",       badgeDark: "bg-blue-900/40 text-blue-300 border-blue-700"       },
  "Pending for Review":            { badge: "bg-blue-50 text-blue-700 border-blue-300",       badgeDark: "bg-blue-900/40 text-blue-300 border-blue-700"       },
  "Reviewing (Management)":        { badge: "bg-violet-50 text-violet-700 border-violet-300", badgeDark: "bg-violet-900/40 text-violet-300 border-violet-700" },
  "For follow up":                 { badge: "bg-amber-50 text-amber-700 border-amber-300",     badgeDark: "bg-amber-900/40 text-amber-300 border-amber-700"    },
  "For follow-up":                 { badge: "bg-amber-50 text-amber-700 border-amber-300",     badgeDark: "bg-amber-900/40 text-amber-300 border-amber-700"    },
  "Overpaid but ready to close":   { badge: "bg-amber-50 text-amber-700 border-amber-300",     badgeDark: "bg-amber-900/40 text-amber-300 border-amber-700"    },
  "Not ready to close":            { badge: "bg-red-50 text-red-700 border-red-300",           badgeDark: "bg-red-900/40 text-red-300 border-red-700"          },
  "Incomplete win sheet":          { badge: "bg-red-50 text-red-700 border-red-300",           badgeDark: "bg-red-900/40 text-red-300 border-red-700"          },
  "Missing fees":                  { badge: "bg-red-50 text-red-700 border-red-300",           badgeDark: "bg-red-900/40 text-red-300 border-red-700"          },
  "NEED AUX FEE":                  { badge: "bg-red-50 text-red-700 border-red-300",           badgeDark: "bg-red-900/40 text-red-300 border-red-700"          },
};
const CASE_STATUS_FALLBACK = { badge: "bg-neutral-100 text-neutral-500 border-neutral-300", badgeDark: "bg-neutral-700 text-neutral-300 border-neutral-600" };

function CaseStatusBadge({ value, dark }: { value: string | null | undefined; dark: boolean }) {
  if (!value) return <span className="text-neutral-400">—</span>;
  const colors = CASE_STATUS_COLORS[value] ?? CASE_STATUS_FALLBACK;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border whitespace-nowrap ${dark ? colors.badgeDark : colors.badge}`}>
      {value}
    </span>
  );
}

interface FeeAmountCellProps {
  active: boolean;
  value: number;
  draft: string;
  saving: boolean;
  error: string | null;
  canEdit: boolean;
  saveLabel: string;
  inputBg: string;
  hoverCls: string;
  textMuted: string;
  onEdit: () => void;
  onDraftChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

function FeeAmountCell({
  active, value, draft, saving, error, canEdit,
  saveLabel, inputBg, hoverCls, textMuted,
  onEdit, onDraftChange, onSave, onCancel,
}: FeeAmountCellProps) {
  if (active) {
    return (
      <div className="flex flex-col items-end gap-1 min-w-[110px]">
        <div className="flex items-center gap-0.5">
          <input
            type="number" min="0" step="0.01" value={draft} autoFocus
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onSave(); if (e.key === "Escape") onCancel(); }}
            className={`h-6 px-1.5 rounded border text-[11px] outline-none w-24 text-right ${inputBg}`}
          />
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin ml-0.5" aria-hidden="true" />
          ) : (
            <>
              <button type="button" onClick={onSave} className="p-0.5 rounded text-emerald-500 hover:bg-emerald-500/10 transition-colors" aria-label={`Save ${saveLabel}`}>
                <Check className="h-3 w-3" aria-hidden="true" />
              </button>
              <button type="button" onClick={onCancel} className={`p-0.5 rounded transition-colors ${hoverCls}`} aria-label="Cancel">
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </>
          )}
        </div>
        {error && <p role="alert" className="text-[10px] text-red-500">{error}</p>}
      </div>
    );
  }
  return (
    <div className="flex items-center justify-end gap-1">
      <span>{currency(value)}</span>
      {canEdit && (
        <button type="button" onClick={onEdit} className={`opacity-0 group-hover:opacity-100 transition-colors p-0.5 rounded ${hoverCls}`} aria-label={`Edit ${saveLabel}`}>
          <Pencil className={`h-3 w-3 ${textMuted}`} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

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
  // Team members (name + team + role) — colors the Assigned dropdown by
  // team, and highlights team_lead members by team in the Approved By
  // dropdown so it's obvious who can actually sign off on closing a case.
  teamMembers?: { name: string; team: string | null; role: string }[];
  // Optional approver filter rendered in the toolbar before the Sync button.
  // Only the master-fees page passes this; fees-closed omits it.
  approverFilter?: string;
  onApproverFilterChange?: (value: string) => void;
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
  | "daysAfterApproval"
  | "closedAt";
type SortDir = "asc" | "desc";

export const FeeRecordsTable = ({
  cases,
  dateRange,
  onImported,
  mode = "active",
  approvedByOptions = [],
  dropdownOptions = {},
  teamMembers = [],
  approverFilter,
  onApproverFilterChange,
}: FeeRecordsTableProps) => {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const t = themeClasses(dark);
  const { data: session } = useSession();
  const isAdmin =
    session?.user?.role === "admin" || session?.user?.role === "system_admin";
  const isLead = session?.user?.role === "lead";
  const { can } = useCapabilities();
  const canCreate = can("case.create");
  const canFinalize = can("case.finalize");
  const canEditFeeDue = can("case.update");
  const canEditFees = can("fees.edit");

  const assignedOptions = dropdownOptions.assigned_to ?? [];
  const feesConfirmationOptions = dropdownOptions.fees_confirmation ?? [];
  const caseStatusOptions = dropdownOptions.case_status ?? [];
  const caseLevelOptions = dropdownOptions.case_level ?? [];
  const claimTypeOptions = dropdownOptions.claim_type ?? [];
  const winSheetStatusOptions = dropdownOptions.win_sheet_status ?? [];
  const leaders = teamMembers.filter((m) => m.role === "team_lead");

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

  // Case targeted by the Fees Closed / Reopen confirmation dialogs.
  const [closeConfirmCase, setCloseConfirmCase] = useState<CaseRow | null>(null);
  const [reopenConfirmCase, setReopenConfirmCase] = useState<CaseRow | null>(null);

  // Win sheet link inline edit state.
  const [winSheetEditing, setWinSheetEditing] = useState<number | null>(null);
  const [winSheetDraft, setWinSheetDraft] = useState<{ url: string; text: string }>({ url: "", text: "" });
  const [winSheetSaving, setWinSheetSaving] = useState<number | null>(null);
  const [winSheetError, setWinSheetError] = useState<string | null>(null);
  const winSheetAbortRef = useRef<AbortController | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [assignedFilter, setAssignedFilter] = useState("all");
  const [feesConfFilter, setFeesConfFilter] = useState("all");
  const [claimFilter, setClaimFilter] = useState("all");
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
  const [feesConfEditId, setFeesConfEditId] = useState<number | null>(null);
  const [claimEditId, setClaimEditId] = useState<number | null>(null);
  const [winSheetStatusEditId, setWinSheetStatusEditId] = useState<number | null>(null);
  const [caseStatusEditId, setCaseStatusEditId] = useState<number | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [myCaseSyncOpen, setMyCaseSyncOpen] = useState(false);
  const [notesFor, setNotesFor] = useState<{ id: number; name: string } | null>(
    null,
  );
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [archivePendingIds, setArchivePendingIds] = useState<number[]>([]);
  const [archivePendingSource, setArchivePendingSource] = useState<
    "active_sheet" | "fees_closed_sheet"
  >("active_sheet");
  // Optimistic overrides for fee payment totals after panel add/delete.
  const [feeOverrides, setFeeOverrides] = useState<
    Record<number, Partial<Pick<CaseRow, "t16Retro" | "t16FeeDue" | "t16Pending" | "t16FeeReceived" | "t16FeeReceivedDate" | "t2Retro" | "t2FeeDue" | "t2Pending" | "t2FeeReceived" | "t2FeeReceivedDate" | "auxRetro" | "auxFeeDue" | "auxPending" | "auxFeeReceived" | "auxFeeReceivedDate">>>
  >({});
  type FeeAmountField = "t16Retro" | "t16FeeDue" | "t16Pending" | "t2Retro" | "t2FeeDue" | "t2Pending" | "auxRetro" | "auxFeeDue" | "auxPending";
  const [feeAmountEdit, setFeeAmountEdit] = useState<{
    caseId: number;
    field: FeeAmountField;
    draft: string;
  } | null>(null);
  const [feeAmountSaving, setFeeAmountSaving] = useState(false);
  const [feeAmountError, setFeeAmountError] = useState<string | null>(null);
  const feeAmountAbortRef = useRef<AbortController | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const patchAbortRef = useRef<Map<string, AbortController>>(new Map());
  useEffect(() => {
    const abortMap = patchAbortRef.current;
    const feeAmountRef = feeAmountAbortRef;
    return () => {
      for (const ctrl of abortMap.values()) ctrl.abort();
      abortMap.clear();
      feeAmountRef.current?.abort();
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

  const toggleSelectAll = () => {
    const allSelected =
      filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id));
    setSelectedIds(
      allSelected ? new Set() : new Set(filtered.map((c) => c.id)),
    );
  };

  const handleBatchArchive = () => {
    if (selectedIds.size === 0) return;
    setArchivePendingIds(Array.from(selectedIds));
    setArchivePendingSource(
      mode === "closed" ? "fees_closed_sheet" : "active_sheet",
    );
    setArchiveConfirmOpen(true);
  };

  // Unique assignees for filter dropdown
  const assignees = useMemo(() => {
    const set = new Set(cases.map((c) => c.assigned).filter((a) => a !== "—"));
    return Array.from(set).sort();
  }, [cases]);

  // Unique fees-confirmation values present in the data for the filter dropdown.
  // Derived from cases rather than feesConfirmationOptions so inactive values
  // that are already set on records remain filterable.
  const feesConfValues = useMemo(() => {
    const set = new Set(
      cases.map((c) => c.feesConfirmation).filter((v): v is string => v != null),
    );
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
    if (feesConfFilter !== "all")
      d = d.filter((c) => c.feesConfirmation === feesConfFilter);
    if (claimFilter !== "all")
      d = d.filter((c) => c.claim === claimFilter);

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
        case "closedAt":
          av = a.closedAt || "";
          bv = b.closedAt || "";
          break;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return d;
  }, [
    cases,
    pending,
    search,
    statusFilter,
    assignedFilter,
    feesConfFilter,
    claimFilter,
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
    feesConfFilter,
    claimFilter,
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

  const handleWinSheetSave = async (c: CaseRow) => {
    if (winSheetSaving != null) return;
    winSheetAbortRef.current?.abort();
    const controller = new AbortController();
    winSheetAbortRef.current = controller;
    setWinSheetSaving(c.id);
    setWinSheetError(null);
    try {
      const res = await fetch(`/api/cases/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feeFields: {
            winSheetLink: winSheetDraft.url ?? null,
            winSheetLinkText: winSheetDraft.text ?? null,
          },
          logMessage: "Win Sheet link updated.",
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Save failed (${res.status})`);
      }
      setWinSheetEditing(null);
      onImported?.();
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setWinSheetError((err as Error).message);
    } finally {
      if (!controller.signal.aborted) setWinSheetSaving(null);
    }
  };

  const handleFeeAmountSave = async () => {
    if (!feeAmountEdit || feeAmountSaving) return;
    const amount = parseFloat(feeAmountEdit.draft);
    if (isNaN(amount) || amount < 0) {
      setFeeAmountError("Enter a valid amount (0 or more).");
      return;
    }
    feeAmountAbortRef.current?.abort();
    const controller = new AbortController();
    feeAmountAbortRef.current = controller;
    setFeeAmountSaving(true);
    setFeeAmountError(null);
    const { caseId, field } = feeAmountEdit;
    const labelMap: Record<FeeAmountField, string> = {
      t16Retro: "T16 Retro", t16FeeDue: "T16 Fee Due", t16Pending: "T16 Pending",
      t2Retro: "T2 Retro",   t2FeeDue: "T2 Fee Due",   t2Pending: "T2 Pending",
      auxRetro: "AUX Retro", auxFeeDue: "AUX Fee Due",  auxPending: "AUX Pending",
    };
    try {
      const res = await fetch(`/api/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feeFields: { [field]: amount },
          logMessage: `${labelMap[field]} updated to ${fmtFull(amount)}`,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `Save failed (${res.status})`);
      }
      setFeeOverrides((prev) => ({
        ...prev,
        [caseId]: { ...prev[caseId], [field]: amount },
      }));
      setFeeAmountEdit(null);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setFeeAmountError((err as Error).message);
    } finally {
      if (!controller.signal.aborted) setFeeAmountSaving(false);
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
  const isClosedMode = mode === "closed";

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
  // sticky neighbors during scroll. In "closed" mode, Closed On sits in front
  // of Case Name, so Case Name/Assigned/Fees Conf's left offsets all shift
  // right by colClosedOnW's 112px (7rem) — 40+112=152px=9.5rem, etc.
  const stickyTh1 = isClosedMode
    ? `left-[9.5rem] z-30 ${colNameW} ${nameDivider}`
    : `left-10 z-30 ${colNameW} ${nameDivider}`;
  // z-30 only at sm+ (where Assigned is a frozen corner). On mobile Assigned
  // scrolls, so no sticky-left. Freeze boundary moved to Fees Conf, so no divider here.
  // scrolls, so it must stay at thBase's z-20 — BELOW the frozen Case Name
  // (z-30) — otherwise it paints over the frozen "front index" on scroll.
  // Assigned: no divider — freeze boundary now sits after Fees Conf.
  const stickyTh2 = isClosedMode
    ? `sm:left-[21.5rem] sm:z-30 ${colAssignedW}`
    : `sm:left-[14.5rem] sm:z-30 ${colAssignedW}`;
  // "Case Info" group label is split into cells so each part's freeze matches
  // the column beneath it. Three frozen columns: Case Name, Assigned, Fees
  // Conf (four, with Closed On, in "closed" mode).
  const stickyGroup = isClosedMode
    ? `top-0! left-[9.5rem] z-30 ${colNameW} ${nameDivider}`
    : `top-0! left-10 z-30 ${colNameW} ${nameDivider}`;
  const stickyGroup2 = isClosedMode
    ? `top-0! sm:left-[21.5rem] sm:z-30 ${colAssignedW}`
    : `top-0! sm:left-[14.5rem] sm:z-30 ${colAssignedW}`;
  // Fees Conf is the 3rd frozen column (left offset = 40 + 192 + 160 = 392px
  // = 24.5rem; + colClosedOnW's 112px = 504px = 31.5rem in "closed" mode).
  const stickyGroup3 = isClosedMode
    ? `top-0! sm:left-[31.5rem] sm:z-30 ${colFeesConfW} ${stickyDivider}`
    : `top-0! sm:left-[24.5rem] sm:z-30 ${colFeesConfW} ${stickyDivider}`;
  const stickyTh3 = isClosedMode
    ? `sm:left-[31.5rem] sm:z-30 ${colFeesConfW} ${stickyDivider}`
    : `sm:left-[24.5rem] sm:z-30 ${colFeesConfW} ${stickyDivider}`;
  const stickyTd1 = isClosedMode
    ? `sticky left-[9.5rem] z-10 ${colNameW} ${stickyBg} ${stickyHover} ${nameDivider}`
    : `sticky left-10 z-10 ${colNameW} ${stickyBg} ${stickyHover} ${nameDivider}`;
  const stickyTd2 = isClosedMode
    ? `sm:sticky sm:left-[21.5rem] sm:z-10 ${colAssignedW} ${stickyColBg}`
    : `sm:sticky sm:left-[14.5rem] sm:z-10 ${colAssignedW} ${stickyColBg}`;
  const stickyTd3 = isClosedMode
    ? `sm:sticky sm:left-[31.5rem] sm:z-10 ${colFeesConfW} ${stickyColBg} ${stickyDivider}`
    : `sm:sticky sm:left-[24.5rem] sm:z-10 ${colFeesConfW} ${stickyColBg} ${stickyDivider}`;
  const stickyCheckTh = `sticky top-0! left-0 z-30 w-10 min-w-10 ${stickyBg}`;
  const stickyCheckTd = `sticky left-0 z-10 w-10 min-w-10 ${stickyBg} ${stickyHover}`;
  // Closed On — new frozen column, "closed" mode only, sitting exactly where
  // Case Name used to (left-10) now that it's first.
  const stickyGroupClosedOn = `top-0! left-10 z-30 ${colClosedOnW}`;
  const stickyThClosedOn = `left-10 z-30 ${colClosedOnW}`;
  const stickyTdClosedOn = `sticky left-10 z-10 ${colClosedOnW} ${stickyBg} ${stickyHover}`;

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
        <div>
          <h3 className={`text-sm font-bold ${t.text}`}>Master Fee Records</h3>
          <p className={`text-[11px] ${t.textMuted} mt-0.5`}>
            {filtered.length} of {cases.length} cases
          </p>
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
            <option value="all">All Fees Conf</option>
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
          {onApproverFilterChange && (
            <select
              value={approverFilter ?? "all"}
              onChange={(e) => onApproverFilterChange(e.target.value)}
              className={`h-8 px-2 rounded-md border text-xs outline-none cursor-pointer ${t.inputBg}`}
            >
              <option value="all">Cases Approved</option>
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
            onClick={() => setImportOpen(true)}
            className={`h-8 px-3 rounded-md text-xs font-semibold flex items-center gap-1.5 ${t.outlineBtn}`}
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" /> Import
          </button>
        </div>
      </div>

      {/* Floating batch action pill — fixed to the viewport bottom. Archive is
          the only batch action; marking a case overpaid is Fees Conf-only
          now (see the "Fees Confirmation" column) so it's a single,
          unambiguous path instead of two ways to do the same thing. */}
      {selectedIds.size > 0 && isAdmin && (
        <div className="pointer-events-none fixed bottom-6 left-0 right-0 z-50 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-gray-900 px-4 py-2.5 shadow-2xl ring-1 ring-white/10 dark:bg-gray-800">
            <span className="text-[11px] font-semibold text-gray-300 pr-1 border-r border-white/20 mr-1">
              {selectedIds.size} selected
            </span>
            <button
              onClick={handleBatchArchive}
              disabled={archiveConfirmOpen}
              className="h-7 px-3 rounded-full text-[11px] font-semibold flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 text-white transition-colors disabled:opacity-50"
            >
              <Archive aria-hidden="true" className="h-3 w-3" />
              Archive
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
                {/* Closed On sits in front of Case Info's group, "closed" mode
                    only — same blank-spacer pattern as the Assigned/Fees Conf
                    cells below, just with nothing to label. */}
                {isClosedMode && (
                  <th
                    aria-hidden="true"
                    className={`${thBase} ${t.textSub} text-left ${stickyGroupClosedOn}`}
                  />
                )}
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
                  aria-hidden="true"
                  className={`${thBase} ${t.textSub} text-left ${stickyGroup3}`}
                />
                <th
                  colSpan={6}
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
                  colSpan={isClosedMode ? 5 : 6}
                  className={`${thBase} text-center ${groupBorder} ${stickyThRow1} ${t.textSub}`}
                >
                  Workflow
                </th>
              </tr>
              {/* Column headers */}
              <tr className={`border-b ${t.borderLight}`}>
                {isClosedMode && (
                  <th
                    className={`${thBase} ${t.textSub} text-left cursor-pointer ${stickyThClosedOn}`}
                    onClick={() => toggleSort("closedAt")}
                  >
                    <span className="flex items-center gap-1">
                      Closed On <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                    </span>
                  </th>
                )}
                <th
                  className={`${thBase} ${t.textSub} text-left cursor-pointer ${stickyTh1}`}
                  onClick={() => toggleSort("name")}
                >
                  <span className="flex items-center gap-1">
                    Case Name <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                  </span>
                </th>
                <th
                  className={`${thBase} ${t.textSub} text-left cursor-pointer ${stickyTh2}`}
                  onClick={() => toggleSort("assigned")}
                  title="Sort to group rows by assignee"
                >
                  <span className="flex items-center gap-1">
                    Assigned <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                  </span>
                </th>
                <th className={`${thBase} ${t.textSub} text-left ${stickyTh3}`}>
                  Fees Conf
                </th>
                <th className={`${thBase} ${t.textSub} text-left`}>Fees Closed</th>
                <th className={`${thBase} ${t.textSub} text-left`}>Level</th>
                <th className={`${thBase} ${t.textSub} text-left`}>Claim</th>
                <th
                  className={`${thBase} ${t.textSub} text-left cursor-pointer`}
                  onClick={() => toggleSort("date")}
                >
                  <span className="flex items-center gap-1">
                    Approval <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                  </span>
                </th>
                <th className={`${thBase} ${t.textSub} text-left`}>Win Sheet Status</th>
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
                    Expected <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                  </span>
                </th>
                <th
                  className={`${thBase} ${t.textSub} text-right cursor-pointer`}
                  onClick={() => toggleSort("paid")}
                >
                  <span className="flex items-center justify-end gap-1">
                    Paid <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
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
                  Remarks
                </th>
                <th className={`${thBase} ${t.textSub} text-left`}>
                  Recent Update
                </th>
                <th className={`${thBase} ${t.textSub} text-center`}>Notes</th>
                {/* Closed On moved to the front (frozen) in "closed" mode —
                    this trailing slot is Active-mode-only now. */}
                {!isClosedMode && (
                  <th
                    className={`${thBase} ${t.textSub} text-right cursor-pointer`}
                    onClick={() => toggleSort("daysAfterApproval")}
                  >
                    <span className="flex items-center justify-end gap-1">
                      Days
                      <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                    </span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {paged.map((rawC) => {
                const c = { ...rawC, ...feeOverrides[rawC.id] };
                const isOverpaid = c.markedOverpaid;
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
                    {/* Closed On — frozen, "closed" mode only, first data
                        column so it's visible without scrolling. */}
                    {isClosedMode && (
                      <td className={`${tdBase} ${t.textSub} ${stickyTdClosedOn}`}>
                        {dateStr(c.closedAt ? c.closedAt.slice(0, 10) : null)}
                      </td>
                    )}
                    {/* Case Info — first two columns are frozen.
                        Name deep-links to MyCase (external_id); a Chronicle
                        link and the long-form claim label sit on a sub-line. */}
                    <td className={`${tdBase} ${stickyTd1}`} title={c.name}>
                      {/* overflow-hidden keeps the sub-line from spilling past
                          the frozen column onto Assigned during h-scroll. */}
                      <div className="flex flex-col gap-0.5 overflow-hidden">
                        {c.externalId ? (
                          <a
                            href={c.externalId}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className={`inline-flex items-center gap-1 max-w-full ${t.text} font-semibold hover:underline`}
                          >
                            <span className="truncate">{c.name}</span>
                            <ExternalLink
                              className="h-3 w-3 shrink-0 opacity-50"
                              aria-hidden="true"
                            />
                          </a>
                        ) : (
                          <span className={`${t.text} font-semibold truncate`}>
                            {c.name}
                          </span>
                        )}
                        <div className="flex items-center gap-2 text-[11px] leading-none min-w-0">
                          {(() => {
                            // Mirror the Claim column's optimistic value so the
                            // sub-line updates the instant the dropdown changes.
                            const claim = cellValue(c, "claim");
                            return claim && claim !== "—" ? (
                              <span className={`${t.textMuted} truncate`}>
                                {fmtClaimLong(claim)}
                              </span>
                            ) : null;
                          })()}
                          {c.chronicleId != null && (
                            <a
                              href={`https://app.chroniclelegal.com/dashboard/clients/${c.chronicleId}`}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className={`inline-flex items-center gap-0.5 hover:underline shrink-0 ${dark ? "text-blue-400" : "text-blue-600"}`}
                            >
                              Chronicle
                              <ExternalLink
                                className="h-2.5 w-2.5"
                                aria-hidden="true"
                              />
                            </a>
                          )}
                        </div>
                      </div>
                    </td>
                    <td
                      className={`${tdBase} ${t.textSub} ${stickyTd2}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Listbox
                        value={cellValue(c, "assigned")}
                        onChange={(v) =>
                          handleVarcharChange(
                            c,
                            "fee",
                            "assignedTo",
                            "assigned",
                            "Assigned To",
                            v,
                          )
                        }
                        dark={dark}
                        t={t}
                        aria-label="Assigned To"
                        className="w-full"
                        title={
                          assignedOptions.length === 0
                            ? "No options configured — add them in Settings"
                            : undefined
                        }
                        options={buildListboxOptions(
                          assignedOptions,
                          cellValue(c, "assigned"),
                          undefined,
                          (name) => memberRowTint(name, dark),
                        )}
                      />
                    </td>
                    {/* Fees Confirmation — 3rd frozen column */}
                    <td
                      className={`${tdBase} ${t.textSub} ${stickyTd3}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isAdmin && feesConfEditId === c.id ? (
                        <select
                          autoFocus
                          value={cellValue(c, "feesConfirmation")}
                          onClick={(e) => e.stopPropagation()}
                          onBlur={() => setFeesConfEditId(null)}
                          onChange={(e) => {
                            handleVarcharChange(
                              c,
                              "fee",
                              "feesConfirmation",
                              "feesConfirmation",
                              "Fees Confirmation",
                              e.target.value,
                            );
                            setFeesConfEditId(null);
                          }}
                          className={`w-full h-7 px-2 rounded-md border text-[11px] outline-none cursor-pointer ${t.inputBg}`}
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
                      ) : isAdmin ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setFeesConfEditId(c.id); }}
                          className="cursor-pointer"
                        >
                          <FeesConfBadge value={cellValue(c, "feesConfirmation")} dark={dark} />
                        </button>
                      ) : (
                        <FeesConfBadge value={cellValue(c, "feesConfirmation")} dark={dark} />
                      )}
                    </td>
                    {/* Fees Closed — checkbox; check → close dialog; uncheck → reopen dialog */}
                    <td
                      className={`${tdBase} text-center`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {mode === "closed" ? (
                        <input
                          type="checkbox"
                          checked
                          className={`h-4 w-4 ${canFinalize ? "cursor-pointer" : "cursor-default opacity-60"}`}
                          aria-label="Reopen case — move back to active dashboard"
                          disabled={!canFinalize}
                          onChange={() => setReopenConfirmCase(c)}
                        />
                      ) : (isAdmin || isLead) && canFinalize ? (
                        <input
                          type="checkbox"
                          checked={false}
                          className="h-4 w-4 cursor-pointer"
                          aria-label="Mark as Fees Closed"
                          onChange={() => setCloseConfirmCase(c)}
                        />
                      ) : (
                        "—"
                      )}
                    </td>
                    {/* Level — varchar; lives on the cases row. */}
                    <td
                      className={`${tdBase}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Listbox
                        value={cellValue(c, "level")}
                        onChange={(v) =>
                          handleVarcharChange(
                            c,
                            "case",
                            "levelWon",
                            "level",
                            "Case Level",
                            v,
                          )
                        }
                        dark={dark}
                        t={t}
                        aria-label="Case Level"
                        title={
                          caseLevelOptions.length === 0
                            ? "No options configured — add them in Settings"
                            : undefined
                        }
                        options={buildListboxOptions(
                          caseLevelOptions,
                          cellValue(c, "level"),
                          (name) => {
                            const visual = caseLevelVisual(name, dark);
                            return visual
                              ? { icon: visual.Icon, iconBg: visual.bg, iconFg: visual.fg }
                              : undefined;
                          },
                        )}
                      />
                    </td>
                    {/* Claim — varchar; lives on the cases row. */}
                    <td
                      className={`${tdBase}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {claimEditId === c.id ? (
                        <select
                          autoFocus
                          value={cellValue(c, "claim")}
                          onClick={(e) => e.stopPropagation()}
                          onBlur={() => setClaimEditId(null)}
                          onChange={(e) => {
                            handleVarcharChange(
                              c,
                              "case",
                              "claimTypeLabel",
                              "claim",
                              "Claim Type",
                              e.target.value,
                            );
                            setClaimEditId(null);
                          }}
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
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); setClaimEditId(c.id); }}
                          className="rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
                          aria-label={`Edit claim type: ${cellValue(c, "claim") || "not set"}`}
                        >
                          <ClaimTypeBadge value={cellValue(c, "claim")} dark={dark} />
                        </button>
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
                      {winSheetStatusEditId === c.id ? (
                        <select
                          autoFocus
                          value={cellValue(c, "status")}
                          onClick={(e) => e.stopPropagation()}
                          onBlur={() => setWinSheetStatusEditId(null)}
                          onChange={(e) => {
                            handleVarcharChange(
                              c,
                              "fee",
                              "winSheetStatus",
                              "status",
                              "Win Sheet Status",
                              e.target.value,
                            );
                            setWinSheetStatusEditId(null);
                          }}
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
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); setWinSheetStatusEditId(c.id); }}
                          className="rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
                          aria-label={`Edit Win Sheet Status: ${cellValue(c, "status") || "not set"}`}
                        >
                          <WinSheetStatusBadge value={cellValue(c, "status")} dark={dark} />
                        </button>
                      )}
                    </td>

                    {/* Win Sheet Link — hover pen to edit; HoverCard shows URL + text */}
                    <td
                      className={`${tdBase}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {winSheetEditing === c.id ? (
                        <div
                          className="flex flex-col gap-1 min-w-[200px]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="url"
                            placeholder="https://..."
                            value={winSheetDraft.url}
                            autoFocus
                            onChange={(e) =>
                              setWinSheetDraft((d) => ({ ...d, url: e.target.value }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleWinSheetSave(c);
                              if (e.key === "Escape") setWinSheetEditing(null);
                            }}
                            className={`h-6 px-2 rounded border text-[11px] outline-none w-full ${t.inputBg}`}
                          />
                          <input
                            type="text"
                            placeholder="Display text (optional)"
                            value={winSheetDraft.text}
                            onChange={(e) =>
                              setWinSheetDraft((d) => ({ ...d, text: e.target.value }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleWinSheetSave(c);
                              if (e.key === "Escape") setWinSheetEditing(null);
                            }}
                            className={`h-6 px-2 rounded border text-[11px] outline-none w-full ${t.inputBg}`}
                          />
                          {winSheetError && (
                            <p role="alert" className={`text-[10px] text-red-500`}>
                              {winSheetError}
                            </p>
                          )}
                          <div className="flex gap-1 justify-end">
                            {winSheetSaving === c.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin self-center" aria-hidden="true" />
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleWinSheetSave(c)}
                                  className="inline-flex items-center gap-0.5 h-5 px-1.5 rounded text-[10px] font-semibold bg-blue-500 text-white hover:bg-blue-600"
                                >
                                  <Check className="h-3 w-3" aria-hidden="true" />
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setWinSheetEditing(null); setWinSheetError(null); }}
                                  className={`inline-flex items-center gap-0.5 h-5 px-1.5 rounded text-[10px] font-semibold border ${t.outlineBtn}`}
                                >
                                  <X className="h-3 w-3" aria-hidden="true" />
                                  Cancel
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          {c.winSheetLink ? (
                            <HoverCard openDelay={150} closeDelay={50}>
                              <HoverCardTrigger asChild>
                                <a
                                  href={c.winSheetLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-500 hover:underline"
                                >
                                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                                  {c.winSheetLinkText || "Open"}
                                </a>
                              </HoverCardTrigger>
                              <HoverCardContent
                                align="start"
                                collisionPadding={12}
                                className="w-72 p-3 space-y-2 text-[11px]"
                              >
                                <p>
                                  <span className="font-semibold">Display text: </span>
                                  {c.winSheetLinkText || "Open"}
                                </p>
                                <p className="break-all">
                                  <span className="font-semibold">URL: </span>
                                  {c.winSheetLink}
                                </p>
                              </HoverCardContent>
                            </HoverCard>
                          ) : (
                            <span className={`text-[11px] ${t.textMuted}`}>—</span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setWinSheetEditing(c.id);
                              setWinSheetDraft({
                                url: c.winSheetLink ?? "",
                                text: c.winSheetLinkText ?? "",
                              });
                            }}
                            className={`opacity-0 group-hover:opacity-100 transition-colors shrink-0 p-0.5 rounded ${t.hover}`}
                            aria-label="Edit win sheet link"
                          >
                            <Pencil className={`h-3 w-3 ${t.textMuted}`} aria-hidden="true" />
                          </button>
                        </div>
                      )}
                    </td>

                    {/* T16 */}
                    <td
                      className={`${tdBase} text-right tabular-nums ${t.text} ${groupBorder}`}
                      onClick={canEditFeeDue ? (e) => e.stopPropagation() : undefined}
                    >
                      <FeeAmountCell
                        active={canEditFeeDue && feeAmountEdit?.caseId === c.id && feeAmountEdit.field === "t16Retro"}
                        value={c.t16Retro} draft={feeAmountEdit?.draft ?? ""} saving={feeAmountSaving} error={feeAmountError}
                        canEdit={canEditFeeDue} saveLabel="T16 retro" inputBg={t.inputBg} hoverCls={t.hover} textMuted={t.textMuted}
                        onEdit={() => { setFeeAmountEdit({ caseId: c.id, field: "t16Retro", draft: String(c.t16Retro) }); setFeeAmountError(null); }}
                        onDraftChange={(v) => setFeeAmountEdit((p) => p ? { ...p, draft: v } : p)}
                        onSave={handleFeeAmountSave}
                        onCancel={() => { setFeeAmountEdit(null); setFeeAmountError(null); }}
                      />
                    </td>
                    <td
                      className={`${tdBase} text-right tabular-nums ${t.text}`}
                      onClick={canEditFeeDue ? (e) => e.stopPropagation() : undefined}
                    >
                      <FeeAmountCell
                        active={canEditFeeDue && feeAmountEdit?.caseId === c.id && feeAmountEdit.field === "t16FeeDue"}
                        value={c.t16FeeDue} draft={feeAmountEdit?.draft ?? ""} saving={feeAmountSaving} error={feeAmountError}
                        canEdit={canEditFeeDue} saveLabel="T16 fee due" inputBg={t.inputBg} hoverCls={t.hover} textMuted={t.textMuted}
                        onEdit={() => { setFeeAmountEdit({ caseId: c.id, field: "t16FeeDue", draft: String(c.t16FeeDue) }); setFeeAmountError(null); }}
                        onDraftChange={(v) => setFeeAmountEdit((p) => p ? { ...p, draft: v } : p)}
                        onSave={handleFeeAmountSave}
                        onCancel={() => { setFeeAmountEdit(null); setFeeAmountError(null); }}
                      />
                    </td>
                    <td
                      className={`${tdBase} text-right tabular-nums ${c.t16FeeReceived > 0 ? "text-emerald-500 font-medium" : t.textMuted}`}
                    >
                      {currency(c.t16FeeReceived)}
                    </td>
                    <td
                      className={`${tdBase} text-right tabular-nums ${c.t16Pending > 0 ? (dark ? "text-amber-400" : "text-amber-600") : t.textMuted}`}
                      onClick={canEditFeeDue ? (e) => e.stopPropagation() : undefined}
                    >
                      <FeeAmountCell
                        active={canEditFeeDue && feeAmountEdit?.caseId === c.id && feeAmountEdit.field === "t16Pending"}
                        value={c.t16Pending} draft={feeAmountEdit?.draft ?? ""} saving={feeAmountSaving} error={feeAmountError}
                        canEdit={canEditFeeDue} saveLabel="T16 pending" inputBg={t.inputBg} hoverCls={t.hover} textMuted={t.textMuted}
                        onEdit={() => { setFeeAmountEdit({ caseId: c.id, field: "t16Pending", draft: String(c.t16Pending) }); setFeeAmountError(null); }}
                        onDraftChange={(v) => setFeeAmountEdit((p) => p ? { ...p, draft: v } : p)}
                        onSave={handleFeeAmountSave}
                        onCancel={() => { setFeeAmountEdit(null); setFeeAmountError(null); }}
                      />
                    </td>
                    <td className={`${tdBase} ${t.textSub}`} onClick={(e) => e.stopPropagation()}>
                      <FeePaymentPanel
                        caseId={c.id}
                        feeType="t16"
                        currentTotal={c.t16FeeReceived}
                        mostRecentDate={c.t16FeeReceivedDate}
                        canEdit={canEditFees}
                        dark={dark}
                        onAdded={(amount, receivedDate) =>
                          setFeeOverrides((prev) => ({
                            ...prev,
                            [c.id]: { ...prev[c.id], t16FeeReceived: (prev[c.id]?.t16FeeReceived ?? c.t16FeeReceived) + amount, t16FeeReceivedDate: receivedDate },
                          }))
                        }
                        onDeleted={(amount) =>
                          setFeeOverrides((prev) => ({
                            ...prev,
                            [c.id]: { ...prev[c.id], t16FeeReceived: Math.max(0, (prev[c.id]?.t16FeeReceived ?? c.t16FeeReceived) - amount) },
                          }))
                        }
                      />
                    </td>

                    {/* T2 */}
                    <td
                      className={`${tdBase} text-right tabular-nums ${t.text} ${groupBorder}`}
                      onClick={canEditFeeDue ? (e) => e.stopPropagation() : undefined}
                    >
                      <FeeAmountCell
                        active={canEditFeeDue && feeAmountEdit?.caseId === c.id && feeAmountEdit.field === "t2Retro"}
                        value={c.t2Retro} draft={feeAmountEdit?.draft ?? ""} saving={feeAmountSaving} error={feeAmountError}
                        canEdit={canEditFeeDue} saveLabel="T2 retro" inputBg={t.inputBg} hoverCls={t.hover} textMuted={t.textMuted}
                        onEdit={() => { setFeeAmountEdit({ caseId: c.id, field: "t2Retro", draft: String(c.t2Retro) }); setFeeAmountError(null); }}
                        onDraftChange={(v) => setFeeAmountEdit((p) => p ? { ...p, draft: v } : p)}
                        onSave={handleFeeAmountSave}
                        onCancel={() => { setFeeAmountEdit(null); setFeeAmountError(null); }}
                      />
                    </td>
                    <td
                      className={`${tdBase} text-right tabular-nums ${t.text}`}
                      onClick={canEditFeeDue ? (e) => e.stopPropagation() : undefined}
                    >
                      <FeeAmountCell
                        active={canEditFeeDue && feeAmountEdit?.caseId === c.id && feeAmountEdit.field === "t2FeeDue"}
                        value={c.t2FeeDue} draft={feeAmountEdit?.draft ?? ""} saving={feeAmountSaving} error={feeAmountError}
                        canEdit={canEditFeeDue} saveLabel="T2 fee due" inputBg={t.inputBg} hoverCls={t.hover} textMuted={t.textMuted}
                        onEdit={() => { setFeeAmountEdit({ caseId: c.id, field: "t2FeeDue", draft: String(c.t2FeeDue) }); setFeeAmountError(null); }}
                        onDraftChange={(v) => setFeeAmountEdit((p) => p ? { ...p, draft: v } : p)}
                        onSave={handleFeeAmountSave}
                        onCancel={() => { setFeeAmountEdit(null); setFeeAmountError(null); }}
                      />
                    </td>
                    <td
                      className={`${tdBase} text-right tabular-nums ${c.t2FeeReceived > 0 ? "text-emerald-500 font-medium" : t.textMuted}`}
                    >
                      {currency(c.t2FeeReceived)}
                    </td>
                    <td
                      className={`${tdBase} text-right tabular-nums ${c.t2Pending > 0 ? (dark ? "text-amber-400" : "text-amber-600") : t.textMuted}`}
                      onClick={canEditFeeDue ? (e) => e.stopPropagation() : undefined}
                    >
                      <FeeAmountCell
                        active={canEditFeeDue && feeAmountEdit?.caseId === c.id && feeAmountEdit.field === "t2Pending"}
                        value={c.t2Pending} draft={feeAmountEdit?.draft ?? ""} saving={feeAmountSaving} error={feeAmountError}
                        canEdit={canEditFeeDue} saveLabel="T2 pending" inputBg={t.inputBg} hoverCls={t.hover} textMuted={t.textMuted}
                        onEdit={() => { setFeeAmountEdit({ caseId: c.id, field: "t2Pending", draft: String(c.t2Pending) }); setFeeAmountError(null); }}
                        onDraftChange={(v) => setFeeAmountEdit((p) => p ? { ...p, draft: v } : p)}
                        onSave={handleFeeAmountSave}
                        onCancel={() => { setFeeAmountEdit(null); setFeeAmountError(null); }}
                      />
                    </td>
                    <td className={`${tdBase} ${t.textSub}`} onClick={(e) => e.stopPropagation()}>
                      <FeePaymentPanel
                        caseId={c.id}
                        feeType="t2"
                        currentTotal={c.t2FeeReceived}
                        mostRecentDate={c.t2FeeReceivedDate}
                        canEdit={canEditFees}
                        dark={dark}
                        onAdded={(amount, receivedDate) =>
                          setFeeOverrides((prev) => ({
                            ...prev,
                            [c.id]: { ...prev[c.id], t2FeeReceived: (prev[c.id]?.t2FeeReceived ?? c.t2FeeReceived) + amount, t2FeeReceivedDate: receivedDate },
                          }))
                        }
                        onDeleted={(amount) =>
                          setFeeOverrides((prev) => ({
                            ...prev,
                            [c.id]: { ...prev[c.id], t2FeeReceived: Math.max(0, (prev[c.id]?.t2FeeReceived ?? c.t2FeeReceived) - amount) },
                          }))
                        }
                      />
                    </td>

                    {/* AUX */}
                    <td
                      className={`${tdBase} text-right tabular-nums ${t.text} ${groupBorder}`}
                      onClick={canEditFeeDue ? (e) => e.stopPropagation() : undefined}
                    >
                      <FeeAmountCell
                        active={canEditFeeDue && feeAmountEdit?.caseId === c.id && feeAmountEdit.field === "auxRetro"}
                        value={c.auxRetro} draft={feeAmountEdit?.draft ?? ""} saving={feeAmountSaving} error={feeAmountError}
                        canEdit={canEditFeeDue} saveLabel="AUX retro" inputBg={t.inputBg} hoverCls={t.hover} textMuted={t.textMuted}
                        onEdit={() => { setFeeAmountEdit({ caseId: c.id, field: "auxRetro", draft: String(c.auxRetro) }); setFeeAmountError(null); }}
                        onDraftChange={(v) => setFeeAmountEdit((p) => p ? { ...p, draft: v } : p)}
                        onSave={handleFeeAmountSave}
                        onCancel={() => { setFeeAmountEdit(null); setFeeAmountError(null); }}
                      />
                    </td>
                    <td
                      className={`${tdBase} text-right tabular-nums ${t.text}`}
                      onClick={canEditFeeDue ? (e) => e.stopPropagation() : undefined}
                    >
                      <FeeAmountCell
                        active={canEditFeeDue && feeAmountEdit?.caseId === c.id && feeAmountEdit.field === "auxFeeDue"}
                        value={c.auxFeeDue} draft={feeAmountEdit?.draft ?? ""} saving={feeAmountSaving} error={feeAmountError}
                        canEdit={canEditFeeDue} saveLabel="AUX fee due" inputBg={t.inputBg} hoverCls={t.hover} textMuted={t.textMuted}
                        onEdit={() => { setFeeAmountEdit({ caseId: c.id, field: "auxFeeDue", draft: String(c.auxFeeDue) }); setFeeAmountError(null); }}
                        onDraftChange={(v) => setFeeAmountEdit((p) => p ? { ...p, draft: v } : p)}
                        onSave={handleFeeAmountSave}
                        onCancel={() => { setFeeAmountEdit(null); setFeeAmountError(null); }}
                      />
                    </td>
                    <td
                      className={`${tdBase} text-right tabular-nums ${c.auxFeeReceived > 0 ? "text-emerald-500 font-medium" : t.textMuted}`}
                    >
                      {currency(c.auxFeeReceived)}
                    </td>
                    <td
                      className={`${tdBase} text-right tabular-nums ${c.auxPending > 0 ? (dark ? "text-amber-400" : "text-amber-600") : t.textMuted}`}
                      onClick={canEditFeeDue ? (e) => e.stopPropagation() : undefined}
                    >
                      <FeeAmountCell
                        active={canEditFeeDue && feeAmountEdit?.caseId === c.id && feeAmountEdit.field === "auxPending"}
                        value={c.auxPending} draft={feeAmountEdit?.draft ?? ""} saving={feeAmountSaving} error={feeAmountError}
                        canEdit={canEditFeeDue} saveLabel="AUX pending" inputBg={t.inputBg} hoverCls={t.hover} textMuted={t.textMuted}
                        onEdit={() => { setFeeAmountEdit({ caseId: c.id, field: "auxPending", draft: String(c.auxPending) }); setFeeAmountError(null); }}
                        onDraftChange={(v) => setFeeAmountEdit((p) => p ? { ...p, draft: v } : p)}
                        onSave={handleFeeAmountSave}
                        onCancel={() => { setFeeAmountEdit(null); setFeeAmountError(null); }}
                      />
                    </td>
                    <td className={`${tdBase} ${t.textSub}`} onClick={(e) => e.stopPropagation()}>
                      <FeePaymentPanel
                        caseId={c.id}
                        feeType="aux"
                        currentTotal={c.auxFeeReceived}
                        mostRecentDate={c.auxFeeReceivedDate}
                        canEdit={canEditFees}
                        dark={dark}
                        onAdded={(amount, receivedDate) =>
                          setFeeOverrides((prev) => ({
                            ...prev,
                            [c.id]: { ...prev[c.id], auxFeeReceived: (prev[c.id]?.auxFeeReceived ?? c.auxFeeReceived) + amount, auxFeeReceivedDate: receivedDate },
                          }))
                        }
                        onDeleted={(amount) =>
                          setFeeOverrides((prev) => ({
                            ...prev,
                            [c.id]: { ...prev[c.id], auxFeeReceived: Math.max(0, (prev[c.id]?.auxFeeReceived ?? c.auxFeeReceived) - amount) },
                          }))
                        }
                      />
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
                        <Listbox
                          value={cellValue(c, "approvedBy")}
                          onChange={(v) =>
                            handleVarcharChange(
                              c,
                              "fee",
                              "approvedBy",
                              "approvedBy",
                              "Approved By",
                              v,
                            )
                          }
                          dark={dark}
                          t={t}
                          aria-label="Approved By"
                          title={
                            approvedByOptions.length === 0
                              ? "No options configured — add them in Settings"
                              : undefined
                          }
                          options={buildListboxOptions(
                            approvedByOptions,
                            cellValue(c, "approvedBy"),
                            undefined,
                            (name) => {
                              const leader = leaders.find((l) => l.name === name);
                              return leader ? teamRowTint(leader.team, dark) : undefined;
                            },
                          )}
                        />
                      )}
                    </td>
                    {/* Remarks */}
                    <td
                      className={`${tdBase} ${t.textSub}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {caseStatusEditId === c.id ? (
                        <select
                          autoFocus
                          value={cellValue(c, "caseStatus")}
                          onClick={(e) => e.stopPropagation()}
                          onBlur={() => setCaseStatusEditId(null)}
                          onChange={(e) => {
                            handleVarcharChange(
                              c,
                              "fee",
                              "caseStatus",
                              "caseStatus",
                              "Remarks",
                              e.target.value,
                            );
                            setCaseStatusEditId(null);
                          }}
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
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); setCaseStatusEditId(c.id); }}
                          className="rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
                          aria-label={`Edit Remarks: ${cellValue(c, "caseStatus") || "not set"}`}
                        >
                          <CaseStatusBadge value={cellValue(c, "caseStatus")} dark={dark} />
                        </button>
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
                        <MessageSquare className="h-3 w-3" aria-hidden="true" />
                        {c.notesCount}
                      </button>
                    </td>
                    {/* Closed On moved to the front (frozen) in "closed" mode —
                        this trailing slot is Active-mode-only now. */}
                    {!isClosedMode && (
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
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
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


      {notesFor && (
        <NotesModal
          dark={dark}
          caseId={notesFor.id}
          caseName={notesFor.name}
          onClose={() => setNotesFor(null)}
          onChanged={() => onImported?.()}
        />
      )}

      <ArchiveConfirmDialog
        open={archiveConfirmOpen}
        clientIds={archivePendingIds}
        source={archivePendingSource}
        onClose={() => setArchiveConfirmOpen(false)}
        onArchived={() => {
          setSelectedIds(new Set());
          onImported?.();
        }}
      />

      <FeesClosedConfirmDialog
        open={closeConfirmCase !== null}
        mode="close"
        caseId={closeConfirmCase?.id ?? null}
        caseName={closeConfirmCase?.name ?? ""}
        onClose={() => setCloseConfirmCase(null)}
        onConfirmed={() => {
          setCloseConfirmCase(null);
          onImported?.();
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
          onImported?.();
        }}
      />

    </div>
  );
};
