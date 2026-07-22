"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw, PhoneMissed, AlertCircle, ExternalLink, Check, Table2, MessageSquare, LayoutGrid, type LucideIcon } from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import { toChatBlock, toTeamsHtml } from "@/lib/formatters";

type CopyFormat = "sheets" | "chat" | "teams";
const COPY_FORMATS: { format: CopyFormat; Icon: LucideIcon; label: string; ariaLabel: string; title: string }[] = [
  { format: "sheets", Icon: Table2, label: "Sheets", ariaLabel: "Copy for Google Sheets", title: "Copy for Google Sheets (tab-separated)" },
  { format: "chat", Icon: MessageSquare, label: "Chat", ariaLabel: "Copy for Google Chat", title: "Copy for Google Chat (monospace code block)" },
  { format: "teams", Icon: LayoutGrid, label: "Teams", ariaLabel: "Copy for Microsoft Teams", title: "Copy for Microsoft Teams (HTML table)" },
];
import Link from "next/link";

interface BacklogRow {
  id: number;
  weekStart: string;
  callDate: string;
  number: string;
  transcript: string;
  caseLink: string;
  specialistAssigned: string;
}

interface CallsBacklogTabProps {
  dark: boolean;
  t: ReturnType<typeof themeClasses>;
}

const fmtDate = (iso: string): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

const thBase = "px-3 py-2 text-[13px] font-semibold uppercase tracking-wide";
const tdBase = "px-3 py-2 text-xs";

export function CallsBacklogTab({ dark, t }: CallsBacklogTabProps) {
  const [rows, setRows] = useState<BacklogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [copiedTable, setCopiedTable] = useState<"sheets" | "chat" | "teams" | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (copyTimerRef.current) clearTimeout(copyTimerRef.current); }, []);

  const fetchBacklog = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/inbound-calls/backlog", { signal: controller.signal });
      if (!res.ok) throw new Error(`Failed to load calls backlog (${res.status})`);
      const json = await res.json() as { data: BacklogRow[] };
      if (controller.signal.aborted) return;
      setRows(json.data ?? []);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError((e as Error).message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchBacklog();
    return () => { abortRef.current?.abort(); };
  }, [fetchBacklog]);

  const rowDivide = dark ? "border-neutral-800/40" : "border-neutral-100";
  const rowHover = dark ? "hover:bg-neutral-800/30" : "hover:bg-neutral-50";

  const copyTable = (format: "sheets" | "chat" | "teams") => {
    const title = "Calls Backlog";
    const header = ["Call Date", "Number", "Reason", "Case Link", "Specialist"];
    const tableRows: (string | number)[][] = rows.map((r) => [
      fmtDate(r.callDate),
      r.number || "—",
      r.transcript || "—",
      r.caseLink || "—",
      r.specialistAssigned || "—",
    ]);
    const done = () => {
      setCopiedTable(format);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopiedTable(null), 1500);
    };
    if (format === "teams") {
      const blob = new Blob([toTeamsHtml(title, header, tableRows)], { type: "text/html" });
      navigator.clipboard.write([new ClipboardItem({ "text/html": blob })]).then(done).catch(console.warn);
    } else if (format === "sheets") {
      const lines = [title, header.join("\t"), ...tableRows.map((r) => r.join("\t"))];
      navigator.clipboard.writeText(lines.join("\n")).then(done);
    } else {
      navigator.clipboard.writeText(toChatBlock(title, header, tableRows)).then(done);
    }
  };

  return (
    <div className="space-y-4">
      <div className={`rounded-xl border ${t.card}`}>
        {/* Header */}
        <div className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b ${t.borderLight}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${dark ? "bg-amber-900/40" : "bg-amber-50"}`}>
              <PhoneMissed className={`h-5 w-5 ${dark ? "text-amber-400" : "text-amber-600"}`} aria-hidden="true" />
            </div>
            <div>
              <h3 className={`text-sm font-bold ${t.text}`}>Calls Backlog</h3>
              <p className={`text-[13px] ${t.textMuted} mt-0.5`}>
                {loading ? "Loading…" : `${rows.length} call${rows.length !== 1 ? "s" : ""} pending callback — oldest first`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-wrap justify-end">
            {!loading && !error && rows.length > 0 && COPY_FORMATS.map(({ format, Icon, label, ariaLabel, title }) => (
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
              onClick={fetchBacklog}
              disabled={loading}
              aria-label="Refresh calls backlog"
              className={`h-8 w-8 rounded-md flex items-center justify-center border transition-colors ${t.outlineBtn}`}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
            </button>
            <Link
              href="/inbound-calls"
              className={`h-8 px-3 rounded-md text-xs font-medium flex items-center gap-1.5 border transition-colors ${t.outlineBtn}`}
            >
              Go to Inbound Calls
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className={`m-4 rounded-lg border p-3 flex items-center gap-2 text-xs ${dark ? "bg-red-900/20 border-red-800 text-red-400" : "bg-red-50 border-red-200 text-red-700"}`} role="alert">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className={`h-5 w-5 animate-spin ${t.textMuted}`} aria-hidden="true" />
            <span className={`ml-2 text-sm ${t.textSub}`}>Loading backlog...</span>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16">
            <PhoneMissed className={`h-8 w-8 ${t.textMuted} mb-3`} aria-hidden="true" />
            <p className={`text-sm font-medium ${t.text}`}>No pending callbacks</p>
            <p className={`text-xs ${t.textMuted} mt-1`}>All inbound calls have been called back or resolved.</p>
          </div>
        )}

        {/* Table */}
        {!loading && !error && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr className={`border-b ${t.borderLight}`}>
                  <th className={`${thBase} ${t.textMuted} text-left`} style={{ width: 110 }}>Call Date</th>
                  <th className={`${thBase} ${t.textMuted} text-left`} style={{ width: 130 }}>Number</th>
                  <th className={`${thBase} ${t.textMuted} text-left`}>Reason</th>
                  <th className={`${thBase} ${t.textMuted} text-left`} style={{ width: 160 }}>Case Link</th>
                  <th className={`${thBase} ${t.textMuted} text-left`} style={{ width: 160 }}>Specialist</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className={`border-b last:border-0 ${rowDivide} ${rowHover} transition-colors`}>
                    <td className={`${tdBase} font-medium ${t.text}`}>{fmtDate(row.callDate)}</td>
                    <td className={`${tdBase} ${t.textSub}`}>{row.number || <span className={t.textMuted}>—</span>}</td>
                    <td className={`${tdBase} ${t.textSub} max-w-xs`}>
                      {row.transcript
                        ? <span className="line-clamp-2">{row.transcript}</span>
                        : <span className={t.textMuted}>—</span>}
                    </td>
                    <td className={`${tdBase}`}>
                      {row.caseLink ? (
                        <a
                          href={row.caseLink.startsWith("http") ? row.caseLink : `https://rgdr.mycase.com/court_cases/${row.caseLink}`}
                          target="_blank"
                          rel="noreferrer"
                          className={`inline-flex items-center gap-1 text-xs hover:underline ${dark ? "text-indigo-400" : "text-indigo-600"}`}
                        >
                          {row.caseLink.startsWith("http") ? "Open" : row.caseLink}
                          <ExternalLink className="h-3 w-3 opacity-50 shrink-0" aria-hidden="true" />
                        </a>
                      ) : <span className={t.textMuted}>—</span>}
                    </td>
                    <td className={`${tdBase} ${t.textSub}`}>{row.specialistAssigned || <span className={t.textMuted}>—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
