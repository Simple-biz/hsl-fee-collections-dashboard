"use client";

import { useState, useEffect, useRef, Fragment } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, DollarSign, AlertCircle, ExternalLink, Check, Table2, MessageSquare, LayoutGrid, type LucideIcon } from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import { getMonday, formatWeekLabelShort as formatWeekLabel, fmt, toChatBlock, toTeamsHtml } from "@/lib/formatters";

type CopyFormat = "sheets" | "chat" | "teams";
const COPY_FORMATS: { format: CopyFormat; Icon: LucideIcon; label: string; ariaLabel: string; title: string }[] = [
  { format: "sheets", Icon: Table2, label: "Sheets", ariaLabel: "Copy for Google Sheets", title: "Copy for Google Sheets (tab-separated)" },
  { format: "chat", Icon: MessageSquare, label: "Chat", ariaLabel: "Copy for Google Chat", title: "Copy for Google Chat (monospace code block)" },
  { format: "teams", Icon: LayoutGrid, label: "Teams", ariaLabel: "Copy for Microsoft Teams", title: "Copy for Microsoft Teams (HTML table)" },
];

interface DayTotal {
  date: string;
  total: number;
  count: number;
}

interface PaymentRow {
  id: string;
  caseId: number;
  caseName: string;
  externalId: string | null;
  feeType: string;
  amount: number;
  receivedDate: string;
  assignedTo: string | null;
  createdAt: string;
  date: string;
}

interface PaymentsTabProps {
  dark: boolean;
  t: ReturnType<typeof themeClasses>;
}


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

export function PaymentsTab({ dark, t }: PaymentsTabProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [days, setDays] = useState<DayTotal[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [copiedTable, setCopiedTable] = useState<CopyFormat | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (copyTimerRef.current) clearTimeout(copyTimerRef.current); }, []);

  const monday = getMonday(weekOffset);

  useEffect(() => {
    let cancelled = false;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    fetch(`/api/fees-received?week=${monday}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load payments (${res.status})`);
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;
        setDays(json.data ?? []);
        setPayments(json.payments ?? []);
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

  const weekTotal = days.reduce((sum, d) => sum + d.total, 0);
  const weekCount = days.reduce((sum, d) => sum + d.count, 0);
  const maxTotal = Math.max(1, ...days.map((d) => d.total));

  const paymentsByDate = payments.reduce<Record<string, PaymentRow[]>>((acc, p) => {
    (acc[p.date] ??= []).push(p);
    return acc;
  }, {});
  const paymentDates = Object.keys(paymentsByDate).sort((a, b) => b.localeCompare(a));

  const rowDivide = dark ? "border-neutral-800/40" : "border-neutral-100";
  const rowHover = dark ? "hover:bg-neutral-800/30" : "hover:bg-neutral-50";
  const todayBg = dark ? "bg-emerald-900/20" : "bg-emerald-50/60";
  const barBg = dark ? "bg-emerald-500/30" : "bg-emerald-200";
  const dateBg = dark ? "bg-neutral-800/60" : "bg-neutral-50";

  const copyTable = (format: CopyFormat) => {
    const weekLabel = formatWeekLabel(monday);
    const countTitle = `Payments Received — ${weekLabel}`;
    const countHeader = ["Day", "Amount", "Count"];
    const countRows: (string | number)[][] = [
      ...days.map((d) => [fmtDate(d.date), fmt(d.total), d.count]),
      ["Week Total", fmt(weekTotal), weekCount],
    ];
    const listTitle = `Payments Entered — ${weekLabel}`;
    const listHeader = ["Date", "Case Name", "Amount", "Type", "Agent"];
    const listRows: (string | number)[][] = paymentDates.flatMap((date) =>
      paymentsByDate[date].map((p) => [fmtDate(date), p.caseName, fmt(p.amount), p.feeType, p.assignedTo ?? "—"])
    );
    const done = () => {
      setCopiedTable(format);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopiedTable(null), 1500);
    };
    if (format === "teams") {
      const html = toTeamsHtml(countTitle, countHeader, countRows) +
        (listRows.length ? toTeamsHtml(listTitle, listHeader, listRows) : "");
      const blob = new Blob([html], { type: "text/html" });
      navigator.clipboard.write([new ClipboardItem({ "text/html": blob })]).then(done).catch(console.warn);
    } else if (format === "sheets") {
      const lines = [
        countTitle, countHeader.join("\t"), ...countRows.map((r) => r.join("\t")),
        "",
        ...(listRows.length ? [listTitle, listHeader.join("\t"), ...listRows.map((r) => r.join("\t"))] : []),
      ];
      navigator.clipboard.writeText(lines.join("\n")).then(done);
    } else {
      const parts = [toChatBlock(countTitle, countHeader, countRows)];
      if (listRows.length) parts.push(toChatBlock(listTitle, listHeader, listRows));
      navigator.clipboard.writeText(parts.join("\n\n")).then(done);
    }
  };

  return (
    <div className="space-y-4">
      <div className={`rounded-xl border ${t.card}`}>
        {/* Header */}
        <div className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b ${t.borderLight}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${dark ? "bg-emerald-900/40" : "bg-emerald-50"}`}>
              <DollarSign className={`h-5 w-5 ${dark ? "text-emerald-400" : "text-emerald-600"}`} aria-hidden="true" />
            </div>
            <div>
              <h3 className={`text-sm font-bold ${t.text}`}>Payments Received</h3>
              <p className={`text-[13px] ${t.textMuted} mt-0.5`}>
                {weekCount > 0 ? `${weekCount} payment${weekCount !== 1 ? "s" : ""} · ${fmt(weekTotal)} — ` : ""}
                {formatWeekLabel(monday)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {!loading && !error && days.length > 0 && COPY_FORMATS.map(({ format, Icon, label, ariaLabel, title }) => (
              <button
                key={format}
                onClick={() => copyTable(format)}
                aria-label={ariaLabel}
                title={title}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[13px] font-medium border transition-colors ${copiedTable === format ? (dark ? "border-emerald-700 text-emerald-400" : "border-emerald-300 text-emerald-600") : (dark ? "border-neutral-700 text-neutral-300 hover:bg-neutral-800" : "border-neutral-200 text-neutral-600 hover:bg-neutral-50")}`}
              >
                {copiedTable === format ? <><Check aria-hidden="true" className="h-3.5 w-3.5" />Copied</> : <><Icon aria-hidden="true" className="h-3.5 w-3.5" />{label}</>}
              </button>
            ))}
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
            <span className={`ml-2 text-sm ${t.textSub}`}>Loading payments...</span>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && weekCount === 0 && (
          <div className="flex flex-col items-center justify-center py-16">
            <DollarSign className={`h-8 w-8 ${t.textMuted} mb-3`} aria-hidden="true" />
            <p className={`text-sm font-medium ${t.text}`}>No payments recorded this week</p>
          </div>
        )}

        {/* Daily table */}
        {!loading && !error && days.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className={`border-b ${t.borderLight}`}>
                  <th className={`${thBase} ${t.textMuted} w-40`}>Day</th>
                  <th className={`${thBase} ${t.textMuted} text-right`}>Amount</th>
                  <th className={`${thBase} ${t.textMuted} w-full`}></th>
                </tr>
              </thead>
              <tbody>
                {days.map((d) => (
                  <tr
                    key={d.date}
                    className={`border-b ${rowDivide} ${isToday(d.date) ? todayBg : ""}`}
                  >
                    <td className={`${tdBase} font-medium ${t.text} whitespace-nowrap`}>
                      {fmtDate(d.date)}
                      {isToday(d.date) && (
                        <span className={`ml-1.5 text-[11px] font-semibold ${dark ? "text-emerald-400" : "text-emerald-600"}`}>
                          Today
                        </span>
                      )}
                    </td>
                    <td className={`${tdBase} text-right font-medium tabular-nums ${d.total > 0 ? t.text : t.textMuted} whitespace-nowrap`}>
                      {d.total > 0 ? fmt(d.total) : "—"}
                    </td>
                    <td className={`${tdBase} w-full`}>
                      {d.total > 0 && (
                        <div className="flex items-center gap-2">
                          <div className={`h-2 rounded-full ${barBg}`} style={{ width: `${Math.round((d.total / maxTotal) * 100)}%`, minWidth: "4px", maxWidth: "100%" }} />
                          <span className={`text-[11px] ${t.textMuted}`}>{d.count}</span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                <tr className={`border-t-2 ${t.borderLight}`}>
                  <td className={`${tdBase} font-semibold ${t.text}`}>Week Total</td>
                  <td className={`${tdBase} text-right font-semibold tabular-nums ${t.text}`}>{weekTotal > 0 ? fmt(weekTotal) : "—"}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Per-day case list */}
      {!loading && !error && paymentDates.length > 0 && (
        <div className={`rounded-xl border ${t.card}`}>
          <div className={`p-4 border-b ${t.borderLight}`}>
            <h4 className={`text-sm font-bold ${t.text}`}>
              Payments Entered — {formatWeekLabel(monday)}
            </h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className={`border-b ${t.borderLight}`}>
                  <th className={`${thBase} ${t.textMuted}`}>Case Name</th>
                  <th className={`${thBase} ${t.textMuted} text-right`}>Amount</th>
                  <th className={`${thBase} ${t.textMuted}`}>Type</th>
                  <th className={`${thBase} ${t.textMuted}`}>Agent</th>
                </tr>
              </thead>
              <tbody>
                {paymentDates.map((date) => (
                  <Fragment key={date}>
                    <tr className={`border-b ${rowDivide}`}>
                      <td
                        colSpan={4}
                        className={`px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider ${t.textMuted} ${dateBg}`}
                      >
                        {fmtDate(date)}{isToday(date) && <span className={`ml-1.5 ${dark ? "text-emerald-400" : "text-emerald-600"}`}>· Today</span>}
                      </td>
                    </tr>
                    {paymentsByDate[date].map((p) => (
                      <tr
                        key={p.id}
                        className={`border-b ${rowDivide} ${rowHover} transition-colors`}
                      >
                        <td className={`${tdBase} font-medium ${t.text}`}>
                          {p.externalId ? (
                            <a
                              href={p.externalId}
                              target="_blank"
                              rel="noreferrer"
                              className={`inline-flex items-center gap-1 hover:underline ${dark ? "text-indigo-400" : "text-indigo-600"}`}
                            >
                              {p.caseName}
                              <ExternalLink className="h-3 w-3 opacity-50 shrink-0" aria-hidden="true" />
                            </a>
                          ) : (
                            p.caseName
                          )}
                        </td>
                        <td className={`${tdBase} text-right font-medium tabular-nums ${t.text}`}>
                          {fmt(p.amount)}
                        </td>
                        <td className={`${tdBase} uppercase text-[11px] font-semibold ${t.textMuted}`}>
                          {p.feeType}
                        </td>
                        <td className={`${tdBase} ${t.textMuted}`}>
                          {p.assignedTo ?? "—"}
                        </td>
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
