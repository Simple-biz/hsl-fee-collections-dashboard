"use client";

import { useState, type ReactNode } from "react";
import { useTheme } from "next-themes";
import { Menu } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { DateRangeProvider, useDateRange } from "@/lib/date-range-context";
import { themeClasses } from "@/lib/theme-classes";

function DashboardShell({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const t = themeClasses(dark);
  const { dateRange, setDateRange } = useDateRange();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <div
      className={`flex h-screen ${dark ? "bg-neutral-950 text-neutral-100" : "bg-white text-neutral-900"}`}
    >
      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <Sidebar
          open={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
        />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileSidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 md:hidden">
            <Sidebar
              open={true}
              onToggle={() => setMobileSidebarOpen(false)}
              onMobileClose={() => setMobileSidebarOpen(false)}
            />
          </div>
        </>
      )}

      <div className={`flex-1 flex flex-col overflow-hidden ${t.bgSub}`}>
        {/* Mobile top bar */}
        <div
          className={`flex md:hidden items-center gap-3 h-14 px-4 ${t.bg} border-b ${t.border} shrink-0`}
        >
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className={`h-8 w-8 rounded-md flex items-center justify-center ${t.hover} ${t.textSub}`}
          >
            <Menu className="h-5 w-5" />
          </button>
          <h1 className={`text-base font-bold ${t.text}`}>Fee Collections</h1>
        </div>

        <Header dateRange={dateRange} onDateRangeChange={setDateRange} />
        <main className="flex-1 overflow-auto p-4 md:p-6 space-y-4 md:space-y-6">
          {children}
        </main>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <DateRangeProvider>
      <DashboardShell>{children}</DashboardShell>
    </DateRangeProvider>
  );
}
