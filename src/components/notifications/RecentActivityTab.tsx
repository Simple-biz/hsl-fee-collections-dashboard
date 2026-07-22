"use client";

import { useState, useEffect, useRef, Fragment } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, Clock, AlertCircle, Check, Table2, MessageSquare, LayoutGrid, type LucideIcon } from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import { getMonday, formatWeekLabel, toChatBlock, toTeamsHtml } from "@/lib/formatters";

type CopyFormat = "sheets" | "chat" | "teams";
const COPY_FORMATS: { format: CopyFormat; Icon: LucideIcon; label: string; ariaLabel: string; title: string }[] = [
  { format: "sheets", Icon: Table2, label: "Sheets", ariaLabel: "Copy for Google Sheets", title: "Copy for Google Sheets (tab-separated)" },
  { format: "chat", Icon: MessageSquare, label: "Chat", ariaLabel: "Copy for Google Chat", title: "Copy for Google Chat (monospace code block)" },
  { format: "teams", Icon: LayoutGrid, label: "Teams", ariaLabel: "Copy for Microsoft Teams", title: "Copy for Microsoft Teams (HTML table)" },
];

interface ActivityEntry {
  id: string;
  caseId: number;
  message: string;
  createdBy: string;
  createdAt: string;
  caseName: string | null;
}

interface RecentActivityTabProps {
  dark: boolean;
  t: ReturnType<typeof themeClasses>;
}

const fmtDateOnly = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

const toDateKey = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-CA");

const thBase = "px-3 py-2 text-[13px] font-semibold uppercase tracking-wide";
const tdBase = "px-3 py-2 text-xs";

export function RecentActivityTab({ dark, t }: RecentActivityTabProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [copiedTable, setCopiedTable] = useState<"sheets" | "chat" | "teams" | null>(null);
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

    fetch(`/api/activity-log?week=${monday}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load activity log (${res.status})`);
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;
        setEntries(json.data ?? []);
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

  const byDate = entries.reduce<Record<string, ActivityEntry[]>>((acc, e) => {
    const key = toDateKey(e.createdAt);
    (acc[key] ??= []).push(e);
    return acc;
  }, {});
  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  const rowDivide = dark ? "border-neutral-800/40" : "border-neutral-100";
  const rowHover  = dark ? "hover:bg-neutral-800/30" : "hover:bg-neutral-50";
  const dateBg    = dark ? "bg-neutral-800/60" : "bg-neutral-50";

  const copyTable = (format: "sheets" | "chat" | "teams") => {
    const title = `Recent Activity — ${formatWeekLabel(monday)}`;
    const header = ["Date", "Time", "Agent", "Case", "Activity"];
    const rows = dates.flatMap((date) =>
      byDate[date].map((e) => [
        fmtDateOnly(date + "T12:00:00"),
        new Date(e.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
        e.createdBy,
        e.caseName ?? "—",
        e.message,
      ])
    );
    const done = () => {
      setCopiedTable(format);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopiedTable(null), 1500);
    };
    if (format === "teams") {
      const blob = new Blob([toTeamsHtml(title, header, rows)], { type: "text/html" });
      navigator.clipboard.write([new ClipboardItem({ "text/html": blob })]).then(done).catch(console.warn);
    } else if (format === "sheets") {
      const lines = [title, header.join("\t"), ...rows.map((r) => r.join("\t"))];
      navigator.clipboard.writeText(lines.join("\n")).then(done);
    } else {
      navigator.clipboard.writeText(toChatBlock(title, header, rows)).then(done);
    }
  };

  return (
    <div className={`rounded-xl border ${t.card}`}>
      {/* Header */}
      <div className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b ${t.borderLight}`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${dark ? "bg-amber-900/40" : "bg-amber-50"}`}>
            <Clock className={`h-5 w-5 ${dark ? "text-amber-400" : "text-amber-600"}`} aria-hidden="true" />
          </div>
          <div>
            <h3 className={`text-sm font-bold ${t.text}`}>Recent Activity</h3>
            <p className={`text-[13px] ${t.textMuted} mt-0.5`}>
              Case activity log — {formatWeekLabel(monday)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {!loading && !error && dates.length > 0 && COPY_FORMATS.map(({ format, Icon, label, ariaLabel, title }) => (
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
          <span className={`ml-2 text-sm ${t.textSub}`}>Loading activity...</span>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && dates.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16">
          <Clock className={`h-8 w-8 ${t.textMuted} mb-3`} aria-hidden="true" />
          <p className={`text-sm font-medium ${t.text}`}>No activity logged for this week</p>
          <p className={`text-xs ${t.textMuted} mt-1`}>
            Case updates appear here as agents work their cases.
          </p>
        </div>
      )}

      {/* Table */}
      {!loading && !error && dates.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-150">
            <thead>
              <tr className={`border-b ${t.borderLight}`}>
                <th className={`${thBase} ${t.textSub} text-left`}>Time</th>
                <th className={`${thBase} ${t.textSub} text-left`}>Agent</th>
                <th className={`${thBase} ${t.textSub} text-left`}>Case</th>
                <th className={`${thBase} ${t.textSub} text-left`}>Activity</th>
              </tr>
            </thead>
            <tbody>
              {dates.map((date) => (
                <Fragment key={date}>
                  <tr className={dateBg}>
                    <td colSpan={4} className={`${tdBase} font-semibold ${t.textSub}`}>
                      {fmtDateOnly(date + "T12:00:00")}
                    </td>
                  </tr>
                  {byDate[date].map((entry) => (
                    <tr
                      key={entry.id}
                      className={`border-b ${rowDivide} ${rowHover} transition-colors`}
                    >
                      <td className={`${tdBase} ${t.textMuted} shrink-0 whitespace-nowrap`}>
                        {new Date(entry.createdAt).toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className={`${tdBase} ${t.text} font-medium whitespace-nowrap`}>
                        {entry.createdBy}
                      </td>
                      <td className={`${tdBase} ${entry.caseName ? t.textSub : t.textMuted} whitespace-nowrap`}>
                        {entry.caseName ?? "—"}
                      </td>
                      <td className={`${tdBase} ${t.textSub} max-w-xs`}>
                        {entry.message}
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
