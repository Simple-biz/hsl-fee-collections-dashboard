"use client";

import { useState, useEffect, useRef, Fragment } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import { getMonday, formatWeekLabel as formatWeekLabelBase } from "@/lib/formatters";

interface DayCount {
  date: string;
  count: number;
}

interface ApprovalRow {
  id: string;
  caseId: number;
  caseName: string;
  externalId: string | null;
  assignedTo: string | null;
  approvedAt: string;
  date: string;
}

interface FeePetitionApprovedTabProps {
  dark: boolean;
  t: ReturnType<typeof themeClasses>;
}

const formatWeekLabel = (monday: string): string => formatWeekLabelBase(monday, 6);

const fmtDate = (iso: string): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

const isToday = (iso: string): boolean =>
  iso === new Date().toISOString().split("T")[0];

const thBase = "px-3 py-2 text-[13px] font-semibold uppercase tracking-wide";
const tdBase = "px-3 py-2 text-xs";

export function FeePetitionApprovedTab({ dark, t }: FeePetitionApprovedTabProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [days, setDays] = useState<DayCount[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const monday = getMonday(weekOffset);

  useEffect(() => {
    let cancelled = false;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    fetch(`/api/fee-petitions-approved?week=${monday}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load approved petitions (${res.status})`);
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;
        setDays(json.data ?? []);
        setApprovals(json.approvals ?? []);
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
  }, [monday]);

  const weekTotal = days.reduce((sum, d) => sum + d.count, 0);
  const maxCount = Math.max(1, ...days.map((d) => d.count));

  const approvalsByDate = approvals.reduce<Record<string, ApprovalRow[]>>((acc, a) => {
    (acc[a.date] ??= []).push(a);
    return acc;
  }, {});
  const approvalDates = Object.keys(approvalsByDate).sort((a, b) => b.localeCompare(a));

  const rowDivide = dark ? "border-neutral-800/40" : "border-neutral-100";
  const rowHover = dark ? "hover:bg-neutral-800/30" : "hover:bg-neutral-50";
  const todayBg = dark ? "bg-emerald-900/20" : "bg-emerald-50/60";
  const barBg = dark ? "bg-emerald-500/30" : "bg-emerald-200";
  const dateBg = dark ? "bg-neutral-800/60" : "bg-neutral-50";

  return (
    <div className="space-y-4">
      <div className={`rounded-xl border ${t.card}`}>
        {/* Header */}
        <div className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b ${t.borderLight}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${dark ? "bg-emerald-900/40" : "bg-emerald-50"}`}>
              <CheckCircle2 className={`h-5 w-5 ${dark ? "text-emerald-400" : "text-emerald-600"}`} aria-hidden="true" />
            </div>
            <div>
              <h3 className={`text-sm font-bold ${t.text}`}>Fee Petition Approved</h3>
              <p className={`text-[13px] ${t.textMuted} mt-0.5`}>
                {weekTotal > 0 ? `${weekTotal} approved — ` : ""}{formatWeekLabel(monday)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setWeekOffset((v) => v - 1)}
              className={`h-8 w-8 rounded-md flex items-center justify-center transition-colors ${t.hover} ${t.textSub}`}
              aria-label="Previous week"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className={`text-[13px] font-medium ${t.textSub} whitespace-nowrap px-2`}>
              {formatWeekLabel(monday)}
            </span>
            <button
              onClick={() => setWeekOffset((v) => v + 1)}
              disabled={weekOffset >= 0}
              className={`h-8 w-8 rounded-md flex items-center justify-center transition-colors ${t.hover} ${t.textSub} disabled:opacity-40`}
              aria-label="Next week"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
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
            <span className={`ml-2 text-sm ${t.textSub}`}>Loading approved petitions...</span>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && weekTotal === 0 && (
          <div className="flex flex-col items-center justify-center py-16">
            <CheckCircle2 className={`h-8 w-8 ${t.textMuted} mb-3`} aria-hidden="true" />
            <p className={`text-sm font-medium ${t.text}`}>No fee petitions approved this week</p>
          </div>
        )}

        {/* Daily table */}
        {!loading && !error && days.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-100 border-collapse">
              <thead>
                <tr className={`border-b ${t.borderLight}`}>
                  <th className={`${thBase} ${t.textSub} text-left`}>Day</th>
                  <th className={`${thBase} ${t.textSub} text-right`}>Approved</th>
                  <th className={`${thBase} ${t.textSub} text-left`}></th>
                </tr>
              </thead>
              <tbody>
                {days.map((d) => (
                  <tr
                    key={d.date}
                    className={`border-b ${rowDivide} ${rowHover} transition-colors ${isToday(d.date) ? todayBg : ""}`}
                  >
                    <td className={`${tdBase} ${t.text} font-medium`}>
                      {fmtDate(d.date)}
                      {isToday(d.date) && (
                        <span className={`ml-1.5 text-[12px] font-semibold ${dark ? "text-emerald-400" : "text-emerald-600"}`}>
                          Today
                        </span>
                      )}
                    </td>
                    <td className={`${tdBase} text-right font-semibold tabular-nums ${d.count > 0 ? t.text : t.textMuted}`}>
                      {d.count > 0 ? d.count : "—"}
                    </td>
                    <td className={`${tdBase} w-1/2`}>
                      <div className={`h-2 rounded-full ${dark ? "bg-neutral-800" : "bg-neutral-100"}`}>
                        <div
                          className={`h-2 rounded-full ${barBg}`}
                          style={{ width: `${(d.count / maxCount) * 100}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className={dark ? "bg-neutral-800/60" : "bg-neutral-50"}>
                  <td className={`${tdBase} font-semibold ${t.text}`}>Week Total</td>
                  <td className={`${tdBase} text-right font-bold tabular-nums ${t.text}`}>{weekTotal}</td>
                  <td className={tdBase}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Per-day case list */}
      {!loading && !error && approvalDates.length > 0 && (
        <div className={`rounded-xl border ${t.card}`}>
          <div className={`p-4 border-b ${t.borderLight}`}>
            <h4 className={`text-sm font-bold ${t.text}`}>
              Approved — {formatWeekLabel(monday)}
            </h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className={`border-b ${t.borderLight}`}>
                  <th className={`${thBase} ${t.textMuted}`}>Case Name</th>
                  <th className={`${thBase} ${t.textMuted}`}>Assigned To</th>
                </tr>
              </thead>
              <tbody>
                {approvalDates.map((date) => (
                  <Fragment key={date}>
                    <tr className={`border-b ${rowDivide}`}>
                      <td
                        colSpan={2}
                        className={`px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider ${t.textMuted} ${dateBg}`}
                      >
                        {fmtDate(date)}{isToday(date) && <span className={`ml-1.5 ${dark ? "text-emerald-400" : "text-emerald-600"}`}>· Today</span>}
                      </td>
                    </tr>
                    {approvalsByDate[date].map((a) => (
                      <tr
                        key={a.id}
                        className={`border-b ${rowDivide} ${rowHover} transition-colors`}
                      >
                        <td className={`${tdBase} font-medium ${t.text}`}>
                          {a.externalId ? (
                            <a
                              href={a.externalId}
                              target="_blank"
                              rel="noreferrer"
                              className={`inline-flex items-center gap-1 hover:underline ${dark ? "text-indigo-400" : "text-indigo-600"}`}
                            >
                              {a.caseName}
                              <ExternalLink className="h-3 w-3 opacity-50 shrink-0" aria-hidden="true" />
                            </a>
                          ) : (
                            a.caseName
                          )}
                        </td>
                        <td className={`${tdBase} ${t.textMuted}`}>{a.assignedTo ?? "—"}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
