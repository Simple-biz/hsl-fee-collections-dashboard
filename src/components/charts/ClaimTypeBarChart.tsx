"use client";

import { fmt } from "@/lib/formatters";
import type { CaseRow } from "@/types";

interface ClaimTypeBarChartProps {
  cases: CaseRow[];
  /** Collected-in-window totals per claim type. When set (any window other
   *  than "All Time"), the chart renders a single Collected bar per claim
   *  type instead of the Expected/Collected pair — "Expected" (the total
   *  fee owed) has no time dimension, so there's nothing to pair it with. */
  windowedClaims?: { claim: string; collected: number }[] | null;
}

// Preferred display order for the known worksheet claim types. Any other
// value that shows up in the data (future types, etc.) is appended after
// these, alphabetically — so nothing silently drops out of the chart.
const CLAIM_ORDER = ["T2", "T16", "CONC", "DWB", "DAC", "AUX"];

const sortByClaimOrder = <T extends { label: string }>(bars: T[]): T[] =>
  [...bars].sort((a, b) => {
    const ai = CLAIM_ORDER.indexOf(a.label);
    const bi = CLAIM_ORDER.indexOf(b.label);
    if (ai !== -1 && bi !== -1) return ai - bi; // both known → fixed order
    if (ai !== -1) return -1; // known before unknown
    if (bi !== -1) return 1;
    return a.label.localeCompare(b.label); // unknowns alphabetical
  });

export const ClaimTypeBarChart = ({ cases, windowedClaims }: ClaimTypeBarChartProps) => {
  if (windowedClaims) {
    const bars = sortByClaimOrder(
      windowedClaims
        .filter((c) => c.claim && c.claim !== "—")
        .map((c) => ({ label: c.claim, collected: c.collected })),
    );

    if (bars.length === 0) {
      return (
        <div className="flex items-center justify-center h-36 text-[13px] text-neutral-400 dark:text-neutral-500">
          No fees collected in this window yet
        </div>
      );
    }

    const maxVal = Math.max(...bars.map((b) => b.collected), 1);

    return (
      <div className="flex items-end gap-6 justify-center h-36 px-4 overflow-x-auto">
        {bars.map((b) => (
          <div key={b.label} className="flex flex-col items-center gap-1 shrink-0">
            <span className="text-[12px] text-neutral-400 dark:text-neutral-500 font-medium">
              {fmt(b.collected)}
            </span>
            <div
              className="w-8 rounded-t"
              style={{
                height: (b.collected / maxVal) * 100 || 2,
                background: "#10b981",
              }}
            />
            <span className="text-[13px] text-neutral-500 dark:text-neutral-400 font-medium">
              {b.label}
            </span>
          </div>
        ))}
      </div>
    );
  }

  // Aggregate expected/paid per claim type as it actually appears in the
  // data (the API maps T2_T16 → "CONC"). Skip unknown/empty ("—").
  const totals = new Map<string, { expected: number; paid: number }>();
  cases.forEach((c) => {
    const label = c.claim;
    if (!label || label === "—") return;
    const cur = totals.get(label) ?? { expected: 0, paid: 0 };
    cur.expected += c.expected;
    cur.paid += c.paid;
    totals.set(label, cur);
  });

  const bars = sortByClaimOrder(Array.from(totals.entries()).map(([label, v]) => ({ label, ...v })));

  if (bars.length === 0) {
    return (
      <div className="flex items-center justify-center h-36 text-[13px] text-neutral-400 dark:text-neutral-500">
        No claim-type data yet
      </div>
    );
  }

  const maxVal = Math.max(...bars.map((b) => b.expected), 1);

  return (
    <div className="flex items-end gap-6 justify-center h-36 px-4 overflow-x-auto">
      {bars.map((b) => (
        <div key={b.label} className="flex flex-col items-center gap-1 shrink-0">
          <span className="text-[12px] text-neutral-400 dark:text-neutral-500 font-medium">
            {fmt(b.expected)}
          </span>
          <div className="flex items-end gap-1">
            <div
              className="w-8 rounded-t"
              style={{
                height: (b.expected / maxVal) * 100,
                background: "#6366f1",
                opacity: 0.25,
              }}
            />
            <div
              className="w-8 rounded-t"
              style={{
                height: (b.paid / maxVal) * 100 || 2,
                background: "#10b981",
              }}
            />
          </div>
          <span className="text-[13px] text-neutral-500 dark:text-neutral-400 font-medium">
            {b.label}
          </span>
        </div>
      ))}
    </div>
  );
};
