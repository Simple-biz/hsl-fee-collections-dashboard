"use client";

import { useState, useEffect, useRef, Fragment } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, ClipboardList, AlertCircle } from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";

interface DailyMetricRow {
  agent: string;
  date: string;
  ssaCalls: number;
  clientCallsIb: number;
  clientCallsOb: number;
  winSheetsCreated: number;
  notes: string | null;
}

interface AuditLogTabProps {
  dark: boolean;
  t: ReturnType<typeof themeClasses>;
}

const getMonday = (offset = 0): string => {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1) + offset * 7);
  return d.toISOString().split("T")[0];
};

const formatWeekLabel = (monday: string): string => {
  const start = new Date(monday + "T00:00:00");
  const end = new Date(monday + "T00:00:00");
  end.setDate(end.getDate() + 4);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${start.toLocaleDateString("en-US", opts)} – ${end.toLocaleDateString("en-US", { ...opts, year: "numeric" })}`;
};

const fmtDate = (iso: string): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

const thBase = "px-3 py-2 text-[11px] font-semibold uppercase tracking-wide";
const tdBase = "px-3 py-2 text-xs";

export function AuditLogTab({ dark, t }: AuditLogTabProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [rows, setRows] = useState<DailyMetricRow[]>([]);
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

    fetch(`/api/daily-metrics?week=${monday}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load audit log (${res.status})`);
        return res.json();
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
  }, [monday]);

  const byDate = rows.reduce<Record<string, DailyMetricRow[]>>((acc, r) => {
    (acc[r.date] ??= []).push(r);
    return acc;
  }, {});
  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  const rowDivide = dark ? "border-neutral-800/40" : "border-neutral-100";
  const rowHover  = dark ? "hover:bg-neutral-800/30" : "hover:bg-neutral-50";
  const dateBg    = dark ? "bg-neutral-800/60" : "bg-neutral-50";

  return (
    <div className={`rounded-xl border ${t.card}`}>
      {/* Header */}
      <div className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b ${t.borderLight}`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${dark ? "bg-indigo-900/40" : "bg-indigo-50"}`}>
            <ClipboardList className={`h-5 w-5 ${dark ? "text-indigo-400" : "text-indigo-600"}`} aria-hidden="true" />
          </div>
          <div>
            <h3 className={`text-sm font-bold ${t.text}`}>Audit Log</h3>
            <p className={`text-[11px] ${t.textMuted} mt-0.5`}>
              Daily agent activity — {formatWeekLabel(monday)}
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
          <span className={`text-[11px] font-medium ${t.textSub} whitespace-nowrap px-2`}>
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
          <span className={`ml-2 text-sm ${t.textSub}`}>Loading audit log...</span>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && dates.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16">
          <ClipboardList className={`h-8 w-8 ${t.textMuted} mb-3`} aria-hidden="true" />
          <p className={`text-sm font-medium ${t.text}`}>No activity logged for this week</p>
          <p className={`text-xs ${t.textMuted} mt-1`}>
            Daily call entries appear here once agents log their activity in Reports.
          </p>
        </div>
      )}

      {/* Table */}
      {!loading && !error && dates.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-150">
            <thead>
              <tr className={`border-b ${t.borderLight}`}>
                <th className={`${thBase} ${t.textSub} text-left`}>Agent</th>
                <th className={`${thBase} ${t.textSub} text-right`}>SSA Calls</th>
                <th className={`${thBase} ${t.textSub} text-right`}>Client IB</th>
                <th className={`${thBase} ${t.textSub} text-right`}>Client OB</th>
                <th className={`${thBase} ${t.textSub} text-right`}>Win Sheets</th>
                <th className={`${thBase} ${t.textSub} text-left`}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {dates.map((date) => (
                <Fragment key={date}>
                  <tr className={dateBg}>
                    <td colSpan={6} className={`${tdBase} font-semibold ${t.textSub}`}>
                      {fmtDate(date)}
                    </td>
                  </tr>
                  {byDate[date]
                    .slice()
                    .sort((a, b) => a.agent.localeCompare(b.agent))
                    .map((row) => (
                      <tr
                        key={`${date}-${row.agent}`}
                        className={`border-b ${rowDivide} ${rowHover} transition-colors`}
                      >
                        <td className={`${tdBase} ${t.text} font-medium pl-6`}>{row.agent}</td>
                        <td className={`${tdBase} text-right ${row.ssaCalls > 0 ? t.text : t.textMuted}`}>
                          {row.ssaCalls || "—"}
                        </td>
                        <td className={`${tdBase} text-right ${row.clientCallsIb > 0 ? t.text : t.textMuted}`}>
                          {row.clientCallsIb || "—"}
                        </td>
                        <td className={`${tdBase} text-right ${row.clientCallsOb > 0 ? t.text : t.textMuted}`}>
                          {row.clientCallsOb || "—"}
                        </td>
                        <td className={`${tdBase} text-right ${row.winSheetsCreated > 0 ? t.text : t.textMuted}`}>
                          {row.winSheetsCreated || "—"}
                        </td>
                        <td className={`${tdBase} max-w-64 truncate ${row.notes ? t.textSub : t.textMuted}`}>
                          {row.notes || "—"}
                        </td>
                      </tr>
                    ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
