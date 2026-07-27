"use client";

import { useState, useEffect, useRef, Fragment } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, PhoneCall, AlertCircle, ExternalLink, Check, Table2, MessageSquare, LayoutGrid, type LucideIcon } from "lucide-react";
import { buildMyCaseUrl } from "@/lib/import/case-link";
import { themeClasses } from "@/lib/theme-classes";
import { getMonday, formatWeekLabelShort as formatWeekLabel, toChatBlock, toTeamsHtml } from "@/lib/formatters";

type CopyFormat = "sheets" | "chat" | "teams";
const COPY_FORMATS: { format: CopyFormat; Icon: LucideIcon; label: string; ariaLabel: string; title: string }[] = [
  { format: "sheets", Icon: Table2,       label: "Sheets", ariaLabel: "Copy for Google Sheets",    title: "Copy for Google Sheets (tab-separated)" },
  { format: "chat",   Icon: MessageSquare, label: "Chat",   ariaLabel: "Copy for Google Chat",      title: "Copy for Google Chat (monospace code block)" },
  { format: "teams",  Icon: LayoutGrid,    label: "Teams",  ariaLabel: "Copy for Microsoft Teams",  title: "Copy for Microsoft Teams (HTML table)" },
];

interface AgentCount {
  name: string;
  count: number;
}

interface FollowUpRow {
  id: string;
  caseId: number;
  caseName: string;
  externalId: string | null;
  assignedTo: string | null;
  date: string;
  source: "master_fees" | "fee_petition";
}

interface FollowUpsTabProps {
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

export function FollowUpsTab({ dark, t }: FollowUpsTabProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [agents, setAgents] = useState<AgentCount[]>([]);
  const [followUps, setFollowUps] = useState<FollowUpRow[]>([]);
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

    fetch(`/api/follow-ups?week=${monday}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load follow-ups (${res.status})`);
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;
        setAgents(json.agents ?? []);
        setFollowUps(json.followUps ?? []);
      })
      .catch((err) => {
        if (cancelled || (err as Error).name === "AbortError") return;
        setError((err as Error).message);
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [monday]);

  const weekTotal = agents.reduce((s, a) => s + a.count, 0);
  const maxCount = Math.max(1, ...agents.map((a) => a.count));

  const byDate = followUps.reduce<Record<string, FollowUpRow[]>>((acc, f) => {
    (acc[f.date] ??= []).push(f);
    return acc;
  }, {});
  const dates = Object.keys(byDate).sort();

  const rowDivide = dark ? "border-neutral-800/40" : "border-neutral-100";
  const rowHover  = dark ? "hover:bg-neutral-800/30" : "hover:bg-neutral-50";
  const todayBg   = dark ? "bg-orange-900/20" : "bg-orange-50/60";
  const barBg     = dark ? "bg-orange-500/30" : "bg-orange-200";
  const dateBg    = dark ? "bg-neutral-800/60" : "bg-neutral-50";

  const copyTable = (format: CopyFormat) => {
    const weekLabel = formatWeekLabel(monday);
    const summaryTitle  = `Follow-Ups Due — ${weekLabel}`;
    const summaryHeader = ["Agent", "Follow-Ups"];
    const summaryRows: (string | number)[][] = [
      ...agents.map((a) => [a.name, a.count]),
      ["Total", weekTotal],
    ];
    const listTitle  = `Follow-Up Cases — ${weekLabel}`;
    const listHeader = ["Date", "Case Name", "Agent", "Source"];
    const listRows: (string | number)[][] = dates.flatMap((date) =>
      byDate[date].map((f) => [
        fmtDate(date),
        f.caseName,
        f.assignedTo ?? "—",
        f.source === "fee_petition" ? "Fee Petition" : "Master Fees",
      ])
    );
    const done = () => {
      setCopiedTable(format);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopiedTable(null), 1500);
    };
    if (format === "teams") {
      const html = toTeamsHtml(summaryTitle, summaryHeader, summaryRows) +
        (listRows.length ? toTeamsHtml(listTitle, listHeader, listRows) : "");
      const blob = new Blob([html], { type: "text/html" });
      navigator.clipboard.write([new ClipboardItem({ "text/html": blob })]).then(done).catch(console.warn);
    } else if (format === "sheets") {
      const lines = [
        summaryTitle, summaryHeader.join("\t"), ...summaryRows.map((r) => r.join("\t")),
        "",
        ...(listRows.length ? [listTitle, listHeader.join("\t"), ...listRows.map((r) => r.join("\t"))] : []),
      ];
      navigator.clipboard.writeText(lines.join("\n")).then(done);
    } else {
      const parts = [toChatBlock(summaryTitle, summaryHeader, summaryRows)];
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
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${dark ? "bg-orange-900/40" : "bg-orange-50"}`}>
              <PhoneCall className={`h-5 w-5 ${dark ? "text-orange-400" : "text-orange-600"}`} aria-hidden="true" />
            </div>
            <div>
              <h3 className={`text-sm font-bold ${t.text}`}>Follow-Ups Due</h3>
              <p className={`text-[13px] ${t.textMuted} mt-0.5`}>
                {weekTotal > 0 ? `${weekTotal} follow-up${weekTotal !== 1 ? "s" : ""} · ${agents.length} agent${agents.length !== 1 ? "s" : ""} — ` : ""}
                {formatWeekLabel(monday)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {!loading && !error && agents.length > 0 && COPY_FORMATS.map(({ format, Icon, label, ariaLabel, title }) => (
              <button
                key={format}
                onClick={() => copyTable(format)}
                aria-label={ariaLabel}
                title={title}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[13px] font-medium border transition-colors ${
                  copiedTable === format
                    ? (dark ? "border-orange-700 text-orange-400" : "border-orange-300 text-orange-600")
                    : (dark ? "border-neutral-700 text-neutral-300 hover:bg-neutral-800" : "border-neutral-200 text-neutral-600 hover:bg-neutral-50")
                }`}
              >
                {copiedTable === format
                  ? <><Check aria-hidden="true" className="h-3.5 w-3.5" />Copied</>
                  : <><Icon aria-hidden="true" className="h-3.5 w-3.5" />{label}</>}
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
          <div className={`m-4 rounded-lg border p-3 flex items-center gap-2 text-xs ${dark ? "bg-red-900/20 border-red-800 text-red-400" : "bg-red-50 border-red-200 text-red-700"}`} role="alert">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className={`h-5 w-5 animate-spin ${t.textMuted}`} aria-hidden="true" />
            <span className={`ml-2 text-sm ${t.textSub}`}>Loading follow-ups...</span>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && weekTotal === 0 && (
          <div className="flex flex-col items-center justify-center py-16">
            <PhoneCall className={`h-8 w-8 ${t.textMuted} mb-3`} aria-hidden="true" />
            <p className={`text-sm font-medium ${t.text}`}>No follow-ups scheduled this week</p>
          </div>
        )}

        {/* Per-agent summary table */}
        {!loading && !error && agents.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className={`border-b ${t.borderLight}`}>
                  <th className={`${thBase} ${t.textMuted} text-left`}>Agent</th>
                  <th className={`${thBase} ${t.textMuted} text-right`}>Follow-Ups</th>
                  <th className={`${thBase} ${t.textMuted} text-left w-1/2`}></th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => (
                  <tr key={a.name} className={`border-b ${rowDivide} ${rowHover} transition-colors`}>
                    <td className={`${tdBase} font-medium ${t.text} whitespace-nowrap`}>{a.name}</td>
                    <td className={`${tdBase} text-right font-semibold tabular-nums ${t.text}`}>{a.count}</td>
                    <td className={`${tdBase} w-1/2`}>
                      <div className={`h-2 rounded-full ${dark ? "bg-neutral-800" : "bg-neutral-100"}`}>
                        <div className={`h-2 rounded-full ${barBg}`} style={{ width: `${(a.count / maxCount) * 100}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className={dark ? "bg-neutral-800/60" : "bg-neutral-50"}>
                  <td className={`${tdBase} font-semibold ${t.text}`}>Total</td>
                  <td className={`${tdBase} text-right font-bold tabular-nums ${t.text}`}>{weekTotal}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Per-date case list */}
      {!loading && !error && dates.length > 0 && (
        <div className={`rounded-xl border ${t.card}`}>
          <div className={`p-4 border-b ${t.borderLight}`}>
            <h4 className={`text-sm font-bold ${t.text}`}>Follow-Up Cases — {formatWeekLabel(monday)}</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className={`border-b ${t.borderLight}`}>
                  <th className={`${thBase} ${t.textMuted}`}>Case Name</th>
                  <th className={`${thBase} ${t.textMuted}`}>Agent</th>
                  <th className={`${thBase} ${t.textMuted}`}>Source</th>
                </tr>
              </thead>
              <tbody>
                {dates.map((date) => (
                  <Fragment key={date}>
                    <tr className={`border-b ${rowDivide} ${isToday(date) ? todayBg : ""}`}>
                      <td colSpan={3} className={`px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider ${t.textMuted} ${isToday(date) ? "" : dateBg}`}>
                        {fmtDate(date)}
                        {isToday(date) && (
                          <span className={`ml-1.5 ${dark ? "text-orange-400" : "text-orange-600"}`}>· Today</span>
                        )}
                      </td>
                    </tr>
                    {byDate[date].map((f) => (
                      <tr key={f.id} className={`border-b ${rowDivide} ${rowHover} transition-colors`}>
                        <td className={`${tdBase} font-medium ${t.text}`}>
                          <a
                            href={f.externalId ?? buildMyCaseUrl(f.caseId)}
                            target="_blank"
                            rel="noreferrer"
                            className={`inline-flex items-center gap-1 hover:underline ${dark ? "text-indigo-400" : "text-indigo-600"}`}
                          >
                            {f.caseName}
                            <ExternalLink className="h-3 w-3 opacity-50 shrink-0" aria-hidden="true" />
                          </a>
                        </td>
                        <td className={`${tdBase} ${t.textMuted}`}>{f.assignedTo ?? "—"}</td>
                        <td className={`${tdBase}`}>
                          <span className={`text-[11px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                            f.source === "fee_petition"
                              ? (dark ? "bg-purple-900/40 text-purple-300" : "bg-purple-50 text-purple-600")
                              : (dark ? "bg-neutral-800 text-neutral-400"  : "bg-neutral-100 text-neutral-500")
                          }`}>
                            {f.source === "fee_petition" ? "Fee Petition" : "Master Fees"}
                          </span>
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
