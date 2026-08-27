"use client";

import { useState, useEffect, useRef, Fragment } from "react";
import { CalendarClock, ChevronLeft, ChevronRight, RefreshCw, AlertCircle, ExternalLink, Check, Table2, MessageSquare, type LucideIcon } from "lucide-react";
import { buildMyCaseUrl } from "@/lib/import/case-link";
import { themeClasses } from "@/lib/theme-classes";
import { toChatBlock } from "@/lib/formatters";

type CopyFormat = "sheets" | "chat";
const COPY_FORMATS: { format: CopyFormat; Icon: LucideIcon; label: string; ariaLabel: string }[] = [
  { format: "sheets", Icon: Table2,        label: "Sheets", ariaLabel: "Copy for Google Sheets" },
  { format: "chat",   Icon: MessageSquare, label: "Chat",   ariaLabel: "Copy for Google Chat" },
];

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

const getMondayOfWeek = (dateStr: string): string => {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
};

const fmtDate = (iso: string): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

const thBase = "px-3 py-2 text-[13px] font-semibold uppercase tracking-wide";
const tdBase = "px-3 py-2 text-xs";

const AGENT_ROLES = new Set(["member", "collections_specialist"]);

export function FollowUpsTab({ dark, t }: FollowUpsTabProps) {
  const [dayOffset, setDayOffset] = useState(0);
  const [followUps, setFollowUps] = useState<FollowUpRow[]>([]);
  const [allAgents, setAllAgents] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [copied, setCopied] = useState<CopyFormat | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (copyTimerRef.current) clearTimeout(copyTimerRef.current); }, []);

  // Load full active agent roster once — used to compute who has no follow-ups today
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    fetch("/api/team-members", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((json) => {
        if (cancelled) return;
        const names: string[] = (json.data ?? [])
          .filter((m: { isActive: boolean; role: string }) =>
            m.isActive && AGENT_ROLES.has(m.role)
          )
          .map((m: { name: string }) => m.name)
          .sort((a: string, b: string) => a.localeCompare(b));
        setAllAgents(names);
      })
      .catch(() => {});
    return () => { cancelled = true; controller.abort(); };
  }, []);

  const selectedDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    return d.toISOString().split("T")[0];
  })();

  const monday = getMondayOfWeek(selectedDate);

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

  // Filter to selected day, sort agent A-Z then case name A-Z
  const todayRows = followUps
    .filter((f) => f.date === selectedDate)
    .sort((a, b) => {
      const agentCmp = (a.assignedTo ?? "Unassigned").localeCompare(b.assignedTo ?? "Unassigned");
      return agentCmp !== 0 ? agentCmp : a.caseName.localeCompare(b.caseName);
    });

  // Per-agent counts for the selected day — all active agents, 0 when none
  const agentCountMap = new Map<string, number>();
  for (const f of todayRows) {
    const name = f.assignedTo ?? "Unassigned";
    agentCountMap.set(name, (agentCountMap.get(name) ?? 0) + 1);
  }
  // Merge roster (A-Z) with today's counts; agents not in roster but with
  // follow-ups still appear (e.g. recently added or renamed agents).
  const rosterSet = new Set(allAgents);
  const extraAgents = Array.from(agentCountMap.keys()).filter((n) => !rosterSet.has(n));
  const agentsToday = [...allAgents, ...extraAgents]
    .map((name) => ({ name, count: agentCountMap.get(name) ?? 0 }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const maxCount = Math.max(1, ...agentsToday.map((a) => a.count));
  const dayTotal = todayRows.length;

  // Case list grouped by agent (A-Z), cases already A-Z within each agent
  const byAgent: Record<string, FollowUpRow[]> = {};
  for (const f of todayRows) {
    const agent = f.assignedTo ?? "Unassigned";
    (byAgent[agent] ??= []).push(f);
  }
  const agentNames = Object.keys(byAgent).sort();

  const isToday = dayOffset === 0;

  const rowDivide = dark ? "border-neutral-800/40" : "border-neutral-100";
  const rowHover  = dark ? "hover:bg-neutral-800/30" : "hover:bg-neutral-50";
  const barBg     = dark ? "bg-orange-500/30" : "bg-orange-200";
  const agentBg   = dark ? "bg-neutral-800/60" : "bg-neutral-50";

  // Copies only the agent figures — not the case-level detail list rendered
  // below, which staff paste into Sheets/Chat as a scoreboard-style summary,
  // not a case export.
  const copyData = (format: CopyFormat) => {
    const label = isToday ? `Today · ${fmtDate(selectedDate)}` : fmtDate(selectedDate);
    const agentTitle  = `Follow-Ups — ${label}`;
    const agentHeader = ["Agent", "Follow-Ups"];
    const agentRows: (string | number)[][] = agentsToday.map((a) => [a.name, a.count]);
    const done = () => {
      setCopied(format);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(null), 1500);
    };
    if (format === "sheets") {
      const lines = [agentTitle, agentHeader.join("\t"), ...agentRows.map((r) => r.join("\t"))];
      navigator.clipboard.writeText(lines.join("\n")).then(done);
    } else {
      navigator.clipboard.writeText(toChatBlock(agentTitle, agentHeader, agentRows)).then(done);
    }
  };

  return (
    <div className="space-y-4">
      {/* Agent counts card */}
      <div className={`rounded-xl border ${t.card}`}>
        {/* Header */}
        <div className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b ${t.borderLight}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${dark ? "bg-orange-900/40" : "bg-orange-50"}`}>
              <CalendarClock className={`h-5 w-5 ${dark ? "text-orange-400" : "text-orange-600"}`} aria-hidden="true" />
            </div>
            <div>
              <h3 className={`text-sm font-bold ${t.text}`}>
                Follow-Ups{isToday ? " Today" : ""} — {fmtDate(selectedDate)}
              </h3>
              <p className={`text-[13px] ${t.textMuted} mt-0.5`}>
                {dayTotal > 0
                  ? `${dayTotal} follow-up${dayTotal !== 1 ? "s" : ""} · ${agentsToday.length} agent${agentsToday.length !== 1 ? "s" : ""}`
                  : "No follow-ups scheduled"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {!loading && !error && dayTotal > 0 && COPY_FORMATS.map(({ format, Icon, label, ariaLabel }) => (
              <button
                key={format}
                onClick={() => copyData(format)}
                aria-label={ariaLabel}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[13px] font-medium border transition-colors ${
                  copied === format
                    ? (dark ? "border-orange-700 text-orange-400" : "border-orange-300 text-orange-600")
                    : (dark ? "border-neutral-700 text-neutral-300 hover:bg-neutral-800" : "border-neutral-200 text-neutral-600 hover:bg-neutral-50")
                }`}
              >
                {copied === format
                  ? <><Check aria-hidden="true" className="h-3.5 w-3.5" />Copied</>
                  : <><Icon aria-hidden="true" className="h-3.5 w-3.5" />{label}</>}
              </button>
            ))}
            <button
              onClick={() => setDayOffset((v) => v - 1)}
              className={`h-8 w-8 rounded-md flex items-center justify-center transition-colors ${t.hover} ${t.textSub}`}
              aria-label="Previous day"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              onClick={() => setDayOffset((v) => v + 1)}
              disabled={dayOffset >= 0}
              className={`h-8 w-8 rounded-md flex items-center justify-center transition-colors ${t.hover} ${t.textSub} disabled:opacity-40`}
              aria-label="Next day"
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

        {/* Per-agent counts */}
        {!loading && !error && agentsToday.length > 0 && (
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
                {agentsToday.map((a) => (
                  <tr key={a.name} className={`border-b ${rowDivide} ${rowHover} transition-colors`}>
                    <td className={`${tdBase} font-medium ${t.text} whitespace-nowrap`}>{a.name}</td>
                    <td className={`${tdBase} text-right font-semibold tabular-nums ${a.count > 0 ? t.text : t.textMuted}`}>{a.count}</td>
                    <td className={`${tdBase} w-1/2`}>
                      <div className={`h-2 rounded-full ${dark ? "bg-neutral-800" : "bg-neutral-100"}`}>
                        <div className={`h-2 rounded-full ${barBg}`} style={{ width: `${(a.count / maxCount) * 100}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className={agentBg}>
                  <td className={`${tdBase} font-semibold ${t.text}`}>Total</td>
                  <td className={`${tdBase} text-right font-bold tabular-nums ${t.text}`}>{dayTotal}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

      </div>

      {/* Cases grouped by agent */}
      {!loading && !error && agentNames.length > 0 && (
        <div className={`rounded-xl border ${t.card}`}>
          <div className={`p-4 border-b ${t.borderLight}`}>
            <h4 className={`text-sm font-bold ${t.text}`}>
              Follow-Up Cases — {fmtDate(selectedDate)}
            </h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className={`border-b ${t.borderLight}`}>
                  <th className={`${thBase} ${t.textMuted}`}>Case Name</th>
                  <th className={`${thBase} ${t.textMuted}`}>Source</th>
                </tr>
              </thead>
              <tbody>
                {agentNames.map((agent) => (
                  <Fragment key={agent}>
                    <tr className={`border-b ${rowDivide}`}>
                      <td colSpan={2} className={`px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider ${t.textMuted} ${agentBg}`}>
                        {agent}
                        <span className={`ml-2 font-normal normal-case tracking-normal ${t.textMuted}`}>
                          · {byAgent[agent].length} case{byAgent[agent].length !== 1 ? "s" : ""}
                        </span>
                      </td>
                    </tr>
                    {byAgent[agent].map((f) => (
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
