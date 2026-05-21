"use client";

import { useTheme } from "next-themes";
import { Shield, Activity } from "lucide-react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { themeClasses } from "@/lib/theme-classes";
import { UsersTable, type AdminUser } from "./UsersTable";

export type { AdminUser } from "./UsersTable";

interface AdminPageProps {
  users: AdminUser[];
  currentUserId: number;
}

export function AdminPage({ users, currentUserId }: AdminPageProps) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const t = themeClasses(dark);
  const sectionCard = `rounded-xl border ${t.card}`;

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className={`${sectionCard} p-4 md:p-5`}>
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center ${dark ? "bg-indigo-900/40" : "bg-indigo-50"}`}
          >
            <Shield className={`h-5 w-5 ${dark ? "text-indigo-400" : "text-indigo-600"}`} />
          </div>
          <div>
            <h3 className={`text-sm font-bold ${t.text}`}>Admin</h3>
            <p className={`text-[11px] ${t.textMuted} mt-0.5`}>
              Manage user accounts and review activity
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="activity">Activity Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <UsersTable users={users} currentUserId={currentUserId} />
        </TabsContent>

        <TabsContent value="activity">
          <div className={`${sectionCard} p-8 text-center`}>
            <div
              className={`mx-auto w-10 h-10 rounded-lg flex items-center justify-center ${dark ? "bg-neutral-800" : "bg-neutral-100"}`}
            >
              <Activity className={`h-5 w-5 ${t.textMuted}`} />
            </div>
            <h3 className={`text-sm font-semibold mt-3 ${t.text}`}>
              Activity logs coming soon
            </h3>
            <p className={`text-[11px] ${t.textMuted} mt-1 max-w-md mx-auto`}>
              Auth events, admin actions, and case modifications will surface
              here once we settle on what to capture.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
