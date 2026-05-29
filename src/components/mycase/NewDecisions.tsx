"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import {
  FileCheck,
  Loader2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import { fmtDate } from "@/lib/formatters";

type NewDecision = {
  id: number;
  name: string | null;
  filename: string | null;
  path: string | null;
  createdAt: string | null;
  caseId: number | null;
  caseName: string | null;
};

// Dates in the firm's timezone (Hogan Smith is US Eastern), as YYYY-MM-DD.
const FIRM_TZ = "America/New_York";
const ymdInFirmTz = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: FIRM_TZ }).format(d);
const todayInFirmTz = () => ymdInFirmTz(new Date());
// The MyCase mirror DB syncs overnight (~4am ET) with the *prior* day's
// updates, so the default action targets yesterday — "what came in
// overnight" — not today, which won't be in the mirror until tomorrow's
// sync. Noon-UTC math keeps the day-subtraction DST-safe.
const yesterdayInFirmTz = () => {
  const d = new Date(`${todayInFirmTz()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return ymdInFirmTz(d);
};

export function NewDecisions() {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const t = themeClasses(dark);

  const [docs, setDocs] = useState<NewDecision[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pulledFor, setPulledFor] = useState<string | null>(null);
  const [date, setDate] = useState<string>(yesterdayInFirmTz);

  const isYesterday = date === yesterdayInFirmTz();

  const sectionCard = `rounded-xl border ${t.card}`;
  const thBase = `py-2 px-3 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap ${t.textSub}`;
  const tdBase = `py-2 px-3 text-[12px]`;
  const rowBorder = dark ? "border-neutral-800/50" : "border-neutral-100";
  const rowHover = dark ? "hover:bg-neutral-800/40" : "hover:bg-neutral-50/80";

  const pull = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/mycase/new-decisions?date=${encodeURIComponent(date)}`,
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || `Failed to pull (${res.status})`);
      }
      setDocs(Array.isArray(json.data) ? json.data : []);
      setPulledFor(json.date ?? null);
    } catch (e) {
      setError((e as Error).message);
      setDocs([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={sectionCard}>
      {/* Toolbar */}
      <div
        className={`p-4 border-b ${t.borderLight} flex flex-col sm:flex-row sm:items-center justify-between gap-3`}
      >
        <div>
          <h3 className={`text-sm font-bold ${t.text}`}>
            New Fully-Favorable Decisions
          </h3>
          <p className={`text-[11px] ${t.textMuted} mt-0.5`}>
            Pulls Notice-of-Decision (Fully Favorable) documents added on the
            selected date from MyCase
            {pulledFor ? ` · last pulled for ${fmtDate(pulledFor)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {/* Date picker — defaults to yesterday (firm tz), matching the
              overnight mirror sync. Changing it lets the user check any
              past or future date. */}
          <label
            className={`text-[11px] font-medium ${t.textSub} flex items-center gap-1.5`}
          >
            Added on
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={loading}
              className={`h-8 px-2 rounded-md border text-xs outline-none ${t.inputBg} disabled:opacity-40`}
            />
          </label>
          {!isYesterday && (
            <button
              type="button"
              onClick={() => setDate(yesterdayInFirmTz())}
              disabled={loading}
              className={`h-8 px-2 rounded-md text-[11px] font-medium border ${t.outlineBtn} disabled:opacity-40`}
              title="Reset to yesterday"
            >
              Yesterday
            </button>
          )}
          <button
            onClick={pull}
            disabled={loading || !date}
            className={`h-8 px-3 rounded-md text-xs font-semibold flex items-center gap-1.5 ${t.ctaBtn} disabled:opacity-40`}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {loading
              ? "Pulling…"
              : isYesterday
                ? "Pull yesterday's decisions"
                : "Pull decisions"}
          </button>
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className={`m-4 rounded-md border p-3 flex items-start gap-2 text-xs ${dark ? "bg-red-900/20 border-red-800 text-red-400" : "bg-red-50 border-red-200 text-red-700"}`}
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className={`h-5 w-5 animate-spin ${t.textMuted}`} />
          <span className={`ml-3 text-sm ${t.textSub}`}>
            Pulling from MyCase…
          </span>
        </div>
      ) : pulledFor === null ? (
        <div className="py-16 text-center">
          <FileCheck
            aria-hidden="true"
            className={`h-8 w-8 mx-auto opacity-30 ${t.textMuted}`}
          />
          <p className={`mt-2 text-sm ${t.textMuted}`}>
            Pick a date and click <b>Pull</b> to fetch fully-favorable
            Notice-of-Decision documents added on that day.
          </p>
        </div>
      ) : docs.length === 0 ? (
        <div className="py-16 text-center">
          <FileCheck
            aria-hidden="true"
            className={`h-8 w-8 mx-auto opacity-30 ${t.textMuted}`}
          />
          <p className={`mt-2 text-sm ${t.textMuted}`}>
            No fully-favorable decisions were added on {fmtDate(pulledFor)}.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-200">
            <thead>
              <tr className={`border-b ${t.borderLight}`}>
                <th className={`${thBase} text-left`}>Document</th>
                <th className={`${thBase} text-left`}>Case</th>
                <th className={`${thBase} text-left`}>Folder</th>
                <th className={`${thBase} text-left`}>Added</th>
                <th className={`${thBase} text-right`}>File</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr
                  key={d.id}
                  className={`border-b ${rowBorder} ${rowHover} transition-colors`}
                >
                  <td className={`${tdBase} ${t.text} font-medium`}>
                    {d.filename || d.name || "—"}
                  </td>
                  <td className={`${tdBase} ${t.textSub}`}>
                    {d.caseName || (d.caseId ? `#${d.caseId}` : "—")}
                  </td>
                  <td
                    className={`${tdBase} ${t.textMuted} max-w-65 truncate`}
                    title={d.path ?? undefined}
                  >
                    {d.path || "—"}
                  </td>
                  <td className={`${tdBase} ${t.textMuted} whitespace-nowrap`}>
                    {fmtDate(d.createdAt)}
                  </td>
                  <td className={`${tdBase} text-right whitespace-nowrap`}>
                    <a
                      href={`/api/mycase/documents/${d.id}/file`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`inline-flex items-center gap-1 text-[11px] font-medium ${dark ? "text-indigo-400" : "text-indigo-600"} hover:underline`}
                    >
                      View
                      <ExternalLink aria-hidden="true" className="h-3 w-3" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
