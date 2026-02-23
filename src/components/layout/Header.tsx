"use client";

import { useTheme } from "next-themes";
import {
  Home,
  BarChart3,
  FileText,
  Bell,
  Download,
  CalendarDays,
} from "lucide-react";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { themeClasses } from "@/lib/theme-classes";

interface HeaderProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const TABS = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "reports", label: "Reports", icon: FileText },
  { id: "notifications", label: "Notifications", icon: Bell },
];

export const Header = ({ activeTab, onTabChange }: HeaderProps) => {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const t = themeClasses(dark);

  return (
    <>
      <header
        className={`hidden md:flex h-14 ${t.bg} border-b ${t.border} items-center justify-between px-6 shrink-0`}
      >
        <h1 className={`text-lg font-bold ${t.text}`}>Dashboard</h1>
        <div className="flex items-center gap-2.5">
          <button
            className={`h-8 px-3 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors ${t.ctaBtn}`}
          >
            <Download className="h-3.5 w-3.5" />{" "}
            <span className="hidden lg:inline">Download</span>
          </button>
          <button
            className={`h-8 px-3 rounded-md border text-xs font-medium flex items-center gap-1.5 ${t.outlineBtn}`}
          >
            <CalendarDays className="h-3.5 w-3.5" />{" "}
            <span className="hidden lg:inline">Pick a date</span>
          </button>
          <ThemeToggle />
        </div>
      </header>

      {/* Mobile action bar */}
      <div
        className={`flex md:hidden items-center justify-end gap-2 px-4 py-2 ${t.bg} border-b ${t.border} shrink-0`}
      >
        <button
          className={`h-8 px-3 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors ${t.ctaBtn}`}
        >
          <Download className="h-3.5 w-3.5" />
        </button>
        <ThemeToggle />
      </div>

      <div className={`px-4 md:px-6 pt-3 md:pt-4 ${t.bg} border-b ${t.border}`}>
        <div className="flex gap-1 overflow-x-auto scrollbar-none">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? dark
                    ? "bg-neutral-800 text-neutral-100"
                    : "bg-neutral-100 text-neutral-900"
                  : dark
                    ? "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
                    : "text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50"
              }`}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
};
