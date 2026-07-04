"use client";

import { useTheme } from "next-themes";
import { Shield } from "lucide-react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { themeClasses } from "@/lib/theme-classes";
import { UsersTable, type AdminUser } from "./UsersTable";
import {
  AdminActivityLog,
  type AdminActivityEntry,
} from "./AdminActivityLog";
import {
  CaseActivityFeed,
  type CaseActivityEntry,
} from "./CaseActivityFeed";

export type { AdminUser } from "./UsersTable";
export type { AdminActivityEntry } from "./AdminActivityLog";
export type { CaseActivityEntry } from "./CaseActivityFeed";

interface AdminPageProps {
  users: AdminUser[];
  activity: AdminActivityEntry[];
  caseActivity: CaseActivityEntry[];
  currentUserId: number;
}

export function AdminPage({
  users,
  activity,
  caseActivity,
  currentUserId,
}: AdminPageProps) {
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
            <p className={`text-[13px] ${t.textMuted} mt-0.5`}>
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
          <Tabs defaultValue="admin-actions" className="space-y-3">
            <TabsList>
              <TabsTrigger value="admin-actions">Admin Actions</TabsTrigger>
              <TabsTrigger value="case-activity">Case Activity</TabsTrigger>
            </TabsList>
            <TabsContent value="admin-actions">
              <AdminActivityLog entries={activity} />
            </TabsContent>
            <TabsContent value="case-activity">
              <CaseActivityFeed entries={caseActivity} />
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>
    </div>
  );
}
