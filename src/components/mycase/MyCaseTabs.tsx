"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { Scale, ListChecks, FileCheck } from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import { MyCaseCases, type MyCaseRow } from "./MyCaseCases";
import { NewDecisions } from "./NewDecisions";

type Tab = "cases" | "new-decisions";

interface MyCaseTabsProps {
  cases: MyCaseRow[];
  error: string | null;
}

export function MyCaseTabs({ cases, error }: MyCaseTabsProps) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const t = themeClasses(dark);

  const [tab, setTab] = useState<Tab>("cases");

  const tabs: { key: Tab; label: string; icon: typeof Scale }[] = [
    { key: "cases", label: "Cases", icon: ListChecks },
    { key: "new-decisions", label: "New Decisions", icon: FileCheck },
  ];

  return (
    <div className="space-y-4">
      {/* Shared header */}
      <div className={`rounded-xl border ${t.card} p-4 md:p-5`}>
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center ${dark ? "bg-indigo-900/40" : "bg-indigo-50"}`}
          >
            <Scale
              aria-hidden="true"
              className={`h-5 w-5 ${dark ? "text-indigo-400" : "text-indigo-600"}`}
            />
          </div>
          <div>
            <h3 className={`text-sm font-bold ${t.text}`}>MyCase</h3>
            <p className={`text-[11px] ${t.textMuted} mt-0.5`}>
              Social Security · Fully Favorable ALJ Decision · Hogan Smith office
            </p>
          </div>
        </div>

        {/* Tab strip */}
        <div
          role="tablist"
          aria-label="MyCase views"
          className={`mt-4 flex gap-1.5 p-1 rounded-lg border ${t.borderLight} ${dark ? "bg-neutral-900/40" : "bg-neutral-50"} w-fit`}
        >
          {tabs.map((tb) => {
            const active = tab === tb.key;
            return (
              <button
                key={tb.key}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => setTab(tb.key)}
                className={`px-3 py-1.5 rounded-md text-[11px] font-medium flex items-center gap-1.5 transition-colors ${
                  active
                    ? dark
                      ? "bg-neutral-800 text-neutral-100"
                      : "bg-white text-neutral-900 shadow-sm"
                    : `${t.textMuted} hover:${t.text}`
                }`}
              >
                <tb.icon className="h-3.5 w-3.5" />
                {tb.label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === "cases" ? (
        <MyCaseCases cases={cases} error={error} />
      ) : (
        <NewDecisions />
      )}
    </div>
  );
}
