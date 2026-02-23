"use client";

import { fmt } from "@/lib/formatters";
import type { CaseRow } from "@/types";

interface ClaimTypeBarChartProps {
  cases: CaseRow[];
}

export const ClaimTypeBarChart = ({ cases }: ClaimTypeBarChartProps) => {
  const bars = [
    { label: "T2", expected: 0, paid: 0 },
    { label: "T16", expected: 0, paid: 0 },
    { label: "T2/T16", expected: 0, paid: 0 },
  ];

  cases.forEach((c) => {
    const bar = bars.find((b) => b.label === c.claim);
    if (bar) {
      bar.expected += c.expected;
      bar.paid += c.paid;
    }
  });

  const maxVal = Math.max(...bars.map((b) => b.expected)) || 1;

  return (
    <div className="flex items-end gap-6 justify-center h-36 px-4">
      {bars.map((b) => (
        <div key={b.label} className="flex flex-col items-center gap-1">
          <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-medium">
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
          <span className="text-[11px] text-neutral-500 dark:text-neutral-400 font-medium">
            {b.label}
          </span>
        </div>
      ))}
    </div>
  );
};
