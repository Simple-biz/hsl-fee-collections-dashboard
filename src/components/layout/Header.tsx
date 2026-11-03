"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { DateRangeButton } from "@/components/layout/DateRangeButton";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { themeClasses } from "@/lib/theme-classes";
import type { DateRange } from "@/lib/date-range-context";

interface HeaderProps {
  dateRange: DateRange | null;
  onDateRangeChange: (range: DateRange | null) => void;
}

export const Header = ({ dateRange, onDateRangeChange }: HeaderProps) => {
  const { resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const dark = mounted ? resolvedTheme === "dark" : false;
  const t = themeClasses(dark);

  return (
    <header
      className={`hidden md:flex h-12 ${t.bg} border-b ${t.border} items-center justify-end px-6 shrink-0`}
    >
      <div className="flex items-center gap-2.5">
        <DateRangeButton
          dateRange={dateRange}
          onDateRangeChange={onDateRangeChange}
          dark={dark}
          t={t}
          align="right"
        />
        <ThemeToggle />
      </div>
    </header>
  );
};
