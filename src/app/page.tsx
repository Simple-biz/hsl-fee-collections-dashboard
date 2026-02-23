"use client";

import { useTheme } from "next-themes";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatCards } from "@/components/cases/StatCards";
import { CollectionsPanel } from "@/components/cases/CollectionsPanel";
import { RevenuePanel } from "@/components/cases/RevenuePanel";
import { FeeRecordsTable } from "@/components/cases/FeeRecordsTable";
import { Scoreboard } from "@/components/scoreboard/Scoreboard";
import { useDashboard } from "@/hooks/useDashboard";
import { themeClasses } from "@/lib/theme-classes";
import { RefreshCw, AlertCircle } from "lucide-react";

const DashboardPage = () => {
  const { cases, summary, monthlyData, team, loading, error, refresh } =
    useDashboard();
  const { resolvedTheme } = useTheme();
  const t = themeClasses(resolvedTheme === "dark");

  return (
    <DashboardLayout>
      {(activeTab) => (
        <>
          {/* Error state */}
          {error && (
            <div
              className={`rounded-xl border p-4 flex items-center gap-3 ${resolvedTheme === "dark" ? "bg-red-900/20 border-red-800 text-red-400" : "bg-red-50 border-red-200 text-red-700"}`}
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="text-sm">
                Failed to load dashboard data: {error}
              </span>
              <button
                onClick={refresh}
                className="ml-auto text-xs font-medium underline"
              >
                Retry
              </button>
            </div>
          )}

          {/* Loading state */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <RefreshCw className={`h-6 w-6 animate-spin ${t.textMuted}`} />
              <span className={`ml-3 text-sm ${t.textSub}`}>
                Loading dashboard...
              </span>
            </div>
          ) : (
            <>
              {/* OVERVIEW TAB */}
              {activeTab === "overview" && (
                <>
                  <StatCards stats={summary} />

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
                    <CollectionsPanel data={monthlyData} />
                    <RevenuePanel stats={summary} cases={cases} />
                  </div>

                  <FeeRecordsTable cases={cases} />
                </>
              )}

              {/* ANALYTICS TAB */}
              {activeTab === "analytics" && <Scoreboard />}

              {/* REPORTS TAB */}
              {activeTab === "reports" && (
                <div className={`rounded-xl border p-8 text-center ${t.card}`}>
                  <p className={`text-sm ${t.textMuted}`}>
                    Reports coming soon.
                  </p>
                </div>
              )}

              {/* NOTIFICATIONS TAB */}
              {activeTab === "notifications" && (
                <div className={`rounded-xl border p-8 text-center ${t.card}`}>
                  <p className={`text-sm ${t.textMuted}`}>
                    No new notifications.
                  </p>
                </div>
              )}

              {/* TEAM TAB */}
              {activeTab === "team" && (
                <div className={`rounded-xl border p-8 text-center ${t.card}`}>
                  <p className={`text-sm ${t.textMuted}`}>
                    Team management coming soon.
                  </p>
                </div>
              )}

              {/* SETTINGS TAB */}
              {activeTab === "settings" && (
                <div className={`rounded-xl border p-8 text-center ${t.card}`}>
                  <p className={`text-sm ${t.textMuted}`}>
                    Settings coming soon.
                  </p>
                </div>
              )}
            </>
          )}
        </>
      )}
    </DashboardLayout>
  );
};

export default DashboardPage;
