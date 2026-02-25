"use client";

import { useState, useRef, useEffect } from "react";
import { useTheme } from "next-themes";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { themeClasses } from "@/lib/theme-classes";
import type { DateRange } from "@/lib/date-range-context";

interface HeaderProps {
  dateRange: DateRange | null;
  onDateRangeChange: (range: DateRange | null) => void;
}

const TABS = [
  { path: "/", label: "Overview" },
  { path: "/scoreboard", label: "Scoreboard" },
  { path: "/chronicle", label: "Chronicle Sync" },
  { path: "/reports", label: "Reports" },
  { path: "/notifications", label: "Notifications" },
];

const PRESETS = [
  { label: "Today", days: 0 },
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "This year", days: -1 },
  { label: "All time", days: -2 },
];

const toISO = (d: Date) => d.toISOString().split("T")[0];

export const Header = ({ dateRange, onDateRangeChange }: HeaderProps) => {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const t = themeClasses(dark);
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // useEffect(() => {
  //   if (dateRange) {
  //     setFromDate(dateRange.from);
  //     setToDate(dateRange.to);
  //   }
  // }, [dateRange]);

  const isActive = (path: string) =>
    path === "/" ? pathname === "/" : pathname.startsWith(path);

  const applyPreset = (days: number) => {
    const now = new Date();
    if (days === -2) {
      onDateRangeChange(null);
      setFromDate("");
      setToDate("");
      setOpen(false);
      return;
    }
    if (days === -1) {
      const from = `${now.getFullYear()}-01-01`;
      const to = toISO(now);
      onDateRangeChange({ from, to });
      setFromDate(from);
      setToDate(to);
      setOpen(false);
      return;
    }
    if (days === 0) {
      const today = toISO(now);
      onDateRangeChange({ from: today, to: today });
      setFromDate(today);
      setToDate(today);
      setOpen(false);
      return;
    }
    const from = new Date(now);
    from.setDate(from.getDate() - days);
    onDateRangeChange({ from: toISO(from), to: toISO(now) });
    setFromDate(toISO(from));
    setToDate(toISO(now));
    setOpen(false);
  };

  const applyCustom = () => {
    if (fromDate && toDate) {
      onDateRangeChange({ from: fromDate, to: toDate });
      setOpen(false);
    }
  };
  const clearRange = () => {
    onDateRangeChange(null);
    setFromDate("");
    setToDate("");
    setOpen(false);
  };

  const dateLabel = dateRange
    ? `${new Date(dateRange.from + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(dateRange.to + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
    : "All time";

  return (
    <header
      className={`hidden md:flex h-14 ${t.bg} border-b ${t.border} items-center justify-between px-6 shrink-0`}
    >
      {/* Tab links */}
      <div className="flex items-center gap-1">
        {TABS.map((tab) => {
          const active = isActive(tab.path);
          return (
            <Link
              key={tab.path}
              href={tab.path}
              className={`h-8 px-3 rounded-md text-xs font-medium transition-colors ${
                active
                  ? dark
                    ? "bg-neutral-800 text-neutral-100 font-semibold"
                    : "bg-neutral-100 text-neutral-900 font-semibold"
                  : dark
                    ? "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50"
                    : "text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50"
              } flex items-center`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2.5">
        <div className="relative" ref={dropRef}>
          <button
            onClick={() => setOpen(!open)}
            className={`h-8 px-3 rounded-md border text-xs font-medium flex items-center gap-1.5 ${
              dateRange
                ? dark
                  ? "border-indigo-700 bg-indigo-900/30 text-indigo-300"
                  : "border-indigo-300 bg-indigo-50 text-indigo-700"
                : t.outlineBtn
            }`}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">{dateLabel}</span>
          </button>
          {open && (
            <div
              className={`absolute right-0 top-10 z-50 w-72 rounded-xl border shadow-xl ${dark ? "bg-neutral-900 border-neutral-700" : "bg-white border-neutral-200"}`}
            >
              <div className="p-2">
                <p
                  className={`px-2 py-1 text-[10px] font-semibold uppercase ${t.textMuted}`}
                >
                  Quick Select
                </p>
                <div className="grid grid-cols-2 gap-1">
                  {PRESETS.map((p) => (
                    <button
                      key={p.label}
                      onClick={() => applyPreset(p.days)}
                      className={`px-2.5 py-1.5 rounded-md text-xs text-left transition-colors ${dark ? "hover:bg-neutral-800 text-neutral-300" : "hover:bg-neutral-50 text-neutral-700"}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className={`border-t ${t.borderLight} p-2`}>
                <p
                  className={`px-2 py-1 text-[10px] font-semibold uppercase ${t.textMuted}`}
                >
                  Custom Range
                </p>
                <div className="flex gap-2 px-2">
                  <div className="flex-1">
                    <label className={`text-[10px] ${t.textMuted}`}>From</label>
                    <input
                      type="date"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      className={`w-full h-7 px-2 rounded border text-[11px] outline-none ${t.inputBg}`}
                    />
                  </div>
                  <div className="flex-1">
                    <label className={`text-[10px] ${t.textMuted}`}>To</label>
                    <input
                      type="date"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                      className={`w-full h-7 px-2 rounded border text-[11px] outline-none ${t.inputBg}`}
                    />
                  </div>
                </div>
                <div className="flex gap-2 px-2 mt-2">
                  <button
                    onClick={applyCustom}
                    disabled={!fromDate || !toDate}
                    className={`flex-1 h-7 rounded text-[11px] font-semibold ${t.ctaBtn} disabled:opacity-40`}
                  >
                    Apply
                  </button>
                  {dateRange && (
                    <button
                      onClick={clearRange}
                      className={`h-7 px-3 rounded text-[11px] border ${t.outlineBtn}`}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
        <ThemeToggle />
      </div>
    </header>
  );
};
