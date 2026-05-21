import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth-helpers";
import { AdminPage, type AdminUser } from "@/components/admin/AdminPage";

// Auth-gated, data depends on cookies → never prerender.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin · SSA Fee Collections",
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

  const userList: AdminUser[] = rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    role: r.role,
    isActive: r.isActive,
    lastLoginAt: r.lastLoginAt ? r.lastLoginAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <AdminPage
      users={userList}
      currentUserId={Number(guard.session.user.id)}
    />
  );
}
