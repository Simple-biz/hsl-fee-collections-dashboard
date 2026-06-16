"use client";

import { useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { Activity, Search } from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import { fmtDateTime } from "@/lib/formatters";

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
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.summary.toLowerCase().includes(q) ||
        (e.actorEmail ?? "").toLowerCase().includes(q) ||
        (e.targetEmail ?? "").toLowerCase().includes(q),
    );
  }, [entries, search]);

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
        <p className={`text-[11px] ${t.textMuted} mt-1 max-w-md mx-auto`}>
          User creates, role changes, password resets, and access edits will
          appear here as they happen.
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
          Activity Log
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
            placeholder="Search activity…"
            className={`h-8 w-48 pl-8 pr-3 rounded-md border text-xs outline-none ${t.inputBg}`}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className={`text-xs ${t.textMuted} text-center py-10`}>
          No entries match “{search}”.
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
                  className={`mt-0.5 shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${toneClasses(meta.tone, dark)}`}
                >
                  {meta.label}
                </span>
                <div className="flex-1 min-w-0 select-text">
                  <p className={`text-[12px] ${t.text} break-words`}>
                    {e.summary}
                  </p>
                  <p className={`text-[10px] ${t.textMuted} mt-0.5`}>
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
