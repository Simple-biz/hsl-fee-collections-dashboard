"use client";

import { useTheme } from "next-themes";
import { CollectionsAreaChart } from "@/components/charts/CollectionsAreaChart";
import { themeClasses } from "@/lib/theme-classes";
import type { MonthlyData } from "@/types";

interface CollectionsPanelProps {
  data: MonthlyData[];
}

export const CollectionsPanel = ({ data }: CollectionsPanelProps) => {
  const { resolvedTheme } = useTheme();
  const t = themeClasses(resolvedTheme === "dark");

  return (
    <div
      className={`col-span-1 lg:col-span-2 rounded-xl border p-4 md:p-5 ${t.card}`}
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-4">
        <div>
          <h3 className={`text-sm font-bold ${t.text}`}>
            Collections Activity — Monthly
          </h3>
          <p className={`text-[11px] ${t.textMuted} mt-0.5`}>
            Showing fee activity for the last 6 months
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span
            className={`flex items-center gap-1.5 text-[11px] ${t.textSub}`}
          >
            <span className="w-2 h-2 rounded-full bg-indigo-500" /> Expected
          </span>
          <span
            className={`flex items-center gap-1.5 text-[11px] ${t.textSub}`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Collected
          </span>
        </div>
      </div>
      <CollectionsAreaChart data={data} />
    </div>
  );
};
