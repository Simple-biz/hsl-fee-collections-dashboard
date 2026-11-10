"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Plus, Search, X, RefreshCw, UserPlus, Trash2, DollarSign, CheckCircle2 } from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import { fmtDate, fmtDateLong, fmtClaim } from "@/lib/formatters";
import { removeReferral } from "@/app/(dashboard)/referrals/actions";
import { toast } from "sonner";

type PaymentTab = "no-fees" | "partial" | "paid";
type FeeFilter = "all" | "unpaid" | "paid";

interface ReferralRow {
  caseId: number;
  referredBy: string;
  notes: string;
  paidAt: string | null;
  paymentAmount: string | null;
  createdAt: string;
  firstName: string;
  lastName: string;
  claimTypeLabel: string | null;
  approvalDate: string | null;
  assignedTo: string | null;
  isClosed: boolean | null;
  totalFeesPaid: string | null;
  pifReadyToClose: boolean | null;
}

interface CaseSearchResult {
  id: number;
  name: string;
  claim: string;
  status: string;
  assigned: string;
}

export function ReferralsClient() {
  const { resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const dark = mounted ? resolvedTheme === "dark" : false;
  const t = themeClasses(dark);

  const [rows, setRows] = useState<ReferralRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<PaymentTab>("no-fees");
  const [feeFilter, setFeeFilter] = useState<FeeFilter>("all");

  const [addOpen, setAddOpen] = useState(false);
  const [markPaidCaseId, setMarkPaidCaseId] = useState<number | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const cancelledRef = useRef(false);

  // ── Fetch referrals list ─────────────────────────────────────────────────

  const fetchReferrals = useCallback(async (q: string, silent = false) => {
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "500" });
      if (q) params.set("search", q);
      const res = await fetch(`/api/referrals?${params}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const json = await res.json() as { data: ReferralRow[] };
      if (!cancelledRef.current) setRows(json.data);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      if (!cancelledRef.current && !silent) toast.error("Failed to load referrals");
    } finally {
      if (!cancelledRef.current && fetchAbortRef.current === controller && !silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    fetchReferrals("");
    return () => {
      cancelledRef.current = true;
      fetchAbortRef.current?.abort();
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [fetchReferrals]);

  const switchTab = useCallback((tab: PaymentTab) => {
    setActiveTab(tab);
  }, []);

  const onSearch = (value: string) => {
    setSearch(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => fetchReferrals(value), 300);
  };

  // ── Remove ───────────────────────────────────────────────────────────────

  const handleRemove = async (caseId: number, name: string) => {
    if (!confirm(`Remove ${name} from referrals?`)) return;
    const result = await removeReferral({ caseId });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Removed from referrals");
    setRows((prev) => prev.filter((r) => r.caseId !== caseId));
  };

  // ── Mark paid / unpaid ───────────────────────────────────────────────────

  const handleMarkPaid = async (caseId: number, amount: number | null) => {
    const controller = new AbortController();
    try {
      const res = await fetch("/api/referrals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId, paid: true, paymentAmount: amount }),
        signal: controller.signal,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Failed (${res.status})`);
      setRows((prev) =>
        prev.map((r) =>
          r.caseId === caseId
            ? { ...r, paidAt: (json.data?.paidAt as string | null) ?? new Date().toISOString(), paymentAmount: amount != null ? String(amount) : null }
            : r,
        ),
      );
      setMarkPaidCaseId(null);
      toast.success("Referral marked as paid");
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error((e as Error).message);
    }
  };

  const handleMarkUnpaid = async (caseId: number) => {
    if (!confirm("Mark this referral as unpaid?")) return;
    try {
      const res = await fetch("/api/referrals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId, paid: false }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Failed (${res.status})`);
      setRows((prev) =>
        prev.map((r) => (r.caseId === caseId ? { ...r, paidAt: null, paymentAmount: null } : r)),
      );
      toast.success("Referral marked as unpaid");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  // ── Tab derivation ───────────────────────────────────────────────────────

  const noFeesRows = rows.filter((r) => !r.pifReadyToClose && Number(r.totalFeesPaid ?? 0) === 0);
  const partialRows = rows.filter((r) => !r.pifReadyToClose && Number(r.totalFeesPaid) > 0);
  const paidRows = rows.filter((r) => r.pifReadyToClose);

  const applyFeeFilter = (rs: ReferralRow[]) =>
    feeFilter === "paid"
      ? rs.filter((r) => r.paidAt != null)
      : feeFilter === "unpaid"
        ? rs.filter((r) => r.paidAt === null)
        : rs;

  const tabs: { key: PaymentTab; label: string; count: number }[] = [
    { key: "no-fees", label: "No Fees", count: applyFeeFilter(noFeesRows).length },
    { key: "partial", label: "Partially Paid", count: applyFeeFilter(partialRows).length },
    { key: "paid", label: "Paid in Full", count: applyFeeFilter(paidRows).length },
  ];

  const tabRows =
    activeTab === "paid" ? paidRows : activeTab === "partial" ? partialRows : noFeesRows;

  const displayRows = applyFeeFilter(tabRows);

  // ── Styles ───────────────────────────────────────────────────────────────

  const inputCls = `h-9 w-full px-3 rounded-md border text-sm outline-none ${t.inputBg}`;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className={`text-lg font-bold ${t.text}`}>Atty Referrals</h1>
          <p className={`text-[13px] mt-0.5 ${t.textMuted}`}>
            Cases brought in through an external referrer.
          </p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className={`h-9 px-4 rounded-md text-xs font-semibold flex items-center gap-1.5 shrink-0 ${t.ctaBtn}`}
        >
          <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
          Add Referral
        </button>
      </div>

      {/* Search bar */}
      <div className="relative mb-4">
        <Search
          className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${t.textMuted}`}
          aria-hidden="true"
        />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search by name or referrer…"
          className={`${inputCls} pl-9`}
          aria-label="Search referrals"
        />
        {search && (
          <button
            onClick={() => onSearch("")}
            className={`absolute right-2 top-1/2 -translate-y-1/2 ${t.textSub} hover:opacity-80`}
            aria-label="Clear search"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Tab bar */}
      {!loading && (
        <div className={`flex gap-1 mb-3 p-1 rounded-lg ${dark ? "bg-white/5" : "bg-neutral-100"}`}>
          {tabs.map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => switchTab(key)}
              className={`flex-1 h-8 rounded-md text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                activeTab === key
                  ? dark
                    ? "bg-white/10 text-white"
                    : "bg-white text-neutral-900 shadow-sm"
                  : dark
                    ? "text-neutral-400 hover:text-neutral-200"
                    : "text-neutral-500 hover:text-neutral-700"
              }`}
            >
              {label}
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  activeTab === key
                    ? dark
                      ? "bg-white/15 text-white"
                      : "bg-neutral-200 text-neutral-700"
                    : dark
                      ? "bg-white/8 text-neutral-400"
                      : "bg-neutral-200/60 text-neutral-500"
                }`}
              >
                {count}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Referral fee filter */}
      {!loading && (
        <div className="flex items-center gap-2 mb-3">
          <span className={`text-[11px] font-semibold uppercase tracking-wider ${t.textMuted}`}>
            Referral Fee
          </span>
          <div className={`flex gap-0.5 p-0.5 rounded-lg ${dark ? "bg-white/5" : "bg-neutral-100"}`}>
            {(["all", "unpaid", "paid"] as FeeFilter[]).map((f) => {
              const label = f === "all" ? "All" : f === "unpaid" ? "Unpaid" : "Paid";
              return (
                <button
                  key={f}
                  onClick={() => setFeeFilter(f)}
                  className={`h-6 px-3 rounded-md text-[11px] font-semibold transition-colors ${
                    feeFilter === f
                      ? dark
                        ? "bg-white/10 text-white"
                        : "bg-white text-neutral-900 shadow-sm"
                      : dark
                        ? "text-neutral-400 hover:text-neutral-200"
                        : "text-neutral-500 hover:text-neutral-700"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Table */}
      <div className={`rounded-xl border overflow-hidden ${t.card}`}>
        {loading ? (
          <div className={`flex items-center justify-center gap-2 py-16 text-sm ${t.textMuted}`}>
            <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading…
          </div>
        ) : displayRows.length === 0 ? (
          <div className={`py-16 text-center text-sm ${t.textMuted}`}>
            {search
              ? `No referrals match "${search}".`
              : feeFilter === "paid"
                ? "No referrals with a paid referral fee in this group."
                : feeFilter === "unpaid"
                  ? "No referrals with an unpaid referral fee in this group."
                  : activeTab === "no-fees"
                    ? "No cases without fees."
                    : activeTab === "partial"
                      ? "No partially paid cases."
                      : "No fully paid cases."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={`border-b ${t.borderLight} ${dark ? "bg-white/4" : "bg-neutral-50"}`}>
                  {["Referral Source", "Case Name", "Claim", "Approval Date", "Assigned Agent", "Date Added", "Referral Fee", ""].map(
                    (h) => (
                      <th
                        key={h}
                        className={`px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider ${t.textMuted} whitespace-nowrap`}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row, i) => {
                  const name = `${row.lastName}, ${row.firstName}`;
                  return (
                    <tr
                      key={row.caseId}
                      className={`border-b last:border-b-0 ${t.borderLight} ${i % 2 === 0 ? "" : dark ? "bg-white/2" : "bg-neutral-50/60"} hover:${dark ? "bg-white/4" : "bg-neutral-100/60"} transition-colors`}
                    >
                      <td className={`px-4 py-3 font-medium ${t.text} whitespace-nowrap`}>
                        {row.referredBy}
                      </td>
                      <td className={`px-4 py-3 ${t.text} whitespace-nowrap`}>
                        {name}
                        {row.isClosed && (
                          <span className={`ml-1.5 text-[10px] font-semibold uppercase tracking-wide ${t.textMuted}`}>
                            Closed
                          </span>
                        )}
                      </td>
                      <td className={`px-4 py-3 ${t.textSub} whitespace-nowrap`}>
                        {row.claimTypeLabel ? fmtClaim(row.claimTypeLabel) : "—"}
                      </td>
                      <td className={`px-4 py-3 ${t.textSub} whitespace-nowrap`}>
                        {fmtDate(row.approvalDate)}
                      </td>
                      <td className={`px-4 py-3 ${t.textSub} whitespace-nowrap`}>
                        {row.assignedTo || "—"}
                      </td>
                      <td className={`px-4 py-3 ${t.textSub} whitespace-nowrap`}>
                        {fmtDateLong(row.createdAt)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {row.paidAt ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                            Paid{row.paymentAmount ? ` $${Number(row.paymentAmount).toLocaleString()}` : ""}
                          </span>
                        ) : (
                          <button
                            onClick={() => setMarkPaidCaseId(row.caseId)}
                            className={`h-6 px-2 rounded text-[11px] font-semibold flex items-center gap-1 border ${dark ? "border-white/15 text-neutral-300 hover:bg-white/8" : "border-neutral-300 text-neutral-600 hover:bg-neutral-100"} transition-colors`}
                            title="Mark referral fee as paid"
                          >
                            <DollarSign className="h-3 w-3" aria-hidden="true" />
                            Mark Paid
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {row.paidAt && (
                            <button
                              onClick={() => handleMarkUnpaid(row.caseId)}
                              className={`h-7 px-2 rounded-md text-[11px] font-medium ${t.hover} ${t.textSub}`}
                              title="Undo payment"
                            >
                              Undo
                            </button>
                          )}
                          <button
                            onClick={() => handleRemove(row.caseId, name)}
                            className={`h-7 w-7 rounded-md flex items-center justify-center ${t.hover} text-red-500 hover:text-red-600`}
                            aria-label={`Remove ${name} from referrals`}
                            title="Remove from referrals"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Mark Paid dialog */}
      {markPaidCaseId != null && (
        <MarkPaidDialog
          dark={dark}
          onClose={() => setMarkPaidCaseId(null)}
          onConfirm={(amount) => handleMarkPaid(markPaidCaseId, amount)}
        />
      )}

      {/* Add Referral modal */}
      {addOpen && (
        <AddReferralModal
          dark={dark}
          onClose={() => setAddOpen(false)}
          onAdded={(row) => {
            setRows((prev) => {
              const exists = prev.some((r) => r.caseId === row.caseId);
              return exists
                ? prev.map((r) => (r.caseId === row.caseId ? row : r))
                : [row, ...prev];
            });
            setActiveTab(
              row.pifReadyToClose
                ? "paid"
                : Number(row.totalFeesPaid) > 0
                  ? "partial"
                  : "no-fees",
            );
          }}
        />
      )}
    </div>
  );
}

// ── Mark Paid dialog ───────────────────────────────────────────────────────

interface MarkPaidDialogProps {
  dark: boolean;
  onClose: () => void;
  onConfirm: (amount: number | null) => void;
}

function MarkPaidDialog({ dark, onClose, onConfirm }: MarkPaidDialogProps) {
  const t = themeClasses(dark);
  const [amount, setAmount] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = amount.trim() ? parseFloat(amount.trim()) : null;
    if (parsed != null && (isNaN(parsed) || parsed <= 0)) return;
    onConfirm(parsed);
  };

  const inputCls = `h-9 w-full px-3 rounded-md border text-sm outline-none ${t.inputBg}`;
  const lblCls = `block text-[12px] font-semibold uppercase tracking-wider mb-1 ${t.textMuted}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <form
        className={`relative w-full max-w-sm rounded-xl border ${t.card} mx-4 p-5 space-y-4`}
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h3 className={`text-sm font-bold ${t.text}`}>Mark Referral as Paid</h3>
        <div>
          <label className={lblCls}>Payment Amount (optional)</label>
          <div className="relative">
            <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-sm ${t.textMuted}`}>$</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className={`${inputCls} pl-6`}
              autoFocus
            />
          </div>
          <p className={`mt-1 text-[11px] ${t.textMuted}`}>Leave blank if amount is unknown.</p>
        </div>
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className={`h-8 px-3 rounded-md border text-xs font-medium ${t.outlineBtn}`}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={`h-8 px-4 rounded-md text-xs font-semibold flex items-center gap-1.5 ${t.ctaBtn}`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            Mark Paid
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Add Referral modal ──────────────────────────────────────────────────────

interface AddReferralModalProps {
  dark: boolean;
  onClose: () => void;
  onAdded: (row: ReferralRow) => void;
}

function AddReferralModal({ dark, onClose, onAdded }: AddReferralModalProps) {
  const t = themeClasses(dark);

  const [caseQuery, setCaseQuery] = useState("");
  const [caseResults, setCaseResults] = useState<CaseSearchResult[]>([]);
  const [selectedCase, setSelectedCase] = useState<CaseSearchResult | null>(null);
  const [referredBy, setReferredBy] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const searchAbortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      searchAbortRef.current?.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const searchCases = async (q: string) => {
    searchAbortRef.current?.abort();
    if (!q.trim()) { setSearching(false); setCaseResults([]); return; }
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setSearching(true);
    try {
      const res = await fetch(
        `/api/cases?search=${encodeURIComponent(q)}&limit=8`,
        { signal: controller.signal },
      );
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const json = await res.json() as { data: CaseSearchResult[] };
      setCaseResults(json.data ?? []);
      setSearching(false);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setSearching(false);
    }
  };

  const onCaseQuery = (value: string) => {
    setCaseQuery(value);
    setSelectedCase(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchCases(value), 250);
  };

  const pickCase = (c: CaseSearchResult) => {
    setSelectedCase(c);
    setCaseQuery(c.name);
    setCaseResults([]);
  };

  const canSubmit = selectedCase != null && referredBy.trim() !== "" && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: selectedCase!.id,
          referredBy: referredBy.trim(),
          notes: notes.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Failed (${res.status})`);
      toast.success(`${selectedCase!.name} added to referrals`);
      // Build a fallback row in case the refetch fails.
      const fallbackRow: ReferralRow = {
        caseId: selectedCase!.id,
        referredBy: referredBy.trim(),
        notes: notes.trim(),
        paidAt: null,
        paymentAmount: null,
        createdAt: new Date().toISOString(),
        firstName: selectedCase!.name.split(", ")[1] ?? "",
        lastName: selectedCase!.name.split(", ")[0] ?? "",
        claimTypeLabel: selectedCase!.claim || null,
        approvalDate: null,
        assignedTo: selectedCase!.assigned || null,
        isClosed: null,
        totalFeesPaid: null,
        pifReadyToClose: null,
      };
      // Refetch the real row so approvalDate / isClosed reflect DB state.
      let refRow: ReferralRow = fallbackRow;
      try {
        const refRes = await fetch(
          `/api/referrals?search=${encodeURIComponent(selectedCase!.name)}`,
        );
        if (refRes.ok) {
          const refJson = await refRes.json() as { data: ReferralRow[] };
          const match = refJson.data?.find((r) => r.caseId === selectedCase!.id);
          if (match) refRow = match;
        }
      } catch {
        // Silently fall back to the optimistic row.
      }
      onAdded(refRow);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const inputCls = `h-9 w-full px-3 rounded-md border text-sm outline-none ${t.inputBg}`;
  const lblCls = `block text-[12px] font-semibold uppercase tracking-wider mb-1 ${t.textMuted}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50" />
      <div
        className={`relative w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col rounded-xl border ${t.card} mx-4`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-3 border-b ${t.borderLight}`}>
          <h3 className={`text-sm font-bold ${t.text}`}>Add Referral</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className={`h-7 w-7 rounded-md flex items-center justify-center ${t.hover} ${t.textSub}`}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div
              className={`rounded-md border p-3 text-xs ${dark ? "bg-red-900/20 border-red-800 text-red-300" : "bg-red-50 border-red-200 text-red-700"}`}
              role="alert"
            >
              {error}
            </div>
          )}

          {/* Case search */}
          <div>
            <label className={lblCls}>Case *</label>
            <div className="relative">
              <Search
                className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${t.textMuted}`}
                aria-hidden="true"
              />
              <input
                value={caseQuery}
                onChange={(e) => onCaseQuery(e.target.value)}
                placeholder="Search by name or ID…"
                className={`${inputCls} pl-9`}
                autoFocus
              />
              {searching && (
                <RefreshCw
                  className={`absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin ${t.textMuted}`}
                  aria-hidden="true"
                />
              )}
            </div>
            {caseResults.length > 0 && (
              <ul
                className={`mt-1 rounded-md border ${t.borderLight} ${t.card} overflow-hidden divide-y ${t.borderLight}`}
              >
                {caseResults.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => pickCase(c)}
                      className={`w-full text-left px-3 py-2 text-sm ${t.hover} transition-colors`}
                    >
                      <span className={`font-medium ${t.text}`}>{c.name}</span>
                      {c.claim && (
                        <span className={`ml-2 text-[12px] ${t.textMuted}`}>
                          {fmtClaim(c.claim)}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {selectedCase && (
              <p className={`mt-1.5 text-[12px] ${t.textMuted}`}>
                Selected: <span className={`font-medium ${t.text}`}>{selectedCase.name}</span>
              </p>
            )}
          </div>

          {/* Referral source */}
          <div>
            <label className={lblCls}>Referral Source *</label>
            <input
              value={referredBy}
              onChange={(e) => setReferredBy(e.target.value)}
              placeholder="Referrer's name"
              className={inputCls}
            />
          </div>

          {/* Notes (optional) */}
          <div>
            <label className={lblCls}>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes…"
              rows={3}
              className={`w-full px-3 py-2 rounded-md border text-sm outline-none resize-none ${t.inputBg}`}
            />
          </div>
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-end gap-2 px-5 py-3 border-t ${t.borderLight}`}>
          <button
            onClick={onClose}
            className={`h-8 px-3 rounded-md border text-xs font-medium ${t.outlineBtn}`}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className={`h-8 px-4 rounded-md text-xs font-semibold flex items-center gap-1.5 ${t.ctaBtn} disabled:opacity-50`}
          >
            {busy ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Add Referral
          </button>
        </div>
      </div>
    </div>
  );
}
