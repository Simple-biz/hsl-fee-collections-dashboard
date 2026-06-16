"use client";

import { themeClasses } from "@/lib/theme-classes";

// Shared filter model + UI for the admin Activity Logs sub-tabs. Both feeds
// filter client-side over the rows the server already sent (capped), so this
// stays a pure, instant transform — no refetch.

export type DateMode = "all" | "month" | "day" | "range";

export interface ActivityFilterState {
  search: string;
  user: string; // "all" or a specific actor/author value
  dateMode: DateMode;
  month: number; // 0-11
  year: number;
  day: string; // YYYY-MM-DD
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Default state — date filtering off; month/year seeded from the newest row
 *  (deterministic from props, so no SSR/client hydration mismatch). */
export function defaultActivityFilters(
  newestIso?: string,
): ActivityFilterState {
  const d = newestIso ? new Date(newestIso) : null;
  return {
    search: "",
    user: "all",
    dateMode: "all",
    month: d ? d.getMonth() : 0,
    year: d ? d.getFullYear() : new Date().getFullYear(),
    day: "",
    from: "",
    to: "",
  };
}

// Local-time YYYY-MM-DD for an ISO timestamp, to compare against <input
// type="date"> values (which the user picks in local time).
const localDate = (iso: string): string => {
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
};

/** True if the entry passes the active search / user / date filters. */
export function matchesActivityFilters(
  f: ActivityFilterState,
  entry: { user: string | null; createdAt: string; haystack: string },
): boolean {
  const q = f.search.trim().toLowerCase();
  if (q && !entry.haystack.toLowerCase().includes(q)) return false;

  if (f.user !== "all" && (entry.user ?? "") !== f.user) return false;

  if (f.dateMode === "all") return true;
  if (f.dateMode === "month") {
    const d = new Date(entry.createdAt);
    return d.getFullYear() === f.year && d.getMonth() === f.month;
  }
  const ds = localDate(entry.createdAt);
  if (f.dateMode === "day") return !f.day || ds === f.day;
  if (f.dateMode === "range") {
    if (f.from && ds < f.from) return false;
    if (f.to && ds > f.to) return false;
    return true;
  }
  return true;
}

export function ActivityFilterBar({
  dark,
  users,
  years,
  state,
  onChange,
  searchPlaceholder = "Search…",
}: {
  dark: boolean;
  users: string[];
  years: number[];
  state: ActivityFilterState;
  onChange: (next: ActivityFilterState) => void;
  searchPlaceholder?: string;
}) {
  const t = themeClasses(dark);
  const ctl = `h-8 px-2 rounded-md border text-xs outline-none ${t.inputBg}`;
  const set = (patch: Partial<ActivityFilterState>) =>
    onChange({ ...state, ...patch });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={state.search}
        onChange={(e) => set({ search: e.target.value })}
        placeholder={searchPlaceholder}
        className={`${ctl} flex-1 min-w-40`}
      />

      <select
        value={state.user}
        onChange={(e) => set({ user: e.target.value })}
        className={`${ctl} cursor-pointer`}
        aria-label="Filter by user"
      >
        <option value="all">All users</option>
        {users.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>

      <select
        value={state.dateMode}
        onChange={(e) => set({ dateMode: e.target.value as DateMode })}
        className={`${ctl} cursor-pointer`}
        aria-label="Date filter mode"
      >
        <option value="all">All dates</option>
        <option value="month">Month</option>
        <option value="day">Specific day</option>
        <option value="range">Date range</option>
      </select>

      {state.dateMode === "month" && (
        <>
          <select
            value={state.month}
            onChange={(e) => set({ month: Number(e.target.value) })}
            className={`${ctl} cursor-pointer`}
            aria-label="Month"
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i}>
                {m}
              </option>
            ))}
          </select>
          <select
            value={state.year}
            onChange={(e) => set({ year: Number(e.target.value) })}
            className={`${ctl} cursor-pointer`}
            aria-label="Year"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </>
      )}

      {state.dateMode === "day" && (
        <input
          type="date"
          value={state.day}
          onChange={(e) => set({ day: e.target.value })}
          className={`${ctl} cursor-pointer`}
          aria-label="Day"
        />
      )}

      {state.dateMode === "range" && (
        <>
          <input
            type="date"
            value={state.from}
            onChange={(e) => set({ from: e.target.value })}
            className={`${ctl} cursor-pointer`}
            aria-label="From date"
          />
          <span className={`text-[11px] ${t.textMuted}`}>to</span>
          <input
            type="date"
            value={state.to}
            onChange={(e) => set({ to: e.target.value })}
            className={`${ctl} cursor-pointer`}
            aria-label="To date"
          />
        </>
      )}
    </div>
  );
}
