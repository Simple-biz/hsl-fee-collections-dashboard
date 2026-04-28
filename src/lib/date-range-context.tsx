"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

export interface DateRange {
  from: string;
  to: string;
}

interface DateRangeCtx {
  dateRange: DateRange | null;
  setDateRange: (range: DateRange | null) => void;
}

const DateRangeContext = createContext<DateRangeCtx>({
  dateRange: null,
  setDateRange: () => {},
});

export const useDateRange = () => useContext(DateRangeContext);

export const DateRangeProvider = ({ children }: { children: ReactNode }) => {
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  return (
    <DateRangeContext.Provider value={{ dateRange, setDateRange }}>
      {children}
    </DateRangeContext.Provider>
  );
};
