"use client";

import { useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Trophy, Activity } from "lucide-react";
import { ScoreboardTracker } from "@/components/reports/ScoreboardTracker";
import { ReportsDashboard } from "@/components/reports/ReportsDashboard";
import { themeClasses } from "@/lib/theme-classes";

type ReportsTab = "scoreboard" | "activity";

const TABS: { key: ReportsTab; label: string; icon: React.ElementType }[] = [
  { key: "scoreboard", label: "Scoreboard", icon: Trophy },
  { key: "activity", label: "Activity", icon: Activity },
];

export const Reports = () => {
  const { resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const dark = mounted ? resolvedTheme === "dark" : false;
  const t = themeClasses(dark);

  const [activeTab, setActiveTab] = useState<ReportsTab>("scoreboard");

  return (
    <div className="space-y-4">
      {/* Tab nav */}
      <div className={`rounded-xl border ${t.card} overflow-x-auto`}>
        <div className={`flex border-b ${dark ? "border-neutral-800" : "border-neutral-200"} min-w-max`}>
          {TABS.map(({ key, label, icon: Icon }) => {
            const active = activeTab === key;
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`relative flex items-center gap-2 px-4 py-3 text-[13px] font-medium shrink-0 transition-colors whitespace-nowrap
                  ${active
                    ? dark ? "text-indigo-300" : "text-indigo-700"
                    : dark ? "text-neutral-400 hover:text-neutral-200" : "text-neutral-500 hover:text-neutral-800"
                  }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {label}
                {active && (
                  <span className={`absolute bottom-0 inset-x-0 h-0.5 rounded-t ${dark ? "bg-indigo-400" : "bg-indigo-600"}`} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === "scoreboard" && <ScoreboardTracker dark={dark} t={t} />}
      {activeTab === "activity" && <ReportsDashboard dark={dark} t={t} />}
    </div>
  );
};
