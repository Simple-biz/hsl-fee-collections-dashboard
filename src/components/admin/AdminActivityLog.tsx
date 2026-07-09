"use client";

import { useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { Activity } from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import { fmtDateTime } from "@/lib/formatters";
import {
  ActivityFilterBar,
  defaultActivityFilters,
  matchesActivityFilters,
} from "./activity-filters";

export interface AdminActivityEntry {
  id: string;
  actorEmail: string | null;
  action: string;
  targetEmail: string | null;
  summary: string;
  createdAt: string;
}

// Per-action badge label + color. Unknown actions fall back to a neutral pill.
const ACTION_META: Record<string, { label: string; tone: string }> = {
  "user.create": { label: "Created", tone: "emerald" },
  "user.role_change": { label: "Role", tone: "blue" },
  "user.activate": { label: "Activated", tone: "emerald" },
  "user.deactivate": { label: "Deactivated", tone: "amber" },
  "user.password_reset": { label: "Password", tone: "violet" },
  "user.access_update": { label: "Access", tone: "blue" },
  "backup.export": { label: "Backup", tone: "violet" },
  "backup.restore": { label: "Restore", tone: "amber" },
};

const toneClasses = (tone: string, dark: boolean): string => {
  switch (tone) {
    case "emerald":
      return dark
        ? "bg-emerald-900/40 text-emerald-400"
        : "bg-emerald-50 text-emerald-700";
    case "amber":
      return dark
        ? "bg-amber-900/40 text-amber-400"
        : "bg-amber-50 text-amber-700";
    case "violet":
      return dark
        ? "bg-violet-900/40 text-violet-400"
        : "bg-violet-50 text-violet-700";
    case "blue":
      return dark ? "bg-blue-900/40 text-blue-400" : "bg-blue-50 text-blue-700";
    default:
      return dark
        ? "bg-neutral-800 text-neutral-400"
        : "bg-neutral-100 text-neutral-600";
  }
};

export function AdminActivityLog({ entries }: { entries: AdminActivityEntry[] }) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const t = themeClasses(dark);
  const [filters, setFilters] = useState(() =>
    defaultActivityFilters(entries[0]?.createdAt),
  );

  // Distinct actors + years for the dropdowns (newest year first).
  const users = useMemo(
    () =>
      Array.from(
        new Set(entries.map((e) => e.actorEmail).filter((v): v is string => !!v)),
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
          user: e.actorEmail,
          createdAt: e.createdAt,
          haystack: `${e.summary} ${e.actorEmail ?? ""} ${e.targetEmail ?? ""}`,
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
          <Activity className={`h-5 w-5 ${t.textMuted}`} />
        </div>
        <h3 className={`text-sm font-semibold mt-3 ${t.text}`}>
          No admin activity yet
        </h3>
        <p className={`text-[13px] ${t.textMuted} mt-1 max-w-md mx-auto`}>
          User creates, role changes, password resets, and access edits will
          appear here as they happen.
        </p>
      </div>
    );
  }

  return (
    <div className={`${sectionCard} overflow-hidden`}>
      <div className={`px-4 py-3 border-b ${t.borderLight} space-y-2`}>
        <h3 className={`text-xs font-bold ${t.text}`}>
          Activity Log
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
          searchPlaceholder="Search summary, actor, target…"
        />
      </div>

      {filtered.length === 0 ? (
        <p className={`text-xs ${t.textMuted} text-center py-10`}>
          No entries match the current filters.
        </p>
      ) : (
        <ul className="divide-y divide-current/5">
          {filtered.map((e) => {
            const meta = ACTION_META[e.action] ?? {
              label: e.action,
              tone: "neutral",
            };
            return (
              <li
                key={e.id}
                className={`flex items-start gap-3 px-4 py-2.5 ${dark ? "hover:bg-neutral-800/30" : "hover:bg-neutral-50"}`}
              >
                <span
                  className={`mt-0.5 shrink-0 text-[12px] font-semibold px-1.5 py-0.5 rounded ${toneClasses(meta.tone, dark)}`}
                >
                  {meta.label}
                </span>
                <div className="flex-1 min-w-0 select-text">
                  <p className={`text-[14px] ${t.text} break-words`}>
                    {e.summary}
                  </p>
                  <p className={`text-[12px] ${t.textMuted} mt-0.5`}>
                    {e.actorEmail ?? "Unknown"} · {fmtDateTime(e.createdAt)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
