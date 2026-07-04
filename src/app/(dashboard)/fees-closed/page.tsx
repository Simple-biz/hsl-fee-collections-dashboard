"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";
import { FeeRecordsTable } from "@/components/cases/FeeRecordsTable";
import { useDateRange } from "@/lib/date-range-context";
import { themeClasses } from "@/lib/theme-classes";
import type { CaseRow, ApprovedByOption } from "@/types";
import { fetchDropdownOptions, type DropdownOptionsByCategory } from "@/lib/dropdown-options";

type LevelFilter = "all" | "fee_petition";

export default function FeesClosedPage() {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const t = themeClasses(dark);
  const { dateRange } = useDateRange();

  const [cases, setCases] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");
  const [closedFrom, setClosedFrom] = useState("");
  const [closedTo, setClosedTo] = useState("");
  const [dropdownOptions, setDropdownOptions] = useState<DropdownOptionsByCategory>({});
  const [approvedByOptions, setApprovedByOptions] = useState<ApprovedByOption[]>([]);
  const [teamMembers, setTeamMembers] = useState<
    { name: string; team: string | null; role: string }[]
  >([]);
  const controllerRef = useRef<AbortController | null>(null);

  const fetchClosed = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cases?isClosed=true&limit=2000", { signal: controller.signal });
      if (!res.ok) throw new Error(`Failed to load closed fees (${res.status})`);
      const json = await res.json();
      setCases(json.data || []);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  // Powers the inline-editable dropdowns (Fees Conf, Claim, Level, Assigned,
  // Win Sheet Status, Approved By) — FeeRecordsTable renders those as
  // "— Select —" plus only the current value when this is empty. Master Fees
  // gets this for free via useDashboard(); fees-closed fetches its own case
  // list instead, so it needs this separately.
  useEffect(() => {
    const controller = new AbortController();
    fetchDropdownOptions(controller.signal)
      .then((grouped) => {
        setDropdownOptions(grouped);
        setApprovedByOptions(grouped.approved_by || []);
      })
      // Includes AbortError on unmount — fetchDropdownOptions doesn't catch
      // it internally, so it lands here and we correctly skip the setState
      // calls above instead of firing them after unmount.
      .catch(() => {});
    return () => controller.abort();
  }, []);

  // Colors the Assigned dropdown by team — master-fees gets this for free via
  // useDashboard(); fees-closed needs its own fetch same as the dropdown
  // options above.
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/team-members", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((json) => setTeamMembers(json.data || []))
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    fetchClosed();
    return () => { controllerRef.current?.abort(); };
  }, [fetchClosed]);

  const filteredCases = cases.filter((c) => {
    if (levelFilter === "fee_petition" && c.level !== "FEE_PETITION" && c.level !== "FEE PETITION") return false;
    if (closedFrom && c.closedAt && c.closedAt.slice(0, 10) < closedFrom) return false;
    if (closedTo && c.closedAt && c.closedAt.slice(0, 10) > closedTo) return false;
    return true;
  });

  const sectionCard = `rounded-xl border ${t.card}`;

  if (error) {
    return (
      <div
        className={`rounded-xl border p-4 flex items-center gap-3 ${dark ? "bg-red-900/20 border-red-800 text-red-400" : "bg-red-50 border-red-200 text-red-700"}`}
      >
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="text-sm">Failed to load closed fees: {error}</span>
        <button
          onClick={fetchClosed}
          className="ml-auto text-xs font-medium underline"
        >
          Retry
        </button>
      </div>
    );
  }

  // Only block on the initial load — see the matching comment in
  // master-fees/page.tsx for why later refreshes shouldn't blank the table.
  if (loading && cases.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className={`h-6 w-6 animate-spin ${t.textMuted}`} aria-hidden="true" />
        <span className={`ml-3 text-sm ${t.textSub}`}>
          Loading closed fees...
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={`${sectionCard} p-4 md:p-5`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center ${dark ? "bg-emerald-900/40" : "bg-emerald-50"}`}
            >
              <CheckCircle2
                aria-hidden="true"
                className={`h-5 w-5 ${dark ? "text-emerald-400" : "text-emerald-600"}`}
              />
            </div>
            <div>
              <h3 className={`text-sm font-bold ${t.text}`}>Fees Closed</h3>
              <p className={`text-[11px] ${t.textMuted} mt-0.5`}>
                Cases acknowledged and marked closed from the dashboard
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {(["all", "fee_petition"] as LevelFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setLevelFilter(f)}
                aria-pressed={levelFilter === f}
                className={`px-3 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                  levelFilter === f
                    ? dark
                      ? "bg-emerald-700 border-emerald-600 text-white"
                      : "bg-emerald-100 border-emerald-400 text-emerald-800"
                    : dark
                      ? "border-neutral-700 text-neutral-400 hover:border-neutral-500"
                      : "border-neutral-200 text-neutral-500 hover:border-neutral-400"
                }`}
              >
                {f === "all" ? "All" : "Fee Petitions"}
              </button>
            ))}
            <span className={`text-[11px] ${t.textMuted} ml-1`}>Closed:</span>
            <input
              type="date"
              value={closedFrom}
              onChange={(e) => setClosedFrom(e.target.value)}
              aria-label="Closed from date"
              className={`rounded-md border px-2 py-1 text-[11px] ${dark ? "bg-neutral-800 border-neutral-700 text-neutral-200" : "bg-white border-neutral-200 text-neutral-900"}`}
            />
            <span className={`text-[11px] ${t.textMuted}`}>–</span>
            <input
              type="date"
              value={closedTo}
              onChange={(e) => setClosedTo(e.target.value)}
              aria-label="Closed to date"
              className={`rounded-md border px-2 py-1 text-[11px] ${dark ? "bg-neutral-800 border-neutral-700 text-neutral-200" : "bg-white border-neutral-200 text-neutral-900"}`}
            />
            {(closedFrom || closedTo) && (
              <button
                onClick={() => { setClosedFrom(""); setClosedTo(""); }}
                className={`text-[11px] ${t.textMuted} hover:text-red-500 transition-colors`}
                aria-label="Clear date filter"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      <FeeRecordsTable
        cases={filteredCases}
        dateRange={dateRange}
        mode="closed"
        onImported={fetchClosed}
        dropdownOptions={dropdownOptions}
        approvedByOptions={approvedByOptions}
        teamMembers={teamMembers}
      />
    </div>
  );
}
