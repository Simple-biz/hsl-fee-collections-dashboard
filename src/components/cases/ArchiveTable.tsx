"use client";

import { Fragment, useState, useRef } from "react";
import { RotateCcw, X, AlertCircle } from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import { fmtDate, fmtDateTime } from "@/lib/formatters";

export type ArchiveRow = {
  id: string;
  originalClientId: number;
  caseName: string | null;
  caseLink: string | null;
  approvalDate: string | null;
  archivedSource: "active_sheet" | "fees_closed_sheet";
  archivedAt: string;
  archivedBy: string | null;
};

interface ArchiveTableProps {
  rows: ArchiveRow[];
  dark: boolean;
  t: ReturnType<typeof themeClasses>;
  onReopened: () => void;
}

const SourceBadge = ({ source, dark }: { source: ArchiveRow["archivedSource"]; dark: boolean }) => {
  const label = source === "active_sheet" ? "Active Sheet" : "Fees Closed";
  const cls =
    source === "active_sheet"
      ? dark
        ? "bg-blue-900/40 text-blue-300"
        : "bg-blue-50 text-blue-700"
      : dark
        ? "bg-emerald-900/40 text-emerald-300"
        : "bg-emerald-50 text-emerald-700";
  return (
    <span className={`text-[12px] font-semibold px-1.5 py-0.5 rounded ${cls}`}>
      {label}
    </span>
  );
};

export const ArchiveTable = ({ rows, dark, t, onReopened }: ArchiveTableProps) => {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [reopenId, setReopenId] = useState<string | null>(null);
  const [reopening, setReopening] = useState<"master_list" | "fees_closed" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const displayRows = rows.filter((r) => !hiddenIds.has(r.id));

  const handleReopen = async (archiveId: string, destination: "master_list" | "fees_closed") => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setReopening(destination);
    setError(null);
    try {
      const res = await fetch("/api/archive/reopen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archiveId, destination }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? `Request failed (${res.status})`);
      }
      setHiddenIds((prev) => new Set([...prev, archiveId]));
      setReopenId(null);
      onReopened();
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError((e as Error).message);
    } finally {
      setReopening(null);
    }
  };

  if (displayRows.length === 0) {
    return (
      <div className={`rounded-xl border ${t.card} p-12 text-center`}>
        <p className={`text-sm ${t.textMuted}`}>No archived cases.</p>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border ${t.card} overflow-hidden`}>
      {error && (
        <div
          role="alert"
          className={`flex items-center gap-2 px-4 py-2.5 text-sm border-b ${dark ? "bg-red-900/20 border-red-800 text-red-300" : "bg-red-50 border-red-200 text-red-700"}`}
        >
          <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-auto"
            aria-label="Dismiss error"
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className={`border-b ${t.border} ${dark ? "bg-neutral-800/60" : "bg-neutral-50"}`}>
              <th className={`px-4 py-2.5 text-left text-[13px] font-semibold uppercase tracking-wider ${t.textMuted}`}>Case</th>
              <th className={`px-4 py-2.5 text-left text-[13px] font-semibold uppercase tracking-wider ${t.textMuted}`}>Approval Date</th>
              <th className={`px-4 py-2.5 text-left text-[13px] font-semibold uppercase tracking-wider ${t.textMuted}`}>Archived From</th>
              <th className={`px-4 py-2.5 text-left text-[13px] font-semibold uppercase tracking-wider ${t.textMuted}`}>Archived By</th>
              <th className={`px-4 py-2.5 text-left text-[13px] font-semibold uppercase tracking-wider ${t.textMuted}`}>Archived At</th>
              <th className={`px-4 py-2.5 text-right text-[13px] font-semibold uppercase tracking-wider ${t.textMuted}`}>Action</th>
            </tr>
          </thead>
          <tbody className={`divide-y ${t.border}`}>
            {displayRows.map((row) => (
              <Fragment key={row.id}>
                <tr className={`transition-colors ${t.hover}`}>
                  <td className={`px-4 py-3 ${t.text}`}>
                    <div className="font-medium">{row.caseName ?? "—"}</div>
                    <div className={`text-[13px] ${t.textMuted}`}>#{row.originalClientId}</div>
                  </td>
                  <td className={`px-4 py-3 ${t.textSub} text-sm`}>{fmtDate(row.approvalDate)}</td>
                  <td className="px-4 py-3">
                    <SourceBadge source={row.archivedSource} dark={dark} />
                  </td>
                  <td className={`px-4 py-3 ${t.textSub} text-sm`}>{row.archivedBy ?? "—"}</td>
                  <td className={`px-4 py-3 ${t.textSub} text-sm`}>{fmtDateTime(row.archivedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    {reopenId === row.id ? (
                      <button
                        onClick={() => { setReopenId(null); setError(null); }}
                        className={`text-[13px] font-medium px-2 py-1 rounded ${t.textMuted} ${t.hover}`}
                      >
                        Cancel
                      </button>
                    ) : (
                      <button
                        onClick={() => { setReopenId(row.id); setError(null); }}
                        disabled={reopenId !== null}
                        className={`flex items-center gap-1.5 text-[13px] font-semibold px-2.5 py-1 rounded transition-colors ${dark ? "text-amber-300 hover:bg-amber-900/30 disabled:opacity-40" : "text-amber-700 hover:bg-amber-50 disabled:opacity-40"}`}
                      >
                        <RotateCcw aria-hidden="true" className="h-3 w-3" />
                        Reopen
                      </button>
                    )}
                  </td>
                </tr>
                {reopenId === row.id && (
                  <tr className={`${dark ? "bg-neutral-800/40" : "bg-neutral-50"}`}>
                    <td colSpan={6} className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className={`text-[14px] font-medium ${t.textSub}`}>
                          Restore this case to:
                        </span>
                        <button
                          onClick={() => handleReopen(row.id, "master_list")}
                          disabled={reopening !== null}
                          className={`text-[14px] font-semibold px-3 py-1 rounded border transition-colors disabled:opacity-50 ${dark ? "border-blue-700 text-blue-300 hover:bg-blue-900/30" : "border-blue-300 text-blue-700 hover:bg-blue-50"}`}
                        >
                          {reopening === "master_list" ? "Restoring…" : "Master List"}
                        </button>
                        <button
                          onClick={() => handleReopen(row.id, "fees_closed")}
                          disabled={reopening !== null}
                          className={`text-[14px] font-semibold px-3 py-1 rounded border transition-colors disabled:opacity-50 ${dark ? "border-emerald-700 text-emerald-300 hover:bg-emerald-900/30" : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"}`}
                        >
                          {reopening === "fees_closed" ? "Restoring…" : "Fees Closed"}
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
