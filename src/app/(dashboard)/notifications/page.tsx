"use client";

import { useTheme } from "next-themes";
import { themeClasses } from "@/lib/theme-classes";
import { Bell } from "lucide-react";

export default function NotificationsPage() {
  const { resolvedTheme } = useTheme();
  const t = themeClasses(resolvedTheme === "dark");

  return (
    <div className={`rounded-xl border p-12 text-center ${t.card}`}>
      <Bell className={`h-8 w-8 mx-auto mb-3 ${t.textMuted}`} />
      <h2 className={`text-sm font-bold ${t.text} mb-1`}>Notifications</h2>
      <p className={`text-sm ${t.textMuted}`}>No new notifications.</p>
    </div>
  );
}
