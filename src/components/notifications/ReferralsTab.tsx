"use client";

import { useState, useEffect, useRef } from "react";
import { RefreshCw, Handshake, AlertCircle, DollarSign, CheckCircle2, ExternalLink } from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import { fmtDate } from "@/lib/formatters";
import { toast } from "sonner";

interface ReferralRow {
  caseId: number;
  referredBy: string;
  paidAt: string | null;
  paymentAmount: string | null;
  firstName: string;
  lastName: string;
  claimTypeLabel: string | null;
  approvalDate: string | null;
  assignedTo: string | null;
  totalFeesPaid: string | null;
  pifReadyToClose: boolean | null;
}

interface ReferralsTabProps {
  dark: boolean;
  t: ReturnType<typeof themeClasses>;
}

export function ReferralsTab({ dark, t }: ReferralsTabProps) {
  const [rows, setRows] = useState<ReferralRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = () => {
    let cancelled = false;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    fetch("/api/referrals?needsPayment=true&limit=500", { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load referrals (${res.status})`);
        return res.json() as Promise<{ data: ReferralRow[] }>;
      })
      .then((json) => {
        if (cancelled) return;
        setRows(json.data ?? []);
      })
      .catch((err) => {
        if (cancelled || (err as Error).name === "AbortError") return;
        setError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  };

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMarkPaid = async (caseId: number) => {
    setMarkingId(caseId);
    try {
      const res = await fetch("/api/referrals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId, paid: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Failed (${res.status})`);
      setRows((prev) => prev.filter((r) => r.caseId !== caseId));
      toast.success("Referral marked as paid");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setMarkingId(null);
    }
  };

  const thBase = "px-3 py-2 text-[11px] font-semibold uppercase tracking-wider";
  const tdBase = "px-3 py-2.5 text-xs";
  const rowDivide = dark ? "border-neutral-800/40" : "border-neutral-100";
  const rowHover = dark ? "hover:bg-neutral-800/30" : "hover:bg-neutral-50";

  return (
    <div className={`rounded-xl border ${t.card}`}>
      {/* Header */}
      <div className={`p-4 flex items-center justify-between border-b ${t.borderLight}`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${dark ? "bg-violet-900/40" : "bg-violet-50"}`}>
            <Handshake className={`h-5 w-5 ${dark ? "text-violet-400" : "text-violet-600"}`} aria-hidden="true" />
          </div>
          <div>
            <h3 className={`text-sm font-bold ${t.text}`}>Referral Fees Pending</h3>
            <p className={`text-[13px] ${t.textMuted} mt-0.5`}>
              Cases that received fees but referral payment not yet sent
            </p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          aria-label="Refresh"
          className={`h-8 w-8 rounded-md flex items-center justify-center border ${t.outlineBtn}`}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
        </button>
      </div>

      {/* Error */}
      {error && (
        <div
          className={`m-4 rounded-lg border p-3 flex items-center gap-2 text-xs ${dark ? "bg-red-900/20 border-red-800 text-red-400" : "bg-red-50 border-red-200 text-red-700"}`}
          role="alert"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className={`h-5 w-5 animate-spin ${t.textMuted}`} aria-hidden="true" />
          <span className={`ml-2 text-sm ${t.textSub}`}>Loading…</span>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && rows.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16">
          <Handshake className={`h-8 w-8 ${t.textMuted} mb-3`} aria-hidden="true" />
          <p className={`text-sm font-medium ${t.text}`}>All referral fees are settled</p>
          <p className={`text-xs ${t.textMuted} mt-1`}>Referrals that receive fees will appear here until marked paid.</p>
        </div>
      )}

      {/* Table */}
      {!loading && !error && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className={`border-b ${t.borderLight} ${dark ? "bg-white/4" : "bg-neutral-50"}`}>
                {["Case Name", "Referral Source", "Fee Status", "Agent", "Approval Date", ""].map((h) => (
                  <th key={h} className={`${thBase} ${t.textMuted} whitespace-nowrap`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const name = `${row.lastName}, ${row.firstName}`;
                const isPif = row.pifReadyToClose;
                const isPartial = !isPif && Number(row.totalFeesPaid ?? 0) > 0;
                const busy = markingId === row.caseId;
                return (
                  <tr key={row.caseId} className={`border-b ${rowDivide} ${rowHover} transition-colors`}>
                    <td className={`${tdBase} font-medium ${t.text} whitespace-nowrap`}>
                      <a
                        href="/referrals"
                        className={`inline-flex items-center gap-1 hover:underline ${dark ? "text-indigo-400" : "text-indigo-600"}`}
                      >
                        {name}
                        <ExternalLink className="h-3 w-3 opacity-50 shrink-0" aria-hidden="true" />
                      </a>
                    </td>
                    <td className={`${tdBase} ${t.textSub} whitespace-nowrap`}>{row.referredBy}</td>
                    <td className={`${tdBase} whitespace-nowrap`}>
                      {isPif ? (
                        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${dark ? "bg-emerald-900/30 text-emerald-400" : "bg-emerald-50 text-emerald-700"}`}>
                          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                          Paid in Full
                        </span>
                      ) : isPartial ? (
                        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${dark ? "bg-amber-900/30 text-amber-400" : "bg-amber-50 text-amber-700"}`}>
                          <DollarSign className="h-3 w-3" aria-hidden="true" />
                          Partially Paid
                        </span>
                      ) : null}
                    </td>
                    <td className={`${tdBase} ${t.textSub} whitespace-nowrap`}>{row.assignedTo ?? "—"}</td>
                    <td className={`${tdBase} ${t.textSub} whitespace-nowrap`}>{fmtDate(row.approvalDate)}</td>
                    <td className={`${tdBase} whitespace-nowrap`}>
                      <button
                        onClick={() => handleMarkPaid(row.caseId)}
                        disabled={busy}
                        className={`h-7 px-3 rounded-md text-[11px] font-semibold flex items-center gap-1 border transition-colors disabled:opacity-50 ${dark ? "border-violet-700 text-violet-300 hover:bg-violet-900/30" : "border-violet-300 text-violet-700 hover:bg-violet-50"}`}
                      >
                        {busy
                          ? <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" />
                          : <DollarSign className="h-3 w-3" aria-hidden="true" />
                        }
                        Mark Paid
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
  );
}
