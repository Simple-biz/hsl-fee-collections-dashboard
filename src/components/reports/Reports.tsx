"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { ScoreboardTracker } from "@/components/reports/ScoreboardTracker";
import { themeClasses } from "@/lib/theme-classes";

export const Reports = () => {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted ? resolvedTheme === "dark" : false;
  const t = themeClasses(dark);

  return <ScoreboardTracker dark={dark} t={t} />;
};
