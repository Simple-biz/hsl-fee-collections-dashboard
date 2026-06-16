"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { MessageSquare, Search, ExternalLink } from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import { fmtDateTime } from "@/lib/formatters";

export interface CaseActivityEntry {
  id: string;
  caseId: number;
  caseName: string;
  message: string;
  createdBy: string | null;
  createdAt: string;
}

// Recent edits across ALL cases (the case-scoped activity_log), shown to admins
// as a firm-wide feed. Per-case history still lives on each case's detail view.
export function CaseActivityFeed({
  entries,
}: {
  entries: CaseActivityEntry[];
}) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const t = themeClasses(dark);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.message.toLowerCase().includes(q) ||
        e.caseName.toLowerCase().includes(q) ||
        (e.createdBy ?? "").toLowerCase().includes(q),
    );
  }, [entries, search]);

  const sectionCard = `rounded-xl border ${t.card}`;

  if (entries.length === 0) {
    return (
      <div className={`${sectionCard} p-8 text-center`}>
        <div
          className={`mx-auto w-10 h-10 rounded-lg flex items-center justify-center ${dark ? "bg-neutral-800" : "bg-neutral-100"}`}
        >
          <MessageSquare className={`h-5 w-5 ${t.textMuted}`} />
        </div>
        <h3 className={`text-sm font-semibold mt-3 ${t.text}`}>
          No case activity yet
        </h3>
        <p className={`text-[11px] ${t.textMuted} mt-1 max-w-md mx-auto`}>
          Edits to cases (fees, status, notes, assignments) will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className={`${sectionCard} overflow-hidden`}>
      <div
        className={`flex items-center justify-between gap-3 px-4 py-3 border-b ${t.borderLight}`}
      >
        <h3 className={`text-xs font-bold ${t.text}`}>
          Case Activity
          <span className={`ml-1.5 font-normal ${t.textMuted}`}>
            ({entries.length})
          </span>
        </h3>
        <div className="relative">
          <Search
            className={`absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 ${t.textMuted}`}
            aria-hidden="true"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search case, note, agent…"
            className={`h-8 w-52 pl-8 pr-3 rounded-md border text-xs outline-none ${t.inputBg}`}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className={`text-xs ${t.textMuted} text-center py-10`}>
          No entries match “{search}”.
        </p>
      ) : (
        <ul className="divide-y divide-current/5">
          {filtered.map((e) => (
            <li
              key={e.id}
              className={`px-4 py-2.5 ${dark ? "hover:bg-neutral-800/30" : "hover:bg-neutral-50"}`}
            >
              <div className="flex items-center gap-2">
                <Link
                  href={`/cases/${e.caseId}`}
                  className={`inline-flex items-center gap-1 text-[11px] font-semibold hover:underline ${dark ? "text-blue-400" : "text-blue-600"}`}
                >
                  {e.caseName}
                  <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
                </Link>
              </div>
              <div className="select-text">
                <p className={`text-[12px] ${t.text} mt-0.5 break-words`}>
                  {e.message}
                </p>
                <p className={`text-[10px] ${t.textMuted} mt-0.5`}>
                  {e.createdBy ?? "System"} · {fmtDateTime(e.createdAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
