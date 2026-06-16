"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { MessageSquare, ExternalLink } from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import { fmtDateTime } from "@/lib/formatters";
import {
  ActivityFilterBar,
  defaultActivityFilters,
  matchesActivityFilters,
} from "./activity-filters";

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
  const [filters, setFilters] = useState(() =>
    defaultActivityFilters(entries[0]?.createdAt),
  );

  // Distinct authors (agents) + years for the dropdowns.
  const users = useMemo(
    () =>
      Array.from(
        new Set(entries.map((e) => e.createdBy).filter((v): v is string => !!v)),
      ).sort(),
    [entries],
  );
  const years = useMemo(
    () =>
      Array.from(
        new Set(entries.map((e) => new Date(e.createdAt).getFullYear())),
      ).sort((a, b) => b - a),
    [entries],
  );

  const filtered = useMemo(
    () =>
      entries.filter((e) =>
        matchesActivityFilters(filters, {
          user: e.createdBy,
          createdAt: e.createdAt,
          haystack: `${e.message} ${e.caseName} ${e.createdBy ?? ""}`,
        }),
      ),
    [entries, filters],
  );

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
      <div className={`px-4 py-3 border-b ${t.borderLight} space-y-2`}>
        <h3 className={`text-xs font-bold ${t.text}`}>
          Case Activity
          <span className={`ml-1.5 font-normal ${t.textMuted}`}>
            ({filtered.length}
            {filtered.length !== entries.length ? ` of ${entries.length}` : ""})
          </span>
        </h3>
        <ActivityFilterBar
          dark={dark}
          users={users}
          years={years}
          state={filters}
          onChange={setFilters}
          searchPlaceholder="Search case, note, agent…"
        />
      </div>

      {filtered.length === 0 ? (
        <p className={`text-xs ${t.textMuted} text-center py-10`}>
          No entries match the current filters.
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
