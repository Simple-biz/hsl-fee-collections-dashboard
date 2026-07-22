import { redirect } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { users, adminActivityLog, activityLog, cases } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  AdminPage,
  type AdminUser,
  type AdminActivityEntry,
  type CaseActivityEntry,
} from "@/components/admin/AdminPage";

// Auth-gated, data depends on cookies → never prerender.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin · Collections Dashboard",
};

export default async function AdminRoute() {
  const guard = await requireAdmin();
  if (!guard.ok) {
    // Bounce non-admins back to the dashboard rather than the login page —
    // they're logged in, just lacking the role.
    redirect(guard.error === "Unauthenticated" ? "/login" : "/");
  }

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt));

  // Only system_admins can see system_admin accounts. Regular admins get a
  // list with those rows filtered out (server-side, so they're never sent).
  const canSeeSystemAdmins = guard.session.user.role === "system_admin";
  const visibleRows = canSeeSystemAdmins
    ? rows
    : rows.filter((r) => r.role !== "system_admin");

  // Last activity_log entry per agent, matched by name (createdBy is the
  // user's display name, not their ID).
  const activityRows = await db.execute(sql`
    SELECT created_by, MAX(created_at) AS last_activity_at
    FROM activity_log
    WHERE created_by IS NOT NULL
    GROUP BY created_by
  `) as unknown as { created_by: string; last_activity_at: string }[];

  const lastActivityMap = new Map(
    activityRows.map((r) => [r.created_by, r.last_activity_at]),
  );

  const userList: AdminUser[] = visibleRows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    role: r.role,
    isActive: r.isActive,
    lastLoginAt: r.lastLoginAt ? r.lastLoginAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    lastActivityAt: lastActivityMap.get(r.name ?? "") ?? null,
  }));

  // Most recent admin actions for the Activity Logs tab. Emails are snapshots
  // on the row, so no joins are needed and entries survive account deletion.
  const logRows = await db
    .select({
      id: adminActivityLog.id,
      actorEmail: adminActivityLog.actorEmail,
      action: adminActivityLog.action,
      targetEmail: adminActivityLog.targetEmail,
      summary: adminActivityLog.summary,
      createdAt: adminActivityLog.createdAt,
    })
    .from(adminActivityLog)
    .orderBy(desc(adminActivityLog.createdAt))
    .limit(300);

  const activity: AdminActivityEntry[] = logRows.map((r) => ({
    id: r.id,
    actorEmail: r.actorEmail,
    action: r.action,
    targetEmail: r.targetEmail,
    summary: r.summary,
    createdAt: r.createdAt.toISOString(),
  }));

  // Recent edits across all cases (case-scoped activity_log) for the admin
  // "Case Activity" sub-tab. Left join to cases for a readable name.
  const caseLogRows = await db
    .select({
      id: activityLog.id,
      caseId: activityLog.caseId,
      firstName: cases.firstName,
      lastName: cases.lastName,
      message: activityLog.message,
      createdBy: activityLog.createdBy,
      createdAt: activityLog.createdAt,
    })
    .from(activityLog)
    .leftJoin(cases, eq(cases.clientId, activityLog.caseId))
    .orderBy(desc(activityLog.createdAt))
    .limit(300);

  const caseActivity: CaseActivityEntry[] = caseLogRows.map((r) => ({
    id: r.id,
    caseId: r.caseId,
    caseName:
      r.lastName || r.firstName
        ? `${r.lastName ?? ""}, ${r.firstName ?? ""}`.replace(/^, |, $/g, "")
        : `Case ${r.caseId}`,
    message: r.message,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <AdminPage
      users={userList}
      activity={activity}
      caseActivity={caseActivity}
      currentUserId={Number(guard.session.user.id)}
    />
  );
}
