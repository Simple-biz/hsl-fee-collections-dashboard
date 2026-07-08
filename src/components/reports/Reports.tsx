"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { ScoreboardTracker } from "@/components/reports/ScoreboardTracker";
import { themeClasses } from "@/lib/theme-classes";

export const Reports = () => {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // Same hydration-guard pattern used in FeePetitions/OverpaidCases/etc. — flagged
  // here but not there due to a known code-shape false positive in this rule.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  const dark = mounted ? resolvedTheme === "dark" : false;
  const t = themeClasses(dark);

  return <ScoreboardTracker dark={dark} t={t} />;
};
