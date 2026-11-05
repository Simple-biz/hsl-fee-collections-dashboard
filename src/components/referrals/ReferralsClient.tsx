"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Plus, Search, X, RefreshCw, UserPlus, Trash2 } from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import { fmtDate, fmtClaim } from "@/lib/formatters";
import { removeReferral } from "@/app/(dashboard)/referrals/actions";
import { toast } from "sonner";

type PaymentTab = "no-fees" | "partial" | "paid";

interface ReferralRow {
  caseId: number;
  referredBy: string;
  notes: string;
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
  const [addOpen, setAddOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<PaymentTab>("no-fees");
  const fetchAbortRef = useRef<AbortController | null>(null);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // ── Fetch referrals list ─────────────────────────────────────────────────

  const fetchReferrals = useCallback(async (q: string) => {
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (q) params.set("search", q);
      const res = await fetch(`/api/referrals?${params}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const json = await res.json() as { data: ReferralRow[] };
      setRows(json.data);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      toast.error("Failed to load referrals");
    } finally {
      if (fetchAbortRef.current === controller) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReferrals("");
    return () => {
      fetchAbortRef.current?.abort();
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [fetchReferrals]);

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

  // ── Tab derivation ───────────────────────────────────────────────────────

  const paidRows = rows.filter((r) => r.pifReadyToClose === true);
  const partialRows = rows.filter((r) => !r.pifReadyToClose && Number(r.totalFeesPaid) > 0);
  const noFeesRows = rows.filter((r) => !r.pifReadyToClose && !(Number(r.totalFeesPaid) > 0));
  const displayRows =
    activeTab === "no-fees" ? noFeesRows : activeTab === "partial" ? partialRows : paidRows;

  const tabs: { key: PaymentTab; label: string; count: number }[] = [
    { key: "no-fees", label: "No Fees", count: noFeesRows.length },
    { key: "partial", label: "Partially Paid", count: partialRows.length },
    { key: "paid", label: "Paid in Full", count: paidRows.length },
  ];

  // ── Styles ───────────────────────────────────────────────────────────────

  const inputCls = `h-9 w-full px-3 rounded-md border text-sm outline-none ${t.inputBg}`;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className={`text-lg font-bold ${t.text}`}>Referrals</h1>
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
              onClick={() => setActiveTab(key)}
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
                  {["Referred By", "Case Name", "Claim", "Approval Date", "Assigned Agent", "Date Added", ""].map(
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
                        {fmtDate(row.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleRemove(row.caseId, name)}
                          className={`h-7 w-7 rounded-md flex items-center justify-center ${t.hover} text-red-500 hover:text-red-600`}
                          aria-label={`Remove ${name} from referrals`}
                          title="Remove from referrals"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Referral modal */}
      {addOpen && (
        <AddReferralModal
          dark={dark}
          onClose={() => setAddOpen(false)}
          onAdded={(row) => {
            setRows((prev) => {
              // Replace if already in list (re-referral), otherwise prepend.
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
                  : "no-fees"
            );
          }}
        />
      )}
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
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    } finally {
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
      // The API returns the referrals row; we need the full display row.
      // Fetch the single row by calling GET with the case name as search so
      // that totalFeesPaid / pifReadyToClose are accurate for tab placement.
      const fallbackRow: ReferralRow = {
        caseId: selectedCase!.id,
        referredBy: referredBy.trim(),
        notes: notes.trim(),
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
        // silently use fallback
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

          {/* Referred by */}
          <div>
            <label className={lblCls}>Referred by *</label>
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
